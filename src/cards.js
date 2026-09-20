// ---------------------------------------------------------------
// cards.js : カード定義（永久資源）
//   インクリメンタル = 数字を上げる / カード = 武器の挙動を変える
//   という役割分担を守る。ここに「全体攻撃力+10%」だけのカードは置かない
//
//   武器カードの入手経路は WEAPONS[x].src で決まる
//     start … 最初から所持       stage … ステージ突破報酬       pack … パックから
// ---------------------------------------------------------------
'use strict';

function C(o) { return o; }

// 遺物カード。**説明文は tmpl と eff から作る。**
//   {e} … 効果量そのまま   {p} … 百分率（加算のとき見やすい）
function P(o) {
  o.kind = 'perm';
  o.desc = o.tmpl
    .split('{p}').join(Math.round(o.eff * 100) + '%')
    .split('{e}').join(String(o.eff));
  return o;
}

const CARDS = {

  // ============ 武器カード ============
  wc_gatling:  C({ id: 'wc_gatling',  kind: 'weapon', weapon: 'gatling',  rarity: 'common', name: 'ガトリング砲',   desc: '編成枠に装備。毎秒大量の小口径弾。' }),
  wc_sniper:   C({ id: 'wc_sniper',   kind: 'weapon', weapon: 'sniper',   rarity: 'common', name: '狙撃タレット',   desc: '編成枠に装備。長射程・高威力の単発。' }),
  wc_missile:  C({ id: 'wc_missile',  kind: 'weapon', weapon: 'missile',  rarity: 'rare',   name: 'ミサイルポッド', desc: '編成枠に装備。置いた円の中へ爆撃を降らせ続ける。' }),
  wc_tesla:    C({ id: 'wc_tesla',    kind: 'weapon', weapon: 'tesla',    rarity: 'rare',   name: 'テスラコイル',   desc: '編成枠に装備。砲身の先へ即着の連鎖電撃。' }),
  wc_flame:    C({ id: 'wc_flame',    kind: 'weapon', weapon: 'flame',    rarity: 'epic',   name: '火炎放射器',     desc: '編成枠に装備。扇状に炎を吹き、燃焼を残す。' }),
  wc_gas:      C({ id: 'wc_gas',      kind: 'weapon', weapon: 'gas',      rarity: 'epic',   name: '毒ガス散布機',   desc: '編成枠に装備。砲身の先へ毒の雲を撒き続ける。' }),
  wc_cryo:     C({ id: 'wc_cryo',     kind: 'weapon', weapon: 'cryo',     rarity: 'legendary', name: '凍結装置',    desc: '編成枠に装備。周囲へ冷気を放ち、敵を鈍らせる。' }),
  wc_mortar:   C({ id: 'wc_mortar',   kind: 'weapon', weapon: 'mortar',   rarity: 'rare',   name: '迫撃砲',         desc: '編成枠に装備。置いた円の中へ重い砲弾を降らせ続ける。' }),
  wc_katana:   C({ id: 'wc_katana',   kind: 'weapon', weapon: 'katana',   rarity: 'rare',   name: '刀',             desc: '編成枠に装備。間合いの敵をまとめて斬る。' }),
  wc_shuriken: C({ id: 'wc_shuriken', kind: 'weapon', weapon: 'shuriken', rarity: 'rare',   name: '手裏剣',         desc: '編成枠に装備。敵から敵へ跳ね回る。' }),
  wc_tentacle: C({ id: 'wc_tentacle', kind: 'weapon', weapon: 'tentacle', rarity: 'epic',   name: '触手',           desc: '編成枠に装備。砲身の先の敵を掴んで来た道へ引き戻す。' }),
  wc_bubble:   C({ id: 'wc_bubble',   kind: 'weapon', weapon: 'bubble',   rarity: 'epic',   name: '泡',             desc: '編成枠に装備。置いた円の中へ泡を降らせ、敵を閉じ込める。' }),

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
  gat_heat: C({ id: 'gat_heat', kind: 'mod', weapon: 'gatling', rarity: 'epic', maxStack: 1,
    // **上限がある。** 撃ちっぱなしになったので、重ねるほど速くなる形だと
    // 「置いておくだけで加速し続ける」になってしまう（BAL.heatCap で頭打ち）
    name: '加熱暴走', desc: '当て続けるほど発射レート上昇（上限 +120%）。当たらないと冷える',
    apply(run) { const w = run.wp('gatling'); if (w) { w.flags.heat = true; w.dyn.heatMax = BAL.heatCap; } } }),
  // ---- 扇を「広げるほど得」にするカード ----
  //
  //   扇を広げるのは、これまで一方的に損だった（集弾率が落ちるだけ）。
  //   広さそのものを利益に変える道を用意して、**絞る／広げるを選ばせる**。
  //   広げても漏れやすさは変わらないので、そこが対価として残る。
  gat_barrels: C({ id: 'gat_barrels', kind: 'mod', weapon: 'gatling', rarity: 'rare', maxStack: 2,
    name: '多銃身', desc: '射界を広げているほど同時発射が増える（最大まで広げて +3）',
    apply(run) { const w = run.wp('gatling'); if (w) { w.flags.wideCount = true; w.dyn.wideCount = (w.dyn.wideCount || 0) + 3; } } }),
  gat_loose: C({ id: 'gat_loose', kind: 'mod', weapon: 'gatling', rarity: 'epic', maxStack: 1,
    // **ただの火力カードでは駄目だった。** 実測で、絞る 106漏れ／広げる 110漏れ と
    // ほぼ同じになり、「広げる理由」にならなかった（火力が上がるだけ）。
    // 火力の上がり方そのものを射界の広さに結び直した
    name: '暴発装薬', desc: '集弾率が最低で固定される代わりに、射界を広げているほどダメージ（最大 ×1.8）',
    apply(run) { const w = run.wp('gatling'); if (w) {
      w.flags.looseGroup = true;
      w.flags.wideDmg = true; w.dyn.wideDmg = (w.dyn.wideDmg || 0) + 0.8;
    } } }),
  shk_sweep: C({ id: 'shk_sweep', kind: 'mod', weapon: 'shuriken', rarity: 'rare', maxStack: 3,
    name: '薙ぎ払い', desc: '射界を広げているほどダメージが上がる（最大まで広げて ×1.6）',
    apply(run) { const w = run.wp('shuriken'); if (w) { w.flags.wideDmg = true; w.dyn.wideDmg = (w.dyn.wideDmg || 0) + 0.6; } } }),

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
    apply(run) { const w = run.wp('sniper'); if (w) { w.s.pierce += 99; w.s.speed *= 1.6; w.s.dmg *= 1.3; } } }),
  snp_exec: C({ id: 'snp_exec', kind: 'mod', weapon: 'sniper', rarity: 'legendary', maxStack: 1,
    name: '執行', desc: 'スナイパーが命中させた敵は、残りHP18%以下なら即死',
    apply(run) { const w = run.wp('sniper'); if (w) w.s.execThr = Math.max(w.s.execThr, 0.18); } }),

  // ============ ミサイル ============
  msl_warhead: C({ id: 'msl_warhead', kind: 'mod', weapon: 'missile', rarity: 'common', maxStack: 5,
    name: '増装弾頭', desc: 'ミサイルの爆風半径 ×1.35、ダメージ ×1.22',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.splash *= 1.35; w.s.dmg *= 1.22; } } }),
  msl_guide: C({ id: 'msl_guide', kind: 'mod', weapon: 'missile', rarity: 'common', maxStack: 5,
    name: '速装填', desc: 'ミサイルの着弾までが速くなり、発射レート ×1.2',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.speed *= 1.35; w.s.rate *= 1.2; } } }),
  msl_multi: C({ id: 'msl_multi', kind: 'mod', weapon: 'missile', rarity: 'rare', maxStack: 3,
    name: '多弾頭', desc: 'ミサイルの同時発射 +2、ダメージ ×0.85',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.count += 2; w.s.dmg *= 0.85; } } }),
  msl_cluster: C({ id: 'msl_cluster', kind: 'mod', weapon: 'missile', rarity: 'epic', maxStack: 2,
    name: 'クラスター弾', desc: '爆発時に子ミサイルを4発ばら撒く',
    apply(run) { const w = run.wp('missile'); if (w) w.dyn.cluster = (w.dyn.cluster || 0) + 4; } }),
  msl_nuke: C({ id: 'msl_nuke', kind: 'mod', weapon: 'missile', rarity: 'legendary', maxStack: 1,
    name: '戦術核', desc: 'ミサイルのダメージ ×3.2 / 爆風 ×2.4 / レート ×0.55',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.dmg *= 3.2; w.s.splash *= 2.4; w.s.rate *= 0.55; } } }),

  // ============ テスラコイル ============
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

  // ============ 火炎放射器 ============
  flm_fuel: C({ id: 'flm_fuel', kind: 'mod', weapon: 'flame', rarity: 'common', maxStack: 5,
    name: '高圧燃料', desc: '火炎のダメージ ×1.40',
    apply(run) { const w = run.wp('flame'); if (w) w.s.dmg *= 1.40; } }),
  flm_wide: C({ id: 'flm_wide', kind: 'mod', weapon: 'flame', rarity: 'rare', maxStack: 3,
    name: '拡散ノズル', desc: '火炎の扇が ×1.45 に広がり、射程 ×1.18',
    apply(run) { const w = run.wp('flame'); if (w) { w.s.cone *= 1.45; w.s.range *= 1.18; } } }),
  flm_napalm: C({ id: 'flm_napalm', kind: 'mod', weapon: 'flame', rarity: 'epic', maxStack: 2,
    name: 'ナパーム', desc: '燃焼ダメージ ×1.8。さらに炎の先端に火の海を残す',
    apply(run) { const w = run.wp('flame'); if (w) { w.s.burn *= 1.8; w.s.burnDur += 1.5; w.flags.napalm = true; } } }),

  // ============ 毒ガス散布機 ============
  gas_dense: C({ id: 'gas_dense', kind: 'mod', weapon: 'gas', rarity: 'common', maxStack: 5,
    name: '濃縮ガス', desc: '毒の雲のダメージ ×1.45',
    apply(run) { const w = run.wp('gas'); if (w) w.s.dmg *= 1.45; } }),
  gas_wide: C({ id: 'gas_wide', kind: 'mod', weapon: 'gas', rarity: 'rare', maxStack: 3,
    name: '拡散弾頭', desc: '雲の半径 ×1.35、持続 ×1.3',
    apply(run) { const w = run.wp('gas'); if (w) { w.s.fieldR *= 1.35; w.s.fieldDur *= 1.3; } } }),
  gas_nerve: C({ id: 'gas_nerve', kind: 'mod', weapon: 'gas', rarity: 'legendary', maxStack: 1,
    name: '神経ガス', desc: '雲の中の敵は 50%減速し、受けるダメージ +45%。毒 ×1.6',
    apply(run) { const w = run.wp('gas'); if (w) { w.s.dmg *= 1.6; w.s.slow = Math.max(w.s.slow, 0.5);
      w.s.fieldVuln = Math.max(w.s.fieldVuln, 0.45); } } }),

  // ============ 凍結装置 ============
  cry_deep: C({ id: 'cry_deep', kind: 'mod', weapon: 'cryo', rarity: 'common', maxStack: 5,
    name: '深冷', desc: '冷気のダメージ ×1.5、減速の持続 +0.6秒',
    apply(run) { const w = run.wp('cryo'); if (w) { w.s.dmg *= 1.5; w.s.slowDur += 0.6; } } }),
  cry_wide: C({ id: 'cry_wide', kind: 'mod', weapon: 'cryo', rarity: 'rare', maxStack: 3,
    name: '冷却範囲拡大', desc: '冷気の範囲 ×1.35、発動レート ×1.2',
    apply(run) { const w = run.wp('cryo'); if (w) { w.s.range *= 1.35; w.s.rate *= 1.2; } } }),
  cry_shatter: C({ id: 'cry_shatter', kind: 'mod', weapon: 'cryo', rarity: 'epic', maxStack: 2,
    name: '砕氷', desc: '凍っている敵が受けるダメージ +60%。凍った敵を倒すと氷片が周囲に飛ぶ',
    apply(run) { const w = run.wp('cryo'); if (w) { w.flags.shatter = true; run.chillVuln += 0.6; } } }),

  // ============ 刀 ============
  ktn_edge: C({ id: 'ktn_edge', kind: 'mod', weapon: 'katana', rarity: 'common', maxStack: 5,
    name: '研磨', desc: '刀のダメージ ×1.50',
    apply(run) { const w = run.wp('katana'); if (w) w.s.dmg *= 1.50; } }),
  ktn_iai: C({ id: 'ktn_iai', kind: 'mod', weapon: 'katana', rarity: 'rare', maxStack: 3,
    name: '居合', desc: '刀の斬撃レート ×1.5、会心率 +15%',
    apply(run) { const w = run.wp('katana'); if (w) { w.s.rate *= 1.5; w.s.crit += 0.15; } } }),
  ktn_mugen: C({ id: 'ktn_mugen', kind: 'mod', weapon: 'katana', rarity: 'legendary', maxStack: 1,
    name: '無限刃', desc: '斬るたびに間合いが +6%（最大2倍まで）。斬り続けるほど手が付けられない',
    apply(run) { const w = run.wp('katana'); if (w) { w.flags.mugen = true; w.dyn.mugenBase = w.s.range; } } }),

  // ============ 手裏剣 ============
  shu_multi: C({ id: 'shu_multi', kind: 'mod', weapon: 'shuriken', rarity: 'common', maxStack: 5,
    name: '三枚重ね', desc: '手裏剣の同時投擲 +2、ダメージ ×0.88',
    apply(run) { const w = run.wp('shuriken'); if (w) { w.s.count += 2; w.s.dmg *= 0.88; w.s.spread = Math.max(w.s.spread, 0.09); } } }),
  shu_bounce: C({ id: 'shu_bounce', kind: 'mod', weapon: 'shuriken', rarity: 'rare', maxStack: 3,
    name: '反射増加', desc: '手裏剣の跳ね返り +3',
    apply(run) { const w = run.wp('shuriken'); if (w) w.s.bounce += 3; } }),
  shu_poison: C({ id: 'shu_poison', kind: 'mod', weapon: 'shuriken', rarity: 'epic', maxStack: 2,
    name: '毒手裏剣', desc: '命中で毒を付与。跳ねるたびにダメージ +12%（減衰しない）',
    apply(run) { const w = run.wp('shuriken'); if (w) { w.s.burn = Math.max(w.s.burn, 0.35); w.s.burnDur = Math.max(w.s.burnDur, 3); w.flags.ramp = true; } } }),

  // ============ 触手 ============
  tnt_grip: C({ id: 'tnt_grip', kind: 'mod', weapon: 'tentacle', rarity: 'common', maxStack: 5,
    name: '握力', desc: '触手のダメージ ×1.60',
    apply(run) { const w = run.wp('tentacle'); if (w) w.s.dmg *= 1.60; } }),
  tnt_long: C({ id: 'tnt_long', kind: 'mod', weapon: 'tentacle', rarity: 'rare', maxStack: 3,
    name: '伸長', desc: '触手の射程 ×1.35、引き戻す力 ×1.35',
    apply(run) { const w = run.wp('tentacle'); if (w) { w.s.range *= 1.35; w.s.knock *= 1.35; } } }),
  tnt_many: C({ id: 'tnt_many', kind: 'mod', weapon: 'tentacle', rarity: 'epic', maxStack: 2,
    name: '多腕', desc: '同時に掴める敵 +1',
    apply(run) { const w = run.wp('tentacle'); if (w) w.s.count += 1; } }),

  // ============ 泡 ============
  bbl_big: C({ id: 'bbl_big', kind: 'mod', weapon: 'bubble', rarity: 'common', maxStack: 5,
    name: '大泡', desc: '閉じ込める時間 ×1.35、割れたときの範囲 ×1.25',
    apply(run) { const w = run.wp('bubble'); if (w) { w.s.stunDur *= 1.35; w.s.splash *= 1.25; } } }),
  bbl_rapid: C({ id: 'bbl_rapid', kind: 'mod', weapon: 'bubble', rarity: 'rare', maxStack: 3,
    name: '連泡', desc: '泡の発射レート ×1.55',
    apply(run) { const w = run.wp('bubble'); if (w) w.s.rate *= 1.55; } }),
  bbl_acid: C({ id: 'bbl_acid', kind: 'mod', weapon: 'bubble', rarity: 'epic', maxStack: 2,
    name: '酸泡', desc: '割れたときのダメージ ×2.4。さらに酸だまりを残す',
    apply(run) { const w = run.wp('bubble'); if (w) { w.s.splashMul *= 2.4; w.flags.acid = true; w.s.fieldR = 60; w.s.fieldDur = 3.5; } } }),

  // ============ 迫撃砲 ============
  mtr_shell: C({ id: 'mtr_shell', kind: 'mod', weapon: 'mortar', rarity: 'common', maxStack: 5,
    name: '大口径榴弾', desc: '迫撃砲のダメージ ×1.45',
    apply(run) { const w = run.wp('mortar'); if (w) w.s.dmg *= 1.45; } }),
  mtr_wide: C({ id: 'mtr_wide', kind: 'mod', weapon: 'mortar', rarity: 'rare', maxStack: 3,
    name: '広域炸裂', desc: '迫撃砲の爆風 ×1.40、射程 ×1.18',
    apply(run) { const w = run.wp('mortar'); if (w) { w.s.splash *= 1.40; w.s.range *= 1.18; } } }),
  mtr_carpet: C({ id: 'mtr_carpet', kind: 'mod', weapon: 'mortar', rarity: 'epic', maxStack: 2,
    name: '絨毯爆撃', desc: '迫撃砲の同時発射 +3、ダメージ ×0.8',
    apply(run) { const w = run.wp('mortar'); if (w) { w.s.count += 3; w.s.dmg *= 0.8; } } }),

  // ============ シナジー（2種を同時編成しているときだけ抽選に出る） ============
  syn_charged: C({ id: 'syn_charged', kind: 'synergy', requires: ['gatling', 'tesla'], rarity: 'common', maxStack: 4,
    name: '帯電弾', desc: '【ガトリング＋テスラ】ガトリング弾が着弾時に2連鎖の電撃を起こす',
    apply(run) { const w = run.wp('gatling'); if (w) { w.flags.charged = true; w.dyn.chargedChain = (w.dyn.chargedChain || 0) + 2; } } }),
  syn_spotter: C({ id: 'syn_spotter', kind: 'synergy', requires: ['sniper', 'missile'], rarity: 'rare', maxStack: 3,
    // **狙いは動かさない。** どこへ落とすかはプレイヤーが決めるものなので、
    // 「印の付いた敵に落ちたときだけ効く」形にしてある
    name: '曳光指示', desc: '【スナイパー＋ミサイル】スナイパーが撃ち抜いた敵に印が残り、そこへの着弾 ×1.6',
    apply(run) { const s = run.wp('sniper'), m = run.wp('missile');
      if (s) s.flags.spot = true;
      if (m) m.dyn.spotMul = (m.dyn.spotMul || 1) * 1.6; } }),
  syn_implode: C({ id: 'syn_implode', kind: 'synergy', requires: ['missile', 'tesla'], rarity: 'rare', maxStack: 3,
    name: '電磁爆縮', desc: '【ミサイル＋テスラ】ミサイルの爆発が感電を付与し、爆風 ×1.35',
    apply(run) { const m = run.wp('missile'); if (m) { m.flags.implode = true; m.s.splash *= 1.35; m.s.shockDur = Math.max(m.s.shockDur, 2.5); } } }),
  syn_resonance: C({ id: 'syn_resonance', kind: 'synergy', requires: ['gatling', 'sniper'], rarity: 'epic', maxStack: 2,
    name: '弾道共鳴', desc: '【ガトリング＋スナイパー】ガトリング命中ごとにスナイパーのダメージ +0.6%（上限 +400%）',
    apply(run) { const g = run.wp('gatling'); if (g) g.flags.resonance = true; } }),

  syn_backdraft: C({ id: 'syn_backdraft', kind: 'synergy', requires: ['flame', 'gas'], rarity: 'rare', maxStack: 3,
    name: '爆燃', desc: '【火炎放射器＋毒ガス】毒の雲に炎が届くと引火して大爆発する',
    apply(run) { const f = run.wp('flame'); if (f) f.flags.ignite = true; run.backdraft += 1; } }),
  syn_shatterblade: C({ id: 'syn_shatterblade', kind: 'synergy', requires: ['cryo', 'katana'], rarity: 'rare', maxStack: 3,
    name: '兜割り', desc: '【凍結装置＋刀】凍っている敵に対して刀の斬撃が必ず会心になる',
    apply(run) { const k = run.wp('katana'); if (k) k.flags.frostCrit = true; } }),
  syn_staticfoam: C({ id: 'syn_staticfoam', kind: 'synergy', requires: ['bubble', 'tesla'], rarity: 'common', maxStack: 4,
    name: '感電泡', desc: '【泡＋テスラ】泡に閉じ込めた敵が感電し、雷の連鎖が必ずそこを通る',
    apply(run) { const b = run.wp('bubble'); if (b) { b.flags.staticFoam = true; b.s.shockDur = Math.max(b.s.shockDur, 3); } } }),
  syn_hangman: C({ id: 'syn_hangman', kind: 'synergy', requires: ['tentacle', 'missile'], rarity: 'epic', maxStack: 2,
    name: '吊るし上げ', desc: '【触手＋ミサイル】掴まれている敵への着弾ダメージ ×2.2',
    apply(run) { const t = run.wp('tentacle'); if (t) t.flags.hang = true;
      const m = run.wp('missile'); if (m) m.dyn.grabMul = (m.dyn.grabMul || 1) * 2.2; } }),

  syn_fixfire: C({ id: 'syn_fixfire', kind: 'synergy', requires: ['tentacle', 'mortar'], rarity: 'rare', maxStack: 3,
    name: '照準固定', desc: '【触手＋迫撃砲】掴まれて足が止まった敵への着弾ダメージ ×1.5',
    apply(run) { const t = run.wp('tentacle'); if (t) t.flags.hang = true;
      const m = run.wp('mortar'); if (m) m.dyn.grabMul = (m.dyn.grabMul || 1) * 1.5; } }),

  // ============ 汎用（編成に関係なく出る） ============
  gen_armor: C({ id: 'gen_armor', kind: 'generic', rarity: 'common', maxStack: 5,
    name: '増設装甲', desc: 'ライフ +6（その場で回復もする）',
    apply(run) { run.livesMax += 6; run.lives += 6; } }),
  gen_gold: C({ id: 'gen_gold', kind: 'generic', rarity: 'rare', maxStack: 3,
    name: '金メッキ弾', desc: 'このランのコイン獲得 ×1.35',
    apply(run) { run.coinMul *= 1.35; } }),
  gen_boost: C({ id: 'gen_boost', kind: 'generic', rarity: 'rare', maxStack: 3,
    name: '過給機', desc: '全武器の発射レート ×1.15、射程 ×1.12',
    apply(run) { for (const w of run.units) { w.s.rate *= 1.15; w.s.range *= 1.12; } } }),
  // ============ 遺物（永続パッシブ）============
  //
  //   **転生で消えない唯一の数値成長。** 遺物パックからのみ出る。
  //   ウェーブ間の3択には出ない（kind:'perm' を draft.js で弾いている）。
  //
  //   効果量は eff だけが持ち、説明文も計算も eff から作る（skilltree.js と同じ作法）。
  //   mode:'add' … 枚数ぶん加算する。**種類ごとに cap（上限）がある。**
  //                上限が無いと、9周ぶん集めたときに ×480 まで伸びた（実測）。
  //                桁を作るのは土台（relics.js の Legacy）の役で、遺物は色付け
  //   mode:'mul' … 廃止した。効果量を少し動かすだけで「足りない」と「発散」に振れたため
  rl_dmg1:  P({ id: 'rl_dmg1',  rarity: 'common', key: 'dmg',  eff: 0.08, mode: 'add', cap: 1.0,
    name: '増幅片',   tmpl: '全ての武器のダメージ +{p}' }),
  rl_coin1: P({ id: 'rl_coin1', rarity: 'common', key: 'coin', eff: 0.08, mode: 'add', cap: 1.0,
    name: '蓄財片',   tmpl: '獲得コイン +{p}' }),
  rl_rate1: P({ id: 'rl_rate1', rarity: 'common', key: 'rate', eff: 0.08, mode: 'add', cap: 0.5,
    name: '律動片',   tmpl: '全ての武器の発射レート +{p}' }),
  rl_life1: P({ id: 'rl_life1', rarity: 'common', key: 'lives', eff: 2, mode: 'flat',
    name: '防壁片',   tmpl: 'ライフ +{e}' }),

  rl_dmg2:  P({ id: 'rl_dmg2',  rarity: 'rare', key: 'dmg',  eff: 0.20, mode: 'add', cap: 1.5,
    name: '増幅核',   tmpl: '全ての武器のダメージ +{p}' }),
  rl_coin2: P({ id: 'rl_coin2', rarity: 'rare', key: 'coin', eff: 0.20, mode: 'add', cap: 1.5,
    name: '蓄財核',   tmpl: '獲得コイン +{p}' }),
  rl_rate2: P({ id: 'rl_rate2', rarity: 'rare', key: 'rate', eff: 0.20, mode: 'add', cap: 0.8,
    name: '律動核',   tmpl: '全ての武器の発射レート +{p}' }),
  rl_seed:  P({ id: 'rl_seed',  rarity: 'rare', key: 'seed', eff: 400, mode: 'flat',
    name: '初動資金', tmpl: '転生した直後に コイン +{e}' }),
  // **設置枠を配るのをやめた。** これが「転生2回でゲーム崩壊」の正体で、
  // しかも集計側が読んでいなかったので、説明文だけが嘘をついている状態でもあった
  rl_unit:  P({ id: 'rl_unit',  rarity: 'rare', key: 'lives', eff: 6, mode: 'flat',
    name: '常設装甲', tmpl: 'ライフ +{e}' }),

  // **累乗をやめた。** 桁を作るのは土台（relics.js の Legacy）の役で、
  // 遺物は色付け。累乗のままだと9周で ×5,700万まで膨らみ、
  // しかも効果量を少し動かすだけで「足りない」と「発散」に振れた（実測）
  rl_dmg3:  P({ id: 'rl_dmg3',  rarity: 'epic', key: 'dmg',  eff: 0.35, mode: 'add', cap: 2.0,
    name: '増幅炉',   tmpl: '全ての武器のダメージ +{p}' }),
  rl_coin3: P({ id: 'rl_coin3', rarity: 'epic', key: 'coin', eff: 0.35, mode: 'add', cap: 2.0,
    name: '蓄財炉',   tmpl: '獲得コイン +{p}' }),

  rl_core:  P({ id: 'rl_core',  rarity: 'legendary', key: 'dmg', eff: 0.80, mode: 'add', cap: 3.0,
    name: '特異点炉', tmpl: '全ての武器のダメージ +{p}' }),
  // **これが「登り直す時間」を消す本命。** 倍率ではなく、買う手数を減らす
  rl_invest: P({ id: 'rl_invest', rarity: 'legendary', key: 'startLv', eff: 1, mode: 'flat',
    name: '初期投資', tmpl: '出撃するとき、アップグレードが最初から Lv+{e} の状態になる' }),
};

const CARD_IDS = Object.keys(CARDS);

// 武器カードの入手経路。パックから出るのは src:'pack' のものだけ
function weaponCardSrc(cardId) {
  const c = CARDS[cardId];
  if (!c || c.kind !== 'weapon') return null;
  const w = WEAPONS[c.weapon];
  return w ? w.src : null;
}

// 初期所持。ミサイル以降はステージ突破、刀以降はパックから手に入る
const STARTER_CARDS = {
  wc_gatling: 1, wc_sniper: 1,
  gat_belt: 1, gat_cool: 1,
  snp_scope: 1, snp_he: 1,
  gen_armor: 1,
};
