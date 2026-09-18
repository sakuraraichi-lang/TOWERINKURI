// ---------------------------------------------------------------
// balance.js : 全ての調整ノブ。バランスを触るときはここだけ見ればいい
// ---------------------------------------------------------------
'use strict';

const BAL = {
  // --- 盤面（タイルは stages.js の TILE = 44px） ---
  coreR: 16,
  loadoutSlots: 4,      // 編成できる武器の「種類」数
  unitBonus: 0,         // 設置上限への加算（スキルで増える）

  // --- 射界（扇） ---
  // ユニットは自分が向いている方向の扇の中しか攻撃できない。
  // 扇を広げるとカバー範囲が増える代わりに弾がばらける（集弾率が落ちる）。狭めるとその逆
  arcMin: 0.13,         // 約7.5度（最も絞った状態）
  arcMax: 0.90,         // 約52度（最も広げた状態）
  arcStep: 0.11,        // ボタン1回で動く量
  spreadPenalty: 0.55,  // 最大まで広げたときに集弾率がどこまで落ちるか（1.0 -> 0.45）
  spreadRad: 0.34,      // 集弾率が0のときに弾が散らばる幅(rad)

  // --- ステージ構造 ---
  wavesPerStage: 5,     // 1ステージ＝5ウェーブ。全部凌げば突破
  minRouteLen: 20,      // 出現口からコアまでの最短タイル数の下限（起動時に検証する）
                        // tools/genmaps.py の MIN_ROUTE と必ず同じ値にすること
  // ウェーブを凌ぐと必ずビルドフェーズに戻る。プレイヤーが開始ボタンを押すまで進まない

  // --- ライフ ---
  // コアのHPではなく「ライフ」。抜けられた敵1体につき1減る。
  // HPだと後半に数字を積んで漏らし放題になってしまうので、体数で数える
  livesBase: 24,
  leakLives: 1,         // 1体抜けられるごとに減るライフ
  bossLeakLives: 5,     // ボスに抜けられたとき

  // --- 敵 ---
  // 強さは「通算ウェーブ番号」で決まる。ステージ1のW1が1、ステージ2のW1が6
  enemyHpBase: 19,
  enemyHpGrowth: 1.30,
  enemySpdBase: 112,    // px/s（1タイル44px）。押し寄せる速さ
  enemySpdGrowth: 1.012,
  enemySpdCap: 260,
  enemyDpsBase: 7,
  enemyDpsGrowth: 1.26,
  enemyCoinBase: 2.4,
  enemyCoinGrowth: 1.26,
  enemySlowFloor: 0.25, // どれだけ重ねても、この倍率より遅くはならない

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
