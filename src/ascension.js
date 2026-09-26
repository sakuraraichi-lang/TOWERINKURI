// ---------------------------------------------------------------
// ascension.js : 第30章のあと（エンドレス）のアセンション
//
//   ユーザーの方針（2026-09-26・CLAUDE.md「第30章のあと：エンドレスとアセンション」）
//   > 「30章クリアしたら転生がアセンションになります…アセンションレベルに応じてステータスが恒久的に上がります、
//   >   同時に一度保留にした誘引スキルが新たに敵側のアセンションとして登場します…成果を失いません、
//   >   代わりに章クリア時の経験値で上がるようにします」
//
//   持ち物は perm.asc = { lv, exp, total }（無ければアセンション前）。**何も戻らない**（転生は第30章を突破したら終わり）。
//   数値のつまみは BAL.asc*（balance.js）
// ---------------------------------------------------------------
'use strict';

const Asc = {
  on(perm) { return !!(perm && perm.asc); },
  lv(perm) { return (perm && perm.asc && perm.asc.lv) || 0; },

  // 章 n（1から数える）の経験値。first＝その章を初めて突破した
  expFor(n, first) {
    if (n <= MAIN_CHAPTERS) return 0;
    const e = BAL.ascExpBase * Math.pow(BAL.ascExpGrowth, n - MAIN_CHAPTERS - 1);
    // もう一度の突破：最前線の章を ascRepeatN 回まわすと1レベルぶん（ascExpGrowth = ascNeedGrowth のとき）
    return first ? e : e * BAL.ascExpGrowth / BAL.ascRepeatN;
  },
  // レベル k → k+1 に要る経験値
  need(k) { return BAL.ascExpBase * Math.pow(BAL.ascNeedGrowth, k); },

  // 恒久の火力（Relic.mods の dmg に掛かる）
  dmgMul(perm) { return Math.pow(BAL.ascDmgPerLv, this.lv(perm)); },
  // レベルが上がったときのパックの数
  packsAt(k) { return Math.round(BAL.ascPackBase * Math.pow(BAL.ascPackGrowth, k)); },

  // 敵側のアセンション（誘引の段）。第31章から先だけ。1段 ＋ レベル ascLurePerLv ごとに1段
  lureLv(perm, stageIdx) {
    if (!this.on(perm) || stageIdx < MAIN_CHAPTERS) return 0;
    return 1 + Math.floor(this.lv(perm) / BAL.ascLurePerLv);
  },
  // 敵の量の倍率（Combat.waveCount が掛ける）
  spawnMul(perm, stageIdx) { return 1 + BAL.ascLureStep * this.lureLv(perm, stageIdx); },

  // 第30章を初めて突破したとき。**恒久の土台を第30章に合わせる**
  //   （最後の転生が第28章だった人は、そのままだと第31章の敵に対して土台が約240倍足りない）
  unlock(perm) {
    if (!BAL.ascEnabled || this.on(perm)) return false;
    perm.asc = { lv: 0, exp: 0, total: 0 };
    perm.legacyDeep = Math.max(perm.legacyDeep || 0, MAIN_CHAPTERS);
    if (!(perm.prestiges > 0)) perm.prestiges = 1;   // 土台（Legacy.of）は転生していないと効かないため
    Relic.invalidate();
    return true;
  },

  // 章の突破で経験値を入れ、上がったレベルぶんのパックを返す（配るのは呼んだ側）
  gain(perm, n, first) {
    if (!this.on(perm)) return null;
    const exp = this.expFor(n, first);
    if (!(exp > 0)) return null;
    const a = perm.asc, from = a.lv;
    a.exp += exp; a.total += exp;
    const packs = {};
    while (a.exp >= this.need(a.lv)) {
      a.exp -= this.need(a.lv);
      a.lv++;
      // 5つの分野から等分に引く（連携・遺物も含む）
      const k = this.packsAt(a.lv);
      for (let i = 0; i < k; i++) {
        const pk = PACK_IDS[(Math.random() * PACK_IDS.length) | 0];
        packs[pk] = (packs[pk] || 0) + 1;
      }
    }
    if (a.lv !== from) Relic.invalidate();
    return { exp, from, to: a.lv, packs };
  },
};
