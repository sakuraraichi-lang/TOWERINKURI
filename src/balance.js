// ---------------------------------------------------------------
// balance.js : 全ての調整ノブ。バランスを触るときはここだけ見ればいい
// ---------------------------------------------------------------
'use strict';

const BAL = {
  // --- 盤面（タイルは stages.js の TILE = 44px） ---
  coreR: 18,
  maxTurrets: 4,        // 同時に置ける武器の数（＝編成枠）

  // --- ステージ構造 ---
  wavesPerStage: 5,     // 1ステージ＝5ウェーブ。全部凌げば突破
  waveGap: 3.0,         // ウェーブとウェーブの間（カードを選ぶ間）

  // --- コア ---
  coreHpBase: 160,

  // --- 敵 ---
  // 強さは「通算ウェーブ番号」で決まる。ステージ1のW1が1、ステージ2のW1が6
  enemyHpBase: 14,
  enemyHpGrowth: 1.28,
  enemySpdBase: 112,    // px/s（1タイル44px）。押し寄せる速さ
  enemySpdGrowth: 1.012,
  enemySpdCap: 260,
  enemyDpsBase: 7,
  enemyDpsGrowth: 1.22,
  enemyCoinBase: 2.4,
  enemyCoinGrowth: 1.26,
  enemySlowFloor: 0.25, // どれだけ重ねても、この倍率より遅くはならない
  leakDamage: 3.0,      // コアに到達した敵が置いていくダメージ（dmgの何秒ぶんか）
  leakCoreFrac: 0.010,  // 同・コア最大HPに対する割合。HPを積んでも漏らし放題にならないための下限
  bossLeakMul: 4,       // ボスが抜けたときの追加倍率

  // 1ウェーブに来る敵の数。「大量に来る」ことが前提のゲームなので多め
  waveCountBase: 24,
  waveCountPerWave: 9,
  waveCountMax: 600,
  spawnIntervalBase: 0.22,
  spawnIntervalMin: 0.02,
  enemyCap: 900,

  // 各ステージの最終ウェーブにボスが出る
  bossHpMul: 26,
  bossSpdMul: 0.6,
  bossCoinMul: 34,
  bossDpsMul: 4,
  bossStunResist: 0.35,

  // --- 状態異常 ---
  shockVuln: 0.25,
  chillVulnBase: 0,
  fieldTick: 0.2,

  // --- 転生 ---
  prestigeMinStages: 2,         // これだけステージを突破すると転生できる
  prestigePower: 1.35,          // 転生1回ごとに 火力とコインが ×1.35（乗算）

  // --- パック ---
  packPerPrestigeMax: 25,

  // --- カード ---
  draftSize: 3,                 // 提示枚数の基本値（スキル「選択肢拡張」で増える）
  rarityWeight: { common: 62, rare: 26, epic: 10, legendary: 2.0 },
  rarityDraftLuck: { common: -1.0, rare: 0.35, epic: 0.55, legendary: 0.75 },

  // --- 配置の手がかり（ヒートマップ） ---
  trafficSample: 0.25,          // 何秒ごとに敵の位置を数えるか
  heatFade: 0.6,                // 次の戦闘へ持ち越すときの減衰率

  // --- レアリティ表示 ---
  rarity: {
    common:    { name: 'コモン',     color: '#9fb2c4', glow: 0 },
    rare:      { name: 'レア',       color: '#4aa8ff', glow: 1 },
    epic:      { name: 'エピック',   color: '#c26bff', glow: 2 },
    legendary: { name: 'レジェンド', color: '#ffb020', glow: 3 },
  },
  rarityOrder: ['common', 'rare', 'epic', 'legendary'],
};
