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
  // 割合で効く遺物は、1枚で BAL.relicBaseMul 枚ぶん効く（relics.js）。説明も1枚の効き目で出す
  const e = o.mode === 'add' ? +(o.eff * BAL.relicBaseMul).toFixed(3) : o.eff;
  o.desc = o.tmpl
    .split('{p}').join(Math.round(e * 100) + '%')
    .split('{e}').join(String(e));
  return o;
}

// **説明の「+○%」と「×○」の違い（2026-09-30 段3・重ね取りの式）**：
//   「ダメージ +32%」「発射レート +25%」… 同じ武器の同じ軸は**足し算**で重なる（+32% を3枚で +96%）。レートは上限に近づく（state.js の applyCardUnit）
//   「×○」… 掛け算のまま。レジェンドの倍率・×1未満の代償・ダメージとレート以外（範囲・持続・連携の倍率など）
const CARDS = {

  // ============ 武器カード ============
  wc_gatling:  C({ id: 'wc_gatling',  kind: 'weapon', weapon: 'gatling',  rarity: 'common', name: 'ガトリング砲',   desc: '編成枠に装備。毎秒大量の小口径弾。' }),
  wc_sniper:   C({ id: 'wc_sniper',   kind: 'weapon', weapon: 'sniper',   rarity: 'common', name: 'レーザーライフル', desc: '編成枠に装備。壁で2回はね返る光線で、線の上の敵をすべて貫く。' }),
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
  //   **【2026-09-30 段3b】カードの作り直し**（設計書 DESIGN-STAGE3 §6・ユーザー「遊び方が変わるカードはワクワクします、しかし、エピックにも方向性を変えるものがあるといいですね」）。
  //   コモン＝1軸を伸ばす／レア＝2軸か到達体数／エピック＝挙動を足す・方向性を変える／レジェンド＝遊び方を変える。
  //   差し替えた札は**同じ id のまま**名前と効果を変えた（持っている枚数・凸はそのまま）。
  //   **凸は `rankAxis` の軸だけに効く**（ユーザー決定）：apply の中の rk/rka/rki の第2引数が rankAxis と同じ呼び出しにだけ凸が掛かる。軸名の付かない値は凸で伸びない
  gat_belt: C({ id: 'gat_belt', kind: 'mod', weapon: 'gatling', rarity: 'common', maxStack: 5, rankAxis: 'dmg',
    name: '給弾ベルト', desc: 'ガトリングのダメージ +32%',
    apply(run) { const w = run.wp('gatling'); if (w) w.s.dmg *= Game.rk(1.32, 'dmg'); } }),
  gat_cool: C({ id: 'gat_cool', kind: 'mod', weapon: 'gatling', rarity: 'common', maxStack: 5, rankAxis: 'rate',
    name: '冷却フィン', desc: 'ガトリングの発射レート +25%',
    apply(run) { const w = run.wp('gatling'); if (w) w.s.rate *= Game.rk(1.25, 'rate'); } }),
  gat_ap: C({ id: 'gat_ap', kind: 'mod', weapon: 'gatling', rarity: 'rare', maxStack: 3, rankAxis: 'dmg',
    name: '徹甲弾', desc: 'ガトリング弾が貫通 +1、ダメージ +18%',
    apply(run) { const w = run.wp('gatling'); if (w) { w.s.pierce += 1; w.s.dmg *= Game.rk(1.18, 'dmg'); } } }),
  gat_heat: C({ id: 'gat_heat', noRank: true, kind: 'mod', weapon: 'gatling', rarity: 'epic', maxStack: 1,
    // **上限がある。** 撃ちっぱなしになったので、重ねるほど速くなる形だと
    // 「置いておくだけで加速し続ける」になってしまう（BAL.heatCap で頭打ち）
    name: '加熱暴走', desc: '当て続けるほど発射レート上昇（上限 +120%）。当たらないと冷える',
    apply(run) { const w = run.wp('gatling'); if (w) { w.flags.heat = true; w.dyn.heatMax = BAL.heatCap; } } }),
  // 曳光弾（旧・多銃身）：装甲への答え。当たった敵の装甲が一定時間削れる（その武器だけでなく、ほかの武器の1発も通りやすくなる）
  gat_barrels: C({ id: 'gat_barrels', kind: 'mod', weapon: 'gatling', rarity: 'epic', maxStack: 2, rankAxis: 'down',
    name: '曳光弾', desc: 'ガトリングの弾が当たった敵は、3秒間 装甲のダメージ軽減が 35%小さくなる（重ねると加算）。弾は橙の光の尾を引く',
    apply(run) { const w = run.wp('gatling'); if (w) w.dyn.tracerDown = Math.min(BAL.cardFx.armorDownMax, (w.dyn.tracerDown || 0) + Game.rka(BAL.cardFx.tracerDown, 'down')); } }),
  // 掃射（旧・暴発装薬）：首振りが速くなり、1体に当たる時間が短い代わりに、広く撫でて群れを抜く
  gat_loose: C({ id: 'gat_loose', kind: 'mod', weapon: 'gatling', rarity: 'epic', maxStack: 1, rankAxis: 'sweep',
    name: '掃射', desc: 'ガトリングの首振りが 2倍の速さになり、同時発射 +1、貫通 +2。1体への滞在は短くなる',
    apply(run) { const w = run.wp('gatling'); if (w) {
      w.dyn.sweepMul = 1 + Game.rka(BAL.cardFx.sweepMul - 1, 'sweep');
      w.s.pierce += BAL.cardFx.sweepPierce; w.s.count += BAL.cardFx.sweepCount; w.s.dmg *= BAL.cardFx.sweepDmg;
    } } }),
  gat_wall: C({ id: 'gat_wall', kind: 'mod', weapon: 'gatling', rarity: 'legendary', maxStack: 1, rankAxis: 'count',
    //   2026-10-05：同時発射 +4・レート ×1.3 は、ガトリングを弱めたあとも漏れ 314 → 6.5（×48）と他の札の10倍以上だったので、+2・×1.1 に（第25章・D27・単独・6本で 314 → 下の実測）
    name: '弾幕結界', desc: '同時発射 +2 / レート ×1.1 / 射程 ×0.85。視界が弾で埋まる',
    apply(run) { const w = run.wp('gatling'); if (w) { w.s.count += Game.rki(2, 'count'); w.s.rate *= 1.1; w.s.range *= 0.85; w.s.spread = Math.max(w.s.spread, 0.1); } } }),

  // ============ スナイパー（レーザーライフル・作り直し対象外） ============
  snp_scope: C({ id: 'snp_scope', kind: 'mod', weapon: 'sniper', rarity: 'common', maxStack: 5, rankAxis: 'dmg',
    name: '高倍率スコープ', desc: 'レーザーのダメージ +10%',
    apply(run) { const w = run.wp('sniper'); if (w) { w.s.dmg *= Game.rk(1.10, 'dmg'); } } }),
  snp_he: C({ id: 'snp_he', kind: 'mod', weapon: 'sniper', rarity: 'common', maxStack: 5, rankAxis: 'dmg',
    name: '徹甲榴弾', desc: 'レーザーのダメージ +55%',
    apply(run) { const w = run.wp('sniper'); if (w) w.s.dmg *= Game.rk(1.55, 'dmg'); } }),
  snp_weak: C({ id: 'snp_weak', kind: 'mod', weapon: 'sniper', rarity: 'rare', maxStack: 3, rankAxis: 'crit',
    name: '弱点狙撃', desc: 'レーザーに 会心率 +25% / 会心倍率 +1.0',
    apply(run) { const w = run.wp('sniper'); if (w) { w.s.crit += Game.rka(0.25, 'crit'); w.s.critMul += Game.rka(1.0, 'crit'); } } }),
  snp_rail: C({ id: 'snp_rail', kind: 'mod', weapon: 'sniper', rarity: 'epic', maxStack: 2, rankAxis: 'dmg',
    // **【2026-09-30】レーザーになって、光線は元から全部貫く。**「全て貫通・弾速」は意味を失ったので、折り返し +1 に替えた（id はそのまま）
    name: '多重反射', desc: 'レーザーが壁で折り返す回数 +1、ダメージ +30%',
    apply(run) { const w = run.wp('sniper'); if (w) { w.s.reflect += 1; w.s.dmg *= Game.rk(1.3, 'dmg'); } } }),
  snp_exec: C({ id: 'snp_exec', kind: 'mod', weapon: 'sniper', rarity: 'legendary', maxStack: 1, rankAxis: 'exec',
    name: '執行', desc: 'レーザーが当たった敵は、残りHP18%以下なら即死',
    apply(run) { const w = run.wp('sniper'); if (w) w.s.execThr = Math.max(w.s.execThr, Game.rka(0.18, 'exec')); } }),

  // ============ ミサイル（0929zt・段3 の武器の作り直し） ============
  //   **何が壊れていたか（実測 docs/audit/2026-09-29-measure.md）**：多弾頭（同時発射 +2・3枚で +6）× クラスター弾（**弾1発ごとに**子弾4〜8発）× 全部積みで
  //   「弾の数 × 子弾の数」の積になり、クラスター1枚で漏れ ×0.16、全部積むと 1 まで落ちた。**強さをコストで帳尻合わせはしない**（ユーザー）ので、札の設計を直した。
  //   ミサイルの性格＝**速射の連続爆撃**（迫撃砲は重い単発・泡は閉じ込め）。弱点＝1発が軽く、装甲で目減りする → 装甲の答えと**混成**が要る。
  //   **札で同時発射を増やさない**（多弾頭を貫通弾頭へ）／**子弾は親の数に比例しない**（3発に1発・1基ごとの数が固定）／**着弾の威力は他の武器と同じ足し算に乗る**
  msl_warhead: C({ id: 'msl_warhead', kind: 'mod', weapon: 'missile', rarity: 'common', maxStack: 5, rankAxis: 'dmg',
    name: '増装弾頭', desc: 'ミサイルのダメージ +22%',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.dmg *= Game.rk(1.22, 'dmg'); } } }),
  msl_guide: C({ id: 'msl_guide', kind: 'mod', weapon: 'missile', rarity: 'common', maxStack: 5, rankAxis: 'rate',
    name: '速装填', desc: 'ミサイルの着弾までが速くなり、発射レート +20%',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.speed *= 1.35; w.s.rate *= Game.rk(1.2, 'rate'); } } }),
  // 貫通弾頭（旧・多弾頭。同時発射 +2 が弾数の積の元だった）：1発が装甲を貫く。軽い弾の弱点（装甲）への答え
  msl_multi: C({ id: 'msl_multi', kind: 'mod', weapon: 'missile', rarity: 'rare', maxStack: 3, rankAxis: 'dmg',
    name: '貫通弾頭', desc: 'ミサイルのダメージ +18%、爆発が敵の装甲を 20%無視（重ねると加算・上限 60%）',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.dmg *= Game.rk(1.18, 'dmg'); w.dyn.apen = Math.min(BAL.cardFx.mslApenMax, (w.dyn.apen || 0) + BAL.cardFx.mslApen); } } }),
  // クラスター弾：**3発に1発**が子ミサイルを撒く（旧は弾1発ごとに4発）。1基が撒く子弾の数は、同時発射の数にも札の取り方にも比例しない
  msl_cluster: C({ id: 'msl_cluster', kind: 'mod', weapon: 'missile', rarity: 'epic', maxStack: 2, rankAxis: 'cluster',
    name: 'クラスター弾', desc: 'ミサイル3発に1発が、爆発で子ミサイルを4発ばら撒く（子は追尾・威力 40%）。重ねると子が +4発',
    apply(run) { const w = run.wp('missile'); if (w) {
      w.dyn.cluster = (w.dyn.cluster || 0) + BAL.cardFx.clusterN;
      w.dyn.clusterDmg = Game.rka(BAL.cardFx.clusterDmg, 'cluster');   // 凸の軸＝子の威力（本数は凸で増やさない）
    } } }),
  // 戦術核：**遊び方が変わる**。1発が重く遅い代わりに、着弾した敵が3秒間「被爆」して、**あらゆる武器から**受けるダメージが増える（ミサイルは仲間の火力を上げる役へ）
  msl_nuke: C({ id: 'msl_nuke', kind: 'mod', weapon: 'missile', rarity: 'legendary', maxStack: 1, rankAxis: 'irr',
    name: '戦術核', desc: 'ミサイルのダメージ ×2.6 / レート ×0.6。着弾した敵は3秒間 被爆し、あらゆる武器から受けるダメージ +25%',
    apply(run) { const w = run.wp('missile'); if (w) { w.s.dmg *= BAL.cardFx.nukeDmg; w.s.rate *= BAL.cardFx.nukeRate; w.dyn.irr = Game.rka(BAL.cardFx.nukeVuln, 'irr'); } } }),

  // ============ テスラコイル（5枚とも残す。凸の軸だけ付けた） ============
  tsl_coil: C({ id: 'tsl_coil', kind: 'mod', weapon: 'tesla', rarity: 'common', maxStack: 5, rankAxis: 'dmg',
    name: '高圧コイル', desc: 'テスラのダメージ +42%',
    apply(run) { const w = run.wp('tesla'); if (w) w.s.dmg *= Game.rk(1.42, 'dmg'); } }),
  tsl_chain: C({ id: 'tsl_chain', kind: 'mod', weapon: 'tesla', rarity: 'common', maxStack: 5, rankAxis: 'chain',
    name: '連鎖増幅', desc: 'テスラの連鎖数 +2',
    apply(run) { const w = run.wp('tesla'); if (w) w.s.chain += Game.rki(2, 'chain'); } }),
  tsl_shock: C({ id: 'tsl_shock', kind: 'mod', weapon: 'tesla', rarity: 'rare', maxStack: 3, rankAxis: 'shock',
    name: '感電', desc: 'テスラが当てた敵の感電が3秒続き、感電中の被ダメージが +20%増える（重ねると加算）',
    apply(run) { const w = run.wp('tesla'); if (w) w.s.shockDur = Math.max(w.s.shockDur, Game.rka(3, 'shock')) + Game.rka(0.5, 'shock'); run.shockVuln = (run.shockVuln || 0) + BAL.cardFx.shockVulnAdd; } }),
  tsl_over: C({ id: 'tsl_over', kind: 'mod', weapon: 'tesla', rarity: 'epic', maxStack: 2, rankAxis: 'chain',
    name: '過負荷', desc: '連鎖 +3。連鎖しても威力が減衰せず、むしろ1段ごとに +12%',
    apply(run) { const w = run.wp('tesla'); if (w) { w.s.chain += Game.rki(3, 'chain'); w.s.chainFalloff = Math.max(w.s.chainFalloff, 1.0) + 0.12; } } }),
  tsl_god: C({ id: 'tsl_god', kind: 'mod', weapon: 'tesla', rarity: 'legendary', maxStack: 1, rankAxis: 'god',
    name: '雷神', desc: '5秒ごとに画面全体へ落雷。テスラのダメージの3倍',
    apply(run) { const w = run.wp('tesla'); if (w) { w.flags.thunderGod = true; w.dyn.godEvery = 5 / Game.rka(1, 'god'); w.dyn.godCd = w.dyn.godEvery; } } }),

  // ============ 火炎放射器 ============
  flm_fuel: C({ id: 'flm_fuel', kind: 'mod', weapon: 'flame', rarity: 'common', maxStack: 5, rankAxis: 'dmg',
    name: '高圧燃料', desc: '火炎のダメージ +40%',
    apply(run) { const w = run.wp('flame'); if (w) w.s.dmg *= Game.rk(1.40, 'dmg'); } }),
  // 粘着燃料（旧・高圧ノズル。ダメージ札が高圧燃料に負けていた）：燃えている敵が隣へ燃え移る。群れに燃やし広げる方向
  flm_wide: C({ id: 'flm_wide', kind: 'mod', weapon: 'flame', rarity: 'epic', maxStack: 2, rankAxis: 'sticky',
    name: '粘着燃料', desc: '火炎で燃えた敵は 30%遅くなり、近くの敵へ燃え移る（移った先から更に1段。重ねると段が増える）',
    apply(run) { const w = run.wp('flame'); if (w) { w.dyn.sticky = Math.min(BAL.cardFx.stickyGenMax, (w.dyn.sticky || 0) + Game.rki(1, 'sticky')); w.s.slow = Math.max(w.s.slow, BAL.cardFx.stickySlow); w.s.slowDur = Math.max(w.s.slowDur, 1.2); } } }),
  flm_napalm: C({ id: 'flm_napalm', kind: 'mod', weapon: 'flame', rarity: 'epic', maxStack: 2, rankAxis: 'burn',
    name: 'ナパーム', desc: '燃焼ダメージ ×1.8。さらに炎の先端に火の海を残す',
    apply(run) { const w = run.wp('flame'); if (w) { w.s.burn *= Game.rk(1.8, 'burn'); w.s.burnDur += 1.5; w.flags.napalm = true; } } }),
  flm_spread: C({ id: 'flm_spread', kind: 'mod', weapon: 'flame', rarity: 'rare', maxStack: 3, rankAxis: 'burn',
    name: '延焼', desc: '炎上のダメージ ×1.5、炎上の時間 +1秒',
    apply(run) { const w = run.wp('flame'); if (w) { w.s.burn *= Game.rk(1.5, 'burn'); w.s.burnDur += 1; } } }),
  // 青い炎（旧・業火。火力とレートの掛け算だけだった）：燃焼で戦う形へ。耐火の敵にも半減されない
  flm_inferno: C({ id: 'flm_inferno', kind: 'mod', weapon: 'flame', rarity: 'legendary', maxStack: 1, rankAxis: 'burn',
    name: '青い炎', desc: '火炎の燃焼ダメージ ×3。炎が耐火の敵にも半減されない。発射レート ×0.85',
    apply(run) { const w = run.wp('flame'); if (w) { w.flags.blue = true; w.s.burn *= Game.rk(BAL.cardFx.blueBurn, 'burn'); w.s.rate *= BAL.cardFx.blueRate; } } }),

  // ============ 毒ガス散布機 ============
  //   雲の広さを広げる札は上位札（広域散布）にだけある。ダメージを上げる札は、効かない軸（実測：威力を3倍にしても漏れが動かない）なので外した
  // 濃縮ガス：**残した**（設計は噴霧弁への差し替えだったが、D19 で全部積むと 1109 → 3323 と3倍弱くなり、札だけでも D22 で 0.19 と毒ガスでいちばん効く札だったので戻した）
  gas_dense: C({ id: 'gas_dense', kind: 'mod', weapon: 'gas', rarity: 'common', maxStack: 5, rankAxis: 'dmg',
    name: '濃縮ガス', desc: '毒の雲のダメージ +45%',
    apply(run) { const w = run.wp('gas'); if (w) w.s.dmg *= Game.rk(1.45, 'dmg'); } }),
  gas_wide: C({ id: 'gas_wide', kind: 'mod', weapon: 'gas', rarity: 'rare', maxStack: 3, rankAxis: 'dur',
    name: '長期滞留', desc: '毒の雲の持続 +1.5秒',
    apply(run) { const w = run.wp('gas'); if (w) { w.s.fieldDur += Game.rka(1.5, 'dur'); } } }),
  gas_nerve: C({ id: 'gas_nerve', kind: 'mod', weapon: 'gas', rarity: 'legendary', maxStack: 1, rankAxis: 'dmg',
    name: '神経ガス', desc: '雲の中の敵は 50%減速し、受けるダメージ +45%。毒 ×1.6',
    apply(run) { const w = run.wp('gas'); if (w) { w.s.dmg *= Game.rk(1.6, 'dmg'); w.s.slow = Math.min(0.85, Math.max(w.s.slow, 0.5));
      w.s.fieldVuln = Math.max(w.s.fieldVuln, 0.45); } } }),
  gas_corrode: C({ id: 'gas_corrode', kind: 'mod', weapon: 'gas', rarity: 'rare', maxStack: 3, rankAxis: 'vuln',
    name: '腐食', desc: '毒の雲の中の敵が受けるダメージ +10%',
    apply(run) { const w = run.wp('gas'); if (w) w.s.fieldVuln += Game.rka(0.10, 'vuln'); } }),
  // 腐蝕の雲（旧・猛毒。濃縮ガスと同じ効かない軸だった）：装甲への答え。雲の中の敵は装甲が削れる
  gas_toxic: C({ id: 'gas_toxic', kind: 'mod', weapon: 'gas', rarity: 'epic', maxStack: 2, rankAxis: 'down',
    name: '腐蝕の雲', desc: '毒の雲の中の敵は、装甲のダメージ軽減が 50%小さくなる（重ねると加算）',
    apply(run) { const w = run.wp('gas'); if (w) w.dyn.armorDown = Math.min(BAL.cardFx.armorDownMax, (w.dyn.armorDown || 0) + Game.rka(0.5, 'down')); } }),
  // 重い霧（新しい札）：雲が通路に沿ってコアの方へ流れる。敵と一緒に動くので、覆う道が長くなる
  gas_fog: C({ id: 'gas_fog', noRank: true, kind: 'mod', weapon: 'gas', rarity: 'epic', maxStack: 1,
    name: '重い霧', desc: '毒の雲が、通路に沿ってコアの方へゆっくり流れる。減速 +15%',
    apply(run) { const w = run.wp('gas'); if (w) { w.flags.fog = true; w.s.slow = Math.min(0.85, w.s.slow + 0.15); } } }),

  // ============ 凍結装置 ============
  cry_deep: C({ id: 'cry_deep', kind: 'mod', weapon: 'cryo', rarity: 'common', maxStack: 5, rankAxis: 'dmg',
    name: '深冷', desc: '冷気のダメージ +50%、減速の持続 +0.6秒',
    apply(run) { const w = run.wp('cryo'); if (w) { w.s.dmg *= Game.rk(1.5, 'dmg'); w.s.slowDur += 0.6; } } }),
  // 急速冷却（旧・急速冷却＋氷結弾の2枚をまとめた。氷結弾の枚数はこの札に足してある・state.js の mergeCards）
  cry_wide: C({ id: 'cry_wide', kind: 'mod', weapon: 'cryo', rarity: 'rare', maxStack: 4, rankAxis: 'rate',
    name: '急速冷却', desc: '冷気の発動レート +30%、減速の持続 +0.4秒',
    apply(run) { const w = run.wp('cryo'); if (w) { w.s.rate *= Game.rk(1.3, 'rate'); w.s.slowDur += 0.4; } } }),
  // 砕氷：**凍っている敵の被ダメージ +○% は、これまで効いていなかった**（run の値を武器の if の中で足していて、ユニット側の呼び出しでは捨てられていた）。いまは if の外
  cry_shatter: C({ id: 'cry_shatter', kind: 'mod', weapon: 'cryo', rarity: 'epic', maxStack: 2, rankAxis: 'vuln',
    name: '砕氷', desc: '凍っている敵が受けるダメージ +40%。凍った敵を倒すと氷片が周囲に飛ぶ',
    apply(run) { const w = run.wp('cryo'); if (w) w.flags.shatter = true; run.chillVuln += Game.rka(0.4, 'vuln'); } }),
  // 氷の棺（旧・永久凍土。深冷と砕氷の小さい版だった）：凍った敵が倒れると、周りが凍る。冷気が連鎖していく形
  cry_permafrost: C({ id: 'cry_permafrost', noRank: true, kind: 'mod', weapon: 'cryo', rarity: 'legendary', maxStack: 1,
    name: '氷の棺', desc: '凍っている敵が倒れると、周りの敵を凍らせる。減速の持続 +1秒、凍った敵が受けるダメージ +30%',
    apply(run) { const w = run.wp('cryo'); if (w) { w.flags.coffin = true; w.s.slowDur += 1; } run.chillVuln += BAL.cardFx.coffinVuln; } }),

  // ============ 刀 ============
  ktn_edge: C({ id: 'ktn_edge', kind: 'mod', weapon: 'katana', rarity: 'common', maxStack: 5, rankAxis: 'dmg',
    name: '研磨', desc: '刀のダメージ +50%',
    apply(run) { const w = run.wp('katana'); if (w) w.s.dmg *= Game.rk(1.50, 'dmg'); } }),
  ktn_iai: C({ id: 'ktn_iai', kind: 'mod', weapon: 'katana', rarity: 'rare', maxStack: 3, rankAxis: 'rate',
    name: '居合', desc: '刀の斬撃レート +50%、会心率 +15%',
    apply(run) { const w = run.wp('katana'); if (w) { w.s.rate *= Game.rk(1.5, 'rate'); w.s.crit += 0.15; } } }),
  ktn_twin: C({ id: 'ktn_twin', kind: 'mod', weapon: 'katana', rarity: 'rare', maxStack: 3, rankAxis: 'count',
    name: '二刀', desc: '1回の斬撃で斬る回数 +1',
    apply(run) { const w = run.wp('katana'); if (w) w.s.count += Game.rki(1, 'count'); } }),
  // 返し刃（旧・燕返し。居合に負けていた）：斬ったあと逆の向きへもう一度斬る。刀の扇が背中側にも届く
  ktn_swallow: C({ id: 'ktn_swallow', kind: 'mod', weapon: 'katana', rarity: 'epic', maxStack: 2, rankAxis: 'recoil',
    name: '返し刃', desc: '刀の斬撃のあと、逆の向きへもう一度斬る（威力 50%・重ねると加算）',
    apply(run) { const w = run.wp('katana'); if (w) w.dyn.recoil = (w.dyn.recoil || 0) + Game.rka(1, 'recoil'); } }),
  ktn_zantetsu: C({ id: 'ktn_zantetsu', kind: 'mod', weapon: 'katana', rarity: 'legendary', maxStack: 1, rankAxis: 'crit',
    name: '斬鉄', desc: '刀の会心率 +30%、会心倍率 +1.0',
    apply(run) { const w = run.wp('katana'); if (w) { w.s.crit += Game.rka(0.30, 'crit'); w.s.critMul += Game.rka(1.0, 'crit'); } } }),
  // 無限刃（斬るたびに間合い +6%・最大2倍）は撤去した（2026-09-24）。
  //   ユーザー 2026-09-22「武器の範囲を広げるスキル、カードなどゲーム内から全て削除」の
  //   0922u の撤去一覧から漏れていた。所持していた分は読み込み時に消える（state.js）

  // ============ 手裏剣 ============
  shu_multi: C({ id: 'shu_multi', kind: 'mod', weapon: 'shuriken', rarity: 'common', maxStack: 5, rankAxis: 'count',
    name: '三枚重ね', desc: '手裏剣の同時投擲 +2、ダメージ ×0.88',
    apply(run) { const w = run.wp('shuriken'); if (w) { w.s.count += Game.rki(2, 'count'); w.s.dmg *= 0.88; w.s.spread = Math.max(w.s.spread, 0.09); } } }),
  shu_bounce: C({ id: 'shu_bounce', kind: 'mod', weapon: 'shuriken', rarity: 'rare', maxStack: 3, rankAxis: 'bounce',
    name: '反射増加', desc: '手裏剣の跳ね返り +3',
    apply(run) { const w = run.wp('shuriken'); if (w) w.s.bounce += Game.rki(3, 'bounce'); } }),
  shu_poison: C({ id: 'shu_poison', kind: 'mod', weapon: 'shuriken', rarity: 'epic', maxStack: 2, rankAxis: 'burn',
    name: '毒手裏剣', desc: '命中で毒を付与。跳ねるたびにダメージ +12%（減衰しない）',
    apply(run) { const w = run.wp('shuriken'); if (w) { w.s.burn = Math.max(w.s.burn, Game.rka(0.35, 'burn')); w.s.burnDur = Math.max(w.s.burnDur, 3); w.flags.ramp = true; } } }),
  // 追尾刃（旧・薙ぎ払い。射界の広さを読む札だった）：跳ねた先を、近くでいちばんHPの高い敵にする
  shk_sweep: C({ id: 'shk_sweep', noRank: true, kind: 'mod', weapon: 'shuriken', rarity: 'epic', maxStack: 1,
    name: '追尾刃', desc: '手裏剣が、近くの敵へ向かって曲がりながら飛ぶ（まっすぐ飛んで外れない）',
    apply(run) { const w = run.wp('shuriken'); if (w) w.s.homing = Math.max(w.s.homing, BAL.cardFx.seekHoming); } }),
  // 影分身（旧・千本桜。三枚重ね2枚ぶんだった）：当たるたびに、分身がもう1枚跳ぶ
  shu_sakura: C({ id: 'shu_sakura', noRank: true, kind: 'mod', weapon: 'shuriken', rarity: 'legendary', maxStack: 1,
    name: '影分身', desc: '手裏剣が敵に当たって跳ねるたび、威力 60%の分身がもう1枚、同じ向きに跳ぶ（分身は分身を呼ばない）',
    apply(run) { const w = run.wp('shuriken'); if (w) w.flags.shadow = true; } }),

  // ============ 触手（作り直し対象外） ============
  //   **【2026-09-30 段3】触手の作り直しに合わせて作り直した。**触手は撃つたびに6種の攻撃のどれかが出る（weapons.js）。
  //   前の札（掴む数・掴む時間）は「引き寄せ」が出たときにしか効かず、掴む時間は1体8秒の打ち止め（ccMaxSec）に当たっていた。
  //   いまは**ピーキーさを尖らせる**方向（設計書 DESIGN-STAGE3 §9-3）：同時に2種・刺す／斬る攻撃を尖らせる・引き寄せと壁を太く。id はそのまま
  tnt_grip: C({ id: 'tnt_grip', kind: 'mod', weapon: 'tentacle', rarity: 'common', maxStack: 5, rankAxis: 'dmg',
    name: '握力', desc: '触手のダメージ +40%',
    apply(run) { const w = run.wp('tentacle'); if (w) w.s.dmg *= Game.rk(1.40, 'dmg'); } }),
  tnt_long: C({ id: 'tnt_long', kind: 'mod', weapon: 'tentacle', rarity: 'rare', maxStack: 3, rankAxis: 'knock',
    name: '剛腕', desc: '引き寄せの力 ×1.35、触手の壁の持続 ×1.3、掴める数 +1',
    apply(run) { const w = run.wp('tentacle'); if (w) { w.s.knock *= Game.rk(1.35, 'knock'); w.s.knockDur *= 1.3; w.s.count += 1; } } }),
  tnt_squeeze: C({ id: 'tnt_squeeze', kind: 'mod', weapon: 'tentacle', rarity: 'rare', maxStack: 3, rankAxis: 'stab',
    name: '締め上げ', desc: '突き刺しと一閃のダメージ ×1.5',
    apply(run) { const w = run.wp('tentacle'); if (w) w.dyn.tntStabMul = (w.dyn.tntStabMul || 1) * Game.rk(1.5, 'stab'); } }),
  tnt_many: C({ id: 'tnt_many', kind: 'mod', weapon: 'tentacle', rarity: 'epic', maxStack: 2, rankAxis: 'double',
    name: '二連撃', desc: '35%の確率で、違う攻撃を2つ同時に出す',
    apply(run) { const w = run.wp('tentacle'); if (w) w.dyn.tntDouble = Math.min(1, (w.dyn.tntDouble || 0) + Game.rka(0.35, 'double')); } }),
  tnt_octo: C({ id: 'tnt_octo', noRank: true, kind: 'mod', weapon: 'tentacle', rarity: 'legendary', maxStack: 1,
    name: '八腕', desc: '毎回、違う攻撃を2つ同時に出す。発射レート ×0.8',
    apply(run) { const w = run.wp('tentacle'); if (w) { w.dyn.tntDouble = 1; w.s.rate *= 0.8; } } }),

  // ============ 泡 ============
  // 重い泡（旧・大泡。閉じ込める時間は1体8秒の打ち止めに当たっていた）：割れたときのダメージ
  bbl_big: C({ id: 'bbl_big', kind: 'mod', weapon: 'bubble', rarity: 'common', maxStack: 5, rankAxis: 'dmg',
    name: '重い泡', desc: '泡が割れたときのダメージ +35%',
    apply(run) { const w = run.wp('bubble'); if (w) { w.s.dmg *= Game.rk(1.35, 'dmg'); } } }),
  bbl_rapid: C({ id: 'bbl_rapid', kind: 'mod', weapon: 'bubble', rarity: 'rare', maxStack: 3, rankAxis: 'rate',
    name: '連泡', desc: '泡の発射レート +55%',
    apply(run) { const w = run.wp('bubble'); if (w) w.s.rate *= Game.rk(1.55, 'rate'); } }),
  // 酸泡：酸だまりの大きさ（60px・3.5秒）は凸で伸ばさない（前は凸で半径が伸びていた）。凸が効くのは割れたときのダメージだけ
  bbl_acid: C({ id: 'bbl_acid', kind: 'mod', weapon: 'bubble', rarity: 'epic', maxStack: 2, rankAxis: 'splash',
    name: '酸泡', desc: '割れたときのダメージ ×2.4。さらに酸だまりを残す',
    apply(run) { const w = run.wp('bubble'); if (w) { w.s.splashMul *= Game.rk(2.4, 'splash'); w.flags.acid = true; w.s.fieldR = 60; w.s.fieldDur = 3.5; } } }),
  bbl_froth: C({ id: 'bbl_froth', kind: 'mod', weapon: 'bubble', rarity: 'rare', maxStack: 3, rankAxis: 'count',
    name: '泡沫', desc: '同時に出す泡 +1',
    apply(run) { const w = run.wp('bubble'); if (w) w.s.count += Game.rki(1, 'count'); } }),
  // 弾む泡（新しい札）：割れた泡が近くの敵の上でもう1回割れる
  bbl_bounce: C({ id: 'bbl_bounce', kind: 'mod', weapon: 'bubble', rarity: 'epic', maxStack: 2, rankAxis: 'hop',
    name: '弾む泡', desc: '割れた泡が、近くの敵の上でもう1回割れる（威力 60%・閉じ込めない・重ねると跳ねる回数が増える）',
    apply(run) { const w = run.wp('bubble'); if (w) w.dyn.hop = (w.dyn.hop || 0) + Game.rki(1, 'hop'); } }),
  // 泡の檻（旧・泡の海。泡沫2枚と連泡の小さい版だった）：閉じ込めた敵が、どの武器からも多くのダメージを受ける
  bbl_sea: C({ id: 'bbl_sea', noRank: true, kind: 'mod', weapon: 'bubble', rarity: 'legendary', maxStack: 1,
    name: '泡の檻', desc: '泡に閉じ込めた敵が、あらゆる武器から受けるダメージ +100%。同時に出す泡 +1、閉じ込める時間 +1秒',
    apply(run) { run.cageVuln = (run.cageVuln || 0) + BAL.cardFx.cageVuln; const w = run.wp('bubble'); if (w) { w.s.stunDur += BAL.cardFx.cageStun; w.s.count += 1; } } }),

  // ============ 迫撃砲 ============
  mtr_shell: C({ id: 'mtr_shell', kind: 'mod', weapon: 'mortar', rarity: 'common', maxStack: 5, rankAxis: 'dmg',
    name: '大口径榴弾', desc: '迫撃砲のダメージ +45%',
    apply(run) { const w = run.wp('mortar'); if (w) w.s.dmg *= Game.rk(1.45, 'dmg'); } }),
  // 徹甲榴弾（旧・重装炸薬。大口径榴弾に負けていた）：装甲を無視する
  mtr_wide: C({ id: 'mtr_wide', kind: 'mod', weapon: 'mortar', rarity: 'epic', maxStack: 1, rankAxis: 'dmg',
    name: '徹甲榴弾', desc: '迫撃砲の爆発が敵の装甲を無視し、ダメージ +25%',
    apply(run) { const w = run.wp('mortar'); if (w) { w.dyn.apen = 1; w.s.dmg *= Game.rk(1.25, 'dmg'); } } }),
  mtr_carpet: C({ id: 'mtr_carpet', kind: 'mod', weapon: 'mortar', rarity: 'epic', maxStack: 2, rankAxis: 'count',
    name: '絨毯爆撃', desc: '迫撃砲の同時発射 +3、ダメージ ×0.8',
    apply(run) { const w = run.wp('mortar'); if (w) { w.s.count += Game.rki(3, 'count'); w.s.dmg *= 0.8; } } }),
  mtr_rapid: C({ id: 'mtr_rapid', kind: 'mod', weapon: 'mortar', rarity: 'rare', maxStack: 3, rankAxis: 'rate',
    name: '速射砲座', desc: '迫撃砲の発射レート +40%',
    apply(run) { const w = run.wp('mortar'); if (w) w.s.rate *= Game.rk(1.4, 'rate'); } }),
  // 焼夷弾（旧・弾幕射撃。絨毯爆撃より少なかった）：着弾した所が燃える
  mtr_barrage: C({ id: 'mtr_barrage', noRank: true, kind: 'mod', weapon: 'mortar', rarity: 'legendary', maxStack: 1,
    name: '焼夷弾', desc: '迫撃砲の着弾が敵を燃やし、地面に火の海（4秒）を残す',
    apply(run) { const w = run.wp('mortar'); if (w) { w.flags.incend = true; w.s.burn = Math.max(w.s.burn, BAL.cardFx.incendBurn); w.s.burnDur = Math.max(w.s.burnDur, 3); } } }),

  // ============ シナジー（2種を同時編成しているときだけ抽選に出る・作り直し対象外。凸の軸だけ付けた） ============
  syn_charged: C({ id: 'syn_charged', kind: 'synergy', requires: ['gatling', 'tesla'], rarity: 'common', maxStack: 4, rankAxis: 'chain',
    name: '帯電弾', desc: '【ガトリング＋テスラ】ガトリング弾が着弾時に2連鎖の電撃を起こす',
    apply(run) { const w = run.wp('gatling'); if (w) { w.flags.charged = true; w.dyn.chargedChain = (w.dyn.chargedChain || 0) + Game.rki(2, 'chain'); } } }),
  syn_spotter: C({ id: 'syn_spotter', kind: 'synergy', requires: ['sniper', 'missile'], rarity: 'rare', maxStack: 3, rankAxis: 'spot',
    // **狙いは動かさない。** どこへ落とすかはプレイヤーが決めるものなので、
    // 「印の付いた敵に落ちたときだけ効く」形にしてある
    name: '曳光指示', desc: '【レーザー＋ミサイル】レーザーが通った敵に印が残り、そこへの着弾 ×1.6（重ねると +0.6ずつ加算）',
    apply(run) { const s = run.wp('sniper'), m = run.wp('missile');
      if (s) s.flags.spot = true;
      if (m) m.dyn.spotMul = (m.dyn.spotMul || 1) + Game.rka(0.6, 'spot'); } }),
  syn_implode: C({ id: 'syn_implode', kind: 'synergy', requires: ['missile', 'tesla'], rarity: 'rare', maxStack: 3, rankAxis: 'shock',
    name: '電磁爆縮', desc: '【ミサイル＋テスラ】ミサイルの爆発が感電を付与する（2.5秒・重ねると +1秒ずつ）',
    apply(run) { const m = run.wp('missile'); if (m) { m.flags.implode = true; m.s.shockDur = m.s.shockDur > 0 ? m.s.shockDur + Game.rka(1, 'shock') : Game.rka(2.5, 'shock'); } } }),
  syn_resonance: C({ id: 'syn_resonance', kind: 'synergy', requires: ['gatling', 'sniper'], rarity: 'epic', maxStack: 2, rankAxis: 'res',
    // **既知の不具合（2026-09-30 段3b で見つけた・作り直し対象外なので直していない）**：run の値（resonanceStep/Max）を武器の if の中で書いていて、
    //   ユニット側の呼び出しでは捨てられ、ラン側の呼び出しでは武器が無いので書かれない。いまは run.resonanceStep ?? 0.006・resonanceMax ?? 4.0 の既定で動いている（重ねても・凸でも伸びない）
    name: '弾道共鳴', desc: '【ガトリング＋レーザー】ガトリング命中ごとにレーザーのダメージ +0.6%（上限 +400%）',
    apply(run) { const g = run.wp('gatling'); if (g) { g.flags.resonance = true;
      run.resonanceStep = Math.max(run.resonanceStep || 0, Game.rka(0.006, 'res'));
      run.resonanceMax = Math.max(run.resonanceMax || 0, Game.rka(4.0, 'res')); } } }),

  syn_backdraft: C({ id: 'syn_backdraft', kind: 'synergy', requires: ['flame', 'gas'], rarity: 'rare', maxStack: 3, rankAxis: 'blast',
    name: '爆燃', desc: '【火炎放射器＋毒ガス】毒の雲に炎が届くと引火して大爆発する',
    apply(run) { const f = run.wp('flame'); if (f) f.flags.ignite = true; run.backdraft += Game.rka(1, 'blast'); } }),
  syn_shatterblade: C({ id: 'syn_shatterblade', noRank: true, kind: 'synergy', requires: ['cryo', 'katana'], rarity: 'rare', maxStack: 3,
    name: '兜割り', desc: '【凍結装置＋刀】凍っている敵に対して刀の斬撃が必ず会心になる',
    apply(run) { const k = run.wp('katana'); if (k) k.flags.frostCrit = true; } }),
  syn_staticfoam: C({ id: 'syn_staticfoam', kind: 'synergy', requires: ['bubble', 'tesla'], rarity: 'common', maxStack: 4, rankAxis: 'shock',
    name: '感電泡', desc: '【泡＋テスラ】泡に閉じ込めた敵が感電し、雷の連鎖が必ずそこを通る',
    apply(run) { const b = run.wp('bubble'); if (b) { b.flags.staticFoam = true; b.s.shockDur = Math.max(b.s.shockDur, Game.rka(3, 'shock')); } } }),
  syn_hangman: C({ id: 'syn_hangman', kind: 'synergy', requires: ['tentacle', 'missile'], rarity: 'epic', maxStack: 2, rankAxis: 'mul',
    name: '吊るし上げ', desc: '【触手＋ミサイル】触手が当てた敵に3秒間「印」が付き、印のある敵へのミサイルの着弾ダメージ ×2.2（重ねると +1.2ずつ加算）',
    // 作り直し（2026-10-05）：以前は「掴まれている敵」だけに効いた（触手の6種のうち引き寄せだけ）。いまは触手の攻撃のどれが当たっても印が付く（Combat.damage）。
    //   倍率は dyn.tntMul（足し算）。flags.hang は消してある（どこからも読まれていなかった）
    apply(run) { run.tntMark = true; const m = run.wp('missile'); if (m) m.dyn.tntMul = (m.dyn.tntMul || 1) + Game.rka(1.2, 'mul'); } }),

  syn_fixfire: C({ id: 'syn_fixfire', kind: 'synergy', requires: ['tentacle', 'mortar'], rarity: 'rare', maxStack: 3, rankAxis: 'mul',
    name: '照準固定', desc: '【触手＋迫撃砲】触手が当てた敵に3秒間「印」が付き、印のある敵への迫撃砲の着弾ダメージ ×1.5（重ねると +0.5ずつ加算）',
    apply(run) { run.tntMark = true; const m = run.wp('mortar'); if (m) m.dyn.tntMul = (m.dyn.tntMul || 1) + (Game.rk(1.5, 'mul') - 1); } }),

  // ============ 上位札（前提のある札・2026-09-30 段3・設計書 DESIGN-STAGE3 §7） ============
  //   > ユーザー「特定のカードを取るとピックに出現するような、前提スキルが必要となるスキルカードも実装していいです、
  //   >   これらを一枚しか取る事が出来ないようにするなどの制限を用いれば、私が最初に禁止した範囲や射程を広げるなどのスキルをプレイヤーに与えることが出来ます」
  //   > 「前提札が単独武器種ではなく、２種の前提を取ったら使える連携スキルなども良いですね」
  //   **その出撃で `needs` の札を両方取っていると、3択に出る。1枚だけ（maxStack 1）。パックからは出ない**（持っていなくても出る・packs.js で除外）。
  //   出る確率はエピックの枠（10%）。**射程・範囲を広げるのはここだけ**：`w.s.range` などを直接書き換える
  //   （射程を読む所＝狙い・扇の絵・攻撃の範囲が同じ値を見るので、見た目と当たりが食い違わない。以前の足し算の仕組み addPct の轍を踏まない）
  up_gat_mount: C({ id: 'up_gat_mount', upper: true, noRank: true, needs: ['gat_belt', 'gat_cool'], kind: 'mod', weapon: 'gatling', rarity: 'epic', maxStack: 1,
    name: '据置き銃架', desc: 'ガトリングの射程 +30%',
    apply(run) { const w = run.wp('gatling'); if (w) w.s.range *= 1.3; } }),
  up_tsl_tower: C({ id: 'up_tsl_tower', upper: true, noRank: true, needs: ['tsl_coil', 'tsl_chain'], kind: 'mod', weapon: 'tesla', rarity: 'epic', maxStack: 1,
    name: '送電塔', desc: 'テスラの射程 +25%、連鎖 +2',
    apply(run) { const w = run.wp('tesla'); if (w) { w.s.range *= 1.25; w.s.chain += 2; } } }),
  up_flm_lance: C({ id: 'up_flm_lance', upper: true, noRank: true, needs: ['flm_fuel', 'flm_spread'], kind: 'mod', weapon: 'flame', rarity: 'epic', maxStack: 1,
    name: '長柄ノズル', desc: '火炎の届く距離 +30%',
    apply(run) { const w = run.wp('flame'); if (w) w.s.range *= 1.3; } }),
  up_gas_wide: C({ id: 'up_gas_wide', upper: true, noRank: true, needs: ['gas_wide', 'gas_corrode'], kind: 'mod', weapon: 'gas', rarity: 'epic', maxStack: 1,
    name: '広域散布', desc: '毒の雲の広さ +40%',
    apply(run) { const w = run.wp('gas'); if (w) w.s.fieldR *= 1.4; } }),
  up_cry_wave: C({ id: 'up_cry_wave', upper: true, noRank: true, needs: ['cry_deep', 'cry_shatter'], kind: 'mod', weapon: 'cryo', rarity: 'epic', maxStack: 1,
    name: '寒波', desc: '冷気の届く半径 +25%',
    apply(run) { const w = run.wp('cryo'); if (w) w.s.range *= 1.25; } }),
  up_ktn_long: C({ id: 'up_ktn_long', upper: true, noRank: true, needs: ['ktn_edge', 'ktn_iai'], kind: 'mod', weapon: 'katana', rarity: 'epic', maxStack: 1,
    name: '長巻', desc: '刀の間合い +30%',
    apply(run) { const w = run.wp('katana'); if (w) w.s.range *= 1.3; } }),
  up_mtr_big: C({ id: 'up_mtr_big', upper: true, noRank: true, needs: ['mtr_shell', 'mtr_rapid'], kind: 'mod', weapon: 'mortar', rarity: 'epic', maxStack: 1,
    name: '大口径化', desc: '迫撃砲の爆風の半径 +30%',
    apply(run) { const w = run.wp('mortar'); if (w) w.s.splash *= 1.3; } }),
  // ---- 2種の武器の札を前提にする連携の上位札（ユーザー「２種の前提を取ったら使える連携スキル」）----
  up_syn_conduct: C({ id: 'up_syn_conduct', upper: true, noRank: true, needs: ['gat_ap', 'tsl_shock'], kind: 'synergy', requires: ['gatling', 'tesla'], rarity: 'epic', maxStack: 1,
    name: '導電弾', desc: '【ガトリング＋テスラ】ガトリングの弾が当たった敵を感電させる（2秒）',
    apply(run) { const w = run.wp('gatling'); if (w) w.s.shockDur = Math.max(w.s.shockDur, 2); } }),
  up_syn_resonate: C({ id: 'up_syn_resonate', upper: true, noRank: true, needs: ['snp_he', 'tsl_chain'], kind: 'synergy', requires: ['sniper', 'tesla'], rarity: 'epic', maxStack: 1,
    name: '共振光線', desc: '【レーザー＋テスラ】レーザーが通った敵を感電させる（2秒）',
    apply(run) { const w = run.wp('sniper'); if (w) w.s.shockDur = Math.max(w.s.shockDur, 2); } }),
  up_syn_venomfire: C({ id: 'up_syn_venomfire', upper: true, noRank: true, needs: ['flm_fuel', 'gas_corrode'], kind: 'synergy', requires: ['flame', 'gas'], rarity: 'epic', maxStack: 1,
    name: '毒炎', desc: '【火炎放射器＋毒ガス】火炎の燃焼ダメージ ×2',
    apply(run) { const w = run.wp('flame'); if (w) w.s.burn *= 2; } }),

  // ============ 鍵（kind:'key'）============
  //   **3択にもパックにも出ない。** 章の報酬でしか手に入らない、機能を開ける札。
  //   遺物（kind:'perm'）と分けてあるのは、Relic.mods が数値を合計する側だから
  ky_skip: C({ id: 'ky_skip', kind: 'key', rarity: 'legendary', maxStack: 1,
    name: '踏破の記録', desc: '一度でも完璧に凌いだ章を、次の周から戦わずに突破できる' }),

  // ============ 汎用（編成に関係なく出る） ============
  // ---- 2026-09-24 に足した連携（ユーザー承認 docs/DESIGN-CARDS-2026-09-24.md）----
  syn_frostgat: C({ id: 'syn_frostgat', noRank: true, kind: 'synergy', requires: ['gatling', 'cryo'], rarity: 'rare', maxStack: 3,
    name: '凍て弾幕', desc: '【ガトリング＋凍結装置】凍っている敵に当たったガトリングの弾は必ず会心になる',
    apply(run) { const g = run.wp('gatling'); if (g) g.flags.frostCrit = true; } }),
  syn_searbind: C({ id: 'syn_searbind', kind: 'synergy', requires: ['flame', 'tentacle'], rarity: 'rare', maxStack: 3, rankAxis: 'mul',
    name: '焼き印', desc: '【火炎放射器＋触手】触手が当てた敵に3秒間「印」が付き、印のある敵への火炎の直撃と炎上ダメージ ×2（重ねると +1ずつ加算）',
    apply(run) { run.tntMark = true; const d = Game.rk(2, 'mul') - 1; run.tntBurn = (run.tntBurn || 1) + d; const f = run.wp('flame'); if (f) f.dyn.tntMul = (f.dyn.tntMul || 1) + d; } }),
  syn_toxfoam: C({ id: 'syn_toxfoam', kind: 'synergy', requires: ['gas', 'bubble'], rarity: 'epic', maxStack: 2, rankAxis: 'dur',
    name: '毒泡', desc: '【毒ガス＋泡】泡が割れた所に毒の雲が残る',
    apply(run) { const b = run.wp('bubble'); if (b) { b.flags.toxFoam = true; b.dyn.toxDur = Math.max(b.dyn.toxDur || 0, Game.rka(3, 'dur')); } } }),
  syn_iceshell: C({ id: 'syn_iceshell', kind: 'synergy', requires: ['mortar', 'cryo'], rarity: 'rare', maxStack: 3, rankAxis: 'slow',
    name: '氷塊弾', desc: '【迫撃砲＋凍結装置】迫撃砲の爆発が敵を凍らせる（減速40%・1.5秒）',
    apply(run) { const m = run.wp('mortar'); if (m) { m.s.slow = Math.min(0.85, Math.max(m.s.slow, Game.rka(0.4, 'slow'))); m.s.slowDur = Math.max(m.s.slowDur, 1.5); } } }),
  syn_thunderblade: C({ id: 'syn_thunderblade', kind: 'synergy', requires: ['shuriken', 'tesla'], rarity: 'common', maxStack: 4, rankAxis: 'chain',
    name: '雷刃', desc: '【手裏剣＋テスラ】手裏剣が当たった敵から2連鎖の電撃が走る',
    apply(run) { const w = run.wp('shuriken'); if (w) { w.flags.charged = true; w.dyn.chargedChain = (w.dyn.chargedChain || 0) + Game.rki(2, 'chain'); } } }),
  syn_spotblade: C({ id: 'syn_spotblade', kind: 'synergy', requires: ['sniper', 'katana'], rarity: 'epic', maxStack: 2, rankAxis: 'spot',
    name: '狙撃指示', desc: '【レーザー＋刀】レーザーが通った敵への斬撃 ×1.6、刀の会心率 +20%',
    apply(run) { const s = run.wp('sniper'), k = run.wp('katana');
      if (s) s.flags.spot = true;
      if (k) { k.dyn.spotMul = (k.dyn.spotMul || 1) * Game.rk(1.6, 'spot'); k.s.crit += 0.20; } } }),

  // ---- 汎用の札（2026-09-30 段3b・設計書 §6-3）----
  //   同じ軸の2枚を1枚にまとめた：増設装甲＋重装甲／金メッキ弾＋戦利品／過給機＋冷却系統（消えた札の枚数は残った札に足してある・state.js の mergeCards）。
  //   空いた枠に耐性の答え：徹甲化 → 装甲貫通。コイン札は第31章から先（アセンション）では3択に出ない（coin:true・draft.js）
  gen_armor: C({ id: 'gen_armor', kind: 'generic', rarity: 'common', maxStack: 5, rankAxis: 'life',
    name: '増設装甲', desc: 'ライフ +8（その場で回復もする）',
    apply(run) { const hp = Game.rki(8, 'life'); run.livesMax += hp; run.lives += hp; } }),
  gen_gold: C({ id: 'gen_gold', kind: 'generic', rarity: 'rare', maxStack: 4, coin: true, rankAxis: 'coin',
    name: '金メッキ弾', desc: 'このランのコイン獲得 ×1.3（第31章から先は出ない）',
    apply(run) { run.coinMul *= Game.rk(1.3, 'coin'); } }),
  gen_boost: C({ id: 'gen_boost', kind: 'generic', rarity: 'rare', maxStack: 4, rankAxis: 'rate',
    name: '過給機', desc: '全武器の発射レート +15%',
    apply(run) { for (const w of run.units) { w.s.rate *= Game.rk(1.15, 'rate'); } } }),
  // 照準補正：会心が乗る武器に効く（火炎・凍結・触手にも会心が乗るようにした。毒ガスの雲だけは会心が無い）
  gen_aim: C({ id: 'gen_aim', kind: 'generic', rarity: 'common', maxStack: 5, rankAxis: 'crit',
    name: '照準補正', desc: '全武器の会心率 +5%（毒ガスの雲には効かない）',
    apply(run) { for (const w of run.units) w.s.crit += Game.rka(0.05, 'crit'); } }),
  // 貫通芯：貫通が効くのは弾（ガトリング・手裏剣）だけだったので、テスラには連鎖 +1 として効かせる
  gen_core: C({ id: 'gen_core', kind: 'generic', rarity: 'rare', maxStack: 3, rankAxis: 'pierce',
    name: '貫通芯', desc: '弾（ガトリング・手裏剣）の貫通 +1、テスラの連鎖 +1',
    apply(run) { const k = Game.rki(1, 'pierce'); for (const w of run.units) { w.s.pierce += k; if (w.id === 'tesla') w.s.chain += k; } } }),
  // 装甲貫通（旧・徹甲化。総力戦と同じダメージ軸だった）：全武器の1発が装甲を割り引いて通る。装甲の敵（ファイアウォール）への答え
  gen_ap: C({ id: 'gen_ap', kind: 'generic', rarity: 'epic', maxStack: 2, rankAxis: 'apen',
    name: '装甲貫通', desc: '全武器の1発が、敵の装甲を 30%無視する（重ねると加算・上限 90%）',
    apply(run) { run.apen = Math.min(0.9, (run.apen || 0) + Game.rka(0.3, 'apen')); } }),
  gen_allout: C({ id: 'gen_allout', kind: 'generic', rarity: 'legendary', maxStack: 1, rankAxis: 'dmg',
    name: '総力戦', desc: '全武器のダメージ ×1.5、発射レート ×1.2',
    apply(run) { for (const w of run.units) { w.s.dmg *= Game.rk(1.5, 'dmg'); w.s.rate *= 1.2; } } }),
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
    name: '初動資金', tmpl: '再起動した直後に コイン +{e}' }),
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
  // 取り切りのツリーでは「Lv+1」＝全節取得になるので、各連なりの1段目だけに絞った（2026-09-24）。
  //   重ねても増えない（cap 1）。判定は Skill.lv
  rl_invest: P({ id: 'rl_invest', rarity: 'legendary', key: 'startLv', eff: 1, mode: 'flat', cap: 1,
    name: '初期投資', tmpl: 'スキルツリーの各連なりの1段目が、最初から取得済みになる（コストの上限と敵誘引を除く）' }),

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

// 上位札の説明に前提の札の名前を足す（「前提：給弾ベルト＋冷却フィン」）
for (const id of Object.keys(CARDS)) {
  const c = CARDS[id];
  if (c.upper && c.needs) c.desc += '（前提：' + c.needs.map(n => CARDS[n] ? CARDS[n].name : n).join('＋') + '）';
}

const CARD_IDS = Object.keys(CARDS);

// **凸の主な軸の自己点検**（2026-09-30 段3b）。凸は札の rankAxis の軸にだけ効く（state.js の rk/rka/rki）。
//   札を足したときの書き忘れ（rankAxis が無い・apply の rk/rka/rki に軸の名前が無い・rankAxis と同じ名前の呼び出しが1つも無い）を、読み込み時にコンソールへ出す。
//   凸の伸びを持たない札は noRank を付ける
for (const id of CARD_IDS) {
  const c = CARDS[id];
  if (!c.apply || c.noRank) continue;
  const src = c.apply.toString();
  const all = (src.match(/Game\.rk[ai]?\(/g) || []).length;
  const tagged = src.match(/Game\.rk[ai]?\([^)]*,\s*'([a-zA-Z]+)'\)/g) || [];
  if (!c.rankAxis) console.error('凸の主な軸（rankAxis）が無い札:', id);
  else if (!tagged.some(t => t.endsWith("'" + c.rankAxis + "')"))) console.error('rankAxis と同じ軸名の rk/rka/rki が無い札:', id, c.rankAxis);
  if (tagged.length !== all) console.error('軸の名前が付いていない rk/rka/rki がある札:', id);
}

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
//   スナイパーは第2章の突破報酬に回した（stages.js の `STAGES[1].reward`）。
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
