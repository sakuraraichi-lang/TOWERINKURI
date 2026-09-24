// ---------------------------------------------------------------
// relics.js : 遺物（永続パッシブ）の集計
//
//   **転生で消えない唯一の数値成長。** ここが無いと、周回のたびに
//   同じ道のりを同じ時間かけて登り直すことになる（第1版の実測：転生しても 0.99〜1.10倍）。
//
//   遺物カードの定義は cards.js（kind:'perm'）。所持枚数は他のカードと同じく
//   perm.collection に入るので、転生で消えない仕組みをここで作る必要はない。
//
//   積み方
//     add  … 枚数ぶん加算してから 1+合計 を掛ける。**後半で1枚の価値が薄まる＝暴走しない**
//     （mul は廃止した。効果量を少し動かすだけで「足りない」と「発散」に振れたため）
//     flat … そのまま加算（ライフ・初期コイン・初期レベル）
//
//   **設置枠を配る遺物は置かない。**
//   遊んでもらった結果「転生エピックの基数追加で無強化プレイができる、
//   転生2回でゲームが崩壊する」という報告が出た。
//   設置枠は火力・カバー範囲・漏れにくさが同時に増え、他の全強化と掛け算になるので、
//   **増やす手段はスキルツリーの「増設基盤」だけ**にしてある。
//   コインで買えるが、1段ごとに値段が ×9 に跳ね上がるので間隔が空く
//   （ユーザー指示 2026-09-21「スキルツリーの深さとかで対応しなよ」・skilltree.js の units）。
//   遺物の下駄も設置枠には乗らない（Skill.lv）。
//   key:'units' の集計は、実際どこからも読まれていない死に道だったので落とした
// ---------------------------------------------------------------
'use strict';

const RELIC_IDS = CARD_IDS.filter(id => CARDS[id].kind === 'perm');

// ---------------------------------------------------------------
// 恒久倍率の「土台」（legacy）
//
//   設計書 §6-2 は、転生後の恒久倍率が
//     F(P) = 前回到達章の必要戦力 N × 5
//   に追随することを要求している。これが無いと、既踏の章が trivial にならず、
//   30章を8回の転生で登る計算が成り立たない（重大度A）。
//
//   **これを遺物カードの累乗で作ろうとして、失敗した。**
//   実測（実際の排出で9周ぶん回した）：
//     いまの効果量           要求の 1.7e-2 〜 8.5e-5 倍（まったく届かない）
//     mul 遺物を x1.63 に     要求の 6.6 〜 0.023 倍（周が進むと落ちる）
//     mul 遺物を x2.00 に     要求の 4.4 〜 3.2e+8 倍（発散する）
//   **効果量をわずかに動かすだけで、足りないか発散するかに振れる。**
//   90枚前後の累乗なので当然で、ここに追随を任せるのは構造的に無理がある。
//
//   なので分けた。
//     **土台（legacy）… 到達した深さから直接決まる。設計の F をそのまま出す**
//     **遺物カード   … その上に乗る色付け。ビルドの方向を変えるものであって、
//                       桁を作る役ではない**
//
//   こうすると、遺物の引きが悪くても既踏の章は必ず trivial になり、
//   引きが良ければその周がさらに楽になる、という形になる。
// ---------------------------------------------------------------
const Legacy = {
  // 1章あたりの必要戦力の伸び（設計書 §6-1 の 1ウェーブ x1.25 を5ウェーブぶん）
  perChapter() { return Math.pow(BAL.enemyHpGrowth, BAL.wavesPerStage); },

  // 到達した深さから出す恒久倍率。**転生していなければ 1（土台は無い）**
  //   **基準は `legacyDeep`（転生したときの到達章）で、`deepest` ではない。**
  //   （2026-09-22）`deepest` は周の途中でも伸びるので、それを見ると
  //   **1章突破するたびに約5倍強くなる暴走**になる（実測で 3 → 30 の2周クリア）。
  //   設計（§6-2）が言う「前回到達章」は、周が始まる時点で固定された値のこと
  of(perm) {
    if (!perm || !(perm.prestiges > 0)) return 1;
    const deepest = Math.max(0, perm.legacyDeep || 0);
    if (deepest <= 1) return 1;
    // N(deepest) = perChapter^(deepest-1) を、余裕 BAL.legacyMargin 倍する
    return Math.pow(this.perChapter(), deepest - 1) * BAL.legacyMargin;
  },
};

// 状態異常の遺物が1枚も無いときの値。**run.st は null にならない**
//   （Combat.damage が毎ヒット読むので、分岐を1つでも減らしたい）
const NO_STATUS = {
  burnDur: 0, burnMul: 1, burnGrant: 0,
  chillDur: 0, slowAdd: 0, chillGrant: 0, chillVuln: 0,
  stunDur: 0, shockDur: 0,
};

const Relic = {
  _cache: null,
  none: NO_STATUS,

  // 所持枚数が変わったら呼ぶ。次に読まれたときに数え直す
  invalidate() { this._cache = null; },

  // 今の所持から、出撃に掛かる倍率一式を作る
  mods(perm) {
    if (this._cache) return this._cache;
    const col = (perm && perm.collection) || {};
    // 足し算でまとめる軸。**種類ごとに上限がある**（同じ遺物を重ねるほど1枚の価値が薄まる）
    //
    // **状態異常の軸（2026-09-21・ユーザー指摘）**
    //   > 「遺物はそもそもゲームの根底から変えるわけでしょ？
    //   >   例えば凍結+0.5秒とか炎上+0.5秒とか、そういった方向にした方がいいかもな」
    //
    //   ダメージとコインしか無いと、遺物は「数字が少し大きくなる札」でしかない。
    //   持続や強さを触ると**遊び方そのものが変わる**ので、そちらへ寄せる。
    //
    //   `*Grant` の2つは、**どの武器にも状態異常を付ける**ぶん。
    //   状態異常の武器（テスラ8章・火炎11章・凍結17章）は解放が遅く、
    //   持続を伸ばす遺物だけだと**序盤は死に札**になるため、
    //   「そもそも状態異常を発生させる」側を置いて、はじめて軸として生きる
    const add = {
      dmg: 0, coin: 0, rate: 0, range: 0, size: 0, speed: 0, crit: 0, pierce: 0,
      burnDur: 0, burnPow: 0, burnGrant: 0,
      chillDur: 0, slowPow: 0, chillGrant: 0, chillVuln: 0,
      stunDur: 0, shockDur: 0,
    };
    let lives = 0, seed = 0, startLv = 0, picks = 0, choices = 0, regen = 0;

    for (const id of RELIC_IDS) {
      const n = col[id] || 0;
      if (n <= 0) continue;
      const c = CARDS[id];
      // **種類ごとに上限がある。** 同じ遺物を重ねるほど1枚の価値が薄まる
      // **flat のものにも上限を掛ける。**（2026-09-21）
      //   `add` にだけ cap を掛けていたので、ライフ（flat）が**上限なしで伸びていた。**
      //   初回転生で遺物パックを36個＝108枚配るので、ライフ関係だけで +80 を超える。
      //   ツリーから「防衛線」を外した意味が消えるうえ、
      //   「配られる枚数に気を配れ」（ユーザー 2026-09-21）にも反する
      // **上限は転生回数で開いていく。**（2026-09-21）
      //   固定の上限だと、初回転生の配布だけで全部埋まって
      //   2周目以降に集める意味が消える（実測：99枚で到達、以降576枚が無駄）
      //   **開くのは倍率もの（ダメージ・コイン・レート）だけ。**
      //   ライフ・初動資金・初期投資は固定の上限のまま。
      //   とくにライフは「HPを鍛えるのはノーサンキュー、せめてカードで固定値上昇」
      //   （ユーザー 2026-09-21）なので、恒久層で伸ばし続けない
      // **状態異常の軸だけは上限が開かない（fixed）。**（2026-09-21）
      //   これは「敵の時間を奪う」軸なので、上限が転生回数で開くと
      //   減速が 0.30 → 0.90、拘束が 1.2秒 → 7秒 まで伸びて、
      //   **終盤には敵が止まる＝難易度そのものが消える。**
      //   ダメージやコインは「速く倒す」だけだが、こちらは「そもそも進ませない」。
      //   同じ扱いにはできない
      const capMul = 1 + 0.6 * (perm.prestiges || 0);
      const capOf = (grow) => (c.cap !== undefined ? c.cap : Infinity) * (grow ? capMul : 1);
      // **遺物も凸で伸びる。**（ユーザー 2026-09-24「入手出来るカード全てに」「遺物にも入れる」）
      //   前は「1枚ごとに効果を足し、遺物ごとの上限で止める」だった。
      //   ・割合で効く遺物（add）… 1枚で BAL.relicBaseMul 枚ぶん（前のクリア時点の中央値が3枚）、
      //     そこに凸の倍率（Game.rankMul と同じ式）を掛ける
      //   ・数で効く遺物（ライフ・カード枠・選択肢・再生・初動資金・初期投資）… 1枚で1枚ぶん、
      //     1凸ごとに1枚ぶん足す（1枚で上限まで埋まらないように）
      //   上限（cap・転生で開く分）はそのまま
      const t = n < BAL.totuBase ? 0 : Math.floor(Math.log2(n / BAL.totuBase)) + 1;
      const pct = BAL.relicBaseMul * (1 + totuBonus(t));
      const cnt = 1 + t;
      if (c.mode === 'add') add[c.key] += Math.min(capOf(!c.fixed), c.eff * pct);
      else if (c.key === 'lives') lives += Math.min(capOf(false), c.eff * cnt);
      else if (c.key === 'seed') seed += Math.min(capOf(false), c.eff * cnt);
      else if (c.key === 'startLv') startLv += Math.min(capOf(false), c.eff * cnt);
      else if (c.key === 'picks') picks += Math.min(capOf(false), c.eff * cnt);
      else if (c.key === 'choices') choices += Math.min(capOf(false), c.eff * cnt);
      else if (c.key === 'regen') regen += Math.min(capOf(false), c.eff * cnt);
    }

    // **土台 × 遺物。** 土台が桁を作り、遺物が色を付ける
    const L = Legacy.of(perm);
    this._cache = {
      legacy: L,
      dmg: (1 + add.dmg) * L,
      coin: (1 + add.coin),
      rate: (1 + add.rate),
      range: (1 + add.range),
      size: (1 + add.size),
      speed: (1 + add.speed),
      crit: add.crit,
      pierce: add.pierce,
      // 状態異常はまとめて run.st に渡す（Combat.damage が読む）
      st: {
        burnDur: add.burnDur, burnMul: 1 + add.burnPow, burnGrant: add.burnGrant,
        chillDur: add.chillDur, slowAdd: add.slowPow, chillGrant: add.chillGrant,
        chillVuln: add.chillVuln,
        stunDur: add.stunDur, shockDur: add.shockDur,
      },
      lives, seed, startLv, picks, choices, regen,
      count: RELIC_IDS.reduce((a, id) => a + (col[id] || 0), 0),
    };
    return this._cache;
  },

  // 所持している遺物を、種類ごとにまとめて返す（画面用）
  owned(perm) {
    const col = (perm && perm.collection) || {};
    return RELIC_IDS.filter(id => (col[id] || 0) > 0)
      .map(id => ({ card: CARDS[id], n: col[id] }))
      .sort((a, b) => BAL.rarityOrder.indexOf(b.card.rarity) - BAL.rarityOrder.indexOf(a.card.rarity));
  },
};
