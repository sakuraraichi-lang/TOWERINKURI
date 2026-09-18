// ---------------------------------------------------------------
// balance.js : 全ての調整ノブ。バランスを触るときはここだけ見ればいい
// ---------------------------------------------------------------
'use strict';

const BAL = {
  // --- 画面 ---
  W: 960, H: 640,
  towerR: 34,
  spawnMargin: 46,      // 画面の外側どれだけ離れた所に敵が湧くか
  placeR: 250,          // 武器を置ける拠点からの最大距離

  // --- 拠点 ---
  towerHpBase: 120,
  towerRegenPerLv: 0.6, // スキル1段ごとの毎秒回復

  // --- 敵 ---
  enemyHpBase: 12,
  enemyHpGrowth: 1.165,   // ウェーブごと
  enemySpdBase: 54,
  enemySpdGrowth: 1.004,
  enemySpdCap: 165,
  enemyDpsBase: 6,
  enemyDpsGrowth: 1.14,
  enemyCoinBase: 2.2,
  enemyCoinGrowth: 1.135,
  enemyXpBase: 1.0,
  enemyXpGrowth: 1.055,

  waveCountBase: 7,
  waveCountPerWave: 1.35,
  waveCountMax: 260,
  spawnIntervalBase: 0.55,
  spawnIntervalMin: 0.035,
  waveGap: 1.2,          // ウェーブ間の小休止(秒)
  enemyCap: 420,         // 同時存在数の上限（重くなるので）

  bossEvery: 10,
  bossHpMul: 22,
  bossSpdMul: 0.55,
  bossCoinMul: 30,
  bossXpMul: 25,
  bossDpsMul: 3.5,

  // --- 経験値 ---
  xpNeedBase: 9,
  xpNeedGrowth: 1.29,

  // --- 転生 ---
  prestigeMinWave: 10,          // これ未満では転生できない
  prestigeCoinBonusPer: 0.12,   // 転生1回につきコイン獲得 +12%(加算)

  // --- パック ---
  packPerPrestigeDiv: 10,       // 到達ウェーブ / これ = 転生時のパック数
  packPerPrestigeMax: 25,

  // --- 3択カード ---
  draftSize: 3,
  rarityWeight: { common: 62, rare: 26, epic: 10, legendary: 2.0 },
  rarityDraftLuck: { common: -1.0, rare: 0.35, epic: 0.55, legendary: 0.75 }, // luck1段あたりの重み倍率寄与

  // --- レアリティ表示 ---
  rarity: {
    common:    { name: 'コモン',       color: '#9fb2c4', glow: 0 },
    rare:      { name: 'レア',         color: '#4aa8ff', glow: 1 },
    epic:      { name: 'エピック',     color: '#c26bff', glow: 2 },
    legendary: { name: 'レジェンド',   color: '#ffb020', glow: 3 },
  },
  rarityOrder: ['common', 'rare', 'epic', 'legendary'],
};
