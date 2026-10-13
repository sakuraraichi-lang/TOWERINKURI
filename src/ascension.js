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
  // 21から先の軸：n 回目の上げ（order の順に1レベルずつ回す）。値は 1＋per×n・max で頭打ち
  axisN(perm, key) {
    const A = BAL.ascAxis, i = A.order.indexOf(key);
    if (i < 0) return 0;
    const k = Math.max(0, this.lv(perm) - A.from + 1), L = A.order.length;
    return Math.floor((k + (L - 1 - i)) / L);
  },
  // レベルごとの調整（BAL.ascAxis.ease[hp|count]：敵のHPの倍率・敵の数の倍率。[レベル, 倍率] の点を対数で線形に結ぶ・最後の点から先はその値のまま）
  easeMul(perm, key) {
    const P = BAL.ascAxis.ease && BAL.ascAxis.ease[key], lv = this.lv(perm);
    if (!P || !P.length) return 1;
    if (lv <= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) {
      if (lv <= P[i][0]) { const t = (lv - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return Math.exp(Math.log(P[i - 1][1]) * (1 - t) + Math.log(P[i][1]) * t); }
    }
    return P[P.length - 1][1];
  },
  axisMul(perm, key) {
    const c = BAL.ascAxis[key];
    return Math.min(c.max, 1 + c.per * this.axisN(perm, key));
  },
  // 妨害の軸：ジャマー兵・クラッシャー（sab が jam / crush）の重みの倍率と、縮小版のボスの追加数
  jamWMul(perm, t) { return (t && (t.sab === 'jam' || t.sab === 'crush')) ? this.axisMul(perm, 'jam') : 1; },
  jamMiniAdd(perm) { const c = BAL.ascAxis.jam; return Math.min(c.miniMax, c.miniPer * this.axisN(perm, 'jam')); },
  upperShare(perm, stageIdx) {
    if (!BAL.ascUpperOn || !this.on(perm) || stageIdx < MAIN_CHAPTERS) return 0;
    let s = Math.min(BAL.ascUpperShareMax, Math.max(0, BAL.ascUpperShare0 + BAL.ascUpperSharePerLv * this.lv(perm)));
    if (this.themeKey(stageIdx) === 'elite') s = 1 - (1 - s) * BAL.ascTheme.elite.left;   // 精鋭章：雑魚を減らして上位が中心
    return s;
  },
  // いま出る上位の種類（アセンションのレベルで増える）
  upperList(perm, stageIdx) {
    const lv = this.lv(perm), out = [];
    for (const k in UPPER_TYPES) { const c = BAL.ascUpper[k]; if (c && lv >= c.lv) out.push({ t: UPPER_TYPES[k], w: c.weight * this.jamWMul(perm, UPPER_TYPES[k]) * this.themeW(stageIdx, UPPER_TYPES[k]) }); }
    return out;
  },
  upperK(perm, stageIdx) {
    const L = this.upperList(perm, stageIdx);
    let sw = 0, sk = 0;
    for (const o of L) { sw += o.w; sk += o.w * o.t.k; }
    return sw > 0 ? sk / sw : 1;
  },
  upperQ(perm, stageIdx) {
    const s = this.upperShare(perm, stageIdx);
    if (!(s > 0)) return 0;
    const a = s / this.upperK(perm, stageIdx);
    return a / ((1 - s) + a);
  },
  // 1ウェーブの数に掛ける倍率（置き換えたぶん減る）
  upperCountMul(perm, stageIdx) {
    const s = this.upperShare(perm, stageIdx);
    return s > 0 ? (1 - s) + s / this.upperK(perm, stageIdx) : 1;
  },
  // ---- 章の特色（2026-10-13・BAL.ascTheme）：第31章から先、ボスの章（5章ごと）以外 ----
  //   24章を1組に、特色5種を per 章ずつ＋特色なし。組ごとに種（BAL.mapSeed）で並べ替え、同じ特色は隣り合わせない。全員同じ
  THEMES: {
    elite:  { jp: '精鋭章',   en: 'ELITE',     col: '#ffd24a', line: '雑魚は少ない ─ 上位の敵が中心' },
    legacy: { jp: '旧ボス章', en: 'LEGACY',    col: '#ff8a3d', line: 'かつてのボスの縮小版が多く混ざる' },
    jam:    { jp: '妨害章',   en: 'JAMMING',   col: '#d36bff', line: 'ジャマー兵・クラッシャーが多い' },
    resist: { jp: '耐性章',   en: 'IMMUNE',    col: '#6fe3ff', line: '' },   // 系統ごとの一言は themeLine
    wide:   { jp: '広域章',   en: 'WIDE AREA', col: '#4ee0ff', line: '盤が広い ─ 流れが太い' },
  },
  THEME_KEYS: ['elite', 'legacy', 'jam', 'resist', 'wide'],
  RESIST_SYS: ['phys', 'elem', 'field'],   // 無効の上位の敵がいる系統（ゴースト・ファラデー・サンドボックス）。光学・掴みに無効の敵はいない
  _thDeck: {}, _thMemo: {},
  _themeDeck(b) {
    if (this._thDeck[b]) return this._thDeck[b];
    const T = BAL.ascTheme, BLOCK = 24, items = [];
    for (const k of this.THEME_KEYS) for (let i = 0; i < T.per; i++) items.push(k);
    while (items.length < BLOCK) items.push(null);
    const rnd = MapGen.rng(((BAL.mapSeed || 1) * 7919 + b * 104729 + 31) >>> 0);
    let deck = items, ok = false;
    for (let t = 0; t < 400 && !ok; t++) {
      deck = items.slice();
      for (let i = deck.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [deck[i], deck[j]] = [deck[j], deck[i]]; }
      ok = deck.every((x, i) => !x || x !== deck[i - 1]);
    }
    return (this._thDeck[b] = deck);
  },
  // 章 ch（1から数える）の特色。無ければ null。{ key, sys }（sys は耐性章だけ）
  themeOf(ch) {
    if (typeof Game !== 'undefined' && Game.run && Game.run.mr) return null;   // 改造ラン（MOD）は章の特色を付けない
    if (!(ch > MAIN_CHAPTERS) || ch % 5 === 0) return null;
    if (ch in this._thMemo) return this._thMemo[ch];
    const x = ch - MAIN_CHAPTERS - 1, k = x - Math.floor(x / 5), b = Math.floor(k / 24), pos = k % 24, deck = this._themeDeck(b);
    const key = deck[pos];
    let out = null;
    if (key) {
      out = { key };
      if (key === 'resist') {
        let r = b * BAL.ascTheme.per;
        for (let i = 0; i < pos; i++) if (deck[i] === 'resist') r++;
        const rr = MapGen.rng(((BAL.mapSeed || 1) * 31 + 977) >>> 0), o = this.RESIST_SYS.slice();
        for (let i = o.length - 1; i > 0; i--) { const j = (rr() * (i + 1)) | 0; [o[i], o[j]] = [o[j], o[i]]; }
        out.sys = o[r % o.length];
      }
    }
    return (this._thMemo[ch] = out);
  },
  themeKey(stageIdx) { const t = stageIdx === undefined ? null : this.themeOf(stageIdx + 1); return t ? t.key : null; },
  // 表示用の短い一行
  themeLine(th) {
    if (!th) return '';
    if (th.key === 'resist') return SYS_INFO[th.sys].jp + 'に無効な敵が多い';
    return this.THEMES[th.key].line;
  },
  // 上位の敵 t の出やすさの、章の特色による倍（妨害章：妨害の敵／耐性章：その系統に無効の敵）
  themeW(stageIdx, t) {
    const th = stageIdx === undefined ? null : this.themeOf(stageIdx + 1);
    if (!th || !t) return 1;
    if (th.key === 'jam' && t.sab) return BAL.ascTheme.jam.w;
    if (th.key === 'resist' && t.imm && t.imm.indexOf(th.sys) >= 0) return BAL.ascTheme.resist.w;
    return 1;
  },
  // 旧ボス章：縮小版のボスの追加体数
  themeMiniAdd(stageIdx) { return this.themeKey(stageIdx) === 'legacy' ? BAL.ascTheme.legacy.add : 0; },
  // 広域章：敵の数の倍
  themeFlow(stageIdx) { return this.themeKey(stageIdx) === 'wide' ? BAL.ascTheme.wide.flow : 1; },

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
