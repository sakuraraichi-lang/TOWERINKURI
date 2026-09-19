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
  showHeat: true,       // 通行量ヒートマップを出すか
  showLeak: true,       // 漏れたルートを出すか

  // ---------- セーブ ----------
  newSave() {
    this.perm = {
      collection: Object.assign({}, STARTER_CARDS),
      packs: { basic: 1, arms: 0, chem: 0, syn: 0 },
      deepest: 0,        // 転生を挟んでも戻らない「到達した深さ」。パックの解放条件に使う
      prestiges: 0,
      totalKills: 0,
      totalRuns: 0,
      packsEarned: 0,     // **遊んで手に入れた**パックの数（最初から持っている1個は数えない）
      missions: {},
      loadout: ['wc_gatling', 'wc_sniper', null, null],
      stages: { st1: { cleared: false, perfect: false, bestWave: 0, attempts: 0 } },
      currentStage: 'st1',
      placements: {},
      heat: {},          // stageId -> { traffic: [], leak: [] }
      // **タブは最初から全部出さない。** 遊んで意味が分かった順に開く
      tabs: { skill: false, load: false, pack: false, deck: false },
      // チュートリアルで今どこまで進んだか。**一度に1操作しか教えない**
      tut: 0,
      // 換装。baseId -> swapId。パックの3択で入れ替えたスキル
      swaps: {},
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
    // 定義から消えた換装は落とす（古いセーブが未知のidを持ち続けないように）
    for (const k of Object.keys(this.perm.swaps)) if (!SWAP_BY_ID[this.perm.swaps[k]]) delete this.perm.swaps[k];
    if (typeof this.perm.deepest !== 'number') this.perm.deepest = this.clearedCount();
    // パックは今の定義と同じキーだけにする。
    // 昔の save には rare / epic が残っていて、開けられないまま数え続けていた
    if (!this.perm.packs) this.perm.packs = {};
    for (const k of Object.keys(this.perm.packs)) if (PACK_IDS.indexOf(k) < 0) delete this.perm.packs[k];
    for (const k of PACK_IDS) if (typeof this.perm.packs[k] !== 'number') this.perm.packs[k] = 0;
    if (!STAGE_BY_ID[this.perm.currentStage]) this.perm.currentStage = 'st1';
    return true;
  },

  hardReset() {
    try { localStorage.removeItem(SAVE_KEY); for (const k of OLD_KEYS) localStorage.removeItem(k); } catch (e) {}
    this.newSave();
  },

  // ---------- ステージ ----------
  stageRec(id) {
    if (!this.perm.stages[id]) this.perm.stages[id] = { cleared: false, perfect: false, bestWave: 0, attempts: 0 };
    return this.perm.stages[id];
  },

  clearedCount() { return MAIN_STAGES.filter(s => this.stageRec(s.id).cleared).length; },

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
    const addPack = (k, n) => {
      this.perm.packs[k] = (this.perm.packs[k] || 0) + n;
      got.packs[k] = (got.packs[k] || 0) + n;
      this.perm.packsEarned = (this.perm.packsEarned || 0) + n;
    };
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

  // ---------- コレクション ----------
  own(cardId) { return this.perm.collection[cardId] || 0; },
  grant(cardId, n) { this.perm.collection[cardId] = (this.perm.collection[cardId] || 0) + (n || 1); },

  // 1回の出撃で重ねられる上限。所持枚数では絞らない
  // （絞ると、手持ちが薄いうちは3択の候補が1枚しか出ず、選ぶ意味が消えるため）
  stackLimit(cardId) {
    const c = CARDS[cardId];
    if (!c || c.kind === 'weapon') return 0;
    return c.maxStack || 1;
  },

  // ダブりは「出やすさ」に変換する。持っているほど3択に顔を出す
  cardWeight(cardId) {
    return 1 + 0.45 * Math.max(0, this.own(cardId) - 1);
  },

  ownedWeaponIds() { return WEAPON_IDS.filter(wid => this.own('wc_' + wid) > 0); },

  checkMissions() {
    const got = [];
    for (const m of MISSIONS) {
      if (this.perm.missions[m.id]) continue;
      if (m.check(this.perm)) {
        this.perm.missions[m.id] = true;
        for (const k in m.reward) {
          this.perm.packs[k] = (this.perm.packs[k] || 0) + m.reward[k];
          this.perm.packsEarned = (this.perm.packsEarned || 0) + m.reward[k];
        }
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
      id: weaponId, def, s: Object.assign({}, def.base), flags: {}, dyn: { heat: 0 },
      c, r, x: pos.x, y: pos.y,
      face: this.defaultFacing(run.stage, c, r),
      arc: def.base.arc,
      angle: 0, cd: 0, target: null, aim: null, shots: 0, muzzle: 0,
    };
    u.angle = u.face;
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

  setArc(u, delta) {
    if (!this.canBuild()) return false;
    u.arc = Util.clamp(u.arc + delta, BAL.arcMin, BAL.arcMax);
    this.syncPlacements();
    return true;
  },

  // 扇の広さから集弾率を出す。狭く絞るほど弾がまとまる
  groupingOf(u) {
    const t = Util.clamp((u.arc - BAL.arcMin) / (BAL.arcMax - BAL.arcMin), 0, 1);
    return 1 - t * BAL.spreadPenalty;
  },

  syncPlacements() {
    const run = this.run;
    if (!run) return;
    this.perm.placements[run.stageId] = run.units.map(u => ({
      w: u.id, c: u.c, r: u.r, a: +u.face.toFixed(4), arc: +u.arc.toFixed(4),
    }));
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
        id: p.w, def, s: Object.assign({}, def.base), flags: {}, dyn: { heat: 0 },
        c: p.c, r: p.r, x: pos.x, y: pos.y,
        face: p.a !== undefined ? p.a : this.defaultFacing(run.stage, p.c, p.r),
        arc: p.arc !== undefined ? p.arc : def.base.arc,
        angle: 0, cd: 0, target: null, aim: null, shots: 0, muzzle: 0,
      });
      run.units[run.units.length - 1].angle = run.units[run.units.length - 1].face;
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
    stageId = stageId || this.perm.currentStage || 'st1';
    if (!this.stageUnlocked(stageId)) stageId = 'st1';
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
      spotTarget: null, grabTarget: null,
      traffic: new Array(n).fill(0),
      leak: new Array(n).fill(0),
      trafficT: 0,
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
    if (ok) stageGot = this.clearStage(r.stageId, perfect);

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
    const reward = Pack.prestigeReward(cleared, this.perm.prestiges, mods.packLuck);
    for (const k in reward) {
      this.perm.packs[k] = (this.perm.packs[k] || 0) + reward[k];
      this.perm.packsEarned = (this.perm.packsEarned || 0) + reward[k];
    }
    this.perm.prestiges++;
    this.meta.coins = 0;
    this.meta.skills = {};
    // **ステージ進行も戻す。** もう一度突破すれば初回報酬と初回完璧の報酬を取り直せる。
    // deepest（到達した深さ）だけは戻さないので、パックの解放は保たれる
    this.perm.stages = {};
    this.perm.currentStage = 'st1';
    this.run = null;
    this.phase = 'prep';
    const missions = this.checkMissions();
    this.save();
    return { reward, missions, prestiges: this.perm.prestiges, resetStages: cleared };
  },
};
