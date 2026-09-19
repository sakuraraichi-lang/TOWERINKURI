// ---------------------------------------------------------------
// packs.js : カードパック（＝カードの唯一の入手経路）
//
//   コインでは買えない。手に入るのは次の4つだけ。
//     ステージ初回突破 / 初回の完璧クリア / ミッション / 転生
//
//   **パックは分野で分かれている。** 1つのパックに全カードが入っているわけではない。
//   「ステージ1をクリアして即転生」を繰り返しても、その周辺の分野しか掘れない。
//   奥の分野は、奥のステージまで行かないと手に入らない
// ---------------------------------------------------------------
'use strict';

const PACKS = {
  basic: {
    id: 'basic', name: '基本パック', size: 4, unlock: 0, color: '#7f93a8',
    desc: '汎用カードと、初期装備まわりの強化',
    weights: { common: 78, rare: 19, epic: 2.7, legendary: 0.3 }, guarantee: null,
    // 汎用カード＋初期装備（ガトリング・スナイパー）の強化
    accepts: (c) => c.kind === 'generic' ||
      (c.kind === 'mod' && WEAPONS[c.weapon] && WEAPONS[c.weapon].src === 'start'),
  },
  arms: {
    id: 'arms', name: '兵装パック', size: 5, unlock: 1, color: '#ffd24a',
    desc: '短射程・中射程・長射程。刀と手裏剣もここから',
    weights: { common: 48, rare: 39, epic: 11, legendary: 2 }, guarantee: 'rare',
    accepts: (c) => {
      const w = c.weapon && WEAPONS[c.weapon];
      if (!w) return false;
      if (['short', 'mid', 'long'].indexOf(w.cat) < 0) return false;
      return c.kind === 'mod' || (c.kind === 'weapon' && w.src === 'pack');
    },
  },
  chem: {
    id: 'chem', name: '化学パック', size: 5, unlock: 2, color: '#8fd94a',
    desc: '範囲攻撃・指定攻撃・支援。触手と泡もここから',
    weights: { common: 42, rare: 41, epic: 14, legendary: 3 }, guarantee: 'rare',
    accepts: (c) => {
      const w = c.weapon && WEAPONS[c.weapon];
      if (!w) return false;
      if (['area', 'target', 'support'].indexOf(w.cat) < 0) return false;
      return c.kind === 'mod' || (c.kind === 'weapon' && w.src === 'pack');
    },
  },
  syn: {
    id: 'syn', name: '連携パック', size: 4, unlock: 2, color: '#c26bff',
    desc: 'シナジー専用。2種を組み合わせたときだけ効くカード',
    // シナジーの内訳に合わせる（コモン2 / レア5 / エピック2 / レジェンド0）。
    // コモンを0にしていると、コモンのシナジー2枚が永久に出ない
    weights: { common: 26, rare: 50, epic: 24, legendary: 0 }, guarantee: 'rare',
    accepts: (c) => c.kind === 'synergy',
  },
};

const PACK_IDS = ['basic', 'arms', 'chem', 'syn'];

// ステージごとに「そのステージらしい分野」を割り当てる。
// 完璧クリアの報酬はこれになるので、奥の分野は奥まで行かないと掘れない
const STAGE_PACK = { st1: 'basic', st2: 'arms', st3: 'chem', st4: 'syn', st5: 'syn' };

const Pack = {
  clearedCount(perm) { return STAGES.filter(s => (perm.stages[s.id] || {}).cleared).length; },

  isUnlocked(perm, id) {
    // 一度でも到達した深さで解放する（転生でステージ進行が戻っても、解放は戻さない）
    return Math.max(this.clearedCount(perm), perm.deepest || 0) >= PACKS[id].unlock;
  },

  rollRarity(pack, packLuck) {
    const entries = BAL.rarityOrder.map(r => ({ r, w: pack.weights[r] || 0 }));
    const lk = packLuck || 0;
    return Util.weighted(entries, e => {
      const bias = BAL.rarityDraftLuck[e.r] * lk * 0.6;
      return Math.max(0.0001, e.w * (1 + bias * 0.25));
    }).r;
  },

  // そのパックが出せるカードのうち、指定レアリティのもの
  cardsOfRarity(packId, r) {
    const pack = PACKS[packId];
    const pool = CARD_IDS.filter(id => {
      const c = CARDS[id];
      if (c.rarity !== r) return false;
      if (!pack.accepts(c)) return false;
      // 所持済みの武器カードは重複しても意味が無い
      if (c.kind === 'weapon' && Game.own(id) > 0) return false;
      return true;
    });
    if (pool.length) return pool;
    // 尽きたら、そのパックの分野の強化カードで埋める
    const fb = CARD_IDS.filter(id => CARDS[id].kind !== 'weapon' && pack.accepts(CARDS[id]));
    return fb.length ? fb : CARD_IDS.filter(id => CARDS[id].kind === 'generic');
  },

  open(packId, packLuck) {
    const pack = PACKS[packId];
    const out = [];
    for (let i = 0; i < pack.size; i++) {
      let r = Pack.rollRarity(pack, packLuck);
      if (pack.guarantee && i === pack.size - 1) {
        const need = BAL.rarityOrder.indexOf(pack.guarantee);
        const best = Math.max.apply(null, out.map(id => BAL.rarityOrder.indexOf(CARDS[id].rarity)).concat([-1]));
        if (best < need) r = pack.guarantee;
      }
      out.push(Util.pick(Pack.cardsOfRarity(packId, r)));
    }
    return out;
  },

  // ステージに紐づく分野のパックid
  forStage(stageId) { return STAGE_PACK[stageId] || 'basic'; },

  // 転生で貰えるパック。
  // **深く行くほど割に合うようにする。** 浅いところで転生を繰り返しても伸びない
  prestigeReward(clearedStages, prestiges, packLuck) {
    const out = { basic: 0, arms: 0, chem: 0, syn: 0 };
    if (clearedStages <= 0) return out;
    // 1ステージ=1個、5ステージ=約15個。奥へ行くほど1回の転生が重くなる
    const n = Util.clamp(Math.round(Math.pow(clearedStages, 1.7)) + Math.floor(prestiges / 4),
                         1, BAL.packPerPrestigeMax);
    // 出る分野は「そこまでに突破したステージ」の分野に限られる
    const pool = STAGES.slice(0, clearedStages).map(s => Pack.forStage(s.id));
    for (let i = 0; i < n; i++) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      out[pick]++;
    }
    return out;
  },
};

// --- ミッション（パックの入手経路その3） ---
function clearedStages(p) { return STAGES.filter(s => (p.stages[s.id] || {}).cleared).length; }

const MISSIONS = [
  { id: 'st1',      name: '最初のステージを突破',       reward: { basic: 1 }, check: (p) => clearedStages(p) >= 1 },
  { id: 'st3',      name: 'ステージを3つ突破',          reward: { arms: 1 },  check: (p) => clearedStages(p) >= 3 },
  { id: 'stAll',    name: '全ステージを突破',           reward: { syn: 2 },   check: (p) => clearedStages(p) >= STAGES.length },
  { id: 'perfect1', name: '初めての完璧クリア',         reward: { basic: 2 }, check: (p) => STAGES.some(s => (p.stages[s.id] || {}).perfect) },
  { id: 'perfect3', name: '3ステージで完璧クリア',      reward: { chem: 1 },  check: (p) => STAGES.filter(s => (p.stages[s.id] || {}).perfect).length >= 3 },
  { id: 'kill1k',   name: '累計1,000体撃破',            reward: { basic: 1 }, check: (p) => p.totalKills >= 1000 },
  { id: 'kill50k',  name: '累計50,000体撃破',           reward: { arms: 2 },  check: (p) => p.totalKills >= 50000 },
  { id: 'kill1m',   name: '累計1,000,000体撃破',        reward: { chem: 2 },  check: (p) => p.totalKills >= 1000000 },
  { id: 'pres1',    name: '初めての転生',               reward: { basic: 2 }, check: (p) => p.prestiges >= 1 },
  { id: 'pres10',   name: '転生10回',                   reward: { syn: 1 },   check: (p) => p.prestiges >= 10 },
  { id: 'coll25',   name: 'カード25種を所持',           reward: { arms: 1 },  check: (p) => Object.keys(p.collection).length >= 25 },
  { id: 'cat6',     name: '6カテゴリすべての武器を所持', reward: { syn: 1 },
    check: (p) => CATEGORY_IDS.every(cat => WEAPON_IDS.some(w => WEAPONS[w].cat === cat && (p.collection['wc_' + w] || 0) > 0)) },
];
