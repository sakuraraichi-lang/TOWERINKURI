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
  dmgMul(perm) { return this.dmgMulAt(this.lv(perm)); },
  dmgMulAt(lv) { return Math.pow(BAL.ascDmgPerLv, lv); },   // レベル lv のときの火力（レベルアップの演出が前後を並べるため）
  // レベルが上がったときのパックの数
  packsAt(k) { return Math.round(BAL.ascPackBase * Math.pow(BAL.ascPackGrowth, k)); },

  // ---- パックの圧縮（2026-10-06・BAL.ascExch*）：同じ分野のふつうのパック M 個＋コイン C 枚 → その分野の上位パック1個 ----
  //   C ＝ ascExchCoinMul ×（最前線の章の最初のウェーブの敵1体のコイン）×（1 ＋ 交換した回数の累計 × ascExchCoinStep）
  //   最前線の章＝突破した章のうちいちばん奥（第31章を突破するまでは第31章として数える）。後ろの章ほどコインの稼ぎが大きいので、C も章で伸びる（式は balance.js）
  exchangeCoin(perm) {
    const reach = Math.max(MAIN_CHAPTERS, Game.endlessReach(perm));
    const unit = BAL.enemyCoinBase * Math.pow(BAL.enemyCoinGrowth, globalWave(reach - 1, 1) - 1);   // 最前線の章の最初のウェーブの、雑魚1体のコイン
    return Math.round(BAL.ascExchCoinMul * unit * (1 + (perm.exchN || 0) * BAL.ascExchCoinStep));
  },
  // 分野 base（'basic'・'arms'・'chem'・'relic'・'syn'）の交換の状況。押せないときは short に足りないものを短く入れる
  exchangeInfo(perm, meta, base) {
    const have = perm.packs[base] || 0, M = BAL.ascExchPacks, C = this.exchangeCoin(perm), coins = meta.coins || 0;
    const short = [];
    if (!this.on(perm)) short.push('アセンション前');
    if (have < M) short.push('パックあと ' + (M - have) + ' 個');
    if (coins < C) short.push('コインあと ' + Util.fmt(C - coins));
    return { base, up: 'u_' + base, have, M, C, coins, ok: short.length === 0, short };
  },
  // 1回交換する。成功したら { ok:true, up, M, C }。保存は呼んだ側（Game.exchange）
  exchange(perm, meta, base) {
    const i = this.exchangeInfo(perm, meta, base);
    if (!i.ok || !PACKS['u_' + base]) return { ok: false, short: i.short };
    perm.packs[base] -= i.M;
    meta.coins -= i.C;
    perm.packs[i.up] = (perm.packs[i.up] || 0) + 1;
    perm.exchN = (perm.exchN || 0) + 1;
    return { ok: true, up: i.up, M: i.M, C: i.C };
  },
  // 測定器用：交換できるだけ交換する（分野ごとに、ふつうのパックが多い順）。戻り値は交換した回数
  exchangeAll(perm, meta) {
    let n = 0;
    for (let g = 0; g < 400; g++) {
      const base = PACK_IDS.filter(b => this.exchangeInfo(perm, meta, b).ok).sort((a, b) => perm.packs[b] - perm.packs[a])[0];
      if (!base) break;
      this.exchange(perm, meta, base); n++;
    }
    return n;
  },

  // 敵側のアセンション（誘引の段）。第31章から先だけ。1段 ＋ レベル ascLurePerLv ごとに1段
  lureLv(perm, stageIdx) {
    if (!this.on(perm) || stageIdx < MAIN_CHAPTERS) return 0;
    return 1 + Math.floor(this.lv(perm) / BAL.ascLurePerLv);
  },
  // 敵の量の倍率（Combat.waveCount が掛ける）
  spawnMul(perm, stageIdx) { return 1 + BAL.ascLureStep * this.lureLv(perm, stageIdx); },

  // ---- 上位の敵（2026-10-06・combat.js の UPPER_TYPES）----
  //   第31章から、ウェーブのHPの総量のうち upperShare を上位の敵に置き換える。上位1体＝雑魚 k 体ぶんで、HPの総量は変えず数だけ減る
  //   数 ＝ 雑魚(1−s) ＋ 上位 s÷K（K＝いま出る種類の k の重み平均）。湧くたびに上位にする確率 q ＝ (s÷K) ÷ ((1−s)＋s÷K)
  //   （雑魚側の1体あたりの平均HPは1として数えた近似：スクリプト 0.5・ブロック 3.4・ボット群 5体ぶん などが混ざるので、総量は ±数割ずれる）
  upperShare(perm, stageIdx) {
    if (!BAL.ascUpperOn || !this.on(perm) || stageIdx < MAIN_CHAPTERS) return 0;
    return Math.min(BAL.ascUpperShareMax, Math.max(0, BAL.ascUpperShare0 + BAL.ascUpperSharePerLv * this.lv(perm)));
  },
  // いま出る上位の種類（アセンションのレベルで増える）
  upperList(perm) {
    const lv = this.lv(perm), out = [];
    for (const k in UPPER_TYPES) { const c = BAL.ascUpper[k]; if (c && lv >= c.lv) out.push({ t: UPPER_TYPES[k], w: c.weight }); }
    return out;
  },
  upperK(perm) {
    const L = this.upperList(perm);
    let sw = 0, sk = 0;
    for (const o of L) { sw += o.w; sk += o.w * o.t.k; }
    return sw > 0 ? sk / sw : 1;
  },
  upperQ(perm, stageIdx) {
    const s = this.upperShare(perm, stageIdx);
    if (!(s > 0)) return 0;
    const a = s / this.upperK(perm);
    return a / ((1 - s) + a);
  },
  // 1ウェーブの数に掛ける倍率（置き換えたぶん減る）
  upperCountMul(perm, stageIdx) {
    const s = this.upperShare(perm, stageIdx);
    return s > 0 ? (1 - s) + s / this.upperK(perm) : 1;
  },
  // ゼロデイの弱点の系統（章ごとに固定・乱数にしない）
  weakOf(stageIdx) { return SYS_ORDER[(stageIdx * 5 + 2) % SYS_ORDER.length]; },

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
    const a = perm.asc, from = a.lv, exp0 = a.exp;   // exp0＝入れる前の経験値（結果画面のバーが、ここから伸びる）
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
    return { exp, from, to: a.lv, exp0, exp1: a.exp, packs };
  },
};
