// ---------------------------------------------------------------
// state.js : セーブと、準備 → 戦闘 → 結果 の流れ
//
//   1ステージ = 5ウェーブ。全部凌げば突破、コアが割れたら失敗。
//   スキルは「準備フェーズ」でしか買えない。戦闘に入ったら編成は固定される
//   （武器の置き場所だけは戦闘中も動かせる）
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
      packs: { basic: 1, rare: 0, epic: 0 },
      prestiges: 0,
      totalKills: 0,
      totalRuns: 0,
      missions: {},
      loadout: ['wc_gatling', 'wc_sniper', null, null],
      stages: { st1: { cleared: false, bestWave: 0, attempts: 0 } },
      currentStage: 'st1',
      placements: {},
      heat: {},          // stageId -> { traffic: [], leak: [] }
      seenIntro: false,
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
        Object.assign(this.perm.packs, old.perm.packs || {});
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
    if (!STAGE_BY_ID[this.perm.currentStage]) this.perm.currentStage = 'st1';
    return true;
  },

  hardReset() {
    try { localStorage.removeItem(SAVE_KEY); for (const k of OLD_KEYS) localStorage.removeItem(k); } catch (e) {}
    this.newSave();
  },

  // ---------- ステージ ----------
  stageRec(id) {
    if (!this.perm.stages[id]) this.perm.stages[id] = { cleared: false, bestWave: 0, attempts: 0 };
    return this.perm.stages[id];
  },

  clearedCount() { return STAGES.filter(s => this.stageRec(s.id).cleared).length; },

  stageUnlocked(id) {
    const i = STAGE_BY_ID[id].idx;
    if (i <= 0) return true;
    return this.stageRec(STAGES[i - 1].id).cleared;
  },

  clearStage(id) {
    const rec = this.stageRec(id);
    const first = !rec.cleared;
    rec.cleared = true;
    const def = STAGE_BY_ID[id];
    const got = { first, cards: [], packs: {}, stage: def, next: STAGES[def.idx + 1] || null };
    if (first) {
      for (const cid of (def.reward.cards || [])) { this.grant(cid, 1); got.cards.push(cid); }
      for (const k in (def.reward.packs || {})) {
        this.perm.packs[k] = (this.perm.packs[k] || 0) + def.reward.packs[k];
        got.packs[k] = def.reward.packs[k];
      }
    }
    this.save();
    return got;
  },

  // ---------- コレクション ----------
  own(cardId) { return this.perm.collection[cardId] || 0; },
  grant(cardId, n) { this.perm.collection[cardId] = (this.perm.collection[cardId] || 0) + (n || 1); },

  stackLimit(cardId) {
    const c = CARDS[cardId];
    if (!c || c.kind === 'weapon') return 0;
    return Math.min(c.maxStack || 1, this.own(cardId));
  },

  ownedWeaponIds() { return WEAPON_IDS.filter(wid => this.own('wc_' + wid) > 0); },

  checkMissions() {
    const got = [];
    for (const m of MISSIONS) {
      if (this.perm.missions[m.id]) continue;
      if (m.check(this.perm)) {
        this.perm.missions[m.id] = true;
        for (const k in m.reward) this.perm.packs[k] = (this.perm.packs[k] || 0) + m.reward[k];
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
  placementsFor(stageId) {
    if (!this.perm.placements[stageId]) this.perm.placements[stageId] = {};
    return this.perm.placements[stageId];
  },

  goodWallTiles(st) {
    const out = [];
    for (let r = 0; r < st.rows; r++) {
      for (let c = 0; c < st.cols; c++) {
        if (!st.isWall(c, r)) continue;
        let touch = 0, best = Infinity;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nc = c + dc, nr = r + dr;
          if (!st.walkable(nc, nr)) continue;
          touch++;
          best = Math.min(best, st.dist[st.idx(nc, nr)]);
        }
        if (touch > 0) out.push({ c, r, touch, near: best });
      }
    }
    out.sort((a, b) => (b.touch - a.touch) || (a.near - b.near));
    return out;
  },

  // 初期配置は経路に沿って散らす。
  // コア周りに固めると、敵が通路を歩き切るまで誰も撃てず、ただ待つ時間が生まれる
  autoPlace(st, weaponIds) {
    const place = this.placementsFor(st.id);
    const taken = {};
    for (const wid of weaponIds) {
      const p = place[wid];
      if (p && st.isWall(p.c, p.r) && !taken[p.c + ',' + p.r]) taken[p.c + ',' + p.r] = 1;
      else delete place[wid];
    }
    const pool = this.goodWallTiles(st);
    if (!pool.length) return place;
    const maxNear = Math.max.apply(null, pool.map(t => (t.near < Infinity ? t.near : 0)));
    const need = weaponIds.filter(wid => !place[wid]);

    need.forEach((wid, i) => {
      // 出現口寄り〜コア寄りまで、等間隔に受け持たせる
      const want = maxNear * (0.80 - 0.62 * (i / Math.max(1, need.length - 1 || 1)));
      let best = null, bestScore = -Infinity;
      for (const t of pool) {
        const key = t.c + ',' + t.r;
        if (taken[key]) continue;
        let far = 1e9;
        for (const k in taken) {
          const [tc, tr] = k.split(',').map(Number);
          far = Math.min(far, Math.hypot(t.c - tc, t.r - tr));
        }
        if (far === 1e9) far = 10;
        const score = t.touch * 2.0
          - Math.abs(t.near - want) * 0.35      // 担当したい距離に近いほど良い
          + Math.min(far, 6) * 1.2;             // 他の武器と重ならない
        if (score > bestScore) { bestScore = score; best = t; }
      }
      if (best) { place[wid] = { c: best.c, r: best.r }; taken[best.c + ',' + best.r] = 1; }
    });
    return place;
  },

  // ---------- 準備フェーズ ----------
  loadoutWeapons() {
    return this.perm.loadout
      .filter(Boolean)
      .map(cid => CARDS[cid] && CARDS[cid].weapon)
      .filter(wid => wid && WEAPONS[wid]);
  },

  canBuySkills() { return this.phase !== 'battle'; },

  // 盤面と武器だけ用意した状態。敵は出さない
  startPrep(stageId) {
    stageId = stageId || this.perm.currentStage || 'st1';
    if (!this.stageUnlocked(stageId)) stageId = 'st1';
    this.perm.currentStage = stageId;
    this.phase = 'prep';

    const st = Stage.build(stageId);
    const ids = this.loadoutWeapons().slice(0, BAL.maxTurrets);
    const place = this.autoPlace(st, ids);
    const corePos = st.center(st.core.c, st.core.r);
    const n = st.cols * st.rows;

    const run = {
      stage: st, stageId, stageIdx: STAGE_BY_ID[stageId].idx,
      mods: null,
      time: 0,
      wave: 0,                 // 0 = まだ始まっていない
      phase: 'idle',
      toSpawn: 0, spawnTimer: 0, gapTimer: 0,
      enemies: [], bullets: [], fields: [], fx: [], nums: [],
      tower: { x: corePos.x, y: corePos.y, r: BAL.coreR, hp: 0, maxHp: 0 },
      weapons: [],
      cards: {},
      coinMul: 1, resonance: 0, chillVuln: BAL.chillVulnBase, backdraft: 0,
      kills: 0, coinsEarned: 0, dealt: 0, leaked: 0,
      shake: 0,
      over: false, cleared: false,
      pendingPicks: 0,
      spotTarget: null, grabTarget: null,
      traffic: new Array(n).fill(0),
      leak: new Array(n).fill(0),
      trafficT: 0,
      wp(id) { return this.weapons.find(w => w.id === id) || null; },
    };

    ids.forEach((wid) => {
      const def = WEAPONS[wid];
      const p = place[wid];
      const pos = st.center(p.c, p.r);
      run.weapons.push({
        id: wid, def, s: Object.assign({}, def.base), flags: {}, dyn: { heat: 0 },
        c: p.c, r: p.r, x: pos.x, y: pos.y,
        angle: -Math.PI / 2, cd: 0, target: null, aim: null, shots: 0, muzzle: 0,
      });
    });

    this.run = run;
    this.applyMods();          // 準備中の数値を表示に反映しておく
    return run;
  },

  // 今のスキルツリーの内容で、武器とコアの数値を組み直す（準備フェーズ専用）
  applyMods() {
    const run = this.run;
    if (!run) return;
    const mods = Skill.mods(this.meta, this.perm);
    run.mods = mods;
    for (const w of run.weapons) {
      w.s = Object.assign({}, w.def.base);
      Skill.applyTo(w, mods);
    }
    const ratio = run.tower.maxHp > 0 ? run.tower.hp / run.tower.maxHp : 1;
    run.tower.maxHp = BAL.coreHpBase * mods.hp;
    run.tower.hp = run.tower.maxHp * (run.wave > 0 ? ratio : 1);
  },

  // ---------- 戦闘開始 ----------
  beginBattle() {
    const run = this.run;
    if (!run) return;
    this.applyMods();                 // 準備中に買ったスキルをここで確定させる
    run.tower.hp = run.tower.maxHp;
    run.wave = 1;
    run.cards = {};
    run.pendingPicks = 0;
    this.phase = 'battle';
    this.stageRec(run.stageId).attempts++;
    this.perm.totalRuns++;
    Combat.startWave(run);
    this.save();
  },

  // ---------- 武器の移動（壁の上だけ） ----------
  moveWeapon(w, c, r) {
    const run = this.run;
    if (!run || !run.stage.isWall(c, r)) return false;
    if (run.weapons.some(o => o !== w && o.c === c && o.r === r)) return false;
    w.c = c; w.r = r;
    const p = run.stage.center(c, r);
    w.x = p.x; w.y = p.y;
    this.placementsFor(run.stageId)[w.id] = { c, r };
    return true;
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

    let stageGot = null;
    if (ok) stageGot = this.clearStage(r.stageId);

    const missions = this.checkMissions();
    this.save();
    return {
      ok, stage: STAGE_BY_ID[r.stageId], wave: r.wave,
      kills: r.kills, coins: r.coinsEarned, leaked: r.leaked,
      stageGot, missions,
    };
  },

  // ---------- 転生 ----------
  canPrestige() { return this.clearedCount() >= BAL.prestigeMinStages; },

  prestige() {
    if (!this.canPrestige()) return null;
    const mods = Skill.mods(this.meta, this.perm);
    const reward = Pack.prestigeReward(this.clearedCount(), this.perm.prestiges, mods.packLuck);
    for (const k in reward) this.perm.packs[k] = (this.perm.packs[k] || 0) + reward[k];
    this.perm.prestiges++;
    this.meta.coins = 0;
    this.meta.skills = {};
    this.run = null;
    this.phase = 'prep';
    const missions = this.checkMissions();
    this.save();
    return { reward, missions, prestiges: this.perm.prestiges };
  },
};
