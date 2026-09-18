// ---------------------------------------------------------------
// packs.js : カードパック（＝カードの唯一の入手経路）
//   コインでは直接買えない。ボス突破・転生・ミッションでしか手に入らない
// ---------------------------------------------------------------
'use strict';

const PACKS = {
  basic: {
    id: 'basic', name: '基本パック', size: 4, unlock: 0, color: '#7f93a8',
    weights: { common: 76, rare: 20, epic: 3.6, legendary: 0.4 }, guarantee: null,
  },
  rare: {
    id: 'rare', name: 'レアパック', size: 5, unlock: 20, color: '#4aa8ff',
    weights: { common: 46, rare: 41, epic: 11, legendary: 2 }, guarantee: 'rare',
  },
  epic: {
    id: 'epic', name: 'エピックパック', size: 5, unlock: 45, color: '#c26bff',
    weights: { common: 18, rare: 46, epic: 30, legendary: 6 }, guarantee: 'epic',
  },
};

const PACK_IDS = ['basic', 'rare', 'epic'];

const Pack = {
  isUnlocked(perm, id) { return perm.bestWave >= PACKS[id].unlock; },

  // レアリティを1つ抽選（packLuck で上振れする）
  rollRarity(pack, packLuck) {
    const entries = BAL.rarityOrder.map(r => ({ r, w: pack.weights[r] || 0 }));
    const lk = packLuck || 0;
    return Util.weighted(entries, e => {
      const bias = BAL.rarityDraftLuck[e.r] * lk * 0.6;
      return Math.max(0.01, e.w * (1 + bias * 0.25));
    }).r;
  },

  cardsOfRarity(r) {
    // 所持済みの武器カードは重複しても意味が無いので排出対象から外す
    const pool = CARD_IDS.filter(id => {
      const c = CARDS[id];
      if (c.rarity !== r) return false;
      if (c.kind === 'weapon' && Game.own(id) > 0) return false;
      return true;
    });
    if (pool.length) return pool;
    return CARD_IDS.filter(id => CARDS[id].rarity === r);
  },

  // パックを1つ開ける -> カードidの配列
  open(packId, packLuck) {
    const pack = PACKS[packId];
    const out = [];
    for (let i = 0; i < pack.size; i++) {
      let r = Pack.rollRarity(pack, packLuck);
      // 最後の1枚で保証レアリティを満たしていなければ引き上げる
      if (pack.guarantee && i === pack.size - 1) {
        const need = BAL.rarityOrder.indexOf(pack.guarantee);
        const best = Math.max(...out.map(id => BAL.rarityOrder.indexOf(CARDS[id].rarity)), -1);
        if (best < need) r = pack.guarantee;
      }
      const pool = Pack.cardsOfRarity(r);
      out.push(Util.pick(pool));
    }
    return out;
  },

  // 転生で貰えるパックの中身を決める
  prestigeReward(bestWave, packLuck) {
    const n = Util.clamp(Math.floor(bestWave / BAL.packPerPrestigeDiv), 1, BAL.packPerPrestigeMax);
    const out = { basic: 0, rare: 0, epic: 0 };
    for (let i = 0; i < n; i++) {
      const roll = Math.random() + packLuck * 0.03 + bestWave / 400;
      if (roll > 1.10 && bestWave >= PACKS.epic.unlock) out.epic++;
      else if (roll > 0.72 && bestWave >= PACKS.rare.unlock) out.rare++;
      else out.basic++;
    }
    return out;
  },
};

// --- ミッション（パックの入手経路その3） ---
const MISSIONS = [
  { id: 'wave10',   name: 'ウェーブ10到達',       reward: { basic: 1 }, check: (p) => p.bestWave >= 10 },
  { id: 'wave25',   name: 'ウェーブ25到達',       reward: { basic: 2 }, check: (p) => p.bestWave >= 25 },
  { id: 'wave50',   name: 'ウェーブ50到達',       reward: { rare: 2 },  check: (p) => p.bestWave >= 50 },
  { id: 'wave100',  name: 'ウェーブ100到達',      reward: { epic: 2 },  check: (p) => p.bestWave >= 100 },
  { id: 'kill1k',   name: '累計1,000体撃破',      reward: { basic: 1 }, check: (p) => p.totalKills >= 1000 },
  { id: 'kill100k', name: '累計100,000体撃破',    reward: { rare: 2 },  check: (p) => p.totalKills >= 100000 },
  { id: 'pres1',    name: '初めての転生',         reward: { basic: 2 }, check: (p) => p.prestiges >= 1 },
  { id: 'pres10',   name: '転生10回',             reward: { epic: 1 },  check: (p) => p.prestiges >= 10 },
  { id: 'coll20',   name: 'カード20種を所持',     reward: { rare: 1 },  check: (p) => Object.keys(p.collection).length >= 20 },
];
