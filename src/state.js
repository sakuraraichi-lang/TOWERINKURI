// ---------------------------------------------------------------
// state.js : セーブデータと、ランの生成／終了／ステージ突破／転生
//   perm  … 絶対に消えない（カードコレクション・パック・ステージ進行）
//   meta  … 転生で消える（コイン・スキルツリー）
//   run   … ラン終了で消える（敵・弾・取得カード・経験値）
// ---------------------------------------------------------------
'use strict';

const SAVE_KEY = 'inkuriment_save_v2';
const SAVE_KEY_V1 = 'inkuriment_save_v1';

const Game = {
  perm: null,
  meta: null,
  run: null,
  paused: false,
  speed: 1,
  dragging: false,

  // ---------- セーブ ----------
  newSave() {
    this.perm = {
      collection: Object.assign({}, STARTER_CARDS),
      packs: { basic: 1, rare: 0, epic: 0 },
      bestWave: 0,
      prestiges: 0,
      totalKills: 0,
      totalRuns: 0,
      missions: {},
      loadout: ['wc_gatling', 'wc_sniper', null, null],
      stages: { st1: { cleared: false, bestWave: 0 } },   // ステージ進行
      currentStage: 'st1',
      placements: {},                                     // ステージ別の武器配置 {stageId:{weaponId:{c,r}}}
      seenIntro: false,
    };
    this.meta = { coins: 0, skills: {}, maxWave: 0 };
  },

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, perm: this.perm, meta: this.meta }));
    } catch (e) { /* プライベートモードなどでは黙って諦める */ }
  },

  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { d = null; }
    if (!d) {
      // v1（アリーナ版）のセーブがあれば、カードとパックだけ引き継ぐ
      try {
        const old = JSON.parse(localStorage.getItem(SAVE_KEY_V1) || 'null');
        if (old && old.perm) {
          this.newSave();
          for (const id of Object.keys(old.perm.collection || {})) {
            if (CARDS[id]) this.perm.collection[id] = old.perm.collection[id];
          }
          Object.assign(this.perm.packs, old.perm.packs || {});
          this.perm.prestiges = old.perm.prestiges || 0;
          this.perm.totalKills = old.perm.totalKills || 0;
          this.save();
          return true;
        }
      } catch (e) { /* 無視 */ }
      this.newSave();
      return false;
    }
    this.newSave();
    Object.assign(this.perm, d.perm || {});
    Object.assign(this.meta, d.meta || {});
    for (const id of Object.keys(this.perm.collection)) if (!CARDS[id]) delete this.perm.collection[id];
    if (!this.perm.stages) this.perm.stages = { st1: { cleared: false, bestWave: 0 } };
    if (!this.perm.placements) this.perm.placements = {};
    if (!STAGE_BY_ID[this.perm.currentStage]) this.perm.currentStage = 'st1';
    return true;
  },

  hardReset() {
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_KEY_V1); } catch (e) {}
    this.newSave();
  },

  // ---------- ステージ ----------
  stageRec(id) {
    if (!this.perm.stages[id]) this.perm.stages[id] = { cleared: false, bestWave: 0 };
    return this.perm.stages[id];
  },

  stageUnlocked(id) {
    const i = STAGES.findIndex(s => s.id === id);
    if (i <= 0) return true;
    return this.stageRec(STAGES[i - 1].id).cleared;
  },

  // ステージ突破。初回だけ報酬が出る
  clearStage(id) {
    const rec = this.stageRec(id);
    if (rec.cleared) return null;
    rec.cleared = true;
    const def = STAGE_BY_ID[id];
    const got = { cards: [], packs: {}, stage: def, next: null };
    for (const cid of (def.reward.cards || [])) {
      this.grant(cid, 1);
      got.cards.push(cid);
    }
    for (const k in (def.reward.packs || {})) {
      this.perm.packs[k] = (this.perm.packs[k] || 0) + def.reward.packs[k];
      got.packs[k] = def.reward.packs[k];
    }
    const i = STAGES.findIndex(s => s.id === id);
    if (i >= 0 && STAGES[i + 1]) got.next = STAGES[i + 1];
    this.save();
    return got;
  },

  // ---------- コレクション ----------
  own(cardId) { return this.perm.collection[cardId] || 0; },
  grant(cardId, n) { this.perm.collection[cardId] = (this.perm.collection[cardId] || 0) + (n || 1); },

  // 所持枚数が、そのランで重ねられる上限になる（＝ダブりが無駄にならない）
  stackLimit(cardId) {
    const c = CARDS[cardId];
    if (!c || c.kind === 'weapon') return 0;
    return Math.min(c.maxStack || 1, this.own(cardId));
  },

  ownedWeaponIds() { return WEAPON_IDS.filter(wid => this.own('wc_' + wid) > 0); },

  // ---------- ミッション ----------
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

  // ---------- 配置 ----------
  placementsFor(stageId) {
    if (!this.perm.placements[stageId]) this.perm.placements[stageId] = {};
    return this.perm.placements[stageId];
  },

  // 通路に面した壁を「面している通路タイルの数 × コアへの近さ」で並べ、良い順に返す
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

  // 保存された配置が無い武器を、良さそうな壁へ自動で置く
  autoPlace(st, weaponIds) {
    const place = this.placementsFor(st.id);
    const taken = {};
    for (const wid of weaponIds) {
      const p = place[wid];
      if (p && st.isWall(p.c, p.r) && !taken[p.c + ',' + p.r]) { taken[p.c + ',' + p.r] = 1; }
      else delete place[wid];
    }
    const pool = this.goodWallTiles(st);
    for (const wid of weaponIds) {
      if (place[wid]) continue;
      // 既に置いた武器から離れたところを選ぶ
      let best = null, bestScore = -Infinity;
      for (const t of pool) {
        const key = t.c + ',' + t.r;
        if (taken[key]) continue;
        let far = 0;
        for (const k in taken) {
          const [tc, tr] = k.split(',').map(Number);
          far += Math.hypot(t.c - tc, t.r - tr);
        }
        const score = t.touch * 3 - t.near * 0.05 + Math.min(far, 30) * 0.6;
        if (score > bestScore) { bestScore = score; best = t; }
      }
      if (best) { place[wid] = { c: best.c, r: best.r }; taken[best.c + ',' + best.r] = 1; }
    }
    return place;
  },

  // ---------- ラン ----------
  loadoutWeapons() {
    return this.perm.loadout
      .filter(Boolean)
      .map(cid => CARDS[cid] && CARDS[cid].weapon)
      .filter(wid => wid && WEAPONS[wid]);
  },

  startRun(stageId) {
    stageId = stageId || this.perm.currentStage || 'st1';
    if (!this.stageUnlocked(stageId)) stageId = 'st1';
    this.perm.currentStage = stageId;

    const st = Stage.build(stageId);
    const mods = Skill.mods(this.meta, this.perm);
    const ids = this.loadoutWeapons();
    const place = this.autoPlace(st, ids);

    const corePos = st.center(st.core.c, st.core.r);
    const run = {
      stage: st,
      stageId,
      mods,
      time: 0,
      wave: 1,
      phase: 'spawn',
      toSpawn: 0,
      spawnTimer: 0,
      gapTimer: 0,
      enemies: [], bullets: [], fields: [], fx: [], nums: [],
      tower: { x: corePos.x, y: corePos.y, r: BAL.coreR, hp: 0, maxHp: 0 },
      weapons: [],
      cards: {},
      xp: 0, level: 1, xpNeed: BAL.xpNeedBase,
      coinMul: 1,
      resonance: 0,
      chillVuln: BAL.chillVulnBase,
      backdraft: 0,
      kills: 0, coinsEarned: 0, dealt: 0,
      shake: 0,
      over: false,
      cleared: false,
      pendingDrafts: 0,
      spotTarget: null,
      grabTarget: null,
      wp(id) { return this.weapons.find(w => w.id === id) || null; },
    };

    run.tower.maxHp = BAL.coreHpBase * mods.hp;
    run.tower.hp = run.tower.maxHp;

    ids.slice(0, BAL.maxTurrets).forEach((wid) => {
      const def = WEAPONS[wid];
      const s = Object.assign({}, def.base);
      s.dmg *= mods.dmg;
      s.rate *= mods.rate;
      s.range *= mods.range;
      const p = place[wid];
      const pos = st.center(p.c, p.r);
      run.weapons.push({
        id: wid, def, s, flags: {}, dyn: { heat: 0 },
        c: p.c, r: p.r, x: pos.x, y: pos.y,
        angle: -Math.PI / 2, cd: Math.random() * 0.2, target: null,
        shots: 0, muzzle: 0,
      });
    });

    this.run = run;
    run.pendingDrafts = mods.headStart;
    this.perm.totalRuns++;
    return run;
  },

  // ラン中にスキルを買ったら、その場で反映する。
  // 「ラン中もいつでも買える」と言っている以上、次のランまで効かないのは嘘になる。
  // カードの効果を壊さないよう、倍率の「差分」だけを掛ける
  refreshMods() {
    const run = this.run;
    if (!run || run.over) return;
    const old = run.mods;
    const now = Skill.mods(this.meta, this.perm);
    const ratio = (k) => (old[k] > 0 ? now[k] / old[k] : 1);

    const rd = ratio('dmg'), rr = ratio('rate'), rg = ratio('range');
    for (const w of run.weapons) {
      w.s.dmg *= rd;
      w.s.rate *= rr;
      w.s.range *= rg;
      if (w.dyn.mugenBase) w.dyn.mugenBase *= rg;
    }
    const rh = ratio('hp');
    if (rh !== 1) {
      run.tower.maxHp *= rh;
      run.tower.hp *= rh;          // 割合を保ったまま増やす（買っただけで全快はしない）
    }
    run.mods = now;
  },

  // 武器をタイルへ動かす。壁の上で、他の武器がいない場所だけ
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

  endRun() {
    const r = this.run;
    if (!r || r.over) return null;
    r.over = true;

    const wave = r.wave;
    const rec = this.stageRec(r.stageId);
    rec.bestWave = Math.max(rec.bestWave, wave);

    this.meta.maxWave = Math.max(this.meta.maxWave, wave);
    const prevBest = this.perm.bestWave;
    const newBest = wave > prevBest;
    this.perm.bestWave = Math.max(prevBest, wave);

    let packs = 0;
    const prevTier = Math.floor(prevBest / BAL.bossEvery);
    const nowTier = Math.floor(this.perm.bestWave / BAL.bossEvery);
    if (nowTier > prevTier) {
      packs = nowTier - prevTier;
      this.perm.packs.basic += packs;
    }

    const missions = this.checkMissions();
    this.save();
    return { wave, kills: r.kills, coins: r.coinsEarned, newBest, packs, missions,
             stage: STAGE_BY_ID[r.stageId] };
  },

  canPrestige() { return this.perm.bestWave >= BAL.prestigeMinWave; },

  prestige() {
    if (!this.canPrestige()) return null;
    const mods = Skill.mods(this.meta, this.perm);
    const reward = Pack.prestigeReward(this.perm.bestWave, mods.packLuck);
    for (const k in reward) this.perm.packs[k] = (this.perm.packs[k] || 0) + reward[k];
    this.perm.prestiges++;
    this.meta.coins = 0;
    this.meta.skills = {};
    this.meta.maxWave = 0;
    this.run = null;
    const missions = this.checkMissions();
    this.save();
    return { reward, missions, prestiges: this.perm.prestiges };
  },
};
