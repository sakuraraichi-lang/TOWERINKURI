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
    id: 'rare', name: 'レアパック', size: 5, unlock: 2, color: '#4aa8ff',
    weights: { common: 46, rare: 41, epic: 11, legendary: 2 }, guarantee: 'rare',
  },
  epic: {
    id: 'epic', name: 'エピックパック', size: 5, unlock: 4, color: '#c26bff',
    weights: { common: 18, rare: 46, epic: 30, legendary: 6 }, guarantee: 'epic',
  },
};

const PACK_IDS = ['basic', 'rare', 'epic'];

const Pack = {
  // 解放条件は「突破したステージ数」
  isUnlocked(perm, id) {
    return STAGES.filter(s => (perm.stages[s.id] || {}).cleared).length >= PACKS[id].unlock;
  },

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
    const pool = CARD_IDS.filter(id => {
      const c = CARDS[id];
      if (c.rarity !== r) return false;
      if (c.kind === 'weapon') {
        // パックから出るのは「なんでもあり枠」の武器だけ。
        // 初期装備とステージ報酬の武器はここには出さない
        if (weaponCardSrc(id) !== 'pack') return false;
        if (Game.own(id) > 0) return false;   // 重複しても意味が無い
      }
      return true;
    });
    if (pool.length) return pool;
    // そのレアリティに出せるものが尽きたら、強化カードだけで埋める
    return CARD_IDS.filter(id => CARDS[id].rarity === r && CARDS[id].kind !== 'weapon');
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

  // 転生で貰えるパックの中身を決める。突破ステージ数が多いほど良いものが出る
  prestigeReward(clearedStages, prestiges, packLuck) {
    const n = Util.clamp(clearedStages + prestiges, 1, BAL.packPerPrestigeMax);
    const out = { basic: 0, rare: 0, epic: 0 };
    for (let i = 0; i < n; i++) {
      const roll = Math.random() + packLuck * 0.03 + clearedStages * 0.09 + prestiges * 0.03;
      if (roll > 1.05 && clearedStages >= PACKS.epic.unlock) out.epic++;
      else if (roll > 0.68 && clearedStages >= PACKS.rare.unlock) out.rare++;
      else out.basic++;
    }
    return out;
  },
};

// --- ミッション（パックの入手経路その3） ---
function clearedStages(p) { return STAGES.filter(s => (p.stages[s.id] || {}).cleared).length; }

const MISSIONS = [
  { id: 'st1',      name: '最初のステージを突破',   reward: { basic: 1 }, check: (p) => clearedStages(p) >= 1 },
  { id: 'st3',      name: 'ステージを3つ突破',      reward: { rare: 1 },  check: (p) => clearedStages(p) >= 3 },
  { id: 'stAll',    name: '全ステージを突破',       reward: { epic: 2 },  check: (p) => clearedStages(p) >= STAGES.length },
  { id: 'kill1k',   name: '累計1,000体撃破',        reward: { basic: 1 }, check: (p) => p.totalKills >= 1000 },
  { id: 'kill50k',  name: '累計50,000体撃破',       reward: { rare: 2 },  check: (p) => p.totalKills >= 50000 },
  { id: 'kill1m',   name: '累計1,000,000体撃破',    reward: { epic: 2 },  check: (p) => p.totalKills >= 1000000 },
  { id: 'pres1',    name: '初めての転生',           reward: { basic: 2 }, check: (p) => p.prestiges >= 1 },
  { id: 'pres10',   name: '転生10回',               reward: { epic: 1 },  check: (p) => p.prestiges >= 10 },
  { id: 'coll25',   name: 'カード25種を所持',       reward: { rare: 1 },  check: (p) => Object.keys(p.collection).length >= 25 },
  { id: 'cat6',     name: '6カテゴリすべての武器を所持', reward: { epic: 1 },
    check: (p) => CATEGORY_IDS.every(cat => WEAPON_IDS.some(w => WEAPONS[w].cat === cat && (p.collection['wc_' + w] || 0) > 0)) },
];
