// ---------------------------------------------------------------
// state.js : セーブデータと、ランの生成／終了／転生
//   perm  … 絶対に消えない（カードコレクション・パック・実績）
//   meta  … 転生で消える（コイン・スキルツリー）
//   run   … ラン終了で消える（敵・弾・取得カード・経験値）
// ---------------------------------------------------------------
'use strict';

const SAVE_KEY = 'inkuriment_save_v1';

const Game = {
  perm: null,
  meta: null,
  run: null,
  field: { w: 960, h: 640, cx: 480, cy: 320 },
  paused: false,
  speed: 1,

  // ---------- セーブ ----------
  newSave() {
    this.perm = {
      collection: Object.assign({}, STARTER_CARDS), // カードid -> 所持枚数
      packs: { basic: 1, rare: 0, epic: 0 },        // 初回プレゼント1パック
      bestWave: 0,
      prestiges: 0,
      totalKills: 0,
      totalRuns: 0,
      missions: {},                                  // 達成済みミッション
      loadout: ['wc_gatling', 'wc_sniper', null, null],
      slotPos: null,                                 // 武器の配置(相対座標)
      seenIntro: false,
    };
    this.meta = { coins: 0, skills: {}, maxWave: 0 };
  },

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, perm: this.perm, meta: this.meta }));
    } catch (e) { /* プライベートモードなどでは黙って諦める */ }
  },

  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { d = null; }
    if (!d || !d.perm) { this.newSave(); return false; }
    this.newSave();
    Object.assign(this.perm, d.perm);
    Object.assign(this.meta, d.meta || {});
    // 後方互換：知らないカードidは捨てる
    for (const id of Object.keys(this.perm.collection)) if (!CARDS[id]) delete this.perm.collection[id];
    return true;
  },

  hardReset() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    this.newSave();
  },

  // ---------- 画面サイズ ----------
  setField(cssW, cssH) {
    const SHORT = 680;
    const a = cssW / cssH;
    let w, h;
    if (a >= 1) { h = SHORT; w = Math.round(SHORT * a); }
    else { w = SHORT; h = Math.round(SHORT / a); }
    this.field.w = w; this.field.h = h;
    this.field.cx = w / 2; this.field.cy = h / 2;
    if (this.run) { this.run.tower.x = this.field.cx; this.run.tower.y = this.field.cy; }
  },

  // ---------- コレクション ----------
  own(cardId) { return this.perm.collection[cardId] || 0; },

  grant(cardId, n) {
    this.perm.collection[cardId] = (this.perm.collection[cardId] || 0) + (n || 1);
  },

  // 所持枚数が、そのランで重ねられる上限になる（＝ダブりが無駄にならない）
  stackLimit(cardId) {
    const c = CARDS[cardId];
    if (!c || c.kind === 'weapon') return 0;
    return Math.min(c.maxStack || 1, this.own(cardId));
  },

  ownedWeaponIds() {
    return WEAPON_IDS.filter(wid => {
      const cid = 'wc_' + wid;
      return this.own(cid) > 0;
    });
  },

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

  // ---------- ラン ----------
  loadoutWeapons() {
    return this.perm.loadout
      .filter(Boolean)
      .map(cid => CARDS[cid] && CARDS[cid].weapon)
      .filter(wid => wid && WEAPONS[wid]);
  },

  startRun() {
    const mods = Skill.mods(this.meta, this.perm);
    const F = this.field;
    const ids = this.loadoutWeapons();

    const run = {
      mods,
      time: 0,
      wave: 1,
      phase: 'spawn',        // spawn -> clear -> gap
      toSpawn: 0,
      spawnTimer: 0,
      gapTimer: 0,
      enemies: [], bullets: [], fx: [], nums: [],
      tower: { x: F.cx, y: F.cy, r: BAL.towerR, hp: 0, maxHp: 0 },
      weapons: [],
      cards: {},             // 取得カード id -> 枚数
      xp: 0, level: 1, xpNeed: BAL.xpNeedBase,
      coinMul: 1,
      resonance: 0,
      kills: 0, coinsEarned: 0, dealt: 0,
      shake: 0,
      over: false,
      pendingDrafts: 0,
      spotTarget: null,
      wp(id) { return this.weapons.find(w => w.id === id) || null; },
    };

    run.tower.maxHp = BAL.towerHpBase * mods.hp;
    run.tower.hp = run.tower.maxHp;

    const saved = this.perm.slotPos || {};
    ids.forEach((wid, i) => {
      const def = WEAPONS[wid];
      const s = Object.assign({}, def.base);
      s.dmg *= mods.dmg;
      s.rate *= mods.rate;
      s.range *= mods.range;
      const ang = -Math.PI / 2 + (Math.PI * 2 * i) / Math.max(1, ids.length);
      const p = saved[wid];
      run.weapons.push({
        id: wid, def, s, flags: {}, dyn: { heat: 0 },
        ox: p ? p.x : Math.cos(ang) * 96,
        oy: p ? p.y : Math.sin(ang) * 96,
        x: 0, y: 0, angle: ang, cd: Math.random() * 0.2, target: null,
        shots: 0, muzzle: 0,
      });
    });

    this.run = run;
    this.syncWeaponPos();

    // スキル「初期投資」の分だけ、開幕で3択を回す
    run.pendingDrafts = mods.headStart;
    this.perm.totalRuns++;
    return run;
  },

  syncWeaponPos() {
    const r = this.run; if (!r) return;
    for (const w of r.weapons) { w.x = r.tower.x + w.ox; w.y = r.tower.y + w.oy; }
  },

  endRun() {
    const r = this.run;
    if (!r || r.over) return null;
    r.over = true;

    const wave = r.wave;
    this.meta.maxWave = Math.max(this.meta.maxWave, wave);

    const newBest = wave > this.perm.bestWave;
    const prevBest = this.perm.bestWave;
    this.perm.bestWave = Math.max(this.perm.bestWave, wave);

    // ボスウェーブの節目を「自己ベスト更新で」初めて越えたらパック
    let packs = 0;
    const prevTier = Math.floor(prevBest / BAL.bossEvery);
    const nowTier = Math.floor(this.perm.bestWave / BAL.bossEvery);
    if (nowTier > prevTier) {
      packs = nowTier - prevTier;
      this.perm.packs.basic += packs;
    }

    const missions = this.checkMissions();
    this.save();
    return { wave, kills: r.kills, coins: r.coinsEarned, newBest, packs, missions };
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
