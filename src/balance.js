// ---------------------------------------------------------------
// balance.js : 全ての調整ノブ。バランスを触るときはここだけ見ればいい
// ---------------------------------------------------------------
'use strict';

const BAL = {
  // --- 盤面（タイルは stages.js の TILE = 44px） ---
  coreR: 18,            // コアの当たり半径
  maxTurrets: 4,        // 同時に置ける武器の数（＝編成枠）

  // --- コア ---
  coreHpBase: 120,
  coreRegenPerLv: 0.6,  // スキル1段ごとの毎秒回復

  // --- 敵 ---
  enemyHpBase: 12,
  enemyHpGrowth: 1.165,
  enemySpdBase: 82,     // px/s（1タイル44px）
  enemySpdGrowth: 1.004,
  enemySpdCap: 190,
  enemyDpsBase: 6,
  enemyDpsGrowth: 1.14,
  enemyCoinBase: 2.2,
  enemyCoinGrowth: 1.135,
  enemyXpBase: 1.0,
  enemyXpGrowth: 1.055,
  enemySlowFloor: 0.25, // どれだけ重ねても、この倍率より遅くはならない

  waveCountBase: 7,
  waveCountPerWave: 1.35,
  waveCountMax: 260,
  spawnIntervalBase: 0.50,
  spawnIntervalMin: 0.04,
  waveGap: 0.9,
  clearWait: 6,         // 残敵の掃討をこの秒数まで待ち、越えたら次ウェーブへ進む
  enemyCap: 420,

  bossEvery: 10,
  bossHpMul: 22,
  bossSpdMul: 0.55,
  bossCoinMul: 30,
  bossXpMul: 25,
  bossDpsMul: 3.5,
  bossStunResist: 0.35, // ボスへの拘束・減速はこの割合まで短くなる

  // --- 状態異常 ---
  shockVuln: 0.25,      // 感電中の被ダメージ増加
  chillVulnBase: 0,     // 凍結中の被ダメージ増加（カードで増える）
  fieldTick: 0.2,       // 場（毒・炎・酸）のダメージ計算の刻み(秒)

  // --- 経験値 ---
  xpNeedBase: 9,
  xpNeedGrowth: 1.29,

  // --- 転生 ---
  prestigeMinWave: 10,
  prestigeCoinBonusPer: 0.12,

  // --- パック ---
  packPerPrestigeDiv: 10,
  packPerPrestigeMax: 25,

  // --- 3択カード ---
  draftSize: 3,
  rarityWeight: { common: 62, rare: 26, epic: 10, legendary: 2.0 },
  rarityDraftLuck: { common: -1.0, rare: 0.35, epic: 0.55, legendary: 0.75 },

  // --- レアリティ表示 ---
  rarity: {
    common:    { name: 'コモン',     color: '#9fb2c4', glow: 0 },
    rare:      { name: 'レア',       color: '#4aa8ff', glow: 1 },
    epic:      { name: 'エピック',   color: '#c26bff', glow: 2 },
    legendary: { name: 'レジェンド', color: '#ffb020', glow: 3 },
  },
  rarityOrder: ['common', 'rare', 'epic', 'legendary'],
};
