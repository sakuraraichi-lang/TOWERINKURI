// ---------------------------------------------------------------
// modrun.js : MOD モード（改造ラン）―― 本編から切り離した独立のモード（2026-10-14 ユーザー）
//
//   ・本編の持ち札・コスト上限・スキルツリー・アセンション・常駐・凸は一切持ち込まない（ModRun.neutralMods・costCap）
//   ・専用のホーム「MOD 基地」：出撃・改造ツリー・武器・交換所・記録。入口は URL に ?modlab を付けたときだけ（仕上がるまで）
//   ・ラン：8章・第4章と第8章にボス。章のあとに「改造」を3択で1つ取って組む。合成は元の2つが開いていれば札なしで使える
//   ・MOD ポイント（MP）：突破した章・倒したボス・踏破でその場で入る（負けても進んだ分は残る）。改造ツリーと交換所で使う
//   ・敵の強さはランの章 k だけで決まる（BAL.modRun.enemy）。本編の章の強さ・アセンションの値は借りない
//   ・セーブは perm.mod（{ pts, earned, tree, run, rec }）。前の改造ラン（perm.modrun・perm.modrunRec）は読み込み時に1回だけ捨てる
//   ・ウェーブの合間は「置き足す・合成する」だけ（動かす・外すは準備フェーズだけ）。組み替え自由で外れる
//   数値のつまみは BAL.modRun（balance.js）
// ---------------------------------------------------------------
'use strict';

// 系統（色はカードの3択の語彙：系統の色を絵の色に、レア度の色を枠に）
const MOD_SYS = {
  adj:   { jp: '隣接',   en: 'LINK',     col: '#4ee0ff' },
  fuse:  { jp: '合成',   en: 'FUSION',   col: '#ffd24a' },
  hit:   { jp: 'ヒット', en: 'HIT',      col: '#ff5b8a' },
  bet:   { jp: '賭け',   en: 'GAMBLE',   col: '#ff8a1f' },
  pos:   { jp: '配置',   en: 'POSITION', col: '#7ee3a0' },
  greed: { jp: '欲張り', en: 'GREED',    col: '#c26bff' },
  boss:  { jp: '代償',   en: 'PRICE',    col: '#ff3d5a' },
};

// 改造。sys＝系統（連携は2つ）・g＝絵の字・rar＝レア度・line＝短い一行（挙動と必ず一致させる・「｜」の後ろは代償で赤く出す）
//   need＝連携の前提の2つ・boss＝ボスを倒したときだけ出る代償つき・unl＝候補に出すのに要る改造ツリーの節（無ければ最初から）
const MODS = {
  backtoback: { sys: ['adj'],   g: '背', rar: 'rare', name: '背中合わせ',     line: '隣の異種 +30%／種｜同種は隣に置けない' },
  family:     { sys: ['adj'],   g: '族', rar: 'rare', name: '大家族',         line: '隣の種類の上限 3→6' },
  premonition:{ sys: ['fuse'],  g: '予', rar: 'rare', name: '合の予感',       line: '合成のコスト +2 なし｜素の武器は威力半分' },
  inherit:    { sys: ['fuse'],  g: '継', rar: 'rare', name: '継承',           line: '合成武器の隣も2系統になる' },
  shatter:    { sys: ['hit'],   g: '砕', rar: 'rare', name: '一撃必砕',       line: 'バリアの減り ×2｜威力半分' },
  breakparty: { sys: ['hit'],   g: '祝', rar: 'rare', name: 'ブレイク祝い',   line: 'バリア0で爆ぜ、周りのバリアを削る' },
  glass:      { sys: ['bet'],   g: '硝', rar: 'epic', unl: 'm_bet', name: 'ガラスの大砲', line: '威力 ×3｜漏らすと武器の半分が停止' },
  backwater:  { sys: ['bet'],   g: '水', rar: 'epic', unl: 'm_bet', name: '背水',         line: '射程 +25%｜ライフ半分' },
  debt:       { sys: ['bet'],   g: '借', rar: 'epic', unl: 'm_bet', name: '借金',         line: 'コスト上限 +6｜置くたびライフ −1' },
  zero:       { sys: ['pos'],   g: '零', rar: 'rare', name: 'ゼロ距離',       line: '湧き口の近く ×2｜コアの近く ×0.5' },
  solo:       { sys: ['pos'],   g: '一', rar: 'epic', unl: 'm_solo', name: '一点豪華',    line: '威力・ヒット数 ×2｜置けるのは1種だけ' },
  free:       { sys: ['pos'],   g: '組', rar: 'rare', name: '組み替え自由',   line: 'ウェーブの合間も動かせる' },
  gacha:      { sys: ['greed'], g: '箱', rar: 'rare', unl: 'm_greed', name: 'ガチャ師',   line: '候補が5つ｜選ばなかった候補は消える' },
  blockade:   { sys: ['greed'], g: '封', rar: 'epic', unl: 'm_greed', name: '封鎖',       line: '口を1つ塞ぐ　MP +50%｜ほかの口は敵 +50%' },
  passer:     { sys: ['greed'], g: '見', rar: 'rare', unl: 'm_greed', name: '見送り上手', line: '見送るたび MP +15' },
  // 連携（前提の2つを持っているときだけ候補に出る）
  corridor:   { sys: ['adj', 'fuse'], g: '廊', rar: 'legendary', unl: 'm_link', need: ['backtoback', 'premonition'], name: '融合回廊', line: '合成武器を隣で2種と数える' },
  cascade:    { sys: ['hit'],         g: '鎖', rar: 'legendary', unl: 'm_link', need: ['shatter', 'breakparty'],     name: '連鎖崩壊', line: '爆ぜが次々につながる' },
  kamikaze:   { sys: ['bet'],         g: '捨', rar: 'legendary', unl: 'm_link', need: ['glass', 'backwater'],        name: '捨て身',   line: 'ライフが減るほど威力↑（最大 ×3）' },
  // 代償つき（第4章のボスを倒したとき）
  overclock:  { sys: ['boss'], g: '速', rar: 'legendary', unl: 'm_price', boss: true, name: 'オーバークロック', line: 'レート ×1.6｜コスト上限 −4' },
  nova:       { sys: ['boss'], g: '臨', rar: 'legendary', unl: 'm_price', boss: true, name: '臨界',             line: '威力 ×2｜敵の速さ +25%' },
  hive:       { sys: ['boss'], g: '群', rar: 'legendary', unl: 'm_price', boss: true, name: '群体',             line: 'コスト上限 +8｜隣の異種レートなし' },
};
const MOD_IDS = Object.keys(MODS);

// 進化（同じ系統を BAL.modRun.evoAt 取ったとき・1段上の効果）
const MOD_EVO = {
  adj:   { name: '隣接・進化',   line: '隣の異種のレートの増えが威力にも乗る' },
  fuse:  { name: '合成・進化',   line: '合成武器の威力 ×1.5' },
  hit:   { name: 'ヒット・進化', line: '敵のバリアが 30% から始まる' },
  bet:   { name: '賭け・進化',   line: '全武器の威力 ×1.5' },
  pos:   { name: '配置・進化',   line: '全武器の射程 +15%' },
  greed: { name: '欲張り・進化', line: 'この先の MP ×1.5' },
};

// 起動条件（ランごとに1つ。平常は改造ツリーの「起動条件を選ぶ」から）。条件つきは MP +25%（BAL.modRun.pts.cond）
const MOD_COND = {
  few:   { name: '少数精鋭', line: '使える武器は3種だけ' },
  fast:  { name: '早足',     line: '敵の速さ +20%' },
  lean:  { name: '薄給',     line: 'コスト上限 −3' },
  horde: { name: '大群',     line: '敵 +30%' },
  calm:  { name: '平常',     line: '条件なし' },
};
const MOD_COND_IDS = ['few', 'fast', 'lean', 'horde'];
// ?modlab：MOD 基地の入口を出す（ある程度完成するまでプレイヤーには出さない・2026-10-14 ユーザー）
const MODLAB = (() => { try { return /[?&]modlab\b/.test(String(location.search)); } catch (e) { return false; } })();

const ModRun = {
  // ---------- セーブ（perm.mod） ----------
  P(perm) {
    perm = perm || (typeof Game !== 'undefined' && Game.perm);
    if (!perm) return null;
    if (!perm.mod) perm.mod = { v: 1, pts: 0, earned: 0, tree: {}, run: null, rec: { runs: 0, wins: 0, best: 0, bossKills: 0 } };
    return perm.mod;
  },
  // 読み込みのとき（Game.load）：前の改造ラン（アセンション後のイベントモード）の記録を1回だけ捨てる
  migrate(perm) {
    if (!perm) return;
    if ('modrun' in perm || 'modrunRec' in perm) { delete perm.modrun; delete perm.modrunRec; }
  },
  state(perm) { const P = this.P(perm); return (P && P.run) || null; },
  open() { return MODLAB; },
  on(run, id) { const mr = run && run.mr; return !!(mr && mr.mods.indexOf(id) >= 0); },
  has(mr, id) { return !!(mr && mr.mods.indexOf(id) >= 0); },
  sysCount(mr, sys) {
    let n = 0;
    for (const id of mr.mods) if (MODS[id] && MODS[id].sys.indexOf(sys) >= 0) n++;
    return n;
  },
  evo(mr, sys) { return !!(mr && this.sysCount(mr, sys) >= BAL.modRun.evoAt); },
  M(id) { return BAL.modRun.m[id]; },
  rng(mr, salt) {
    let x = ((mr.seed >>> 0) ^ Math.imul(salt + 1, 0x9E3779B9)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); x = (x ^ (x >>> 16)) >>> 0;
    return MapGen.rng(x || 1);
  },

  // ---------- 改造ツリー（取り切り・MP） ----------
  //   grp：base＝ランの初期値・weapon＝武器の解放・mod＝改造が候補に出る・cond＝起動条件を選ぶ
  nodes() {
    const T = BAL.modRun.tree, out = [];
    const chain = (key, name, col, g, fmt) => T[key].forEach((n, i) => out.push({ id: key + (i + 1), grp: 'base', key, add: n.add, cost: n.cost, need: i ? key + i : null, name, col, g, line: fmt(n.add) }));
    chain('life', 'ライフ', '#ff5b8a', '命', a => 'ライフ +' + a);
    chain('cost', 'コスト', '#ffd24a', '枠', a => 'コスト上限 +' + a);
    chain('reroll', '引き直し', '#4ee0ff', '引', a => '引き直し +' + a);
    chain('heal', '修復', '#7ee3a0', '修', a => '突破ごとの回復 +' + a);
    for (const w of WEAPON_IDS) if (BAL.modRun.startWeapons.indexOf(w) < 0)
      out.push({ id: 'w_' + w, grp: 'weapon', w, name: WEAPONS[w].name, col: WEAPONS[w].color, line: 'コスト ' + WEAPONS[w].cost });
    const md = (id, sys, name, ids) => out.push({ id, grp: 'mod', cost: T.mods[id.slice(2)], name, col: MOD_SYS[sys].col, mods: ids,
      line: ids.map(x => MODS[x].name).join('・') });
    md('m_bet', 'bet', '賭け', ['glass', 'backwater', 'debt']);
    md('m_greed', 'greed', '欲張り', ['gacha', 'blockade', 'passer']);
    md('m_solo', 'pos', '一点豪華', ['solo']);
    md('m_link', 'adj', '連携', ['corridor', 'cascade', 'kamikaze']);
    md('m_price', 'boss', '代償', ['overclock', 'nova', 'hive']);
    out.push({ id: 'c_pick', grp: 'cond', cost: T.condPick, name: '条件選択', col: '#ff8a1f', g: '択', line: '起動条件を選んで出撃（平常も）' });
    return out;
  },
  node(id) { return this.nodes().find(n => n.id === id) || null; },
  owns(perm, id) { const P = this.P(perm); return !!(P && P.tree[id]); },
  weaponsOpen(perm) { return WEAPON_IDS.filter(w => BAL.modRun.startWeapons.indexOf(w) >= 0 || this.owns(perm, 'w_' + w)); },
  nodeCost(perm, n) {
    if (n.grp !== 'weapon') return n.cost;
    const T = BAL.modRun.tree.weapon, k = WEAPON_IDS.filter(w => this.owns(perm, 'w_' + w)).length;
    return T[Math.min(T.length - 1, k)];
  },
  // 取れるか：'' なら取れる。取れないときは理由
  canBuy(perm, id) {
    const P = this.P(perm), n = this.node(id);
    if (!n) return 'ない';
    if (P.tree[id]) return '取得済み';
    if (n.need && !P.tree[n.need]) return '前の節が先';
    if (P.pts < this.nodeCost(perm, n)) return 'MP が足りない';
    return '';
  },
  buy(perm, id) {
    if (this.canBuy(perm, id)) return false;
    const P = this.P(perm), n = this.node(id);
    P.pts -= this.nodeCost(perm, n);
    P.tree[id] = 1;
    return true;
  },
  treeSum(perm, key) { let t = 0; for (const n of this.nodes()) if (n.key === key && this.owns(perm, n.id)) t += n.add; return t; },
  // 次のランの初期値（改造ツリーから）
  base(perm) {
    const B = BAL.modRun;
    return { lives: B.lives + this.treeSum(perm, 'life'), cost: B.cost + this.treeSum(perm, 'cost'), rerolls: B.rerolls + this.treeSum(perm, 'reroll'),
      heal: B.healPerCh + this.treeSum(perm, 'heal'), weapons: this.weaponsOpen(perm) };
  },
  modOpen(perm, id) { const u = MODS[id].unl; return !u || this.owns(perm, u); },
  canPickCond(perm) { return this.owns(perm, 'c_pick'); },

  // ---------- 始める ----------
  //   cond … 起動条件（「起動条件を選ぶ」を取っているときだけ効く。無ければ種から）
  start(perm, seed, cond) {
    perm = perm || Game.perm;
    const P = this.P(perm), B = BAL.modRun, b = this.base(perm);
    seed = (seed === undefined ? (Math.random() * 0x7fffffff) : seed) >>> 0;
    const mr = { v: 2, seed, ch: 0, mods: [], banned: [], rerolls: b.rerolls, skips: 0, offer: null, status: 'chapter', hist: [], place: [],
      pts: 0, bossKills: 0, cap: b.cost, heal: b.heal, pool: MOD_IDS.filter(id => this.modOpen(perm, id)) };
    const r = this.rng(mr, 1);
    const rc = MOD_COND_IDS[(r() * MOD_COND_IDS.length) | 0];
    mr.cond = (cond && MOD_COND[cond] && this.canPickCond(perm)) ? cond : rc;
    let ws = b.weapons.slice();
    if (mr.cond === 'few' && ws.length > B.cond.few.n) {
      for (let i = ws.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [ws[i], ws[j]] = [ws[j], ws[i]]; }
      ws = ws.slice(0, B.cond.few.n).sort((a, c) => WEAPON_IDS.indexOf(a) - WEAPON_IDS.indexOf(c));
    }
    mr.weapons = ws;
    const used = {};
    mr.boards = [];
    for (let k = 0; k < B.chapters; k++) {
      const pool = B.boards[k < 2 ? 0 : k < 4 ? 1 : 2];
      let id = null;
      for (let t = 0; t < 40 && !id; t++) { const c = 'ch' + pool[(r() * pool.length) | 0]; if (!used[c]) id = c; }
      id = id || ('ch' + pool[pool.length - 1]);
      used[id] = 1; mr.boards.push(id);
    }
    mr.lives = b.lives; mr.livesMax = b.lives;
    P.run = mr;
    return mr;
  },

  // 出てくる敵の種類と耐性を決める本編の章（中身だけ借りる。強さは enemyHp・waveCount）＝ run.stageIdx
  diffIdx(mr, k) { const T = BAL.modRun.enemy.typeCh; k = (k === undefined ? mr.ch : k); return T[Math.min(T.length - 1, k)] - 1; },
  isBossCh(mr, k) { return BAL.modRun.bossAt.indexOf((k === undefined ? mr.ch : k) + 1) >= 0; },

  // ---------- 本体へのつなぎ（state.js・combat.js が呼ぶ） ----------
  // 本編のツリー・常駐を通さない、まっさらな mods（Skill.mods の形）
  neutralMods() {
    if (this._nm) return this._nm;
    const keep = Relic._cache;
    Relic._cache = null;
    try { Relic.mods({ collection: {} }); this._nm = Skill.mods({ coins: 0, skills: {} }, { collection: {} }); }
    finally { Relic._cache = keep; }
    return this._nm;
  },
  costCap(run) { return run.mr.cap + this.capAdd(run); },
  capAdd(run) {
    const mr = run && run.mr;
    if (!mr) return 0;
    const B = BAL.modRun;
    let n = 0;
    if (this.has(mr, 'debt')) n += B.m.debt.cap;
    if (this.has(mr, 'overclock')) n += B.m.overclock.cap;
    if (this.has(mr, 'hive')) n += B.m.hive.cap;
    if (mr.cond === 'lean') n += B.cond.lean.cap;
    return n;
  },
  adjBonus(run) {
    if (this.on(run, 'hive')) return 0;
    return this.on(run, 'backtoback') ? this.M('backtoback').adj : BAL.adjBonus;
  },
  adjMax(run) { return this.on(run, 'family') ? this.M('family').max : BAL.adjMax; },
  fuseExtra(run) { return this.on(run, 'premonition') ? 0 : BAL.fuseExtraCost; },
  fuseCost(run, fid) { const f = FUSIONS[fid]; return WEAPONS[f.a].cost + WEAPONS[f.b].cost + this.fuseExtra(run); },
  // 合成：元の2つがランで使えるときだけ（札は要らない）
  fuseOk(run, fid) { const f = FUSIONS[fid], ws = run.mr.weapons; return ws.indexOf(f.a) >= 0 && ws.indexOf(f.b) >= 0; },
  LOCK_WHY: 'ウェーブの合間は動かせない（改造「組み替え自由」で可）',
  canRearrange(run) {
    if (!run || !run.mr) return true;
    if (Game.phase !== 'battle' || run.wave === 0) return true;
    return this.on(run, 'free');
  },
  placeBlock(run, wid, c, r, ignore) {
    if (!run || !run.mr) return '';
    if (this.on(run, 'solo')) {
      const other = run.units.find(u => u !== ignore && u.id !== wid);
      if (other) return '一点豪華：置ける武器は ' + WEAPONS[other.id].name + ' だけ';
    }
    if (this.on(run, 'backtoback')) {
      const nb = MapGen.hexNbr(c, r);
      for (const o of run.units) {
        if (o === ignore || o.id !== wid) continue;
        if (nb.some(q => q[0] === o.c && q[1] === o.r)) return '背中合わせ：同じ武器は隣に置けない';
      }
    }
    return '';
  },
  onPlace(run, u) {
    if (!this.on(run, 'debt')) return;
    const d = this.M('debt').life;
    run.lives = Math.max(1, run.lives - d);
    run.mr.lives = Math.max(1, Math.min(run.mr.lives, run.lives));
    run.mrDebt = (run.mrDebt || 0) + d;
  },
  livesMax(run) {
    const mr = run.mr;
    let m = mr.livesMax;
    if (this.has(mr, 'backwater')) m = Math.max(1, Math.round(m * this.M('backwater').lives));
    return m;
  },
  applyUnits(run) {
    const mr = run.mr, B = BAL.modRun;
    let dmg = 1, rate = 1, range = 1;
    if (this.has(mr, 'glass')) dmg *= B.m.glass.dmg;
    if (this.has(mr, 'shatter')) dmg *= B.m.shatter.dmg;
    if (this.has(mr, 'solo')) dmg *= B.m.solo.dmg;
    if (this.has(mr, 'nova')) dmg *= B.m.nova.dmg;
    if (this.evo(mr, 'bet')) dmg *= B.evo.bet.dmg;
    if (this.has(mr, 'overclock')) rate *= B.m.overclock.rate;
    if (this.has(mr, 'backwater')) range *= B.m.backwater.range;
    if (this.evo(mr, 'pos')) range *= B.evo.pos.range;
    for (const u of run.units) {
      let d = dmg;
      if (this.has(mr, 'premonition') && !u.fuse) d *= B.m.premonition.plain;
      if (u.fuse && this.evo(mr, 'fuse')) d *= B.evo.fuse.dmg;
      u.s.dmg *= d; u.s.rate *= rate;
      if (u.s.range) u.s.range *= range;
    }
  },
  refreshPos(run) {
    const mr = run.mr, st = run.stage;
    const Z = this.M('zero');
    let sp = null;
    if (this.has(mr, 'zero')) sp = st.spawns.map(s => st.center(s.c, s.r));
    const fused = this.has(mr, 'inherit') ? run.units.filter(o => o.fuse && !o.broken) : [];
    for (const u of run.units) {
      let k = 1;
      if (sp) {
        const ds = Math.min(...sp.map(p => Math.hypot(p.x - u.x, p.y - u.y)));
        const dc = Math.min(...(run.towers || [run.tower]).map(T => Math.hypot(T.x - u.x, T.y - u.y)));
        if (ds <= Z.near) k *= Z.nearMul;
        else if (dc <= Z.core) k *= Z.coreMul;
      }
      if (this.evo(mr, 'adj')) k *= 1 + (u.adjAdd || 0) * BAL.modRun.evo.adj.dmg;
      const old = u.mrPos || 1;
      if (k !== old && u.s) u.s.dmg = u.s.dmg / old * k;
      u.mrPos = k;
      u.mrZone = sp ? (k >= Z.nearMul ? 1 : (k < 1 && !this.evo(mr, 'adj')) ? -1 : 0) : 0;
      u.mrSys = null;
      if (fused.length && !u.fuse) {
        const nb = MapGen.hexNbr(u.c, u.r);
        const own = WEAPONS[u.id].sys;
        const add = [];
        for (const f of fused) {
          if (f === u || !nb.some(q => q[0] === f.c && q[1] === f.r)) continue;
          const s2 = WEAPONS[FUSIONS[f.fuse].b].sys;
          if (s2 && s2 !== own && add.indexOf(s2) < 0) add.push(s2);
        }
        if (add.length) u.mrSys = [own].concat(add);
      }
    }
  },
  adjKinds(run, o) {
    if (o.fuse && this.on(run, 'corridor')) return [o.id, '+' + FUSIONS[o.fuse].b];
    return [o.id];
  },

  // ---- 敵（ランの章 k だけで決まる・BAL.modRun.enemy） ----
  hpBase(run) { const E = BAL.modRun.enemy; return E.hp0 * Math.pow(E.hpG, run.mr.ch) * Math.pow(E.waveG, Math.max(0, run.wave - 1)); },
  enemyHp(run, t) { return this.hpBase(run) * t.hp * (t.up ? BAL.modRun.enemy.upperHp : 1); },
  enemySpd(run, t) { const E = BAL.modRun.enemy; return E.spd0 * Math.pow(E.spdG, run.mr.ch) * t.spd * this.spdMul(run); },
  bossHp(run) { const E = BAL.modRun.enemy; return E.hp0 * Math.pow(E.hpG, run.mr.ch) * Math.pow(E.waveG, BAL.wavesPerStage - 1) * E.bossHp; },
  upperList(run) {
    const E = BAL.modRun.enemy, out = [];
    for (const k in E.upper) if (UPPER_TYPES[k] && run.mr.ch + 1 >= E.upper[k].from) out.push({ t: UPPER_TYPES[k], w: E.upper[k].w });
    return out;
  },
  upperShare(run) { const S = BAL.modRun.enemy.upperShare; return this.upperList(run).length ? (S[Math.min(S.length - 1, run.mr.ch)] || 0) : 0; },
  upperK(run) {
    let sw = 0, sk = 0;
    for (const o of this.upperList(run)) { sw += o.w; sk += o.w * o.t.hp * BAL.modRun.enemy.upperHp; }
    return sw > 0 ? Math.max(1, sk / sw) : 1;
  },
  pickUpper(run) {
    const s = this.upperShare(run);
    if (!(s > 0)) return null;
    const a = s / this.upperK(run), q = a / ((1 - s) + a);
    if (Math.random() >= q) return null;
    return Util.weighted(this.upperList(run), o => o.w).t;
  },
  waveCount(run) {
    const E = BAL.modRun.enemy, k = run.mr.ch;
    const mouths = Math.max(1, (run.stage.mouths && run.stage.mouths.length) || 1);
    const s = this.upperShare(run), um = s > 0 ? (1 - s) + s / this.upperK(run) : 1;
    const n = (E.count0 + E.countK * k + E.countW * run.wave) * (1 + (mouths - 1) * E.perHole) * um * this.countMul(run);
    return Math.max(1, Math.floor(n));
  },
  countMul(run) {
    const mr = run.mr, B = BAL.modRun;
    let m = 1;
    if (mr.cond === 'horde') m *= B.cond.horde.flow;
    if (this.has(mr, 'blockade')) {
      const M = Math.max(1, (run.stage.mouths || []).length);
      if (M > 1) m *= (M - 1) / M * B.m.blockade.flow;
    }
    return m;
  },
  blockedMouth(run) {
    if (!this.on(run, 'blockade')) return -1;
    const M = (run.stage.mouths || []).length;
    return M > 1 ? 0 : -1;
  },
  spdMul(run) {
    const mr = run.mr, B = BAL.modRun;
    let m = 1;
    if (mr.cond === 'fast') m *= B.cond.fast.spd;
    if (this.has(mr, 'nova')) m *= B.m.nova.spd;
    return m;
  },
  barrier0(run) { return this.evo(run.mr, 'hit') ? BAL.modRun.evo.hit.barrier : BAL.modRun.barrier0; },
  barrierStepMul(run, src) {
    let m = 1;
    if (this.on(run, 'shatter')) m *= this.M('shatter').step;
    if (this.on(run, 'solo') && src && src.def) m *= this.M('solo').hits;
    return m;
  },
  onBreak(run, e, chained) {
    if (!this.on(run, 'breakparty')) return;
    if (chained && !this.on(run, 'cascade')) return;
    const P = this.M('breakparty');
    run.mrBursts = (run.mrBursts || 0) + 1;
    if (chained) run.mrChain = (run.mrChain || 0) + 1;
    Combat.fx(run, { type: 'ring', x: e.x, y: e.y, r: P.r, color: MOD_SYS.hit.col, life: 0.35 });
    const near = Grid.query(e.x, e.y, P.r, []);
    const broke = [];
    for (const o of near) {
      if (o === e || o.dead || o.seg || Util.dist(e.x, e.y, o.x, o.y) > P.r + o.r) continue;
      if (o.barrier === undefined) o.barrier = this.barrier0(run);
      if (o.barrier <= 0) continue;
      o.barrier = Math.max(0, o.barrier - P.cut);
      if (o.barrier <= 0) broke.push(o);
    }
    for (const o of broke) this.onBreak(run, o, true);
  },
  hitMul(run) {
    if (!this.on(run, 'kamikaze')) return 1;
    const f = 1 - Math.max(0, run.lives) / Math.max(1, run.livesMax);
    return 1 + this.M('kamikaze').max * Util.clamp(f, 0, 1);
  },
  onLeak(run) {
    if (!this.on(run, 'glass') || run.mrGlassW === run.wave) return;
    run.mrGlassW = run.wave;
    const live = run.units.filter(u => !u.broken);
    const n = Math.floor(live.length * this.M('glass').off);
    let k = 0;
    for (let i = 0; i < live.length && k < n; i += 2) { live[i].jamT = 1e6; live[i].mrOff = true; k++; }
    for (let i = 1; i < live.length && k < n; i += 2) { live[i].jamT = 1e6; live[i].mrOff = true; k++; }
    run.mrGlassN = (run.mrGlassN || 0) + 1;
    if (typeof UI !== 'undefined' && UI.toastMsg) UI.toastMsg('ガラスの大砲：武器の半分が停止', MOD_SYS.bet.col, 'warn');
  },
  leakCost(run, e, cost) { return e.upper ? BAL.modRun.leakUpper : cost; },
  isBossWave(run) { return this.isBossCh(run.mr) && run.wave >= BAL.wavesPerStage; },

  // ---------- 3択 ----------
  pool(mr, boss) {
    const open = mr.pool || MOD_IDS;
    return open.filter(id => {
      const m = MODS[id];
      if (mr.mods.indexOf(id) >= 0 || mr.banned.indexOf(id) >= 0) return false;
      if (!!m.boss !== !!boss) return false;
      if (m.need && !m.need.every(x => mr.mods.indexOf(x) >= 0)) return false;
      return true;
    });
  },
  roll(mr, boss, salt) {
    const n = boss ? 3 : (this.has(mr, 'gacha') ? this.M('gacha').choices : BAL.modRun.choices);
    let p = this.pool(mr, boss);
    if (p.length < n && !boss) p = p.concat(mr.banned.filter(id => mr.mods.indexOf(id) < 0 && !MODS[id].boss && (!MODS[id].need || MODS[id].need.every(x => mr.mods.indexOf(x) >= 0))).slice(0, n - p.length));
    const r = this.rng(mr, 100 + mr.ch * 7 + (salt || 0));
    const out = [];
    const links = p.filter(id => MODS[id].need);
    if (links.length) out.push(links[(r() * links.length) | 0]);
    const rest = p.filter(id => out.indexOf(id) < 0);
    while (out.length < n && rest.length) out.push(rest.splice((r() * rest.length) | 0, 1)[0]);
    return out;
  },
  makeOffer(mr) {
    let boss = this.isBossCh(mr) && mr.ch + 1 < BAL.modRun.chapters;
    if (boss && !this.pool(mr, true).length) boss = false;   // 代償つきの改造を開けていなければ、ふつうの3択
    mr.offer = { ids: this.roll(mr, boss, mr.rerollN || 0), boss };
    mr.status = 'pick';
    return mr.offer;
  },
  take(mr, id) {
    if (!mr.offer || mr.offer.ids.indexOf(id) < 0) return null;
    const ev0 = Object.keys(MOD_SYS).filter(s => this.evo(mr, s));
    if (this.has(mr, 'gacha') && !mr.offer.boss) for (const o of mr.offer.ids) if (o !== id && mr.banned.indexOf(o) < 0) mr.banned.push(o);
    mr.mods.push(id);
    const evo = Object.keys(MOD_SYS).filter(s => this.evo(mr, s) && ev0.indexOf(s) < 0);
    if (id === 'backwater') mr.lives = Math.min(mr.lives, Math.max(1, Math.round(mr.livesMax * this.M('backwater').lives)));
    mr.hist.push({ ch: mr.ch + 1, took: id });
    this.advance(mr);
    return { id, evo };
  },
  skip(mr, perm) {
    if (!mr.offer) return 0;
    let got = 0;
    if (this.has(mr, 'passer')) { got = this.M('passer').pts; this.addPts(perm, mr, got, true); mr.skips++; }
    mr.hist.push({ ch: mr.ch + 1, took: null });
    this.advance(mr);
    return got;
  },
  reroll(mr) {
    if (!mr.offer || mr.rerolls <= 0) return false;
    mr.rerolls--;
    mr.rerollN = (mr.rerollN || 0) + 1;
    mr.offer.ids = this.roll(mr, mr.offer.boss, 50 + mr.rerollN * 31);
    return true;
  },
  advance(mr) {
    mr.offer = null;
    mr.ch++;
    mr.place = [];
    mr.status = 'chapter';
  },

  // ---------- MOD ポイント ----------
  //   条件つきのランは +25%・封鎖 +50%・欲張りの進化 ×1.5（flat＝見送り上手は倍にしない）
  ptsMul(mr) {
    const B = BAL.modRun;
    let m = 1 + (mr.cond && mr.cond !== 'calm' ? B.pts.cond : 0) + (this.has(mr, 'blockade') ? B.m.blockade.pts : 0);
    if (this.evo(mr, 'greed')) m *= B.evo.greed.pts;
    return m;
  },
  addPts(perm, mr, n, flat) {
    const v = Math.round(n * (flat ? 1 : this.ptsMul(mr)));
    if (!(v > 0)) return 0;
    const P = this.P(perm);
    P.pts += v; P.earned += v; mr.pts = (mr.pts || 0) + v;
    return v;
  },

  // ---------- 章の終わり ----------
  endChapter(run, ok) {
    const mr = run.mr, B = BAL.modRun, perm = Game.perm;
    const bk = run.bossKills || 0;
    const res = { mr: true, ok, ch: mr.ch + 1, boss: this.isBossCh(mr), kills: run.kills, leaked: run.leaked, lives: Math.max(0, Math.ceil(run.lives)), livesMax: run.livesMax, pts: 0 };
    mr.bossKills = (mr.bossKills || 0) + bk;
    if (bk) res.pts += this.addPts(perm, mr, bk * B.pts.boss);
    if (!ok) {
      mr.hist.push({ ch: mr.ch + 1, lost: true });
      res.end = this.finish(perm, false);
      return res;
    }
    mr.cleared = (mr.cleared || 0) + 1;
    res.pts += this.addPts(perm, mr, B.pts.ch[Math.min(B.pts.ch.length - 1, mr.ch)]);
    mr.lives = Math.min(this.livesMax(run), Math.max(1, Math.ceil(run.lives)) + (mr.heal || B.healPerCh));
    if (mr.ch + 1 >= B.chapters) { res.pts += this.addPts(perm, mr, B.pts.clear); res.end = this.finish(perm, true); return res; }
    res.offer = this.makeOffer(mr);
    return res;
  },
  finish(perm, won) {
    const P = this.P(perm), mr = P.run;
    if (!mr) return null;
    const rec = P.rec;
    rec.runs++; if (won) rec.wins++;
    rec.best = Math.max(rec.best, mr.cleared || 0);
    rec.bossKills += mr.bossKills || 0;
    const end = { won, cleared: mr.cleared || 0, pts: mr.pts || 0, mods: mr.mods.slice(), cond: mr.cond, hist: mr.hist.slice(), total: P.pts };
    P.run = null;
    return end;
  },
  abandon(perm) { return this.finish(perm || Game.perm, false); },

  // ---------- 交換所（MP → 本編の持ち物） ----------
  //   ふつうのパック（基本・兵装・化学・連携）／上位パック（アセンションを開いてから）／合成の札（持っていないものから1枚・アセンションを開いてから）
  shopItems(perm) {
    const S = BAL.modRun.shop, asc = typeof Asc !== 'undefined' && Asc.on(perm), out = [];
    for (const k of ['basic', 'arms', 'chem', 'syn']) out.push({ id: k, kind: 'pack', pack: k, price: S.pack });
    for (const k of UPACK_IDS) out.push({ id: k, kind: 'upack', pack: k, price: S.upack, lock: asc ? '' : 'アセンションから' });
    const left = FUSION_IDS.filter(f => !((perm.collection || {})['fus_' + f] > 0)).length;
    out.push({ id: 'fusion', kind: 'fusion', price: S.fusion, left, lock: !asc ? 'アセンションから' : left ? '' : '全部持っている' });
    return out;
  },
  shopBuy(perm, id, rnd) {
    const P = this.P(perm), it = this.shopItems(perm).find(x => x.id === id);
    if (!it || it.lock || P.pts < it.price) return null;
    let got;
    if (it.kind === 'fusion') {
      const left = FUSION_IDS.filter(f => !((perm.collection || {})['fus_' + f] > 0));
      const f = left[Math.floor((rnd || Math.random)() * left.length)];
      perm.collection['fus_' + f] = (perm.collection['fus_' + f] || 0) + 1;
      got = { fusion: f };
    } else {
      perm.packs[it.pack] = (perm.packs[it.pack] || 0) + 1;
      got = { pack: it.pack };
    }
    P.pts -= it.price;
    return got;
  },

  // ---------- 盤の上（render.js が呼ぶ） ----------
  drawBoard(ctx, run) {
    const bm = this.blockedMouth(run);
    if (bm < 0) return;
    const st = run.stage, m = st.mouths[bm];
    let x = 0, y = 0;
    for (const si of m) { const p = st.center(st.spawns[si].c, st.spawns[si].r); x += p.x; y += p.y; }
    x /= m.length; y /= m.length;
    const R = 26 + m.length * 6;
    ctx.save();
    ctx.strokeStyle = MOD_SYS.greed.col; ctx.lineWidth = 4; ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * R, y + Math.sin(a) * R); }
    ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - R * 0.55, y - R * 0.55); ctx.lineTo(x + R * 0.55, y + R * 0.55);
    ctx.moveTo(x + R * 0.55, y - R * 0.55); ctx.lineTo(x - R * 0.55, y + R * 0.55); ctx.stroke();
    ctx.restore();
  },
};
