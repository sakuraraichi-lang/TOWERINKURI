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
//   踏破したステージ数以外では増えない（unitCap / Skill.maxOf / Skill.lv を参照）。
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
  of(perm) {
    if (!perm || !(perm.prestiges > 0)) return 1;
    const deepest = Math.max(0, perm.deepest || 0);
    if (deepest <= 1) return 1;
    // N(deepest) = perChapter^(deepest-1) を、余裕 BAL.legacyMargin 倍する
    return Math.pow(this.perChapter(), deepest - 1) * BAL.legacyMargin;
  },
};

const Relic = {
  _cache: null,

  // 所持枚数が変わったら呼ぶ。次に読まれたときに数え直す
  invalidate() { this._cache = null; },

  // 今の所持から、出撃に掛かる倍率一式を作る
  mods(perm) {
    if (this._cache) return this._cache;
    const col = (perm && perm.collection) || {};
    const add = { dmg: 0, coin: 0, rate: 0 };
    let lives = 0, seed = 0, startLv = 0;

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
      const cap = (v) => Math.min(c.cap !== undefined ? c.cap : Infinity, v);
      if (c.mode === 'add') add[c.key] += cap(c.eff * n);
      else if (c.key === 'lives') lives += cap(c.eff * n);
      else if (c.key === 'seed') seed += cap(c.eff * n);
      else if (c.key === 'startLv') startLv += cap(c.eff * n);
    }

    // **土台 × 遺物。** 土台が桁を作り、遺物が色を付ける
    const L = Legacy.of(perm);
    this._cache = {
      legacy: L,
      dmg: (1 + add.dmg) * L,
      coin: (1 + add.coin),
      rate: (1 + add.rate),
      lives, seed, startLv,
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
