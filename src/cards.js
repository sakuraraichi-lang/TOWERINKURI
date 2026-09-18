// ---------------------------------------------------------------
// cards.js : カード定義（永久資源）
//   インクリメンタル = 数字を上げる / カード = 武器の挙動を変える
//   という役割分担を守る。ここに「全体攻撃力+10%」だけのカードは置かない
// ---------------------------------------------------------------
'use strict';

function C(o) { return o; }

const CARDS = {

  // ============ 武器カード（これを編成すると武器が使える） ============
  wc_gatling: C({ id: 'wc_gatling', kind: 'weapon', weapon: 'gatling', rarity: 'common',
    name: 'ガトリング砲', desc: '編成枠に装備。毎秒大量の小口径弾。' }),
  wc_sniper: C({ id: 'wc_sniper', kind: 'weapon', weapon: 'sniper', rarity: 'common',
    name: '狙撃タレット', desc: '編成枠に装備。長射程・高威力の単発。' }),
  wc_missile: C({ id: 'wc_missile', kind: 'weapon', weapon: 'missile', rarity: 'rare',
    name: 'ミサイルポッド', desc: '編成枠に装備。誘導して着弾時に爆発。' }),
  wc_tesla: C({ id: 'wc_tesla', kind: 'weapon', weapon: 'tesla', rarity: 'epic',
    name: 'テスラコイル', desc: '編成枠に装備。即着の連鎖電撃。' }),

  // ============ ガトリング ============
  gat_belt: C({ id: 'gat_belt', kind: 'mod', weapon: 'gatling', rarity: 'common', maxStack: 5,
    name: '給弾ベルト', desc: 'ガトリングのダメージ ×1.32',
    apply(run) { const w = run.wp('gatling'); if (w) w.s.dmg *= 1.32; } }),
  gat_cool: C({ id: 'gat_cool', kind: 'mod', weapon: 'gatling', rarity: 'common', maxStack: 5,
    name: '冷却フィン', desc: 'ガトリングの発射レート ×1.25',
    apply(run) { const w = run.wp('gatling'); if (w) w.s.rate *= 1.25; } }),
  gat_ap: C({ id: 'gat_ap', kind: 'mod', weapon: 'gatling', rarity: 'rare', maxStack: 3,
    name: '徹甲弾', desc: 'ガトリング弾が貫通 +1、ダメージ ×1.18',
    apply(run) { const w = run.wp('gatling'); if (w) { w.s.pierce += 1; w.s.dmg *= 1.18; } } }),
  gat_heat: C({ id: 'gat_heat', kind: 'mod', weapon: 'gatling', rarity: 'epic', maxStack: 2,
    name: '加熱暴走', desc: '撃ち続けるほど発射レート上昇（最大 +120%）。撃たないと冷える',
    apply(run) { const w = run.wp('gatling'); if (w) { w.flags.heat = true; w.dyn.heatMax = (w.dyn.heatMax || 0) + 1.2; } } }),
  gat_wall: C({ id: 'gat_wall', kind: 'mod', weapon: 'gatling', rarity: 'legendary', maxStack: 1,
    name: '弾幕結界', desc: '同時発射 +4 / レート ×1.3 / 射程 ×0.85。視界が弾で埋まる',
    apply(run) { const w = run.wp('gatling'); if (w) { w.s.count += 4; w.s.rate *= 1.3; w.s.range *= 0.85; w.s.spread = Math.max(w.s.spread, 0.1); } } }),

  // ============ スナイパー ============
  snp_scope: C({ id: 'snp_scope', kind: 'mod', weapon: 'sniper', rarity: 'common', maxStack: 5,
    name: '高倍率スコープ', desc: 'スナイパーの射程 ×1.35、ダメージ ×1.10',
    apply(run) { const w = run.wp('sniper'); if (w) { w.s.range *= 1.35; w.s.dmg *= 1.10; } } }),
  snp_he: C({ id: 'snp_he', kind: 'mod', weapon: 'sniper', rarity: 'common', maxStack: 5,
    name: '徹甲榴弾', desc: 'スナイパーのダメージ ×1.55',
    apply(run) { const w = run.wp('sniper'); if (w) w.s.dmg *= 1.55; } }),
  snp_weak: C({ id: 'snp_weak', kind: 'mod', weapon: 'sniper', rarity: 'rare', maxStack: 3,
    name: '弱点狙撃', desc: 'スナイパーに 会心率 +25% / 会心倍率 +1.0',
    apply(run) { const w = run.wp('sniper'); if (w) { w.s.crit += 0.25; w.s.critMul += 1.0; } } }),
  snp_rail: C({ id: 'snp_rail', kind: 'mod', weapon: 'sniper', rarity: 'epic', maxStack: 2,
    name: '貫通レールガン', desc: 'スナイパー弾が並んだ敵を全て貫通。弾速 ×1.6 / ダメージ ×1.3',
    apply(run) { const w = run.wp('sniper'); if (w) { w.s.pierce += 99; w.s.speed *= 1.6; w.s.dmg *= 1.3; w.flags.rail = true; } } }),
  snp_exec: C({ id: 'snp_exec', kind: 'mod', weapon: 'sniper', rarity: 'legendary', maxStack: 1,
    name: '執行', desc: 'スナイパーが命中させた敵は、残りHP18%以下なら即死',
    apply(run) { const w = run.wp('sniper'); if (w) w.s.execThr = Math.max(w.s.execThr, 0.18); } }),

  // ============ ミサイル ============
  msl_warhead: C({ id: 'msl_warhead', kind: 'mod', weapon: 'missile', rarity: 'common', maxStack: 5,
    name: '増装弾頭', desc: 'ミサイルの爆風半径 ×1.35、ダメージ ×1.22',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.splash *= 1.35; w.s.dmg *= 1.22; } } }),
  msl_guide: C({ id: 'msl_guide', kind: 'mod', weapon: 'missile', rarity: 'common', maxStack: 5,
    name: '誘導装置', desc: 'ミサイルの誘導性能 ×1.6、発射レート ×1.2',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.homing *= 1.6; w.s.rate *= 1.2; } } }),
  msl_multi: C({ id: 'msl_multi', kind: 'mod', weapon: 'missile', rarity: 'rare', maxStack: 3,
    name: '多弾頭', desc: 'ミサイルの同時発射 +2、ダメージ ×0.85',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.count += 2; w.s.dmg *= 0.85; } } }),
  msl_cluster: C({ id: 'msl_cluster', kind: 'mod', weapon: 'missile', rarity: 'epic', maxStack: 2,
    name: 'クラスター弾', desc: '爆発時に子ミサイルを4発ばら撒く',
    apply(run) { const w = run.wp('missile'); if (w) w.dyn.cluster = (w.dyn.cluster || 0) + 4; } }),
  msl_nuke: C({ id: 'msl_nuke', kind: 'mod', weapon: 'missile', rarity: 'legendary', maxStack: 1,
    name: '戦術核', desc: 'ミサイルのダメージ ×3.2 / 爆風 ×2.4 / レート ×0.55。画面が揺れる',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.dmg *= 3.2; w.s.splash *= 2.4; w.s.rate *= 0.55; w.flags.nuke = true; } } }),

  // ============ テスラ ============
  tsl_coil: C({ id: 'tsl_coil', kind: 'mod', weapon: 'tesla', rarity: 'common', maxStack: 5,
    name: '高圧コイル', desc: 'テスラのダメージ ×1.42',
    apply(run) { const w = run.wp('tesla'); if (w) w.s.dmg *= 1.42; } }),
  tsl_chain: C({ id: 'tsl_chain', kind: 'mod', weapon: 'tesla', rarity: 'common', maxStack: 5,
    name: '連鎖増幅', desc: 'テスラの連鎖数 +2',
    apply(run) { const w = run.wp('tesla'); if (w) w.s.chain += 2; } }),
  tsl_shock: C({ id: 'tsl_shock', kind: 'mod', weapon: 'tesla', rarity: 'rare', maxStack: 3,
    name: '感電', desc: 'テスラが当てた敵は3秒間、あらゆる被ダメージ +25%',
    apply(run) { const w = run.wp('tesla'); if (w) w.s.shockDur = Math.max(w.s.shockDur, 3) + 0.5; } }),
  tsl_over: C({ id: 'tsl_over', kind: 'mod', weapon: 'tesla', rarity: 'epic', maxStack: 2,
    name: '過負荷', desc: '連鎖 +3。連鎖しても威力が減衰せず、むしろ1段ごとに +12%',
    apply(run) { const w = run.wp('tesla'); if (w) { w.s.chain += 3; w.s.chainFalloff = Math.max(w.s.chainFalloff, 1.0) + 0.12; } } }),
  tsl_god: C({ id: 'tsl_god', kind: 'mod', weapon: 'tesla', rarity: 'legendary', maxStack: 1,
    name: '雷神', desc: '5秒ごとに画面全体へ落雷。テスラのダメージの3倍',
    apply(run) { const w = run.wp('tesla'); if (w) { w.flags.thunderGod = true; w.dyn.godCd = 5; } } }),

  // ============ シナジー（2種を同時編成しているときだけ抽選に出る） ============
  syn_charged: C({ id: 'syn_charged', kind: 'synergy', requires: ['gatling', 'tesla'], rarity: 'rare', maxStack: 3,
    name: '帯電弾', desc: '【ガトリング＋テスラ】ガトリング弾が着弾時に2連鎖の電撃を起こす',
    apply(run) { const w = run.wp('gatling'); if (w) { w.flags.charged = true; w.dyn.chargedChain = (w.dyn.chargedChain || 0) + 2; } } }),
  syn_spotter: C({ id: 'syn_spotter', kind: 'synergy', requires: ['sniper', 'missile'], rarity: 'epic', maxStack: 2,
    name: '曳光指示', desc: '【スナイパー＋ミサイル】スナイパーが撃った敵をミサイルが最優先で狙い、ダメージ ×1.6',
    apply(run) { const s = run.wp('sniper'), m = run.wp('missile');
      if (s) s.flags.spot = true;
      if (m) { m.flags.followSpot = true; m.s.dmg *= 1.6; } } }),
  syn_implode: C({ id: 'syn_implode', kind: 'synergy', requires: ['missile', 'tesla'], rarity: 'epic', maxStack: 2,
    name: '電磁爆縮', desc: '【ミサイル＋テスラ】ミサイルの爆発が感電を付与し、爆風 ×1.35',
    apply(run) { const m = run.wp('missile'); if (m) { m.flags.implode = true; m.s.splash *= 1.35; m.s.shockDur = Math.max(m.s.shockDur, 2.5); } } }),
  syn_resonance: C({ id: 'syn_resonance', kind: 'synergy', requires: ['gatling', 'sniper'], rarity: 'legendary', maxStack: 1,
    name: '弾道共鳴', desc: '【ガトリング＋スナイパー】ガトリング命中ごとにスナイパーのダメージ +0.6%（上限 +400%）',
    apply(run) { const g = run.wp('gatling'); if (g) g.flags.resonance = true; } }),

  // ============ 汎用（編成に関係なく出る） ============
  gen_armor: C({ id: 'gen_armor', kind: 'generic', rarity: 'common', maxStack: 5,
    name: '増設装甲', desc: '拠点の最大HP ×1.30。その分を即時回復',
    apply(run) { const add = run.tower.maxHp * 0.30; run.tower.maxHp += add; run.tower.hp += add; } }),
  gen_gold: C({ id: 'gen_gold', kind: 'generic', rarity: 'rare', maxStack: 3,
    name: '金メッキ弾', desc: 'このランのコイン獲得 ×1.35',
    apply(run) { run.coinMul *= 1.35; } }),
  gen_boost: C({ id: 'gen_boost', kind: 'generic', rarity: 'rare', maxStack: 3,
    name: '過給機', desc: '全武器の発射レート ×1.15、射程 ×1.12',
    apply(run) { for (const w of run.weapons) { w.s.rate *= 1.15; w.s.range *= 1.12; } } }),
};

const CARD_IDS = Object.keys(CARDS);

// 初期所持カード。仕様書に初期所持の記述が無いので、
// 「ミサイル・テスラはパックから引く」という導線のために最小構成にしてある
const STARTER_CARDS = {
  wc_gatling: 1, wc_sniper: 1,
  gat_belt: 1, gat_cool: 1,
  snp_scope: 1, snp_he: 1,
  gen_armor: 1,
};
