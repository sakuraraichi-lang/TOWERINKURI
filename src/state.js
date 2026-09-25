// ---------------------------------------------------------------
// state.js : セーブと、準備 → 戦闘 → 結果 の流れ
//
//   1ステージ = 5ウェーブ。全部凌げば突破、コアが割れたら失敗。
//   アップグレードもユニットの設置・向き・射界も、いじれるのはビルドフェーズだけ。
//   戦闘が始まったら何も動かせない
//
//   perm  … 絶対に消えない（カード・パック・ステージ進行・ヒートマップ）
//   meta  … 転生で消える（コイン・スキルツリー）
//   run   … 1回の出撃で消える（敵・弾・取得カード）
// ---------------------------------------------------------------
'use strict';

// **【2026-09-22】鍵を v4 に上げて、全員の進捗をリセットする。**
//
//   **ユーザー指示**
//   > 「あと**全ユーザーの進捗状態をリセットしない**と、
//   >   既に30章まで辿り着いた人間が転生し続けて**無限ファーム**ができます」
//
//   スキップが「前に手で突破したときの最高コイン」をそのまま配っていたせいで、
//   30章まで到達した記録が作られてしまった。その記録のまま転生を繰り返すと、
//   恒久の土台（Legacy）が最大のまま延々と回せる。
//
//   **引き継ぎはしない。** v3 以前のセーブからカードやパックを移すと、
//   ファームで貯めたぶんがそのまま残る。OLD_KEYS を空にしてある。
//   古い鍵は読み込み時に消して、あとから復活しないようにする
const SAVE_KEY = 'inkuriment_save_v4';
const DMG_LOG_MAX = 30;      // 武器ごとの記録を何件残すか（Game.logDamage）
const OLD_KEYS = [];
const PURGE_KEYS = ['inkuriment_save_v3', 'inkuriment_save_v2', 'inkuriment_save_v1'];

const Game = {
  perm: null,
  meta: null,
  run: null,
  phase: 'prep',        // prep / battle / over
  paused: false,
  speed: 1,
  // **敵のルートと溜まり場はプレイヤーに開示しない。**
  // 予測を配るより、盤面が見やすいことを優先する。
  // 記録自体は続ける（測定器がこれを読む）
  showHeat: false,
  showLeak: false,

  // ---------- セーブ ----------
  newSave() {
    // **遺物のキャッシュを捨てる。** これが無いと、リセットしても
    //   前のセーブの遺物効果（ライフ・ダメージ・コイン）が残ったままになる
    Relic.invalidate();
    // **地図のキャッシュも捨てる。**（2026-09-22・実測で見つけた）
    //   下で mapSeed を引き直しているのに Stage の中身は古いままだったので、
    //   **新規開始しても前のセーブと同じ地図で遊ぶことになっていた。**
    //   測定器でも効いていて、3シードの通しの2本目以降が
    //   1本目の地図を使っていた（同じ設定で結果が再現しない原因）
    if (typeof Stage !== 'undefined' && Stage.invalidate) Stage.invalidate();
    this.perm = {
      collection: Object.assign({}, STARTER_CARDS),
      // **最初はパックを持っていない。** 基本パックは2ステージ突破で解放される
      packs: { basic: 0, arms: 0, chem: 0, syn: 0, relic: 0 },
      deepest: 0,        // 転生を挟んでも戻らない「到達した深さ」。パックの解放条件に使う
      // **恒久の土台（Legacy）の基準。転生したときだけ deepest から写す。**
      //   deepest を直接見ると周の途中で伸びて暴走する（relics.js 参照）
      legacyDeep: 0,
      prestiges: 0,
      totalKills: 0,
      totalRuns: 0,
      packsEarned: 0,     // **遊んで手に入れた**パックの数（最初から持っている1個は数えない）
      missions: {},
      loadout: ['wc_gatling', null, null, null, null, null],   // 初期武器はガトリングのみ（2026-09-21）。開いている枠は loadoutSlots
      stages: { ch1: { cleared: false, perfect: false, bestWave: 0, attempts: 0 } },
      currentStage: 'ch1',
      placements: {},
      // 章ごとに「何周目の引きを使ったか」。踏んだ章は変えず、
      //   まだ届いていない章だけ転生で引き直すための記録（stages.js）
      mapRoll: {},
      // 30章ぶんのマップを決める種（src/mapgen.js）。**新しいセーブを作るときに1回だけ引く。**
      //   転生では作り直さない。まだ届いていない章だけ、上の mapRoll で引き直す
      //   （全部作り直すと周が後退した。prestige() のコメント参照）。
      //   （ユーザー決定 2026-09-21：「グリッドじゃなくて1000組み合わせで作れない？」
      //     「配置は転生で消える」。同じ日の「設置はタイルのまま」は、
      //     2026-09-23 の指示で**設置も六角**に置き換わった）
      //   0 にすると生成を切って、stages.js に書いてある固定のマップを使う。
      //
      //   **入れる前に一度つまずいた。**生成マップにすると12個の種すべてで
      //   第1章が突破できず、与ダメージが 0 だった。原因はゲーム側ではなく
      //   **測定器の置き場所キャッシュ**で、`AIM_CACHE[st.id]` が
      //   「地形は固定なので」という前提で書かれていた（tools/sim.html）。
      //   地形ごとに持たせ直したら 11/12 が突破、しかも挑戦回数は手書きと同じ2回。
      //   通しの曲線も手書きと変わらない（下記・3シード）：
      //     手書き  3→6→10→14/15→19/20→24/25→30  101〜109分
      //     生成    3→6→10→14→20→26→30           101〜108分
      mapSeed: (Math.random() * 0x7fffffff) >>> 0,
      heat: {},          // stageId -> { traffic: [], leak: [] }
      // **タブは最初から全部出さない。** 遊んで意味が分かった順に開く
      tabs: { skill: false, load: false, pack: false },
      // チュートリアルで今どこまで進んだか。**一度に1操作しか教えない**
      tut: 0,
      // 武器の調整ポップアップを置いた場所（プレイヤーが動かせる）
      upop: null,
      // 処理の重さを出すか（実機で敵数の上限を測るため）
      perf: false,
      // 音を止めているか。ホーム右上の 🔊 で切り替わる（状態は保存される）。
      //   一度 true を既定にしたが、ユーザー側で対処済みとのことで戻した
      //   （「こっちでクロードの音切ったから平気」2026-09-21）。
      //   射撃音そのものは 0921v で音量を半分・間引きを毎秒18回→10回にしてある
      mute: false,
      // カードを選んだあと、自動で次のウェーブへ進むか。ホームの ⚙ で切り替える
      autoWave: true,
      autoPlace: true,              // 自動設置（BAL.autoUnlock.autoPlace から効く）
      autoBuy: true,                // 自動購入（BAL.autoUnlock.autoBuy から効く）
      lastPlace: {},                // 自動設置の元：章ごとの最後の配置。**転生でも消さない**
      // スキップの解放と、スキップで配るものの根拠。**転生でも消えない**
      clears: {},      // stageId -> 通算の突破回数
      bestCoins: {},   // stageId -> 手で突破したときの最高コイン
      bestPerfect: {}, // stageId -> 一度でも完璧クリアしたか
    };
    this.meta = { coins: 0, skills: {} };
    // **マップの種が変わったので、焼いた地形を捨てる**（src/mapgen.js）
    if (typeof Stage !== 'undefined' && Stage.invalidate) Stage.invalidate();
  },

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 4, perm: this.perm, meta: this.meta }));
    } catch (e) { /* プライベートモードなどでは黙って諦める */ }
  },

  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { d = null; }
    // 古い鍵は消す。**残しておくと、あとで引き継ぎを足したときに復活してしまう**
    try { for (const k of PURGE_KEYS) localStorage.removeItem(k); } catch (e) {}
    this.newSave();
    if (!d) {
      // 旧バージョンのセーブが残っていたら、カードとパックだけ引き継ぐ
      for (const k of OLD_KEYS) {
        let old = null;
        try { old = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { old = null; }
        if (!old || !old.perm) continue;
        for (const id of Object.keys(old.perm.collection || {})) {
          if (CARDS[id]) this.perm.collection[id] = old.perm.collection[id];
        }
        // 今のパック定義にあるものだけ引き継ぐ（旧形式の rare / epic を持ち込まない）
        for (const pk of PACK_IDS) {
          const v = (old.perm.packs || {})[pk];
          if (typeof v === 'number') this.perm.packs[pk] = v;
        }
        this.perm.prestiges = old.perm.prestiges || 0;
        this.perm.totalKills = old.perm.totalKills || 0;
        this.save();
        return true;
      }
      return false;
    }
    Object.assign(this.perm, d.perm || {});
    Object.assign(this.meta, d.meta || {});
    for (const id of Object.keys(this.perm.collection)) if (!CARDS[id]) delete this.perm.collection[id];
    if (!this.perm.stages) this.perm.stages = {};
    if (!this.perm.placements) this.perm.placements = {};
    // **設置がハニカムになった（2026-09-23）ので、四角のタイルで保存された配置は捨てる。**
    //   セルの座標系が変わったため、古い (c,r) を六角として読むと
    //   まったく違う場所に置かれる。**セーブ全体は消さない**
    //   （進捗・カード・遺物はそのまま。置き直してもらうだけ）
    if (!this.perm.hexPlace) {
      this.perm.placements = {};
      this.perm.hexPlace = 1;
    }
    if (!this.perm.heat) this.perm.heat = {};
    // 換装は撤去した（2026-09-25）。古いセーブの持ち物は捨てる
    delete this.perm.swaps; delete this.perm.swapsOwned;
    if (!this.perm.clears) this.perm.clears = {};
    if (!this.perm.bestCoins) this.perm.bestCoins = {};
    if (!this.perm.bestPerfect) this.perm.bestPerfect = {};
    if (typeof this.perm.autoWave !== 'boolean') this.perm.autoWave = true;
    if (typeof this.perm.autoPlace !== 'boolean') this.perm.autoPlace = true;
    if (typeof this.perm.autoBuy !== 'boolean') this.perm.autoBuy = true;
    if (!this.perm.lastPlace) this.perm.lastPlace = {};
    if (typeof this.perm.deepest !== 'number') this.perm.deepest = this.progressCount();
    // 編成の枠は最大ぶん持っておく（開いていない枠は loadoutSlots で切る）
    if (!Array.isArray(this.perm.loadout)) this.perm.loadout = ['wc_gatling'];
    while (this.perm.loadout.length < BAL.loadoutSlotsMax) this.perm.loadout.push(null);    if (typeof this.perm.legacyDeep !== 'number') this.perm.legacyDeep = 0;
    // パックは今の定義と同じキーだけにする。
    // 昔の save には rare / epic が残っていて、開けられないまま数え続けていた
    if (!this.perm.packs) this.perm.packs = {};
    for (const k of Object.keys(this.perm.packs)) if (PACK_IDS.indexOf(k) < 0) delete this.perm.packs[k];
    for (const k of PACK_IDS) if (typeof this.perm.packs[k] !== 'number') this.perm.packs[k] = 0;
    if (!STAGE_BY_ID[this.perm.currentStage]) this.perm.currentStage = 'ch1';
    Relic.invalidate();
    return true;
  },

  hardReset() {
    try { localStorage.removeItem(SAVE_KEY); for (const k of PURGE_KEYS) localStorage.removeItem(k); } catch (e) {}
    this.newSave();
    Relic.invalidate();
  },

  // ---------- ステージ ----------
  stageRec(id) {
    if (!this.perm.stages[id]) this.perm.stages[id] = { cleared: false, skipped: false, perfect: false, bestWave: 0, attempts: 0 };
    return this.perm.stages[id];
  },

  // **実際に突破した数。** 報酬と表示はこちら
  clearedCount() { return STAGES.filter(s => this.stageRec(s.id).cleared).length; },
  // **そこまで進んだ数（突破＋スキップ）。** 進行・値段・転生・深さはこちら
  progressCount() { return stageProgressCount(this.perm); },
  stagePassed(id) { return stagePassedRec(this.stageRec(id)); },

  // ---------- スキップ ----------
  //
  //   **スキップしても何も失わない。** 手で突破したときと同じものが出る。
  //   周回のたびに同じステージを手で殴り直させないのが目的で、
  //   報酬を削ると「速く回りたいのに損をする」になって本末転倒になる。
  //
  //   **【2026-09-22・作り替えた】上の説明はもう当てはまらない。**
  //   「手で突破したときと同じものが出る」をやめ、**何ももらえない**ようにした。
  //   条件も「通算3回突破」から「**前回到達地点まで**」に置き換えた。
  //   `clears` / `bestPerfect` / `bestCoins` の記録はそのまま残している
  //   （図鑑や表示で使うため。スキップの条件では、もう見ていない）
  clearsOf(id) { return (this.perm.clears && this.perm.clears[id]) || 0; },

  perfectedEver(id) { return !!(this.perm.bestPerfect && this.perm.bestPerfect[id]); },

  // スキップを開ける鍵。**これを持っていないと1章も飛ばせない。**
  //   以前は「完璧クリア済みなら無条件」で、第1章を完璧に凌いだだけで
  //   2周目から飛ばせた。周2以降が実質0分になり、前半に手を動かす場面が
  //   ほとんど残らなかった（実測 2026-09-21）。
  //   **鍵は第13章の報酬。** そこまでは全部自分で通す
  SKIP_KEY: 'ky_skip',
  hasSkipKey() { return this.own(this.SKIP_KEY) > 0; },

  //   **【2026-09-22・作り替え】飛ばしても何ももらえない。**
  //   前は「前に手で突破したときの最高コイン」をそのまま渡していた。
  //   ユーザー報告：**もらえる金額が多すぎて30章を完全クリアされた。**
  //
  //   いまは**チェックマークだけ。** 突破したことにはならないので、
  //   初回クリア報酬はあとから自分で取りに行ける。
  //   飛ばせるのは**前回到達した地点まで**（perm.deepest）
  canSkip(id) {
    if (!this.hasSkipKey()) return false;                 // 鍵が無ければ何も飛ばせない
    const rec = this.stageRec(id);
    if (rec.cleared || rec.skipped) return false;         // 今周でもう通っている
    if (!this.stageUnlocked(id)) return false;
    // **前回到達地点まで。** そこから先は自分で戦う
    const i = STAGES.findIndex(s => s.id === id);
    return i >= 0 && (i + 1) <= (this.perm.deepest || 0);
  },

  skipWhy(id) {
    if (!this.hasSkipKey()) return '';                    // 鍵が無いうちは何も言わない
    const i = STAGES.findIndex(s => s.id === id);
    if (i >= 0 && (i + 1) > (this.perm.deepest || 0)) return '前回到達したところまで飛ばせます';
    return '';
  },

  // **飛ばしても1コインももらえない。** チェックマークが付くだけ
  skipCoins() { return 0; },

  // 自動化が開いているか（BAL.autoUnlock・転生回数）
  autoOpen(key) { return (this.perm.prestiges || 0) >= (BAL.autoUnlock[key] || Infinity); },

  // 一括突破で、id から続けて何章飛ばせるか（スキップと同じ条件を順に見る）
  skipRun(id) {
    const out = [];
    let i = STAGES.findIndex(s => s.id === id);
    while (i >= 0 && i < STAGES.length) {
      const sid = STAGES[i].id;
      // 前の章を飛ばしたことにして次を見る。canSkip は「前の章を通過済み」を要るので、仮に数える
      if (out.length === 0 ? !this.canSkip(sid) : !this.canSkipAfter(sid)) break;
      out.push(sid); i++;
    }
    return out;
  },
  // 前の章を今まさに飛ばした前提での canSkip（stageUnlocked だけ飛ばして見る）
  canSkipAfter(id) {
    if (!this.hasSkipKey()) return false;
    const rec = this.stageRec(id);
    if (rec.cleared || rec.skipped) return false;
    const i = STAGES.findIndex(s => s.id === id);
    return i >= 0 && (i + 1) <= (this.perm.deepest || 0);
  },
  // **一括突破。**1章ずつのスキップを続けて呼ぶだけ（中身も報酬0も同じ）
  skipAll(id) {
    if (!this.autoOpen('skipAll')) return null;
    let last = null, n = 0;
    for (const sid of this.skipRun(id)) {
      const r = this.skipStage(sid);
      if (!r) break;
      last = r; n++;
    }
    return last ? Object.assign({}, last, { count: n }) : null;
  },

  // 戦わずに通過する。**突破にはならない**ので、初回報酬はあとから取りに行ける
  skipStage(id) {
    if (!this.canSkip(id)) return null;
    const rec = this.stageRec(id);
    rec.skipped = true;
    this.perm.deepest = Math.max(this.perm.deepest || 0, this.progressCount());
    // 通過したら次の章へ進める（突破したときと同じ扱い）
    const mi = STAGES.findIndex(s => s.id === id);
    const next = (mi >= 0) ? (STAGES[mi + 1] || null) : null;
    if (next && this.perm.currentStage === id) this.perm.currentStage = next.id;
    this.save();
    return { coins: 0, skipped: true, next, stage: STAGE_BY_ID[id] };
  },

  stageUnlocked(id) {
    const i = STAGES.findIndex(s => s.id === id);
    if (i <= 0) return true;
    return this.stagePassed(STAGES[i - 1].id);   // スキップでも次へ行ける
  },

  // perfect = 1体も抜けさせずに5ウェーブ凌いだ（完璧クリア）
  clearStage(id, perfect) {
    const rec = this.stageRec(id);
    const first = !rec.cleared;
    const firstPerfect = perfect && !rec.perfect;
    rec.cleared = true;
    if (perfect) rec.perfect = true;
    // **ここで Relic.invalidate() を呼んではいけない。**（2026-09-22・やって壊した）
    //   恒久の土台（Legacy）は「**前回**到達章」を基準にする設計。
    //   周の途中で deepest が伸びるたびに作り直すと、
    //   **1章突破するごとに約5倍強くなる暴走**になる
    //   （実測：入れた瞬間に 3 → 30 で2周クリアになった）。
    //   土台は転生のときだけ更新する（下の prestige で legacyDeep を固定する）
    this.perm.deepest = Math.max(this.perm.deepest || 0, this.progressCount());
    const def = STAGE_BY_ID[id];
    // 次のステージも本編の並びで探す（実験用へは送らない）
    const mi = STAGES.findIndex(s => s.id === id);
    const nextStage = (mi >= 0) ? (STAGES[mi + 1] || null) : null;
    // **突破したら、その場で次の章へ進める。**（ユーザー報告 2026-09-22・最優先）
    //   > 「章を突破したとき、次のステージへを押さないと
    //   >   クリアしたはずの突破してない事になる」
    //
    //   `cleared` はここで立っていたが、**どの章にいるか（currentStage）を
    //   進めているのが結果画面の「次のステージへ」ボタンの中だけ**だった。
    //   「準備に戻る」を押す／モーダルを閉じると、ホームは突破した章を指したままで、
    //   出撃を押すと同じ章をもう一度遊ぶことになる。**突破していないように見える。**
    //
    //   いま居る章を突破したときだけ進める（前の章を遊び直したときは動かさない）
    if (nextStage && this.perm.currentStage === id) this.perm.currentStage = nextStage.id;
    const got = { first, perfect: !!perfect, firstPerfect,
                  cards: [], packs: {}, stage: def, next: nextStage };
    const addPack = (k, n) => this.addPack(k, n, got);
    if (first) {
      for (const cid of (def.reward.cards || [])) { this.grant(cid, 1); got.cards.push(cid); }
      for (const k in (def.reward.packs || {})) addPack(k, def.reward.packs[k]);
    }
    // 完璧クリアはパックの入手経路。1体も通さない配置を組めた報酬。
    // 出るのは「そのステージの分野」なので、浅いところを完璧にしても奥の分野は掘れない
    //   **転生ごとに1回。**（ユーザー 2026-09-24「転生ごとに1回」）
    //   前は完璧に凌ぐたびに1個出ていて、第1章を周回すると約1分1個を戦わずに稼げた
    //   （ユーザーの前提「同じ章の周回で稼げると言ってもパックは稼げない」と食い違っていた）。
    //   章の記録（perm.stages）は転生で戻るので、firstPerfect は「その周で初めて」になる
    if (perfect && firstPerfect) {
      addPack(Pack.forStage(id), 2);
    }
    this.save();
    return got;
  },

  // ---------- パックを配る（唯一の入口） ----------
  //
  //   **まだ解放していないパックは配らない。** 解放前に個数だけ増えても、
  //   開けられないので「持っているのに触れない」という状態ができるだけ。
  //   配り先が無いときはコインに振り替えて、報酬そのものは消さない
  addPack(k, n, sink) {
    const id = Pack.grantable(this.perm, k);
    if (!id) {
      // まだ何も開いていない（＝ゲームのいちばん最初）。コインで返す
      const coins = 120 * n;
      this.meta.coins += coins;
      if (sink) sink.coins = (sink.coins || 0) + coins;
      return null;
    }
    this.perm.packs[id] = (this.perm.packs[id] || 0) + n;
    this.perm.packsEarned = (this.perm.packsEarned || 0) + n;
    if (sink) sink.packs[id] = (sink.packs[id] || 0) + n;
    return id;
  },

  // ---------- コレクション ----------
  own(cardId) { return this.perm.collection[cardId] || 0; },
  grant(cardId, n) {
    this.perm.collection[cardId] = (this.perm.collection[cardId] || 0) + (n || 1);
    // 遺物は倍率を作るので、増えたら数え直させる
    if (CARDS[cardId] && CARDS[cardId].kind === 'perm') Relic.invalidate();
  },

  // 1回の出撃で重ねられる上限。所持枚数では絞らない
  // （絞ると、手持ちが薄いうちは3択の候補が1枚しか出ず、選ぶ意味が消えるため）
  stackLimit(cardId) {
    const c = CARDS[cardId];
    if (!c || c.kind === 'weapon') return 0;
    return c.maxStack || 1;
  },

  // **出やすさは所持枚数で変えない（2026-09-21）。**
  //   以前は「持っているほど3択に顔を出す」形だったが、
  //   ユーザーの決定で **レア度ごとの排出率を固定**し、
  //   ダブりは下の cardRank（ランクアップ）に回すことにした。
  //   狙っていない方向へビルドが勝手に寄るのを止めるため
  cardWeight() { return 1; },

  // ダブりで上がるランク（凸）。**1枚被っただけでは上がらない。**
  //
  //   **ユーザー指示（2026-09-22）**
  //   > 「現在カードが被った時に性能が上がるシステムですが、
  //   >   **一枚被っただけでは性能が上がらないようにします、
  //   >   4枚で1凸、8枚で2凸、16枚で3凸**、というようにします、
  //   >   これの理由は**1章クリア転生連打でカード重ねるのが最強**になっているから」
  //
  //   必要枚数は倍々：4 / 8 / 16 / 32 / 64 …
  //     1〜3枚 … 0凸（等倍）
  //     4〜7枚 … 1凸   ／ 8〜15枚 … 2凸   ／ 16〜31枚 … 3凸 …
  //   前は「1枚増えるごとに1ランク」だったので、
  //   浅い章を周回して枚数を稼ぐのがそのまま最強手になっていた
  cardTotu(cardId) { return this.totuOf(this.own(cardId)); },
  // 枚数 n のときの凸（パックの途中の1枚ごとの凸を出すのにも使う）
  totuOf(n) {
    if (n < BAL.totuBase) return 0;
    return Math.floor(Math.log2(n / BAL.totuBase)) + 1;
  },
  // その凸に届くのに要る枚数（0凸は0枚）
  totuNeed(t) { return t <= 0 ? 0 : BAL.totuBase * Math.pow(2, t - 1); },
  // 次の凸に要る枚数（画面用）
  cardTotuNext(cardId) { return this.totuNeed(this.cardTotu(cardId) + 1); },
  cardRank(cardId) { return this.cardTotu(cardId) + 1; },

  // ランクごとの効果倍率。**0凸（1〜3枚）は等倍。** 1〜3凸は小さく、4凸から大きく（balance.js の totuBonus）
  //   （2026-09-22 までは「1枚増えるごとに +12%」だった。上の cardTotu を参照）
  //   累乗にしないのは、上限なしの累乗が必ず壊れるから（集金効率の事故）
  rankMul(cardId) {
    // 伸ばす数字を持たないカード（noRank）は、何枚あっても等倍
    if (CARDS[cardId] && CARDS[cardId].noRank) return 1;
    return 1 + totuBonus(this.cardTotu(cardId));
  },

  // ---------- カードの効果量に、ランクを通す ----------
  //
  //   カード47枚の apply を1つずつ書き換えずに済むよう、
  //   **効果量だけをここに通す。** apply を呼ぶ直前に _rkMul を立てる。
  //
  //     rk(1.32) … 倍率もの。ランク2なら 1 + 0.32×1.12 = 1.358
  //     rka(2)   … 加算もの。ランク2なら 2×1.12 = 2.24
  //
  //   倍率を「そのまま累乗」にしないのは、上限なしの累乗が必ず壊れるため
  //   **下振れ（×1未満の代償）はランクで悪化させない。**
  //   ランクアップは「強くなる」ことなので、代償まで一緒に伸ばすと
  //   ダブるほど弱くなるカードが出る（弾頭肥大の連射 ×0.55 が ×0.17 になる）
  //
  //   **整数で数えるもの（銃身の数・貫通・連鎖・跳弾・ライフ）は rki。**
  //   12%ずつ増やすと 4→4.48 のような端数になり、数える側が切り捨てて
  //   「ランクを上げたのに何も起きない」になる。丸めて、数ランクごとに1本増える形にする
  _rkMul: 1,
  rk(v) { return v < 1 ? v : 1 + (v - 1) * this._rkMul; },
  rka(v) { return v < 0 ? v : v * this._rkMul; },
  //   **端数は次の1枚に繰り越す。** 1枚ずつ丸めると、
  //   「+1 を5枚重ねてランク2」でも合計5本のままになり、ランクが死ぬ。
  //   合計で丸めれば5枚目に +2 が来て、ちゃんと6本になる
  rki(v) {
    const acc = this._rkAcc || (this._rkAcc = {});
    const k = this._rkKey + '|' + v;
    const prev = acc[k] || 0, now = prev + this.rka(v);
    acc[k] = now;
    return Math.round(now) - Math.round(prev);
  },

  // カードを1枚適用する。**ランクを通すのはここだけ**
  // **範囲と射程は「足し算」で重ねる。**（ユーザー 2026-09-21）
  //   > 「一部3択カードで範囲系が乗算計算で上がってあり得ない範囲の広がり方をする、
  //   >   乗算は流石にやめよう、30%upとかにして重ねたら60%になるとかにした方がいい」
  //
  //   掛け算だと3枚で ×1.45^3 = ×3.05 になる。実測（上限まで重ねたとき）：
  //     火炎の扇   24°→73°   ／ 火炎の射程 130→300
  //     毒ガスの雲 半径76→187（直径374 ＝ 盤の幅600の62%）
  //     迫撃の爆風 半径96→263（直径526 ＝ 盤の幅の88%）
  //   盤より大きい爆風は「範囲」ではない。
  //
  //   足し算にすると 26%×3 = +78% で頭打ちが読める。
  //   **基準はツリーを掛けたあとの値**（applyMods が組み直した直後）なので、
  //   ツリーで伸ばしたぶんにもちゃんと乗る
  //
  // **【2026-09-22・最優先で止めた】これを使う効果は全部落とした。**
  //   ユーザー「武器の範囲を広げるスキル、カードなどゲーム内から全て削除してください、
  //   コメントアウトです、**バグの温床です**。代替案は後回しでいいです、
  //   本当に一番やばいです」
  //
  //   足し算にしても**基準（sBase）の取り直しと噛み合わず**、
  //   組み直し（applyMods）のたびに効き方が変わる作りだった。
  //   いま呼び出しは0箇所。**残してあるのは、なぜ消えたのかを次に読む人へ伝えるため。**
  //   代替案を入れるときは、`w.s.range` を直接いじる素直な形にすること
  addPct(w, key, pct) {
    return;                      // **何もしない**
  },

  applyCard(id, run) {
    const c = CARDS[id];
    if (!c || !c.apply) return;
    this._rkMul = this.rankMul(id);
    this._rkAcc = run._rkAcc || (run._rkAcc = {});
    this._rkKey = id;
    try { c.apply(run); } finally { this._rkMul = 1; }
  },

  ownedWeaponIds() { return WEAPON_IDS.filter(wid => this.own('wc_' + wid) > 0); },

  checkMissions() {
    const got = [];
    for (const m of MISSIONS) {
      if (this.perm.missions[m.id]) continue;
      if (m.check(this.perm)) {
        this.perm.missions[m.id] = true;
        for (const k in m.reward) this.addPack(k, m.reward[k]);
        got.push(m);
      }
    }
    return got;
  },

  // ---------- ヒートマップ（配置を決めるための手がかり） ----------
  heatFor(stageId) {
    const st = Stage.build(stageId);
    let h = this.perm.heat[stageId];
    if (!h || !h.traffic || h.traffic.length !== st.cols * st.rows) {
      h = { traffic: new Array(st.cols * st.rows).fill(0), leak: new Array(st.cols * st.rows).fill(0) };
      this.perm.heat[stageId] = h;
    }
    return h;
  },

  // 戦闘の記録を、次の準備フェーズで見られるように畳み込む
  foldHeat(run) {
    const h = this.heatFor(run.stageId);
    const f = BAL.heatFade;
    for (let i = 0; i < h.traffic.length; i++) {
      h.traffic[i] = h.traffic[i] * f + (run.traffic[i] || 0);
      h.leak[i] = h.leak[i] * f + (run.leak[i] || 0);
    }
  },

  // ---------- 配置 ----------
  // 保存形式： perm.placements[stageId] = [ {w, c, r, a, arc}, ... ]
  //   w=武器id  c,r=タイル  a=向き(rad)  arc=射界の半角(rad)
  placementsFor(stageId) {
    const p = this.perm.placements;
    if (!Array.isArray(p[stageId])) p[stageId] = [];
    return p[stageId];
  },

  // **盤に置ける総数。**（2026-09-22・プレイヤー報告「置けすぎ」）
  //
  //   > 「今20基置いて30ステージまで楽勝になってしまってます、
  //   >   現実的にはスキルでもっと大量に置けます、これはおかしいです」
  //
  //   **枠が「武器の種類ごと」だったのが原因。**編成は4種なので、
  //   1つの節で +1 すると盤の上では +4 になる。上限まで取ると **52基**だった
  //   （実測：stock3 + unitBonus1 + カテゴリ節4 + 共通節5 ＝ 13基 × 4種）。
  //   種類ごとの上限をいくら刻んでも、4倍されるので効かない。
  //
  //   **盤全体の総数で持つ。** ここだけ見れば「何基置けるか」が決まる。
  //   種類ごとの上限（unitCap）は「1種類で埋め尽くさせない」ためだけに残す
  slotsTotal() {
    // 取り切りの連なりに割ったので、合計は gkey で取る（skilltree.js の chain）
    return BAL.slotsBase + Skill.gsum(this.meta, 'units');
  },

  slotsUsed() { return this.run ? this.run.units.length : 0; },

  // ---------- 設置は六角1つ。**武器の大きさという概念は無い** ----------
  //
  //   **ユーザー 2026-09-23**
  //   > 「ハニカム形式に移行したのと、壁貫通を無くしたこと、置ける場所を壁沿いのみに
  //   >   したことで、武器の大きさ概念は必要なくなりました、こちらも1マスでいいでしょう」
  //
  //   どの武器も六角セル (c,r) を1つ埋め、その中心に描く・そこから撃つ。
  //   （以前は `footTiles` が「その武器が埋めるセルの一覧」を返し、設置・移動・復元・
  //    描画・タップ判定がそれを回していた。1セルになってからも中継だけ残っていたので畳んだ）

  // (c,r) にいるユニット。無ければ null
  unitAt(c, r, ignore) {
    const run = this.run;
    if (!run) return null;
    return run.units.find(u => u !== ignore && u.c === c && u.r === r) || null;
  },

  // (c,r) に置けるか。**置ける六角で、空いていること**
  canPlaceAt(c, r, ignore) {
    const run = this.run;
    if (!run) return false;
    return run.stage.hexBuildable(c, r) && !this.unitAt(c, r, ignore);
  },

  // ユニットを1つ作る。**置く（placeUnit）と読み戻す（restoreUnits）の両方がここを通る**
  newUnit(weaponId, c, r, face, arc) {
    const def = WEAPONS[weaponId];
    const st = this.run.stage;
    const pos = st.hexCenter(c, r);
    const u = {
      id: weaponId, def, s: Object.assign({}, def.base), flags: {}, dyn: { heat: 0 }, n: 1,
      c, r, x: pos.x, y: pos.y,
      face: face !== undefined ? face : this.defaultFacing(st, c, r),
      arc: arc !== undefined ? arc : def.base.arc,
      angle: 0, cd: 0, target: null, aim: null, shots: 0, muzzle: 0,
    };
    u.angle = u.face;
    return u;
  },

  // その武器を何基まで置けるか。**盤の総数とは別の縛り。**
  //   1種類だけで盤を埋めると編成の意味が消えるので、種類ごとにも天井を置く
  unitCap(weaponId) {
    const def = WEAPONS[weaponId];
    if (!def) return 0;
    // **【調べて、直さないことにした 2026-09-22】**
    //   盤の枠を 6 → 20 → 40 と上げても、置けた数は 22基のまま動かなかった。
    //   `stock + unitBonus + skill` は武器あたり4〜5なので、
    //   編成5種では合計22で頭打ちになる。
    //   **ただし、いまの天井（20枠）では、この頭打ちは効いていない**
    //   （4〜5 × 5種 = 20〜25 ≥ 20）。40枠という、実際には到達しない値で
    //   測ったから見えただけだった。
    //   **「公平な取り分の1.5倍までは置ける」に直したら、通しが遅くなった**
    //   （同じ3シードで 105〜155分 → 147〜181分。全シードで悪化）。
    //   1種類が盤を占められるようになると、編成の噛み合わせが崩れるため。
    //   **盤の天井を20より上げるときは、ここも一緒に見ること**
    return Math.min(this.slotsTotal(),
                    def.stock + BAL.unitBonus + Skill.unitBonusFor(this.meta, def.cat));
  },

  unitCount(weaponId) {
    const run = this.run;
    if (!run) return 0;
    return run.units.filter(u => u.id === weaponId).length;
  },

  // 置いた地点から見て、一番近い通路の方向。置いた瞬間に自動で向く
  //   **(c,r) は六角のセル、通路はタイル。**単位が違うので、
  //   画素に直してから比べる（前はセル番号どうしを引き算していて、
  //   六角に変えた瞬間にあらぬ方向を向くようになる）
  defaultFacing(st, c, r) {
    const p = st.hexCenter(c, r);
    let best = null, bd = 1e9;
    for (let rr = 0; rr < st.rows; rr++) {
      for (let cc = 0; cc < st.cols; cc++) {
        if (!st.walkable(cc, rr)) continue;
        const q = st.center(cc, rr);
        const d = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y);
        if (d < bd) { bd = d; best = q; }
      }
    }
    if (!best) return -Math.PI / 2;
    return Math.atan2(best.y - p.y, best.x - p.x);
  },

  // ---------- ユニットの設置・撤去・調整 ----------
  canBuild() {
    // ビルドできるのは、出撃前と、ウェーブとウェーブの間だけ
    if (this.phase === 'prep') return true;
    return this.phase === 'battle' && this.run && this.run.phase === 'build';
  },

  placeUnit(weaponId, c, r) {
    const run = this.run;
    if (!run || !this.canBuild()) return null;
    if (!this.canPlaceAt(c, r)) return null;
    if (this.unitCount(weaponId) >= this.unitCap(weaponId)) return null;
    if (this.slotsUsed() >= this.slotsTotal()) return null;      // 盤全体の枠

    const u = this.newUnit(weaponId, c, r);
    // 着弾点を持つ武器は、置いた瞬間に既定の点を決める（空撃ちを避ける）
    if (this.usesAimPoint(u.def)) { const p = this.defaultAimPoint(u); u.ax = p.x; u.ay = p.y; }
    run.units.push(u);
    this.applyMods();
    this.syncPlacements();
    return u;
  },

  // 置いたものを別の地面へ移す。**撤去して置き直すと向きと射界が消えるので、そのまま運ぶ**
  moveUnit(u, c, r) {
    const run = this.run;
    if (!run || !this.canBuild()) return false;
    if (!this.canPlaceAt(c, r, u)) return false;
    const pos = run.stage.hexCenter(c, r);
    u.c = c; u.r = r; u.x = pos.x; u.y = pos.y;
    this.syncPlacements();
    return true;
  },

  removeUnit(u) {
    const run = this.run;
    if (!run || !this.canBuild()) return false;
    const i = run.units.indexOf(u);
    if (i < 0) return false;
    run.units.splice(i, 1);
    this.syncPlacements();
    return true;
  },

  aimUnit(u, angle) {
    if (!this.canBuild()) return false;
    u.face = angle;
    u.angle = angle;
    this.syncPlacements();
    return true;
  },

  // 絞れる幅は**武器ごとに違う**。
  //   扇は「首振り扇風機」で、その範囲をずっと撫で続けるもの。
  //   だから全部の武器が同じ幅に広げられると、常に広げたほうが得になってしまう。
  //   スナイパーはほぼ直線まで絞れて貫通を活かす。火炎放射器は絞れず広く焼く
  arcRange(def) {
    return {
      min: (def && def.arcMin !== undefined) ? def.arcMin : BAL.arcMin,
      max: (def && def.arcMax !== undefined) ? def.arcMax : BAL.arcMax,
    };
  },

  setArc(u, delta) {
    if (!this.canBuild()) return false;
    const r = this.arcRange(u.def);
    u.arc = Util.clamp(u.arc + delta, r.min, r.max);
    this.syncPlacements();
    return true;
  },

  // スライダーの位置（0=最も絞る / 1=最も広げる）
  arcT(u) {
    const r = this.arcRange(u.def);
    return Util.clamp((u.arc - r.min) / Math.max(0.001, r.max - r.min), 0, 1);
  },

  // 扇の広さから集弾率を出す。**その武器が絞れる幅の中で**どれだけ絞れているか
  groupingOf(u) {
    // 指定攻撃には掛けない。**あちらは着弾円の面積で密度が決まる**ので、
    // ここで倍率も掛けると「絞ると強い」を二重取りすることになる
    if (this.usesAimPoint(u.def)) return 1;
    // 暴発装薬：**絞っても散る。** 絞る意味が消えるので、広げる側が正解になる
    if (u.flags && u.flags.looseGroup) return 1 - BAL.spreadPenalty;
    return 1 - this.arcT(u) * BAL.spreadPenalty;
  },

  // 指定攻撃の着弾円の半径。スライダーをそのまま半径に読み替える。
  //
  // **下端は「1発ぶんの爆風」。** それより小さく絞っても、爆風どうしが
  // 完全に重なるだけで密度は増えず、届く面だけが減る（＝絞り損）。
  // 実測：迫撃砲を爆風の1/3まで絞ると、ちょうどいい幅の 33撃破 に対して 6撃破 だった。
  // 爆風はカードで大きくなるので、下端もそれに追随させる
  spotRange(def) { return (def && def.spot) || [30, 150]; },
  spotR(u) {
    const s = this.spotRange(u.def);
    const lo = Math.max(s[0], u.s.splash || 0);
    const hi = Math.max(lo + 24, s[1]);
    return lo + (hi - lo) * this.arcT(u);
  },

  syncPlacements() {
    const run = this.run;
    if (!run) return;
    this.perm.placements[run.stageId] = run.units.map(u => ({
      w: u.id, c: u.c, r: u.r, a: +u.face.toFixed(4), arc: +u.arc.toFixed(4),
      // 着弾点を持つ武器は、その点も覚える
      ax: (u.ax === undefined || u.ax === null) ? null : Math.round(u.ax),
      ay: (u.ay === undefined || u.ay === null) ? null : Math.round(u.ay),
    }));
    // 自動設置の元。**転生でも消さない**（空にしたときは覚え直さない＝前の配置を残す）
    if (run.units.length) this.perm.lastPlace[run.stageId] = this.perm.placements[run.stageId];
  },

  // ---------- 着弾点（指定攻撃・ミサイル） ----------
  // **武器に「どこを狙うか」を決めさせない。**プレイヤーが点を指す
  usesAimPoint(def) { return !!(def && def.aimPoint); },

  // 置いた直後の既定の着弾円。
  //   向いている方向へ射程いっぱいまで見て、**通路の上にある一番遠い点**を選ぶ。
  //   ただの7割地点だと、壁や盤の外を撃ち続けることがあった（＝置いた瞬間から空振り）
  defaultAimPoint(u) {
    const st = this.run && this.run.stage;
    let fallback = null;
    for (let f = 0.9; f >= 0.2; f -= 0.05) {
      const d = u.s.range * f;
      const x = u.x + Math.cos(u.face) * d, y = u.y + Math.sin(u.face) * d;
      if (!st) return { x, y };
      if (x <= 4 || y <= 4 || x >= st.w - 4 || y >= st.h - 4) continue;
      if (!fallback) fallback = { x, y };
      if (st.walkable((x / TILE) | 0, (y / TILE) | 0)) return { x, y };
    }
    return fallback || { x: u.x, y: u.y };
  },

  // 着弾円を置く。**制約は射程だけ。**
  //   指定攻撃は砲身から敵へ弾を飛ばさないので、角度で縛る理由がない。
  //   射程の中なら、壁の向こうでも、他の武器の射線の上でも置ける
  setAimPoint(u, x, y) {
    if (!this.canBuild() || !this.usesAimPoint(u.def)) return false;
    const d = Util.dist(u.x, u.y, x, y);
    if (d > u.s.range) {
      const a = Util.angle(u.x, u.y, x, y);
      x = u.x + Math.cos(a) * u.s.range;
      y = u.y + Math.sin(a) * u.s.range;
    }
    u.ax = x; u.ay = y;
    this.syncPlacements();
    return true;
  },

  // 保存された配置を読み戻す。編成から外れた武器や、置けない場所のものは捨てる
  restoreUnits(run) {
    const allowed = this.loadoutWeapons();
    // **自動設置：**この周でまだ一度も触っていない章なら、前の周の配置を置き直す
    //   （触ったことがあれば、空にしたのも本人の意思なのでそのまま）
    const touched = Array.isArray(this.perm.placements[run.stageId]);
    const last = this.perm.lastPlace && this.perm.lastPlace[run.stageId];
    const saved = (!touched && this.autoOpen('autoPlace') && this.perm.autoPlace && last && last.length)
      ? last : this.placementsFor(run.stageId);
    const used = {};
    for (const p of saved) {
      if (!WEAPONS[p.w] || allowed.indexOf(p.w) < 0) continue;
      // 置ける六角で、先に読み戻したものと重なっていないこと（this.run === run）
      if (!this.canPlaceAt(p.c, p.r)) continue;
      used[p.w] = (used[p.w] || 0) + 1;
      if (used[p.w] > this.unitCap(p.w)) continue;
      if (run.units.length >= this.slotsTotal()) continue;
      const nu = this.newUnit(p.w, p.c, p.r, p.a, p.arc);
      if (p.ax !== undefined && p.ax !== null) { nu.ax = p.ax; nu.ay = p.ay; }
      run.units.push(nu);
      // 保存に着弾点が無い古いデータでも、必要な武器なら既定の点を入れておく
      if (this.usesAimPoint(nu.def) && nu.ax === undefined) {
        const ap = this.defaultAimPoint(nu); nu.ax = ap.x; nu.ay = ap.y;
      }
    }
  },

  // ---------- 準備フェーズ ----------
  // いま編成できる武器の種類数（BAL.loadoutByDeep）
  loadoutSlots() {
    let n = BAL.loadoutSlots;
    const d = this.perm ? (this.perm.deepest || 0) : 0;
    for (const [need, k] of (BAL.loadoutByDeep || [])) if (d >= need) n = Math.max(n, k);
    return n;
  },

  // 開くのに要る到達章（枠 i が閉じているときの説明に使う）
  loadoutNeed(i) {
    for (const [need, k] of (BAL.loadoutByDeep || [])) if (k > i) return need;
    return null;
  },

  loadoutWeapons() {
    return this.perm.loadout
      .slice(0, this.loadoutSlots())
      .filter(Boolean)
      .map(cid => CARDS[cid] && CARDS[cid].weapon)
      .filter(wid => wid && WEAPONS[wid]);
  },

  canBuySkills() { return this.phase !== 'battle'; },

  // 盤面とユニットだけ用意した状態。敵は出さない
  startPrep(stageId) {
    stageId = stageId || this.perm.currentStage || 'ch1';
    if (!this.stageUnlocked(stageId)) stageId = 'ch1';
    this.perm.currentStage = stageId;
    this.phase = 'prep';

    const st = Stage.build(stageId);
    const corePos = st.center(st.core.c, st.core.r);
    const n = st.cols * st.rows;

    const run = {
      stage: st, stageId, stageIdx: STAGE_BY_ID[stageId].idx,
      mods: null,
      time: 0,
      wave: 0,
      phase: 'idle',
      toSpawn: 0, spawnTimer: 0,
      enemies: [], bullets: [], fields: [], fx: [], nums: [],
      tower: { x: corePos.x, y: corePos.y, r: BAL.coreR },
      lives: 0, livesMax: 0,
      units: [],
      cards: {},
      coinMul: 1, resonance: 0, chillVuln: BAL.chillVulnBase, backdraft: 0,
      // 遺物の状態異常の軸。applyMods が入れ替える（Combat.damage が毎ヒット読む）
      st: Relic.none,
      kills: 0, coinsEarned: 0, dealt: 0, leaked: 0,
      dmgBy: {}, killBy: {},          // 武器ごとの有効ダメージと撃破（combat.js の damage）
      livesLost: 0, leakBy: {},   // 死因のため：失ったライフと、抜けられた敵の内訳
      shake: 0,
      over: false, cleared: false,
      pendingPicks: 0,
      // （run.spotTarget / run.grabTarget は廃止。狙いを武器に持たせないため）
      traffic: new Array(n).fill(0),
      leak: new Array(n).fill(0),
      trafficT: 0,
      // 一番遠い出現口からコアまでの距離。**倒した場所の「深さ」の物差し**
      maxDist: Math.max(1, ...st.spawns.map(sp => st.dist[st.idx(sp.c, sp.r)]).filter(d => d < 1e8)),
      wp(id) { return this.units.find(u => u.id === id) || null; },
      unitsOf(id) { return this.units.filter(u => u.id === id); },
    };

    this.run = run;
    this.restoreUnits(run);
    this.applyMods();
    return run;
  },

  // 今のアップグレードの内容で、ユニットとコアの数値を組み直す
  applyMods() {
    const run = this.run;
    if (!run) return;
    const mods = Skill.mods(this.meta, this.perm);
    run.mods = mods;
    run.st = mods.relic.st;
    for (const u of run.units) {
      const keepArc = u.arc;
      u.s = Object.assign({}, u.def.base);
      u.s.arc = keepArc;
      // **武器カードの凸。**（ユーザー 2026-09-24「入手出来るカード全てに」）
      //   同じ武器カードが被るほど、その武器の基本ダメージが上がる。倍率は他のカードと同じ rankMul
      u.s.dmg *= this.rankMul('wc_' + u.id);
      Skill.applyTo(u, mods);
      // 組み直したので、カードの足し算の基準も取り直す（Game.addPct）
      u.sBase = null; u.sAdd = null;
    }
    const lost = run.livesMax > 0 ? (run.livesMax - run.lives) : 0;
    run.livesMax = BAL.livesBase + mods.lives;
    run.lives = Math.max(0, run.livesMax - (run.wave > 0 ? lost : 0));
  },

  // ---------- 戦闘 ----------
  beginBattle() {
    const run = this.run;
    if (!run) return;
    this.applyMods();
    run.lives = run.livesMax;
    run.wave = 1;
    run.cards = {};
    run._rkAcc = {};   // 積んだ枚数を戻すので、繰り越しも戻す
    Combat.coinFx = 0; // 前の出撃の残りでコインが飛ばなくなるのを防ぐ
    run.pendingPicks = 0;
    this.phase = 'battle';
    const rec0 = this.stageRec(run.stageId);
    rec0.attempts++;
    // **同じ章で何度も落ちたら、その章の地形を引き直す。**（2026-09-22）
    //   生成マップだと、どうしても手に負えない地形を引くことがある。
    //   検査を厳しくすれば減るが、こんどは候補がほとんど通らず手書きマップに落ちる
    //   （実測：厳しくすると20種のうち11種が生成できない）。
    //   **弾く側で完璧を目指すより、詰んだら引き直せるほうが確実。**
    //   突破済みの章は対象外（踏んだ地形は変えない）。
    //   出撃のたびに見るので、測定器でもゲーム本体でも同じように効く
    if (!rec0.cleared && rec0.attempts > BAL.rerollAfterFails) {
      const rolls = this.perm.mapRoll || (this.perm.mapRoll = {});
      if (rolls[run.stageId] !== undefined) {
        rolls[run.stageId] += 101;                 // 別の引きにする
        rec0.attempts = 0;
        if (typeof Stage !== 'undefined' && Stage.invalidate) Stage.invalidate();
        this.startPrep(run.stageId);               // 新しい地形で組み直す
        return this.beginBattle();
      }
    }
    this.perm.totalRuns++;
    Combat.startWave(run);
    this.save();
  },

  // ウェーブを凌いだあと、次のウェーブを始める
  startNextWave() {
    const run = this.run;
    if (!run || run.over || run.phase !== 'build') return;
    run.wave++;
    Combat.startWave(run);
  },

  // ---------- 終了 ----------
  // ok=true でステージ突破、false でコア破壊
  endRun(ok) {
    const r = this.run;
    if (!r || r.over) return null;
    r.over = true;
    this.phase = 'over';

    const rec = this.stageRec(r.stageId);
    rec.bestWave = Math.max(rec.bestWave, ok ? BAL.wavesPerStage : r.wave);

    this.foldHeat(r);

    const perfect = ok && r.leaked === 0;
    let stageGot = null;
    if (ok) {
      stageGot = this.clearStage(r.stageId, perfect);
      // スキップの根拠になる記録。**転生でも消えない**ので、
      // 次の周では「前に自分で出した成績」をそのまま受け取れる
      const P = this.perm;
      P.clears[r.stageId] = (P.clears[r.stageId] || 0) + 1;
      P.bestCoins[r.stageId] = Math.max(P.bestCoins[r.stageId] || 0, r.coinsEarned);
      if (perfect) P.bestPerfect[r.stageId] = true;
    }

    this.openTabs();     // 出撃を終えたらタブが開く（totalRuns は beginBattle で数えている）
    const missions = this.checkMissions();
    const dmg = this.logDamage(r, ok);
    this.save();
    return {
      ok, perfect, stage: STAGE_BY_ID[r.stageId], wave: r.wave,
      kills: r.kills, coins: r.coinsEarned, leaked: r.leaked,
      lives: Math.max(0, Math.ceil(r.lives)), livesMax: r.livesMax,
      stageGot, missions, dmg,
    };
  },

  // ---------- 武器ごとの記録 ----------
  //   （ユーザー 2026-09-25「リザルトで何が一番ダメージを出していたかを残して、それを何件か分保存しておけば、
  //    あなたがそれを確認して『この転生回数にしては火力が出過ぎているな？』みたいなバランスの異変にも気が付きやすそう」）
  //   出撃ごとに、武器ごとの有効ダメージ・撃破・置いた数と、その回の条件（版・章・転生回数・漏れ・勝ち負け）を
  //   perm.dmgLog に新しい順で DMG_LOG_MAX 件残す（転生でも消えない）。**有効ダメージ**は敵の残りHPまでで切った値
  dmgRanking(r) {
    const n = {};
    for (const w of (r.units || [])) n[w.id] = (n[w.id] || 0) + 1;
    const ids = Object.keys(Object.assign({}, r.dmgBy || {}, n));
    const tot = ids.reduce((a, id) => a + ((r.dmgBy || {})[id] || 0), 0) || 1;
    return ids.map(id => ({ id, dmg: (r.dmgBy || {})[id] || 0, kills: (r.killBy || {})[id] || 0, n: n[id] || 0,
      pct: Math.round(1000 * (((r.dmgBy || {})[id] || 0) / tot)) / 10 }))
      .filter(x => x.dmg > 0 || x.n > 0)
      .sort((a, b) => b.dmg - a.dmg);
  },
  logDamage(r, ok) {
    const rank = this.dmgRanking(r);
    const P = this.perm;
    const log = P.dmgLog || (P.dmgLog = []);
    log.unshift({
      at: Date.now(), build: BUILD, stage: r.stageId, ok: !!ok, wave: r.wave,
      prestiges: P.prestiges || 0, legacyDeep: P.legacyDeep || 0, deepest: P.deepest || 0,
      leaked: r.leaked, kills: r.kills, placed: (r.units || []).length,
      w: rank.map(x => [x.id, +x.dmg.toPrecision(4), x.kills, x.n]),
    });
    if (log.length > DMG_LOG_MAX) log.length = DMG_LOG_MAX;
    return rank;
  },

  // タブの解禁。**一度開いたら閉じない**
  //   スキル・装備 … 一度でも出撃を終えたら（負けても開く）
  //   パック … パックを手にしたら（デッキのタブは 2026-09-25 に撤去）
  openTabs() {
    const t = this.perm.tabs || (this.perm.tabs = { skill: false, load: false, pack: false });
    const opened = [];
    if (!t.skill && this.perm.totalRuns > 0) { t.skill = true; t.load = true; opened.push('skill', 'load'); }
    // **最初から持っている1個では開かない。** 遊んで手に入れてから
    if (!t.pack && (this.perm.packsEarned || 0) > 0) { t.pack = true; opened.push('pack'); }
    return opened;
  },
  tabOpen(id) {
    if (id === 'coll' || id === 'pres') return !!(this.perm.tabs && this.perm.tabs.skill);
    return !!(this.perm.tabs && this.perm.tabs[id]);
  },

  // ---------- 転生 ----------
  //
  //   **【2026-09-22・最重要】転生の評価は「実際に突破した数」だけで決める。**
  //
  //   ユーザー指示
  //   > 「仕様変更後のスキップによる**最高到達地点の無限ファーム**も対策しないと
  //   >   いけません、**クリアフラグのチェックマークだけ与えられても
  //   >   転生スコアが伸びないように**してください、
  //   >   **これは本当にゲームの命に関わります**」
  //
  //   スキップは前回到達地点まで無料で飛べるので、
  //   **飛ばす → 転生 → 飛ばす → 転生** を繰り返すだけで、
  //   1回も戦わずに転生報酬（遺物パック）が無限に出てしまう。
  //
  //   なので**転生できる条件も、転生で出る量も、`clearedCount()`（実際の突破）で見る。**
  //   進行や値段の桁は `progressCount()`（突破＋スキップ）のままでよい。
  //   そちらは「どこまで来たか」であって、報酬ではないため
  canPrestige() { return this.clearedCount() >= BAL.prestigeMinStages; },

  prestige() {
    if (!this.canPrestige()) return null;
    const cleared = this.clearedCount();
    const mods = Skill.mods(this.meta, this.perm);
    // **回数を先に増やす。** 遺物パックは「転生1回」で解放されるので、
    // 増やす前に配ると、初回転生の報酬である遺物パックが自分自身の条件で弾かれる
    this.perm.prestiges++;
    // **ここで捨てないと、転生した直後の出撃に恒久の土台が乗らない。**
    //   （2026-09-22・総点検で発見）Legacy.of は `prestiges > 0` で初めて効くのに、
    //   Relic.mods は転生前に作ったキャッシュ（土台1倍）を返し続けていた。
    //   遺物パックを開ければ Game.grant が捨ててくれるので気づきにくいが、
    //   **開けずに出撃した1回は、土台なしで戦うことになる**
    // **土台の基準を、この時点の到達で固定する。**
    //   `deepest` を直接見ると周の途中で伸びて暴走するので、
    //   **転生のときだけ写し取る。**これが「前回到達章」の正体
    this.perm.legacyDeep = this.perm.deepest || 0;
    Relic.invalidate();
    const reward = Pack.prestigeReward(cleared, this.perm.prestiges - 1, mods.packLuck);
    const sink = { packs: {} };
    for (const k in reward) if (reward[k] > 0) this.addPack(k, reward[k], sink);
    // 遺物「初動資金」のぶんだけ、次の周は資金を持って始まる
    this.meta.coins = Relic.mods(this.perm).seed;
    this.meta.skills = {};
    // **ステージ進行も戻す。** もう一度突破すれば初回報酬と初回完璧の報酬を取り直せる。
    // deepest（到達した深さ）だけは戻さないので、パックの解放は保たれる
    this.perm.stages = {};
    this.perm.currentStage = 'ch1';
    // **配置だけ捨てる。地形は変えない。**（ユーザー決定「配置は転生で消える」）
    //
    //   最初は転生のたびに30章ぶんの地形を作り直していた。**そこまでは言われていない。**
    //   しかも作り直すと**周が後退する**（実測：26章まで行った次の周が22章、
    //   20章の次が16章）。前の周で凌いだ章が別の地形になるので、
    //   積み上げたはずのものが返ってこない。
    //   地形は1つのセーブの中でずっと同じにして、**配置だけ捨てる。**
    //   別の遊びで別の地形になるのは mapSeed が違うから
    this.perm.placements = {};
    // **まだ届いていない章の地形だけ引き直す**（stages.js の mapRowsFor）。
    //   踏んだ章（deepest より手前）は覚えた引きをそのまま使うので変わらない。
    //   壁に当たった章は次の周で別の地形になる
    const deep = this.perm.deepest || 0;
    const rolls = this.perm.mapRoll || {};
    for (const id of Object.keys(rolls)) {
      const rec = STAGE_BY_ID[id];
      if (rec && rec.idx >= deep) delete rolls[id];
    }
    if (typeof Stage !== 'undefined' && Stage.invalidate) Stage.invalidate();
    this.run = null;
    this.phase = 'prep';
    const missions = this.checkMissions();
    this.save();
    return { reward: sink.packs, missions, prestiges: this.perm.prestiges, resetStages: cleared };
  },
};
