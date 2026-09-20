// ---------------------------------------------------------------
// packs.js : カードパック（＝カードの唯一の入手経路）
//
//   コインでは買えない。手に入るのは次の4つだけ。
//     ステージ初回突破 / 初回の完璧クリア / ミッション / 転生
//
//   **パックは分野で分かれている。** 1つのパックに全カードが入っているわけではない。
//
//   【解放の考え方・2026-09-20 改定】
//     以前は解放条件が「突破したステージ数」だけで、**遺物パックが0面解放**だった。
//     遺物は転生でしか消えない恒久強化なのに、**転生を知る前に触れてしまう**状態で、
//     長期の報酬を序盤に食い切っていた。
//
//     そこで**解放の軸を「転生した回数」に移した**（unlockP）。
//     ステージ進行は転生でリセットされるので、そこに長期の解放を紐づけると
//     2周目以降に意味が無くなるため。
//
//       基本パック … 2ステージ突破（ここだけステージ基準。導入で要るので）
//       遺物パック … **転生1回**  ← 恒久強化はここから
//       兵装パック … 転生2回
//       化学パック … 転生3回
//       連携パック … 転生4回
//
//     **まだ解放していないパックは配らない。**（Pack.grantable）
//     配る先が無いときはコインに振り替える（報酬が消えないように）
// ---------------------------------------------------------------
'use strict';

const PACKS = {
  basic: {
    id: 'basic', name: '基本パック', size: 4, unlock: 2, unlockP: 0, color: '#7f93a8',
    swapChance: 0.20,
    desc: '汎用カードと、初期装備まわりの強化',
    weights: { common: 78, rare: 19, epic: 2.7, legendary: 0.3 }, guarantee: null,
    // 汎用カード＋初期装備（ガトリング・スナイパー）の強化
    accepts: (c) => c.kind === 'generic' ||
      (c.kind === 'mod' && WEAPONS[c.weapon] && WEAPONS[c.weapon].src === 'start'),
  },
  arms: {
    id: 'arms', name: '兵装パック', size: 5, unlock: 0, unlockP: 2, color: '#ffd24a',
    swapChance: 0.40,
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
    id: 'chem', name: '化学パック', size: 5, unlock: 0, unlockP: 3, color: '#8fd94a',
    swapChance: 0.40,
    desc: '範囲攻撃・指定攻撃・支援。触手と泡もここから',
    weights: { common: 42, rare: 41, epic: 14, legendary: 3 }, guarantee: 'rare',
    accepts: (c) => {
      const w = c.weapon && WEAPONS[c.weapon];
      if (!w) return false;
      if (['area', 'target', 'support'].indexOf(w.cat) < 0) return false;
      return c.kind === 'mod' || (c.kind === 'weapon' && w.src === 'pack');
    },
  },
  // **転生でしか手に入らない。** 中身は遺物（転生で消えない永続パッシブ）
  relic: {
    id: 'relic', name: '遺物パック', size: 3, unlock: 0, unlockP: 1, color: '#ffb43c',
    swapChance: 0,
    desc: '転生でしか出ない。中身は転生で消えない永続強化',
    weights: { common: 55, rare: 30, epic: 12, legendary: 3 }, guarantee: null,
    accepts: (c) => c.kind === 'perm',
  },
  syn: {
    id: 'syn', name: '連携パック', size: 4, unlock: 0, unlockP: 4, color: '#c26bff',
    swapChance: 0.25,
    desc: 'シナジー専用。2種を組み合わせたときだけ効くカード',
    // シナジーの内訳に合わせる（コモン2 / レア5 / エピック2 / レジェンド0）。
    // コモンを0にしていると、コモンのシナジー2枚が永久に出ない
    weights: { common: 26, rare: 50, epic: 24, legendary: 0 }, guarantee: 'rare',
    accepts: (c) => c.kind === 'synergy',
  },
};

const PACK_IDS = ['basic', 'arms', 'chem', 'syn', 'relic'];

// ステージごとに「そのステージらしい分野」を割り当てる。
// 完璧クリアの報酬はこれになるので、奥の分野は奥まで行かないと掘れない
// 章ごとの「分野」。完璧クリアの報酬はこれになる。
// **30章あるので、1枚ずつ手で書かず幕で決める。**
// 奥の分野は奥まで行かないと掘れない、という性質は変わらない
function stagePackOf(stageId) {
  const i = MAIN_STAGES.findIndex(s => s.id === stageId);
  const ch = i < 0 ? 1 : i + 1;
  if (ch <= 4) return 'basic';      // I   導入
  if (ch <= 8) return 'arms';       // II  最初の壁
  if (ch <= 14) return 'chem';      // III 恒久層
  if (ch <= 20) return 'arms';      // IV  自動化
  if (ch <= 27) return 'chem';      // V   特化
  return 'syn';                     // VI  決着
}

const Pack = {
  clearedCount(perm) { return MAIN_STAGES.filter(s => (perm.stages[s.id] || {}).cleared).length; },

  isUnlocked(perm, id) {
    const pk = PACKS[id];
    // ステージ側は「一度でも到達した深さ」で見る（転生で戻っても解放は戻さない）
    const depth = Math.max(this.clearedCount(perm), perm.deepest || 0);
    if (depth < (pk.unlock || 0)) return false;
    return (perm.prestiges || 0) >= (pk.unlockP || 0);
  },

  // なぜ開いていないのかを一言で（画面に出す）
  lockReason(perm, id) {
    const pk = PACKS[id];
    const depth = Math.max(this.clearedCount(perm), perm.deepest || 0);
    if (depth < (pk.unlock || 0)) return 'ステージを ' + pk.unlock + ' 個突破すると解放';
    const need = (pk.unlockP || 0) - (perm.prestiges || 0);
    if (need > 0) return need === 1 && !(perm.prestiges || 0)
      ? '初めて転生すると解放'
      : 'あと ' + need + ' 回 転生すると解放';
    return '';
  },

  // **まだ解放していないパックは配らない。**
  //   配れないときは null を返す。呼び出し側がコインに振り替える
  grantable(perm, id) {
    if (this.isUnlocked(perm, id)) return id;
    // 同じ役どころで、すでに開いているものへ落とす
    for (const k of ['syn', 'chem', 'arms', 'basic']) {
      if (k !== id && this.isUnlocked(perm, k)) return k;
    }
    return null;
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
  forStage(stageId) { return stagePackOf(stageId); },

  // 開封で「換装の3択」が出る確率。
  // **武器の分野を掘るパックほど出やすい。** 換装はカテゴリの伸ばし方を変えるものなので
  swapChance(packId) { return PACKS[packId].swapChance || 0; },

  // 転生で貰えるパック。
  // **深く行くほど割に合うようにする。** 浅いところで転生を繰り返しても伸びない
  prestigeReward(clearedStages, prestiges, packLuck) {
    const out = { basic: 0, arms: 0, chem: 0, syn: 0, relic: 0 };
    if (clearedStages <= 0) return out;
    // **遺物パックが転生の本体。** 深く行ってから転生するほど多い
    out.relic = 3 + Math.floor(clearedStages * 0.8);
    // 1ステージ=1個、5ステージ=約15個。奥へ行くほど1回の転生が重くなる
    const n = Util.clamp(Math.round(Math.pow(clearedStages, 1.7)) + Math.floor(prestiges / 4),
                         1, BAL.packPerPrestigeMax);
    // 出る分野は「そこまでに突破したステージ」の分野に限られる
    const pool = MAIN_STAGES.slice(0, clearedStages).map(s => Pack.forStage(s.id));
    for (let i = 0; i < n; i++) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      out[pick]++;
    }
    return out;
  },
};

// --- ミッション（パックの入手経路その3） ---
function clearedStages(p) { return MAIN_STAGES.filter(s => (p.stages[s.id] || {}).cleared).length; }

const MISSIONS = [
  { id: 'st1',      name: '第1章を突破',               reward: { basic: 1 }, check: (p) => clearedStages(p) >= 1 },
  { id: 'st3',      name: '第3章まで突破',             reward: { arms: 1 },  check: (p) => clearedStages(p) >= 3 },
  { id: 'st8',      name: '第8章まで突破',             reward: { chem: 1 },  check: (p) => clearedStages(p) >= 8 },
  { id: 'st15',     name: '第15章まで突破',            reward: { chem: 2 },  check: (p) => clearedStages(p) >= 15 },
  { id: 'stAll',    name: '全30章を突破',              reward: { syn: 2 },   check: (p) => clearedStages(p) >= MAIN_STAGES.length },
  { id: 'perfect1', name: '初めての完璧クリア',         reward: { basic: 2 }, check: (p) => MAIN_STAGES.some(s => (p.stages[s.id] || {}).perfect) },
  { id: 'perfect3', name: '3章で完璧クリア',           reward: { chem: 1 },  check: (p) => MAIN_STAGES.filter(s => (p.stages[s.id] || {}).perfect).length >= 3 },
  { id: 'kill1k',   name: '累計1,000体撃破',            reward: { basic: 1 }, check: (p) => p.totalKills >= 1000 },
  { id: 'kill50k',  name: '累計50,000体撃破',           reward: { arms: 2 },  check: (p) => p.totalKills >= 50000 },
  { id: 'kill1m',   name: '累計1,000,000体撃破',        reward: { chem: 2 },  check: (p) => p.totalKills >= 1000000 },
  { id: 'pres1',    name: '初めての転生',               reward: { basic: 2 }, check: (p) => p.prestiges >= 1 },
  { id: 'pres10',   name: '転生10回',                   reward: { syn: 1 },   check: (p) => p.prestiges >= 10 },
  { id: 'coll25',   name: 'カード25種を所持',           reward: { arms: 1 },  check: (p) => Object.keys(p.collection).length >= 25 },
  { id: 'cat6',     name: '6カテゴリすべての武器を所持', reward: { syn: 1 },
    check: (p) => CATEGORY_IDS.every(cat => WEAPON_IDS.some(w => WEAPONS[w].cat === cat && (p.collection['wc_' + w] || 0) > 0)) },
];
