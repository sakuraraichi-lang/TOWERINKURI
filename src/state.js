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

const SAVE_KEY = 'inkuriment_save_v3';
const OLD_KEYS = ['inkuriment_save_v2', 'inkuriment_save_v1'];

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
    this.perm = {
      collection: Object.assign({}, STARTER_CARDS),
      // **最初はパックを持っていない。** 基本パックは2ステージ突破で解放される
      packs: { basic: 0, arms: 0, chem: 0, syn: 0, relic: 0 },
      deepest: 0,        // 転生を挟んでも戻らない「到達した深さ」。パックの解放条件に使う
      prestiges: 0,
      totalKills: 0,
      totalRuns: 0,
      packsEarned: 0,     // **遊んで手に入れた**パックの数（最初から持っている1個は数えない）
      missions: {},
      loadout: ['wc_gatling', 'wc_sniper', null, null],
      stages: { ch1: { cleared: false, perfect: false, bestWave: 0, attempts: 0 } },
      currentStage: 'ch1',
      placements: {},
      heat: {},          // stageId -> { traffic: [], leak: [] }
      // **タブは最初から全部出さない。** 遊んで意味が分かった順に開く
      tabs: { skill: false, load: false, pack: false, deck: false },
      // チュートリアルで今どこまで進んだか。**一度に1操作しか教えない**
      tut: 0,
      // 換装。**持ち物と、今どこに付いているかを分けて持つ**
      //   swapsOwned … パックで手に入れた部品（swapId -> 1）。転生で消えない
      //   swaps      … 今その部品がどのノードに付いているか（baseId -> swapId）
      // 分けてあるので、**一度手に入れた部品はツリーでいつでも付け外しできる**
      swapsOwned: {},
      swaps: {},
      // 武器の調整ポップアップを置いた場所（プレイヤーが動かせる）
      upop: null,
      // 処理の重さを出すか（実機で敵数の上限を測るため）
      perf: false,
      mute: false,        // 音を止めているか
      // カードを選んだあと、自動で次のウェーブへ進むか。ホームの ⚙ で切り替える
      autoWave: true,
      // スキップの解放と、スキップで配るものの根拠。**転生でも消えない**
      clears: {},      // stageId -> 通算の突破回数
      bestCoins: {},   // stageId -> 手で突破したときの最高コイン
      bestPerfect: {}, // stageId -> 一度でも完璧クリアしたか
    };
    this.meta = { coins: 0, skills: {} };
  },

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 3, perm: this.perm, meta: this.meta }));
    } catch (e) { /* プライベートモードなどでは黙って諦める */ }
  },

  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { d = null; }
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
    if (!this.perm.heat) this.perm.heat = {};
    if (!this.perm.swaps) this.perm.swaps = {};
    if (!this.perm.swapsOwned) this.perm.swapsOwned = {};
    // 古いセーブ（持ち物の概念が無かった頃）は、付いている部品を持ち物にも入れる
    for (const k of Object.keys(this.perm.swaps)) this.perm.swapsOwned[this.perm.swaps[k]] = 1;
    for (const k of Object.keys(this.perm.swapsOwned)) if (!SWAP_BY_ID[k]) delete this.perm.swapsOwned[k];
    if (!this.perm.clears) this.perm.clears = {};
    if (!this.perm.bestCoins) this.perm.bestCoins = {};
    if (!this.perm.bestPerfect) this.perm.bestPerfect = {};
    if (typeof this.perm.autoWave !== 'boolean') this.perm.autoWave = true;
    // 定義から消えた換装は落とす（古いセーブが未知のidを持ち続けないように）
    for (const k of Object.keys(this.perm.swaps)) if (!SWAP_BY_ID[this.perm.swaps[k]]) delete this.perm.swaps[k];
    if (typeof this.perm.deepest !== 'number') this.perm.deepest = this.clearedCount();
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
    try { localStorage.removeItem(SAVE_KEY); for (const k of OLD_KEYS) localStorage.removeItem(k); } catch (e) {}
    this.newSave();
    Relic.invalidate();
  },

  // ---------- ステージ ----------
  stageRec(id) {
    if (!this.perm.stages[id]) this.perm.stages[id] = { cleared: false, perfect: false, bestWave: 0, attempts: 0 };
    return this.perm.stages[id];
  },

  clearedCount() { return MAIN_STAGES.filter(s => this.stageRec(s.id).cleared).length; },

  // ---------- スキップ ----------
  //
  //   **スキップしても何も失わない。** 手で突破したときと同じものが出る。
  //   周回のたびに同じステージを手で殴り直させないのが目的で、
  //   報酬を削ると「速く回りたいのに損をする」になって本末転倒になる。
  //
  //   代わりに**解放を慎重にする**：
  //     ・転生を1回以上している（初周は全部自分で遊ぶ）
  //     ・そのステージを**通算3回以上**突破している（1回では手応えを覚えていない）
  //     ・**まだ突破していない**ステージは対象外（記録が無いので自動的にそうなる）
  //   通算の突破回数は perm.clears に持つ。**転生でも消えない**
  SKIP_MIN_CLEARS: 3,
  SKIP_MIN_PRESTIGES: 1,

  clearsOf(id) { return (this.perm.clears && this.perm.clears[id]) || 0; },

  // **完全クリアしたステージは、次の周から即スキップできる。**
  // 1体も通さずに凌げたなら、そのステージはもう自分のものなので、条件を免除する
  perfectedEver(id) { return !!(this.perm.bestPerfect && this.perm.bestPerfect[id]); },

  canSkip(id) {
    if (STAGE_BY_ID[id] && STAGE_BY_ID[id].experimental) return false;
    if (this.stageRec(id).cleared) return false;          // 今周でもう突破している
    if (!this.stageUnlocked(id)) return false;
    if (this.perfectedEver(id)) return true;              // 完全クリア済みなら無条件
    if ((this.perm.prestiges || 0) < this.SKIP_MIN_PRESTIGES) return false;
    return this.clearsOf(id) >= this.SKIP_MIN_CLEARS;
  },

  skipWhy(id) {
    if ((this.perm.prestiges || 0) < this.SKIP_MIN_PRESTIGES) return '転生するか、完璧クリアで使えます';
    const n = this.clearsOf(id);
    if (n < this.SKIP_MIN_CLEARS) return 'あと ' + (this.SKIP_MIN_CLEARS - n) + ' 回突破するか、完璧クリアで使えます';
    return '';
  },

  // スキップで得るコイン。**前に手で突破したときの最高額**をそのまま渡す
  skipCoins(id) { return Math.round((this.perm.bestCoins && this.perm.bestCoins[id]) || 0); },

  // 戦わずに突破扱いにする。得るものは手で突破したときと同じ
  skipStage(id) {
    if (!this.canSkip(id)) return null;
    const coins = this.skipCoins(id);
    this.meta.coins += coins;
    // 前に完璧クリアまで届いていたステージは、その記録どおり完璧扱いにする
    const perfect = !!(this.perm.bestPerfect && this.perm.bestPerfect[id]);
    const got = this.clearStage(id, perfect);
    const missions = this.checkMissions();
    this.save();
    return { coins, perfect, stageGot: got, missions, stage: STAGE_BY_ID[id] };
  },

  stageUnlocked(id) {
    const def = STAGE_BY_ID[id];
    // 実験用はいつでも遊べる。**本編の鎖には入れない**
    if (def.experimental) return true;
    const i = MAIN_STAGES.findIndex(s => s.id === id);
    if (i <= 0) return true;
    return this.stageRec(MAIN_STAGES[i - 1].id).cleared;
  },

  // perfect = 1体も抜けさせずに5ウェーブ凌いだ（完璧クリア）
  clearStage(id, perfect) {
    const rec = this.stageRec(id);
    const first = !rec.cleared;
    const firstPerfect = perfect && !rec.perfect;
    rec.cleared = true;
    if (perfect) rec.perfect = true;
    this.perm.deepest = Math.max(this.perm.deepest || 0, this.clearedCount());
    const def = STAGE_BY_ID[id];
    // 次のステージも本編の並びで探す（実験用へは送らない）
    const mi = MAIN_STAGES.findIndex(s => s.id === id);
    const nextStage = (mi >= 0) ? (MAIN_STAGES[mi + 1] || null) : null;
    const got = { first, perfect: !!perfect, firstPerfect,
                  cards: [], packs: {}, stage: def, next: nextStage };
    const addPack = (k, n) => this.addPack(k, n, got);
    // **実験用のステージは報酬を出さない。** 比較のために置いてあるだけで、
    // ここで稼げてしまうと本編の経済がぶれる
    if (first && !def.experimental) {
      for (const cid of (def.reward.cards || [])) { this.grant(cid, 1); got.cards.push(cid); }
      for (const k in (def.reward.packs || {})) addPack(k, def.reward.packs[k]);
    }
    // 完璧クリアはパックの入手経路。1体も通さない配置を組めた報酬。
    // 出るのは「そのステージの分野」なので、浅いところを完璧にしても奥の分野は掘れない
    if (perfect && !def.experimental) {
      const kind = Pack.forStage(id);
      addPack(kind, 1);
      if (firstPerfect) addPack(kind, 1);
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

  // ダブりで上がるランク。**1枚目がランク1。** 同じカードを重ねるほど効果が伸びる。
  //   効果量は CARDS[].apply が rankMul を掛けて使う
  cardRank(cardId) { return Math.max(1, this.own(cardId)); },

  // ランクごとの効果倍率。**1枚目は等倍。** 1枚増えるごとに +12%
  //   累乗にしないのは、上限なしの累乗が必ず壊れるから（集金効率の事故）
  rankMul(cardId) {
    // 伸ばす数字を持たないカード（noRank）は、何枚あっても等倍
    if (CARDS[cardId] && CARDS[cardId].noRank) return 1;
    return 1 + 0.12 * (this.cardRank(cardId) - 1);
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

  // その武器を何基まで置けるか
  unitCap(weaponId) {
    const def = WEAPONS[weaponId];
    if (!def) return 0;
    // 全武器共通の「増設基盤」と、カテゴリごとの設置数ノードの両方が効く
    return def.stock + BAL.unitBonus
         + Skill.amount(this.meta, 'units')
         + Skill.unitBonusFor(this.meta, def.cat);
  },

  unitCount(weaponId) {
    const run = this.run;
    if (!run) return 0;
    return run.units.filter(u => u.id === weaponId).length;
  },

  // 置いた地点から見て、一番近い通路の方向。置いた瞬間に自動で向く
  defaultFacing(st, c, r) {
    let best = null, bd = 1e9;
    for (let rr = 0; rr < st.rows; rr++) {
      for (let cc = 0; cc < st.cols; cc++) {
        if (!st.walkable(cc, rr)) continue;
        const d = (cc - c) * (cc - c) + (rr - r) * (rr - r);
        if (d < bd) { bd = d; best = { c: cc, r: rr }; }
      }
    }
    if (!best) return -Math.PI / 2;
    return Math.atan2(best.r - r, best.c - c);
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
    if (!run.stage.buildable(c, r)) return null;
    if (run.units.some(u => u.c === c && u.r === r)) return null;
    if (this.unitCount(weaponId) >= this.unitCap(weaponId)) return null;

    const def = WEAPONS[weaponId];
    const pos = run.stage.center(c, r);
    const u = {
      id: weaponId, def, s: Object.assign({}, def.base), flags: {}, dyn: { heat: 0 }, n: 1,
      c, r, x: pos.x, y: pos.y,
      face: this.defaultFacing(run.stage, c, r),
      arc: def.base.arc,
      angle: 0, cd: 0, target: null, aim: null, shots: 0, muzzle: 0,
    };
    u.angle = u.face;
    // 着弾点を持つ武器は、置いた瞬間に既定の点を決める（空撃ちを避ける）
    if (this.usesAimPoint(def)) { const p = this.defaultAimPoint(u); u.ax = p.x; u.ay = p.y; }
    run.units.push(u);
    this.applyMods();
    this.syncPlacements();
    return u;
  },

  // 置いたものを別の地面へ移す。**撤去して置き直すと向きと射界が消えるので、そのまま運ぶ**
  moveUnit(u, c, r) {
    const run = this.run;
    if (!run || !this.canBuild()) return false;
    if (!run.stage.buildable(c, r)) return false;
    if (run.units.some(o => o !== u && o.c === c && o.r === r)) return false;
    const pos = run.stage.center(c, r);
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
    const saved = this.placementsFor(run.stageId);
    const used = {};
    const taken = {};
    for (const p of saved) {
      if (!WEAPONS[p.w] || allowed.indexOf(p.w) < 0) continue;
      if (!run.stage.buildable(p.c, p.r)) continue;
      const key = p.c + ',' + p.r;
      if (taken[key]) continue;
      used[p.w] = (used[p.w] || 0) + 1;
      if (used[p.w] > this.unitCap(p.w)) continue;
      taken[key] = 1;
      const def = WEAPONS[p.w];
      const pos = run.stage.center(p.c, p.r);
      run.units.push({
        id: p.w, def, s: Object.assign({}, def.base), flags: {}, dyn: { heat: 0 }, n: 1,
        c: p.c, r: p.r, x: pos.x, y: pos.y,
        face: p.a !== undefined ? p.a : this.defaultFacing(run.stage, p.c, p.r),
        arc: p.arc !== undefined ? p.arc : def.base.arc,
        angle: 0, cd: 0, target: null, aim: null, shots: 0, muzzle: 0,
        ax: (p.ax === undefined || p.ax === null) ? undefined : p.ax,
        ay: (p.ay === undefined || p.ay === null) ? undefined : p.ay,
      });
      const nu = run.units[run.units.length - 1];
      nu.angle = nu.face;
      // 保存に着弾点が無い古いデータでも、必要な武器なら既定の点を入れておく
      if (this.usesAimPoint(def) && nu.ax === undefined) {
        const ap = this.defaultAimPoint(nu); nu.ax = ap.x; nu.ay = ap.y;
      }
    }
  },

  // ---------- 準備フェーズ ----------
  loadoutWeapons() {
    return this.perm.loadout
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
      kills: 0, coinsEarned: 0, dealt: 0, leaked: 0,
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
    for (const u of run.units) {
      const keepArc = u.arc;
      u.s = Object.assign({}, u.def.base);
      u.s.arc = keepArc;
      Skill.applyTo(u, mods);
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
    run.pendingPicks = 0;
    this.phase = 'battle';
    this.stageRec(run.stageId).attempts++;
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
    this.save();
    return {
      ok, perfect, stage: STAGE_BY_ID[r.stageId], wave: r.wave,
      kills: r.kills, coins: r.coinsEarned, leaked: r.leaked,
      lives: Math.max(0, Math.ceil(r.lives)), livesMax: r.livesMax,
      stageGot, missions,
    };
  },

  // タブの解禁。**一度開いたら閉じない**
  //   スキル・装備 … 一度でも出撃を終えたら（負けても開く）
  //   パック・デッキ … パックを手にしたら
  openTabs() {
    const t = this.perm.tabs || (this.perm.tabs = { skill: false, load: false, pack: false, deck: false });
    const opened = [];
    if (!t.skill && this.perm.totalRuns > 0) { t.skill = true; t.load = true; opened.push('skill', 'load'); }
    // **最初から持っている1個では開かない。** 遊んで手に入れてから
    if (!t.pack && (this.perm.packsEarned || 0) > 0) { t.pack = true; t.deck = true; opened.push('pack', 'deck'); }
    return opened;
  },
  tabOpen(id) {
    if (id === 'coll' || id === 'pres') return !!(this.perm.tabs && this.perm.tabs.skill);
    return !!(this.perm.tabs && this.perm.tabs[id]);
  },

  // ---------- 転生 ----------
  canPrestige() { return this.clearedCount() >= BAL.prestigeMinStages; },

  prestige() {
    if (!this.canPrestige()) return null;
    const cleared = this.clearedCount();
    const mods = Skill.mods(this.meta, this.perm);
    // **回数を先に増やす。** 遺物パックは「転生1回」で解放されるので、
    // 増やす前に配ると、初回転生の報酬である遺物パックが自分自身の条件で弾かれる
    this.perm.prestiges++;
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
    this.run = null;
    this.phase = 'prep';
    const missions = this.checkMissions();
    this.save();
    return { reward: sink.packs, missions, prestiges: this.perm.prestiges, resetStages: cleared };
  },
};
