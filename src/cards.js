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

//   noRank … **ランクを上げても効果が変わらないカード。**
//   「必ず会心になる」のような二択や、上限そのものを触るものは、
//   数字を伸ばす場所が無い。3択の札に倍率を出すと嘘になるので印を付ける

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
    apply(run) { const w = run.wp('gatling'); if (w) w.s.dmg *= Game.rk(1.32); } }),
  gat_cool: C({ id: 'gat_cool', kind: 'mod', weapon: 'gatling', rarity: 'common', maxStack: 5,
    name: '冷却フィン', desc: 'ガトリングの発射レート ×1.25',
    apply(run) { const w = run.wp('gatling'); if (w) w.s.rate *= Game.rk(1.25); } }),
  gat_ap: C({ id: 'gat_ap', kind: 'mod', weapon: 'gatling', rarity: 'rare', maxStack: 3,
    name: '徹甲弾', desc: 'ガトリング弾が貫通 +1、ダメージ ×1.18',
    apply(run) { const w = run.wp('gatling'); if (w) { w.s.pierce += Game.rki(1); w.s.dmg *= Game.rk(1.18); } } }),
  gat_heat: C({ id: 'gat_heat', noRank: true, kind: 'mod', weapon: 'gatling', rarity: 'epic', maxStack: 1,
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
    apply(run) { const w = run.wp('gatling'); if (w) { w.flags.wideCount = true; w.dyn.wideCount = (w.dyn.wideCount || 0) + Game.rki(3); } } }),
  gat_loose: C({ id: 'gat_loose', kind: 'mod', weapon: 'gatling', rarity: 'epic', maxStack: 1,
    // **ただの火力カードでは駄目だった。** 実測で、絞る 106漏れ／広げる 110漏れ と
    // ほぼ同じになり、「広げる理由」にならなかった（火力が上がるだけ）。
    // 火力の上がり方そのものを射界の広さに結び直した
    name: '暴発装薬', desc: '集弾率が最低で固定される代わりに、射界を広げているほどダメージ（最大 ×1.8）',
    apply(run) { const w = run.wp('gatling'); if (w) {
      w.flags.looseGroup = true;
      w.flags.wideDmg = true; w.dyn.wideDmg = (w.dyn.wideDmg || 0) + Game.rka(0.8);
    } } }),
  shk_sweep: C({ id: 'shk_sweep', kind: 'mod', weapon: 'shuriken', rarity: 'rare', maxStack: 3,
    name: '薙ぎ払い', desc: '射界を広げているほどダメージが上がる（最大まで広げて ×1.6）',
    apply(run) { const w = run.wp('shuriken'); if (w) { w.flags.wideDmg = true; w.dyn.wideDmg = (w.dyn.wideDmg || 0) + Game.rka(0.6); } } }),

  gat_wall: C({ id: 'gat_wall', kind: 'mod', weapon: 'gatling', rarity: 'legendary', maxStack: 1,
    name: '弾幕結界', desc: '同時発射 +4 / レート ×1.3 / 射程 ×0.85。視界が弾で埋まる',
    apply(run) { const w = run.wp('gatling'); if (w) { w.s.count += Game.rki(4); w.s.rate *= Game.rk(1.3); w.s.range *= Game.rk(0.85); w.s.spread = Math.max(w.s.spread, 0.1); } } }),

  // ============ スナイパー ============
  snp_scope: C({ id: 'snp_scope', kind: 'mod', weapon: 'sniper', rarity: 'common', maxStack: 5,
    name: '高倍率スコープ', desc: 'スナイパーのダメージ ×1.10',
    apply(run) { const w = run.wp('sniper'); if (w) { w.s.dmg *= Game.rk(1.10); } } }),
  snp_he: C({ id: 'snp_he', kind: 'mod', weapon: 'sniper', rarity: 'common', maxStack: 5,
    name: '徹甲榴弾', desc: 'スナイパーのダメージ ×1.55',
    apply(run) { const w = run.wp('sniper'); if (w) w.s.dmg *= Game.rk(1.55); } }),
  snp_weak: C({ id: 'snp_weak', kind: 'mod', weapon: 'sniper', rarity: 'rare', maxStack: 3,
    name: '弱点狙撃', desc: 'スナイパーに 会心率 +25% / 会心倍率 +1.0',
    apply(run) { const w = run.wp('sniper'); if (w) { w.s.crit += Game.rka(0.25); w.s.critMul += Game.rka(1.0); } } }),
  snp_rail: C({ id: 'snp_rail', kind: 'mod', weapon: 'sniper', rarity: 'epic', maxStack: 2,
    name: '貫通レールガン', desc: 'スナイパー弾が並んだ敵を全て貫通。弾速 ×1.6 / ダメージ ×1.3',
    apply(run) { const w = run.wp('sniper'); if (w) { w.s.pierce += 99; w.s.speed *= Game.rk(1.6); w.s.dmg *= Game.rk(1.3); } } }),
  snp_exec: C({ id: 'snp_exec', kind: 'mod', weapon: 'sniper', rarity: 'legendary', maxStack: 1,
    name: '執行', desc: 'スナイパーが命中させた敵は、残りHP18%以下なら即死',
    apply(run) { const w = run.wp('sniper'); if (w) w.s.execThr = Math.max(w.s.execThr, Game.rka(0.18)); } }),

  // ============ ミサイル ============
  msl_warhead: C({ id: 'msl_warhead', kind: 'mod', weapon: 'missile', rarity: 'common', maxStack: 5,
    name: '増装弾頭', desc: 'ミサイルのダメージ ×1.22',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.dmg *= Game.rk(1.22); } } }),
  msl_guide: C({ id: 'msl_guide', kind: 'mod', weapon: 'missile', rarity: 'common', maxStack: 5,
    name: '速装填', desc: 'ミサイルの着弾までが速くなり、発射レート ×1.2',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.speed *= Game.rk(1.35); w.s.rate *= Game.rk(1.2); } } }),
  msl_multi: C({ id: 'msl_multi', kind: 'mod', weapon: 'missile', rarity: 'rare', maxStack: 3,
    name: '多弾頭', desc: 'ミサイルの同時発射 +2、ダメージ ×0.85',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.count += Game.rki(2); w.s.dmg *= Game.rk(0.85); } } }),
  msl_cluster: C({ id: 'msl_cluster', kind: 'mod', weapon: 'missile', rarity: 'epic', maxStack: 2,
    name: 'クラスター弾', desc: '爆発時に子ミサイルを4発ばら撒く',
    apply(run) { const w = run.wp('missile'); if (w) w.dyn.cluster = (w.dyn.cluster || 0) + Game.rki(4); } }),
  msl_nuke: C({ id: 'msl_nuke', kind: 'mod', weapon: 'missile', rarity: 'legendary', maxStack: 1,
    name: '戦術核', desc: 'ミサイルのダメージ ×3.2 / レート ×0.55',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.dmg *= Game.rk(3.2); w.s.rate *= Game.rk(0.55); } } }),

  // ============ テスラコイル ============
  tsl_coil: C({ id: 'tsl_coil', kind: 'mod', weapon: 'tesla', rarity: 'common', maxStack: 5,
    name: '高圧コイル', desc: 'テスラのダメージ ×1.42',
    apply(run) { const w = run.wp('tesla'); if (w) w.s.dmg *= Game.rk(1.42); } }),
  tsl_chain: C({ id: 'tsl_chain', kind: 'mod', weapon: 'tesla', rarity: 'common', maxStack: 5,
    name: '連鎖増幅', desc: 'テスラの連鎖数 +2',
    apply(run) { const w = run.wp('tesla'); if (w) w.s.chain += Game.rki(2); } }),
  tsl_shock: C({ id: 'tsl_shock', kind: 'mod', weapon: 'tesla', rarity: 'rare', maxStack: 3,
    name: '感電', desc: 'テスラが当てた敵は3秒間、あらゆる被ダメージ +25%',
    apply(run) { const w = run.wp('tesla'); if (w) w.s.shockDur = Math.max(w.s.shockDur, Game.rka(3)) + Game.rka(0.5); } }),
  tsl_over: C({ id: 'tsl_over', kind: 'mod', weapon: 'tesla', rarity: 'epic', maxStack: 2,
    name: '過負荷', desc: '連鎖 +3。連鎖しても威力が減衰せず、むしろ1段ごとに +12%',
    apply(run) { const w = run.wp('tesla'); if (w) { w.s.chain += Game.rki(3); w.s.chainFalloff = Math.max(w.s.chainFalloff, 1.0) + Game.rka(0.12); } } }),
  tsl_god: C({ id: 'tsl_god', kind: 'mod', weapon: 'tesla', rarity: 'legendary', maxStack: 1,
    name: '雷神', desc: '5秒ごとに画面全体へ落雷。テスラのダメージの3倍',
    apply(run) { const w = run.wp('tesla'); if (w) { w.flags.thunderGod = true; w.dyn.godEvery = 5 / Game.rka(1); w.dyn.godCd = w.dyn.godEvery; } } }),

  // ============ 火炎放射器 ============
  flm_fuel: C({ id: 'flm_fuel', kind: 'mod', weapon: 'flame', rarity: 'common', maxStack: 5,
    name: '高圧燃料', desc: '火炎のダメージ ×1.40',
    apply(run) { const w = run.wp('flame'); if (w) w.s.dmg *= Game.rk(1.40); } }),
  flm_wide: C({ id: 'flm_wide', kind: 'mod', weapon: 'flame', rarity: 'rare', maxStack: 3,
    name: '高圧ノズル', desc: '火炎のダメージ ×1.30',
    apply(run) { const w = run.wp('flame'); if (w) { w.s.dmg *= Game.rk(1.30); } } }),
  flm_napalm: C({ id: 'flm_napalm', kind: 'mod', weapon: 'flame', rarity: 'epic', maxStack: 2,
    name: 'ナパーム', desc: '燃焼ダメージ ×1.8。さらに炎の先端に火の海を残す',
    apply(run) { const w = run.wp('flame'); if (w) { w.s.burn *= Game.rk(1.8); w.s.burnDur += Game.rka(1.5); w.flags.napalm = true; } } }),

  // ============ 毒ガス散布機 ============
  gas_dense: C({ id: 'gas_dense', kind: 'mod', weapon: 'gas', rarity: 'common', maxStack: 5,
    name: '濃縮ガス', desc: '毒の雲のダメージ ×1.45',
    apply(run) { const w = run.wp('gas'); if (w) w.s.dmg *= Game.rk(1.45); } }),
  gas_wide: C({ id: 'gas_wide', kind: 'mod', weapon: 'gas', rarity: 'rare', maxStack: 3,
    name: '長期滞留', desc: '毒の雲の持続 ×1.22',
    apply(run) { const w = run.wp('gas'); if (w) { w.s.fieldDur *= Game.rk(1.22); } } }),
  gas_nerve: C({ id: 'gas_nerve', kind: 'mod', weapon: 'gas', rarity: 'legendary', maxStack: 1,
    name: '神経ガス', desc: '雲の中の敵は 50%減速し、受けるダメージ +45%。毒 ×1.6',
    apply(run) { const w = run.wp('gas'); if (w) { w.s.dmg *= Game.rk(1.6); w.s.slow = Math.min(0.85, Math.max(w.s.slow, Game.rka(0.5)));
      w.s.fieldVuln = Math.max(w.s.fieldVuln, Game.rka(0.45)); } } }),

  // ============ 凍結装置 ============
  cry_deep: C({ id: 'cry_deep', kind: 'mod', weapon: 'cryo', rarity: 'common', maxStack: 5,
    name: '深冷', desc: '冷気のダメージ ×1.5、減速の持続 +0.6秒',
    apply(run) { const w = run.wp('cryo'); if (w) { w.s.dmg *= Game.rk(1.5); w.s.slowDur += Game.rka(0.6); } } }),
  cry_wide: C({ id: 'cry_wide', kind: 'mod', weapon: 'cryo', rarity: 'rare', maxStack: 3,
    name: '急速冷却', desc: '冷気の発動レート ×1.2、減速の持続 ×1.25',
    apply(run) { const w = run.wp('cryo'); if (w) { w.s.rate *= Game.rk(1.2); w.s.slowDur *= Game.rk(1.25); } } }),
  cry_shatter: C({ id: 'cry_shatter', kind: 'mod', weapon: 'cryo', rarity: 'epic', maxStack: 2,
    name: '砕氷', desc: '凍っている敵が受けるダメージ +60%。凍った敵を倒すと氷片が周囲に飛ぶ',
    apply(run) { const w = run.wp('cryo'); if (w) { w.flags.shatter = true; run.chillVuln += Game.rka(0.6); } } }),

  // ============ 刀 ============
  ktn_edge: C({ id: 'ktn_edge', kind: 'mod', weapon: 'katana', rarity: 'common', maxStack: 5,
    name: '研磨', desc: '刀のダメージ ×1.50',
    apply(run) { const w = run.wp('katana'); if (w) w.s.dmg *= Game.rk(1.50); } }),
  ktn_iai: C({ id: 'ktn_iai', kind: 'mod', weapon: 'katana', rarity: 'rare', maxStack: 3,
    name: '居合', desc: '刀の斬撃レート ×1.5、会心率 +15%',
    apply(run) { const w = run.wp('katana'); if (w) { w.s.rate *= Game.rk(1.5); w.s.crit += Game.rka(0.15); } } }),
  // 無限刃（斬るたびに間合い +6%・最大2倍）は撤去した（2026-09-24）。
  //   ユーザー 2026-09-22「武器の範囲を広げるスキル、カードなどゲーム内から全て削除」の
  //   0922u の撤去一覧から漏れていた。所持していた分は読み込み時に消える（state.js）

  // ============ 手裏剣 ============
  shu_multi: C({ id: 'shu_multi', kind: 'mod', weapon: 'shuriken', rarity: 'common', maxStack: 5,
    name: '三枚重ね', desc: '手裏剣の同時投擲 +2、ダメージ ×0.88',
    apply(run) { const w = run.wp('shuriken'); if (w) { w.s.count += Game.rki(2); w.s.dmg *= Game.rk(0.88); w.s.spread = Math.max(w.s.spread, 0.09); } } }),
  shu_bounce: C({ id: 'shu_bounce', kind: 'mod', weapon: 'shuriken', rarity: 'rare', maxStack: 3,
    name: '反射増加', desc: '手裏剣の跳ね返り +3',
    apply(run) { const w = run.wp('shuriken'); if (w) w.s.bounce += Game.rki(3); } }),
  shu_poison: C({ id: 'shu_poison', kind: 'mod', weapon: 'shuriken', rarity: 'epic', maxStack: 2,
    name: '毒手裏剣', desc: '命中で毒を付与。跳ねるたびにダメージ +12%（減衰しない）',
    apply(run) { const w = run.wp('shuriken'); if (w) { w.s.burn = Math.max(w.s.burn, Game.rka(0.35)); w.s.burnDur = Math.max(w.s.burnDur, Game.rka(3)); w.flags.ramp = true; } } }),

  // ============ 触手 ============
  tnt_grip: C({ id: 'tnt_grip', kind: 'mod', weapon: 'tentacle', rarity: 'common', maxStack: 5,
    name: '握力', desc: '触手のダメージ ×1.60',
    apply(run) { const w = run.wp('tentacle'); if (w) w.s.dmg *= Game.rk(1.60); } }),
  tnt_long: C({ id: 'tnt_long', kind: 'mod', weapon: 'tentacle', rarity: 'rare', maxStack: 3,
    name: '剛腕', desc: '触手が引き戻す力 ×1.35、掴む時間 ×1.2',
    apply(run) { const w = run.wp('tentacle'); if (w) { w.s.knock *= Game.rk(1.35); w.s.knockDur *= Game.rk(1.2); } } }),
  tnt_many: C({ id: 'tnt_many', kind: 'mod', weapon: 'tentacle', rarity: 'epic', maxStack: 2,
    name: '多腕', desc: '同時に掴める敵 +1',
    apply(run) { const w = run.wp('tentacle'); if (w) w.s.count += Game.rki(1); } }),

  // ============ 泡 ============
  bbl_big: C({ id: 'bbl_big', kind: 'mod', weapon: 'bubble', rarity: 'common', maxStack: 5,
    name: '大泡', desc: '閉じ込める時間 ×1.35',
    apply(run) { const w = run.wp('bubble'); if (w) { w.s.stunDur *= Game.rk(1.35); } } }),
  bbl_rapid: C({ id: 'bbl_rapid', kind: 'mod', weapon: 'bubble', rarity: 'rare', maxStack: 3,
    name: '連泡', desc: '泡の発射レート ×1.55',
    apply(run) { const w = run.wp('bubble'); if (w) w.s.rate *= Game.rk(1.55); } }),
  bbl_acid: C({ id: 'bbl_acid', kind: 'mod', weapon: 'bubble', rarity: 'epic', maxStack: 2,
    name: '酸泡', desc: '割れたときのダメージ ×2.4。さらに酸だまりを残す',
    apply(run) { const w = run.wp('bubble'); if (w) { w.s.splashMul *= Game.rk(2.4); w.flags.acid = true; w.s.fieldR = Game.rka(60); w.s.fieldDur = Game.rka(3.5); } } }),

  // ============ 迫撃砲 ============
  mtr_shell: C({ id: 'mtr_shell', kind: 'mod', weapon: 'mortar', rarity: 'common', maxStack: 5,
    name: '大口径榴弾', desc: '迫撃砲のダメージ ×1.45',
    apply(run) { const w = run.wp('mortar'); if (w) w.s.dmg *= Game.rk(1.45); } }),
  mtr_wide: C({ id: 'mtr_wide', kind: 'mod', weapon: 'mortar', rarity: 'rare', maxStack: 3,
    name: '重装炸薬', desc: '迫撃砲のダメージ ×1.35',
    apply(run) { const w = run.wp('mortar'); if (w) { w.s.dmg *= Game.rk(1.35); } } }),
  mtr_carpet: C({ id: 'mtr_carpet', kind: 'mod', weapon: 'mortar', rarity: 'epic', maxStack: 2,
    name: '絨毯爆撃', desc: '迫撃砲の同時発射 +3、ダメージ ×0.8',
    apply(run) { const w = run.wp('mortar'); if (w) { w.s.count += Game.rki(3); w.s.dmg *= Game.rk(0.8); } } }),

  // ============ シナジー（2種を同時編成しているときだけ抽選に出る） ============
  syn_charged: C({ id: 'syn_charged', kind: 'synergy', requires: ['gatling', 'tesla'], rarity: 'common', maxStack: 4,
    name: '帯電弾', desc: '【ガトリング＋テスラ】ガトリング弾が着弾時に2連鎖の電撃を起こす',
    apply(run) { const w = run.wp('gatling'); if (w) { w.flags.charged = true; w.dyn.chargedChain = (w.dyn.chargedChain || 0) + Game.rki(2); } } }),
  syn_spotter: C({ id: 'syn_spotter', kind: 'synergy', requires: ['sniper', 'missile'], rarity: 'rare', maxStack: 3,
    // **狙いは動かさない。** どこへ落とすかはプレイヤーが決めるものなので、
    // 「印の付いた敵に落ちたときだけ効く」形にしてある
    name: '曳光指示', desc: '【スナイパー＋ミサイル】スナイパーが撃ち抜いた敵に印が残り、そこへの着弾 ×1.6',
    apply(run) { const s = run.wp('sniper'), m = run.wp('missile');
      if (s) s.flags.spot = true;
      if (m) m.dyn.spotMul = (m.dyn.spotMul || 1) * Game.rk(1.6); } }),
  syn_implode: C({ id: 'syn_implode', kind: 'synergy', requires: ['missile', 'tesla'], rarity: 'rare', maxStack: 3,
    name: '電磁爆縮', desc: '【ミサイル＋テスラ】ミサイルの爆発が感電を付与する',
    apply(run) { const m = run.wp('missile'); if (m) { m.flags.implode = true; m.s.shockDur = Math.max(m.s.shockDur, Game.rka(2.5)); } } }),
  syn_resonance: C({ id: 'syn_resonance', kind: 'synergy', requires: ['gatling', 'sniper'], rarity: 'epic', maxStack: 2,
    name: '弾道共鳴', desc: '【ガトリング＋スナイパー】ガトリング命中ごとにスナイパーのダメージ +0.6%（上限 +400%）',
    apply(run) { const g = run.wp('gatling'); if (g) { g.flags.resonance = true;
      run.resonanceStep = Math.max(run.resonanceStep || 0, Game.rka(0.006));
      run.resonanceMax = Math.max(run.resonanceMax || 0, Game.rka(4.0)); } } }),

  syn_backdraft: C({ id: 'syn_backdraft', kind: 'synergy', requires: ['flame', 'gas'], rarity: 'rare', maxStack: 3,
    name: '爆燃', desc: '【火炎放射器＋毒ガス】毒の雲に炎が届くと引火して大爆発する',
    apply(run) { const f = run.wp('flame'); if (f) f.flags.ignite = true; run.backdraft += Game.rka(1); } }),
  syn_shatterblade: C({ id: 'syn_shatterblade', noRank: true, kind: 'synergy', requires: ['cryo', 'katana'], rarity: 'rare', maxStack: 3,
    name: '兜割り', desc: '【凍結装置＋刀】凍っている敵に対して刀の斬撃が必ず会心になる',
    apply(run) { const k = run.wp('katana'); if (k) k.flags.frostCrit = true; } }),
  syn_staticfoam: C({ id: 'syn_staticfoam', kind: 'synergy', requires: ['bubble', 'tesla'], rarity: 'common', maxStack: 4,
    name: '感電泡', desc: '【泡＋テスラ】泡に閉じ込めた敵が感電し、雷の連鎖が必ずそこを通る',
    apply(run) { const b = run.wp('bubble'); if (b) { b.flags.staticFoam = true; b.s.shockDur = Math.max(b.s.shockDur, Game.rka(3)); } } }),
  syn_hangman: C({ id: 'syn_hangman', kind: 'synergy', requires: ['tentacle', 'missile'], rarity: 'epic', maxStack: 2,
    name: '吊るし上げ', desc: '【触手＋ミサイル】掴まれている敵への着弾ダメージ ×2.2',
    // **flags.hang は消した。**どこからも読まれていなかった（2026-09-21 に src 全体を検索）。
    //   「足を止める」は Combat の掴み側が既にやっている（grabT のあいだ後退させる）ので、
    //   この旗は書いただけで何もしていない残骸だった。効果は grabMul のほうが持っている
    apply(run) { const m = run.wp('missile'); if (m) m.dyn.grabMul = (m.dyn.grabMul || 1) * Game.rk(2.2); } }),

  syn_fixfire: C({ id: 'syn_fixfire', kind: 'synergy', requires: ['tentacle', 'mortar'], rarity: 'rare', maxStack: 3,
    name: '照準固定', desc: '【触手＋迫撃砲】掴まれて足が止まった敵への着弾ダメージ ×1.5',
    apply(run) { const m = run.wp('mortar'); if (m) m.dyn.grabMul = (m.dyn.grabMul || 1) * Game.rk(1.5); } }),

  // ============ 鍵（kind:'key'）============
  //   **3択にもパックにも出ない。** 章の報酬でしか手に入らない、機能を開ける札。
  //   遺物（kind:'perm'）と分けてあるのは、Relic.mods が数値を合計する側だから
  ky_skip: C({ id: 'ky_skip', kind: 'key', rarity: 'legendary', maxStack: 1,
    name: '踏破の記録', desc: '一度でも完璧に凌いだ章を、次の周から戦わずに突破できる' }),

  // ============ 汎用（編成に関係なく出る） ============
  gen_armor: C({ id: 'gen_armor', kind: 'generic', rarity: 'common', maxStack: 5,
    name: '増設装甲', desc: 'ライフ +6（その場で回復もする）',
    apply(run) { const hp = Game.rki(6); run.livesMax += hp; run.lives += hp; } }),
  gen_gold: C({ id: 'gen_gold', kind: 'generic', rarity: 'rare', maxStack: 3,
    name: '金メッキ弾', desc: 'このランのコイン獲得 ×1.35',
    apply(run) { run.coinMul *= Game.rk(1.35); } }),
  gen_boost: C({ id: 'gen_boost', kind: 'generic', rarity: 'rare', maxStack: 3,
    name: '過給機', desc: '全武器の発射レート ×1.15',
    apply(run) { for (const w of run.units) { w.s.rate *= Game.rk(1.15); } } }),
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
  rl_life1: P({ id: 'rl_life1', rarity: 'common', key: 'lives', eff: 2, mode: 'flat', cap: 12,
    name: '防壁片',   tmpl: 'ライフ +{e}' }),

  rl_dmg2:  P({ id: 'rl_dmg2',  rarity: 'rare', key: 'dmg',  eff: 0.20, mode: 'add', cap: 1.5,
    name: '増幅核',   tmpl: '全ての武器のダメージ +{p}' }),
  rl_coin2: P({ id: 'rl_coin2', rarity: 'rare', key: 'coin', eff: 0.20, mode: 'add', cap: 1.5,
    name: '蓄財核',   tmpl: '獲得コイン +{p}' }),
  rl_rate2: P({ id: 'rl_rate2', rarity: 'rare', key: 'rate', eff: 0.20, mode: 'add', cap: 0.8,
    name: '律動核',   tmpl: '全ての武器の発射レート +{p}' }),
  rl_seed:  P({ id: 'rl_seed',  rarity: 'rare', key: 'seed', eff: 400, mode: 'flat', cap: 4000,
    name: '初動資金', tmpl: '転生した直後に コイン +{e}' }),
  // **設置枠を配るのをやめた。** これが「転生2回でゲーム崩壊」の正体で、
  // しかも集計側が読んでいなかったので、説明文だけが嘘をついている状態でもあった
  rl_unit:  P({ id: 'rl_unit',  rarity: 'rare', key: 'lives', eff: 6, mode: 'flat', cap: 18,
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
  rl_invest: P({ id: 'rl_invest', rarity: 'legendary', key: 'startLv', eff: 1, mode: 'flat', cap: 4,
    name: '初期投資', tmpl: '出撃するとき、アップグレードが最初から Lv+{e} の状態になる' }),

  // ---- 母数を増やすぶん（2026-09-21・ユーザー指摘）----
  //   > 「そもそもカード母数が足りないからそりゃ出てくるし被って強くなるわな」
  //   13種（コモン4/レア5/エピック2/レジェンド2）しか無く、
  //   **エピック以上を引いても選択肢が2種だけ**だった。
  //   ダメージ・コイン以外の軸（射程・貫通・弾速・範囲・会心・3択）を足して 24種にする。
  //   **設置枠は足さない。**以前「転生2回でゲーム崩壊」の原因だったため
  rl_rng1:  P({ id: 'rl_rng1',  rarity: 'common', key: 'range', eff: 0.06, mode: 'add', cap: 0.40,
    name: '照準片',   tmpl: '全ての武器の射程 +{p}' }),
  rl_prc1:  P({ id: 'rl_prc1',  rarity: 'common', key: 'pierce', eff: 0.3, mode: 'add', cap: 2,
    name: '硬芯片',   tmpl: '全ての武器の貫通 +{e}' }),

  rl_size2: P({ id: 'rl_size2', rarity: 'rare', key: 'size', eff: 0.15, mode: 'add', cap: 1.0,
    name: '拡張核',   tmpl: '全ての武器の効果範囲 +{p}' }),
  rl_spd2:  P({ id: 'rl_spd2',  rarity: 'rare', key: 'speed', eff: 0.20, mode: 'add', cap: 1.2,
    name: '加速核',   tmpl: '全ての弾の速さ +{p}' }),
  rl_crit2: P({ id: 'rl_crit2', rarity: 'rare', key: 'crit', eff: 0.04, mode: 'add', cap: 0.25,
    name: '慧眼核',   tmpl: '全ての武器の会心率 +{p}' }),

  rl_rate3: P({ id: 'rl_rate3', rarity: 'epic', key: 'rate', eff: 0.35, mode: 'add', cap: 2.0,
    name: '律動炉',   tmpl: '全ての武器の発射レート +{p}' }),
  rl_prc3:  P({ id: 'rl_prc3',  rarity: 'epic', key: 'pierce', eff: 1, mode: 'add', cap: 6,
    name: '貫通炉',   tmpl: '全ての武器の貫通 +{e}' }),
  rl_rng3:  P({ id: 'rl_rng3',  rarity: 'epic', key: 'range', eff: 0.20, mode: 'add', cap: 1.2,
    name: '観測炉',   tmpl: '全ての武器の射程 +{p}' }),

  rl_pick:  P({ id: 'rl_pick',  rarity: 'legendary', key: 'picks', eff: 1, mode: 'flat', cap: 2,
    name: '選択の眼', tmpl: 'ウェーブを突破するごとに引けるカードが +{e} 枚' }),
  rl_wide:  P({ id: 'rl_wide',  rarity: 'legendary', key: 'choices', eff: 1, mode: 'flat', cap: 2,
    name: '広域走査', tmpl: 'カードの3択が +{e} 枚 増える' }),
  rl_regen: P({ id: 'rl_regen', rarity: 'legendary', key: 'regen', eff: 1, mode: 'flat', cap: 3,
    name: '再生機関', tmpl: 'ウェーブを突破するごとにライフ +{e}' }),

  // ---- 状態異常の軸（2026-09-21・ユーザー指摘）----
  //   > 「遺物はそもそもゲームの根底から変えるわけでしょ？
  //   >   例えば凍結+0.5秒とか炎上+0.5秒とか、そういった方向にした方がいいかもな
  //   >   増やせるものは多いと思うよ、軸を増やそう」
  //
  //   ダメージ・コイン・射程…は「数字が少し大きくなる」だけで、遊び方は変わらない。
  //   持続と強さを触る軸は、**同じ編成でも戦い方が変わる。**
  //
  //   **付与（熾火核・霜結核）と増幅（それ以外）で分けてある。**
  //   状態異常を出せる武器はテスラ8章・火炎11章・凍結17章と解放が遅いので、
  //   増幅だけ置くと序盤の遺物が死に札になる。付与を先に引けば、
  //   ガトリング1種でも燃えるし凍る ＝ そこから増幅が全部生きる
  rl_burn1: P({ id: 'rl_burn1', rarity: 'common', key: 'burnDur', eff: 0.3, mode: 'add', cap: 1.8, fixed: true,
    name: '火種片',   tmpl: '炎上の持続 +{e}秒' }),
  rl_chill1: P({ id: 'rl_chill1', rarity: 'common', key: 'chillDur', eff: 0.25, mode: 'add', cap: 1.5, fixed: true,
    name: '霜片',     tmpl: '凍結・減速の持続 +{e}秒' }),

  rl_ember: P({ id: 'rl_ember', rarity: 'rare', key: 'burnGrant', eff: 0.04, mode: 'add', cap: 0.16, fixed: true,
    name: '熾火核',   tmpl: 'すべての攻撃が敵を燃やす（与ダメージの {p}/秒・2秒）' }),
  rl_frost: P({ id: 'rl_frost', rarity: 'rare', key: 'chillGrant', eff: 0.06, mode: 'add', cap: 0.24, fixed: true,
    name: '霜結核',   tmpl: 'すべての攻撃が敵を凍らせる（減速 {p}・0.8秒）' }),
  rl_stun2: P({ id: 'rl_stun2', rarity: 'rare', key: 'stunDur', eff: 0.2, mode: 'add', cap: 1.2, fixed: true,
    name: '拘束核',   tmpl: '拘束の持続 +{e}秒' }),

  rl_burn3: P({ id: 'rl_burn3', rarity: 'epic', key: 'burnPow', eff: 0.30, mode: 'add', cap: 1.8, fixed: true,
    name: '業火炉',   tmpl: '炎上のダメージ +{p}' }),
  rl_slow3: P({ id: 'rl_slow3', rarity: 'epic', key: 'slowPow', eff: 0.04, mode: 'add', cap: 0.20, fixed: true,
    name: '極寒炉',   tmpl: '減速の強さ +{p}' }),
  rl_shock3: P({ id: 'rl_shock3', rarity: 'epic', key: 'shockDur', eff: 0.4, mode: 'add', cap: 2.4, fixed: true,
    name: '帯電炉',   tmpl: '感電の持続 +{e}秒' }),

  // **これが一番「根底から変える」札。** 凍らせる手段（霜結核か凍結装置）と
  // 組んではじめて意味が出る ＝ ビルドの方向が決まる
  rl_brittle: P({ id: 'rl_brittle', rarity: 'legendary', key: 'chillVuln', eff: 0.20, mode: 'add', cap: 0.8, fixed: true,
    name: '脆化の理', tmpl: '凍っている敵が受けるダメージ +{p}' }),
};

// ============ 範囲を広げるものを、ゲームから外す ============
//
//   **ユーザー指示（2026-09-22・最優先）**
//   > 「武器の範囲を広げるスキル、カードなどゲーム内から全て削除してください、
//   >   コメントアウトです、**バグの温床です**」
//
//   遺物のうち **射程（key:'range'）と 効果範囲（key:'size'）** を外す。
//   `delete` してしまえば、パックの抽選（CARD_IDS）にも
//   遺物の集計（relics.js の RELIC_IDS）にも出てこない。
//   **戻すときは OFF_CARD_KEYS を空にするだけ。**
//   既に持っている枚数は perm.collection に残るが、
//   CARDS から消えているので効果は乗らない
const OFF_CARD_KEYS = ['range', 'size'];
for (const id of Object.keys(CARDS)) {
  if (OFF_CARD_KEYS.indexOf(CARDS[id].key) >= 0) delete CARDS[id];
}

const CARD_IDS = Object.keys(CARDS);

// 武器カードの入手経路。パックから出るのは src:'pack' のものだけ
function weaponCardSrc(cardId) {
  const c = CARDS[cardId];
  if (!c || c.kind !== 'weapon') return null;
  const w = WEAPONS[c.weapon];
  return w ? w.src : null;
}

// 初期所持。ミサイル以降はステージ突破、刀以降はパックから手に入る
// **【2026-09-21・ユーザー決定】初期武器はガトリングだけ。**
//   > 「初期武器はガトリングでよし、クリアするたびに武器が貰えるからそれでやりくり」
//   スナイパーは第2章の突破報酬に回した（`tools/gen30.py` の CH_WEAPON）。
//   スナイパー用のカードも、武器が来るまで持たせない（3択に出ても使えないため）
const STARTER_CARDS = {
  wc_gatling: 1,
  // **3択が「選択」になる枚数を持たせる。**（2026-09-21 実測で発覚）
  //   初期武器をガトリング1種にしたとき、カードも2枚に削ってしまい、
  //   **第1〜3章の3択の候補が3枚＝毎回ぜんぶ並ぶ**状態になっていた。
  //   選ぶ意味が無いので「カード構築」が成立しない。
  //   ガトリングの mod 4枚＋汎用2枚で、候補6枚から3枚選ぶ形にする
  gat_belt: 1, gat_cool: 1, gat_ap: 1, gat_heat: 1,
  gen_armor: 1, gen_gold: 1,
};
