// ---------------------------------------------------------------
// modrun.js : 改造ラン（MOD）―― アセンション後のイベントモード（2026-10-13 ユーザー「とりあえず作ってみて欲しい」）
//
//   ・カードは使わない。章のあとに「改造」を3択で1つ取って組む。8章・第4章と第8章にボス
//   ・合成の札を持っていなくても合成武器を使える（合成のやり方は本編と同じ・Fusion.usable）
//   ・報酬は上位パック（突破した章で数と質が上がる）。アセンションの経験値は付けない
//   ・入口はホーム（アセンションを解放してから）
//   ・ランの状態は perm.modrun（途中で閉じても続きから）。本編の run / meta・章の記録・配置は汚さない
//   ・改造ランの決まり：ウェーブの合間は「置き足す・合成する」だけ（動かす・外すは準備フェーズだけ）。組み替え自由で外れる
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

// 改造。sys＝系統（連携は2つ）・g＝絵の字・rar＝レア度（カードと同じ色）・line＝短い一行（挙動と必ず一致させる・「｜」の後ろは代償で赤く出す）
//   need＝連携の前提の2つ・boss＝ボスを倒したときだけ出る代償つき
const MODS = {
  backtoback: { sys: ['adj'],   g: '背', rar: 'rare', name: '背中合わせ',     line: '隣の異種 +30%／種｜同種は隣に置けない' },
  family:     { sys: ['adj'],   g: '族', rar: 'rare', name: '大家族',         line: '隣の種類の上限 3→6' },
  premonition:{ sys: ['fuse'],  g: '予', rar: 'rare', name: '合の予感',       line: '合成のコスト +2 なし｜素の武器は威力半分' },
  inherit:    { sys: ['fuse'],  g: '継', rar: 'rare', name: '継承',           line: '合成武器の隣も2系統になる' },
  shatter:    { sys: ['hit'],   g: '砕', rar: 'rare', name: '一撃必砕',       line: 'バリアの減り ×2｜威力半分' },
  breakparty: { sys: ['hit'],   g: '祝', rar: 'rare', name: 'ブレイク祝い',   line: 'バリア0で爆ぜ、周りのバリアを削る' },
  glass:      { sys: ['bet'],   g: '硝', rar: 'epic', name: 'ガラスの大砲',   line: '威力 ×3｜漏らすと武器の半分が停止' },
  backwater:  { sys: ['bet'],   g: '水', rar: 'epic', name: '背水',           line: '射程 +25%｜ライフ半分' },
  debt:       { sys: ['bet'],   g: '借', rar: 'epic', name: '借金',           line: 'コスト上限 +6｜置くたびライフ −1' },
  zero:       { sys: ['pos'],   g: '零', rar: 'rare', name: 'ゼロ距離',       line: '湧き口の近く ×2｜コアの近く ×0.5' },
  solo:       { sys: ['pos'],   g: '一', rar: 'epic', name: '一点豪華',       line: '威力・ヒット数 ×2｜置けるのは1種だけ' },
  free:       { sys: ['pos'],   g: '組', rar: 'rare', name: '組み替え自由',   line: 'ウェーブの合間も動かせる' },
  gacha:      { sys: ['greed'], g: '箱', rar: 'rare', name: 'ガチャ師',       line: '候補が5つ｜選ばなかった候補は消える' },
  blockade:   { sys: ['greed'], g: '封', rar: 'epic', name: '封鎖',           line: '口を1つ塞ぐ　報酬 +1／章｜ほかの口は敵 +50%' },
  passer:     { sys: ['greed'], g: '見', rar: 'rare', name: '見送り上手',     line: '見送るたび上位パック +1' },
  // 連携（前提の2つを持っているときだけ候補に出る）
  corridor:   { sys: ['adj', 'fuse'], g: '廊', rar: 'legendary', need: ['backtoback', 'premonition'], name: '融合回廊', line: '合成武器を隣で2種と数える' },
  cascade:    { sys: ['hit'],         g: '鎖', rar: 'legendary', need: ['shatter', 'breakparty'],     name: '連鎖崩壊', line: '爆ぜが次々につながる' },
  kamikaze:   { sys: ['bet'],         g: '捨', rar: 'legendary', need: ['glass', 'backwater'],        name: '捨て身',   line: 'ライフが減るほど威力↑（最大 ×3）' },
  // 代償つき（第4章のボスを倒したとき）
  overclock:  { sys: ['boss'], g: '速', rar: 'legendary', boss: true, name: 'オーバークロック', line: 'レート ×1.6｜コスト上限 −4' },
  nova:       { sys: ['boss'], g: '臨', rar: 'legendary', boss: true, name: '臨界',             line: '威力 ×2｜敵の速さ +25%' },
  hive:       { sys: ['boss'], g: '群', rar: 'legendary', boss: true, name: '群体',             line: 'コスト上限 +8｜隣の異種レートなし' },
};
const MOD_IDS = Object.keys(MODS);

// 進化（同じ系統を BAL.modRun.evoAt 取ったとき・1段上の効果）
const MOD_EVO = {
  adj:   { name: '隣接・進化',   line: '隣の異種のレートの増えが威力にも乗る' },
  fuse:  { name: '合成・進化',   line: '合成武器の威力 ×1.5' },
  hit:   { name: 'ヒット・進化', line: '敵のバリアが 80% から始まる' },
  bet:   { name: '賭け・進化',   line: '全武器の威力 ×1.5' },
  pos:   { name: '配置・進化',   line: '全武器の射程 +15%' },
  greed: { name: '欲張り・進化', line: 'ランの報酬 ×2' },
};

// 起動条件（ランごとに1つ）
const MOD_COND = {
  six:   { name: '六種',   line: '使える武器は6種だけ' },
  fast:  { name: '早足',   line: '敵の速さ +20%' },
  lean:  { name: '薄給',   line: 'コスト上限 −4' },
  horde: { name: '大群',   line: '敵 +30%　報酬 +2' },
};
const MOD_COND_IDS = Object.keys(MOD_COND);

const ModRun = {
  // ---------- 状態 ----------
  state(perm) { perm = perm || (typeof Game !== 'undefined' && Game.perm); return (perm && perm.modrun) || null; },
  open(perm) { return Asc.on(perm || Game.perm); },     // 入口はアセンションを解放してから
  // run（戦闘中の1章）が改造ランか。mods の判定は run.mr（ランの状態）を見る
  on(run, id) { const mr = run && run.mr; return !!(mr && mr.mods.indexOf(id) >= 0); },
  has(mr, id) { return !!(mr && mr.mods.indexOf(id) >= 0); },
  // 系統ごとに取った数（連携は前提の両方の系統に数える）
  sysCount(mr, sys) {
    let n = 0;
    for (const id of mr.mods) if (MODS[id] && MODS[id].sys.indexOf(sys) >= 0) n++;
    return n;
  },
  evo(mr, sys) { return !!(mr && this.sysCount(mr, sys) >= BAL.modRun.evoAt); },
  M(id) { return BAL.modRun.m[id]; },

  // 決まった種からの乱数（ランの種＋用途）
  rng(mr, salt) {
    let x = ((mr.seed >>> 0) ^ Math.imul(salt + 1, 0x9E3779B9)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); x = (x ^ (x >>> 16)) >>> 0;
    return MapGen.rng(x || 1);
  },

  // ---------- 始める ----------
  start(perm, seed) {
    perm = perm || Game.perm;
    const B = BAL.modRun;
    seed = (seed === undefined ? (Math.random() * 0x7fffffff) : seed) >>> 0;
    const mr = { v: 1, seed, ch: 0, mods: [], banned: [], rerolls: B.rerolls, skips: 0, offer: null, status: 'chapter', hist: [], place: [] };
    const r = this.rng(mr, 1);
    mr.cond = MOD_COND_IDS[(r() * MOD_COND_IDS.length) | 0];
    // 使える武器：持っている武器ぜんぶ（六種なら、そこから6種）
    let ws = WEAPON_IDS.filter(w => (perm.collection['wc_' + w] || 0) > 0);
    if (mr.cond === 'six' && ws.length > B.cond.six.n) {
      ws = ws.slice();
      for (let i = ws.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [ws[i], ws[j]] = [ws[j], ws[i]]; }
      ws = ws.slice(0, B.cond.six.n).sort((a, b) => WEAPON_IDS.indexOf(a) - WEAPON_IDS.indexOf(b));
    }
    mr.weapons = ws;
    // 盤：章ごとに BAL.modRun.boardTiers の範囲から、同じ盤を2度使わずに
    const used = {};
    mr.boards = [];
    for (let k = 0; k < B.chapters; k++) {
      const tier = B.boardTiers[k < 2 ? 0 : k < 5 ? 1 : 2];
      let id = null;
      for (let t = 0; t < 40 && !id; t++) { const c = 'ch' + (tier[0] + ((r() * (tier[1] - tier[0] + 1)) | 0)); if (!used[c] && B.boardSkip.indexOf(c) < 0) id = c; }
      id = id || ('ch' + tier[1]);
      used[id] = 1; mr.boards.push(id);
    }
    // 敵の強さの基準：到達した章（最低 第30章）。走り始めに固定する
    mr.base = Math.max(MAIN_CHAPTERS, Game.endlessReach(perm) - 1 + B.chOffset);
    mr.lives = B.lives; mr.livesMax = B.lives;
    perm.modrun = mr;
    return mr;
  },

  // 章 k（0から）の敵の強さ＝stageIdx
  diffIdx(mr, k) { return mr.base + Math.round((k === undefined ? mr.ch : k) * BAL.modRun.chStep); },
  isBossCh(mr, k) { return BAL.modRun.bossAt.indexOf((k === undefined ? mr.ch : k) + 1) >= 0; },

  // ---------- 本体へのつなぎ（state.js・combat.js が呼ぶ） ----------
  // コスト上限の増減
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
  // 隣り合う異種のレート：1種あたり／数える上限
  adjBonus(run) {
    if (this.on(run, 'hive')) return 0;
    return this.on(run, 'backtoback') ? this.M('backtoback').adj : BAL.adjBonus;
  },
  adjMax(run) { return this.on(run, 'family') ? this.M('family').max : BAL.adjMax; },
  // 合成のとき余分に払うコスト
  fuseExtra(run) { return this.on(run, 'premonition') ? 0 : BAL.fuseExtraCost; },
  fuseCost(run, fid) { const f = FUSIONS[fid]; return WEAPONS[f.a].cost + WEAPONS[f.b].cost + this.fuseExtra(run); },
  // 改造ランの決まり：ウェーブの合間は動かす・外すができない（組み替え自由で外れる）
  LOCK_WHY: 'ウェーブの合間は動かせない（改造「組み替え自由」で可）',
  canRearrange(run) {
    if (!run || !run.mr) return true;
    if (Game.phase !== 'battle' || run.wave === 0) return true;
    return this.on(run, 'free');
  },
  // その武器をそこに置けるか（置けないなら理由）。ignore＝動かしている本人
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
  // 置いたとき（借金）
  onPlace(run, u) {
    if (!this.on(run, 'debt')) return;
    const d = this.M('debt').life;
    run.lives = Math.max(1, run.lives - d);
    run.mr.lives = Math.max(1, Math.min(run.mr.lives, run.lives));
    run.mrDebt = (run.mrDebt || 0) + d;
  },
  // ライフの上限
  livesMax(run) {
    const mr = run.mr;
    let m = mr.livesMax;
    if (this.has(mr, 'backwater')) m = Math.max(1, Math.round(m * this.M('backwater').lives));
    return m;
  },
  // 置いてある武器の数値に掛ける（applyMods の組み直しのたび）
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
  // 位置で決まるもの（ゼロ距離・継承・隣接の進化）。置く・動かす・外す・組み直しのたびに（Game.updateAdj の最後）
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
      // 継承：隣の合成武器の B の系統も持つ（耐性・弱点の判定で2系統）
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
  // 隣の数え方で、合成武器を何種類ぶんにするか（融合回廊）。種類の名前の一覧を返す
  adjKinds(run, o) {
    if (o.fuse && this.on(run, 'corridor')) return [o.id, '+' + FUSIONS[o.fuse].b];
    return [o.id];
  },
  // 1ウェーブの敵の数に掛ける
  countMul(run) {
    const mr = run.mr, B = BAL.modRun;
    let m = B.countMul;
    if (mr.cond === 'horde') m *= B.cond.horde.flow;
    if (this.has(mr, 'blockade')) {
      const M = Math.max(1, (run.stage.mouths || []).length);
      if (M > 1) m *= (M - 1) / M * B.m.blockade.flow;
    }
    return m;
  },
  // 塞いでいる口（封鎖）。無ければ -1
  blockedMouth(run) {
    if (!this.on(run, 'blockade')) return -1;
    const M = (run.stage.mouths || []).length;
    return M > 1 ? 0 : -1;
  },
  // 敵の速さの倍
  spdMul(run) {
    const mr = run.mr, B = BAL.modRun;
    let m = 1;
    if (mr.cond === 'fast') m *= B.cond.fast.spd;
    if (this.has(mr, 'nova')) m *= B.m.nova.spd;
    return m;
  },
  // バリアの始まり・1発の減りの倍
  barrier0(run) { return this.evo(run.mr, 'hit') ? BAL.modRun.evo.hit.barrier : BAL.ascBarrier; },
  barrierStepMul(run, src) {
    let m = 1;
    if (this.on(run, 'shatter')) m *= this.M('shatter').step;
    if (this.on(run, 'solo') && src && src.def) m *= this.M('solo').hits;
    return m;
  },
  // バリアが0になった（ブレイク祝い・連鎖崩壊）
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
  // 当たった瞬間の倍率（捨て身：失ったライフの割合で）
  hitMul(run) {
    if (!this.on(run, 'kamikaze')) return 1;
    const f = 1 - Math.max(0, run.lives) / Math.max(1, run.livesMax);
    return 1 + this.M('kamikaze').max * Util.clamp(f, 0, 1);
  },
  // 漏れた（ガラスの大砲：そのウェーブのあいだ武器の半分が止まる）
  onLeak(run) {
    if (!this.on(run, 'glass') || run.mrGlassW === run.wave) return;
    run.mrGlassW = run.wave;
    const live = run.units.filter(u => !u.broken);
    const n = Math.floor(live.length * this.M('glass').off);
    // 置いた順の後ろ半分ではなく、1つおきに止める（偏らない）
    let k = 0;
    for (let i = 0; i < live.length && k < n; i += 2) { live[i].jamT = 1e6; live[i].mrOff = true; k++; }
    for (let i = 1; i < live.length && k < n; i += 2) { live[i].jamT = 1e6; live[i].mrOff = true; k++; }
    run.mrGlassN = (run.mrGlassN || 0) + 1;
    if (typeof UI !== 'undefined' && UI.toastMsg) UI.toastMsg('ガラスの大砲：武器の半分が停止', MOD_SYS.bet.col, 'warn');
  },
  // 漏れたときのライフ（上位の敵 leakUpper・縮小版のボス leakMini・雑魚はそのまま）
  leakCost(run, e, cost) {
    const B = BAL.modRun;
    if (e.mini) return B.leakMini;
    if (e.upper) return B.leakUpper;
    return cost;
  },
  isBossWave(run) { return this.isBossCh(run.mr) && run.wave >= BAL.wavesPerStage; },

  // ---------- 3択 ----------
  // 候補に出せる改造（取っていない・このランで消えていない・連携は前提がそろっている・代償はボスのあとだけ）
  pool(mr, boss) {
    return MOD_IDS.filter(id => {
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
    // ガチャ師で消した候補が多すぎて足りないときは、消した中から戻す（3択が空にならない）
    if (p.length < n && !boss) p = p.concat(mr.banned.filter(id => mr.mods.indexOf(id) < 0 && !MODS[id].boss && (!MODS[id].need || MODS[id].need.every(x => mr.mods.indexOf(x) >= 0))).slice(0, n - p.length));
    const r = this.rng(mr, 100 + mr.ch * 7 + (salt || 0));
    // 連携は出やすく（前提がそろった次の3択で必ず1枠）
    const out = [];
    const links = p.filter(id => MODS[id].need);
    if (links.length) out.push(links[(r() * links.length) | 0]);
    const rest = p.filter(id => out.indexOf(id) < 0);
    while (out.length < n && rest.length) out.push(rest.splice((r() * rest.length) | 0, 1)[0]);
    return out;
  },
  // 章を突破した直後に、次の3択を作る
  makeOffer(mr) {
    const boss = this.isBossCh(mr) && mr.ch + 1 < BAL.modRun.chapters;
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
    // 背水：取った瞬間に、いまのライフも上限に合わせる
    if (id === 'backwater') mr.lives = Math.min(mr.lives, Math.max(1, Math.round(mr.livesMax * this.M('backwater').lives)));
    mr.hist.push({ ch: mr.ch + 1, took: id });
    this.advance(mr);
    return { id, evo };
  },
  skip(mr) {
    if (!mr.offer) return 0;
    let got = 0;
    if (this.has(mr, 'passer')) { got = this.M('passer').packs; mr.skips += got; }
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

  // ---------- 章の終わり ----------
  //   Game.endRun から呼ばれる（本編の章の記録・報酬・経験値は通らない）。勝ち負けと、ランが終わったかを返す
  endChapter(run, ok) {
    const mr = run.mr, B = BAL.modRun;
    const res = { mr: true, ok, ch: mr.ch + 1, boss: this.isBossCh(mr), kills: run.kills, leaked: run.leaked, lives: Math.max(0, Math.ceil(run.lives)), livesMax: run.livesMax };
    if (!ok) {
      mr.hist.push({ ch: mr.ch + 1, lost: true });
      res.end = this.finish(Game.perm, false);
      return res;
    }
    mr.cleared = (mr.cleared || 0) + 1;
    mr.lives = Math.min(this.livesMax(run), Math.max(1, Math.ceil(run.lives)) + B.healPerCh);
    if (mr.ch + 1 >= B.chapters) { res.end = this.finish(Game.perm, true); return res; }
    res.offer = this.makeOffer(mr);
    return res;
  },
  // 報酬（突破した章の数から）。上位パックを直接もらう
  reward(mr) {
    const B = BAL.modRun, c = mr.cleared || 0;
    const out = {};
    const r = this.rng(mr, 777);
    let total = 0;
    for (let k = 0; k < c; k++) {
      let n = B.packs[k] || 1;
      if (this.has(mr, 'blockade')) n += B.m.blockade.packs;
      const kinds = B.packKinds[k < 3 ? 0 : k < 6 ? 1 : 2];
      for (let i = 0; i < n; i++) { const id = kinds[(r() * kinds.length) | 0]; out[id] = (out[id] || 0) + 1; total++; }
    }
    let extra = mr.skips || 0;
    if (mr.cond === 'horde' && c >= B.chapters) extra += B.cond.horde.packs;
    for (let i = 0; i < extra; i++) { const id = UPACK_IDS[(r() * UPACK_IDS.length) | 0]; out[id] = (out[id] || 0) + 1; }
    if (this.evo(mr, 'greed')) for (const k in out) out[k] *= B.evo.greed.packs;
    return out;
  },
  finish(perm, won) {
    const mr = perm.modrun;
    if (!mr) return null;
    const packs = this.reward(mr);
    for (const k in packs) perm.packs[k] = (perm.packs[k] || 0) + packs[k];
    const rec = perm.modrunRec || (perm.modrunRec = { runs: 0, wins: 0, best: 0 });
    rec.runs++; if (won) rec.wins++;
    rec.best = Math.max(rec.best, mr.cleared || 0);
    const end = { won, cleared: mr.cleared || 0, packs, mods: mr.mods.slice(), cond: mr.cond, hist: mr.hist.slice() };
    perm.modrun = null;
    return end;
  },
  // やめる（報酬は突破した章のぶん）
  abandon(perm) { return this.finish(perm || Game.perm, false); },

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

// ---------------------------------------------------------------
// 画面（ホームの入口・3択・章の終わり・ランの終わり・戦闘中の札）
//   3択はカードの3択の語彙（.draft・.chcard・.cf の枠）。系統の色を絵に、レア度の色を枠に。結果の画面は .rs の語彙
// ---------------------------------------------------------------
Object.assign(ModRun, {
  RAR_EN: { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGEND' },
  // 改造の札の顔（カードと同じ .cf の骨格）。o.mr＝系統の進み（点）を出すためのランの状態
  face(id, o) {
    o = o || {};
    const m = MODS[id], S = MOD_SYS[m.sys[0]], R = BAL.rarity[m.rar];
    const el = Util.el('div', 'cf mdf r-' + m.rar + (m.need ? ' mdlink' : '') + (m.boss ? ' mdboss' : ''));
    el.style.setProperty('--rc', R.color);
    el.style.setProperty('--ac', S.col);
    const mr = o.mr;
    const pips = m.sys.filter(s => s !== 'boss').map(s => {
      const n = mr ? this.sysCount(mr, s) : 0, nx = Math.min(BAL.modRun.evoAt, n + 1);
      let h = '<span class="mdpip" style="--pc:' + MOD_SYS[s].col + '">';
      for (let i = 0; i < BAL.modRun.evoAt; i++) h += '<i class="' + (i < n ? 'on' : (i < nx && !o.owned) ? 'nx' : '') + '"></i>';
      return h + '</span>';
    }).join('');
    el.innerHTML =
      '<div class="cf-frame">' +
        '<div class="cf-top"><span class="cf-name">' + m.name + '</span></div>' +
        '<div class="cf-art mdart"><div class="cf-icon">' + this.glyph(id) + '</div>' +
          '<div class="cf-kind">' + m.sys.map(s => MOD_SYS[s].jp).join('＋') + '</div>' +
          (m.need ? '<div class="cf-upr md-tag">LINK</div>' : m.boss ? '<div class="cf-upr md-tag">PRICE</div>' : '') + '</div>' +
        '<div class="cf-text">' + this.lineHtml(m.line) + '</div>' +
        '<div class="cf-bottom"><span class="cf-stars">' + pips + '</span></div>' +
      '</div><div class="cf-holo"></div><div class="cf-rar">' + this.RAR_EN[m.rar] + '</div>';
    return el;
  },
  lineHtml(t) { const p = t.split('｜'); return p[0] + (p[1] ? '<br><s class="mdcost">' + p[1] + '</s>' : ''); },
  lineText(t) { return t.replace('｜', '　'); },
  // 絵：系統の色の六角（連携は2色）に、改造の字
  glyph(id) {
    const m = MODS[id], c1 = MOD_SYS[m.sys[0]].col, c2 = m.sys[1] ? MOD_SYS[m.sys[1]].col : c1;
    const hx = (r) => { let p = ''; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; p += (50 + Math.cos(a) * r).toFixed(1) + ',' + (50 + Math.sin(a) * r).toFixed(1) + ' '; } return p; };
    const gid = 'mdg' + id;
    return '<svg class="mdsvg" viewBox="0 0 100 100"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
      '<polygon points="' + hx(44) + '" fill="none" stroke="url(#' + gid + ')" stroke-width="3" opacity=".9"/>' +
      '<polygon points="' + hx(36) + '" fill="url(#' + gid + ')" opacity=".16"/>' +
      '<polygon points="' + hx(36) + '" fill="none" stroke="url(#' + gid + ')" stroke-width="1.2" opacity=".6" stroke-dasharray="4 3"/>' +
      '<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="40" font-weight="900" fill="#fff" stroke="' + c1 + '" stroke-width="1.5" paint-order="stroke">' + m.g + '</text></svg>';
  },
  // 取った改造の小さな並び（3択の上・ハブ・結果）。進化した系統は EVO
  strip(mr) {
    const w = Util.el('div', 'mdstrip');
    if (!mr.mods.length) { w.innerHTML = '<span class="mdnone">改造なし</span>'; return w; }
    w.innerHTML = mr.mods.map(id => {
      const m = MODS[id];
      return '<span class="mdmini" style="--pc:' + MOD_SYS[m.sys[0]].col + '" title="' + m.name + '">' + m.g + '</span>';
    }).join('') + Object.keys(MOD_EVO).filter(s => this.evo(mr, s)).map(s =>
      '<span class="mdevo" style="--pc:' + MOD_SYS[s].col + '">' + MOD_SYS[s].jp + ' EVO</span>').join('');
    return w;
  },

  // ---------- ホームの入口 ----------
  homeButton() {
    const row = document.querySelector('.startrow');
    if (!row) return;
    let b = document.getElementById('homeMod');
    if (!this.open(Game.perm)) { if (b) b.style.display = 'none'; return; }
    if (!b) {
      b = Util.el('button', 'skipbtn modbtn');
      b.id = 'homeMod';
      b.addEventListener('click', () => { Snd.resume(); Snd.ui(); this.openHub(); });
      row.appendChild(b);
    }
    const mr = this.state();
    b.style.display = '';
    b.innerHTML = '改造ラン<u>' + (mr ? '第' + (mr.ch + 1) + '章から' : 'MOD RUN') + '</u>';
  },

  // ランの入口（始める・続ける・終える）
  openHub() {
    const mr = this.state();
    const body = Util.el('div', 'rs rs-clear mdhub');
    body.innerHTML = '<div class="rs-ban"><i class="rs-sweep"></i><em>// MOD RUN</em><b>MOD</b><span>改造ラン　' +
      (mr ? '第' + (mr.ch + 1) + '章 / ' + BAL.modRun.chapters : '全' + BAL.modRun.chapters + '章') + '</span></div>';
    const rules = Util.el('div', 'rs-line mdrules');
    rules.innerHTML = '<span>カード <b>なし</b></span><span>合成 <b>札なしで可</b></span><span>ボス <b>第' + BAL.modRun.bossAt.join('・') + '章</b></span><span>報酬 <b>上位パック</b></span>';
    body.appendChild(rules);
    if (mr) {
      body.appendChild(Util.el('div', 'rs-h', '起動条件'));
      body.appendChild(this.condEl(mr));
      body.appendChild(Util.el('div', 'rs-h', '改造'));
      body.appendChild(this.strip(mr));
      const ln = Util.el('div', 'rs-line');
      ln.innerHTML = '<span>ライフ <b>' + mr.lives + '/' + mr.livesMax + '</b></span><span>引き直し <b>' + mr.rerolls + '</b></span><span>突破 <b>' + (mr.cleared || 0) + '</b></span>';
      body.appendChild(ln);
    } else if (Game.perm.modrunRec) {
      const r = Game.perm.modrunRec, ln = Util.el('div', 'rs-line');
      ln.innerHTML = '<span>挑戦 <b>' + r.runs + '</b></span><span>踏破 <b>' + r.wins + '</b></span><span>最高 <b>第' + r.best + '章</b></span>';
      body.appendChild(ln);
    }
    const go = Util.el('button', 'rs-go');
    if (mr && mr.status === 'pick' && mr.offer) {
      go.innerHTML = '<span>続き</span><b>改造を選ぶ</b>' + Icons.get('play');
      go.addEventListener('click', () => { UI.closeModal(); this.showPick(); });
    } else {
      go.innerHTML = '<span>' + (mr ? '続ける' : '始める') + '</span><b>第' + ((mr ? mr.ch : 0) + 1) + '章</b>' + Icons.get('play');
      go.addEventListener('click', () => {
        if (!this.state()) this.start(Game.perm);
        Game.save();
        UI.closeModal();
        this.enter();
      });
    }
    body.appendChild(go);
    const subs = Util.el('div', 'rs-subs');
    const close = Util.el('button', 'rs-sub');
    close.innerHTML = Icons.get('close') + '閉じる';
    close.addEventListener('click', () => UI.closeModal());
    subs.appendChild(close);
    if (mr) {
      const quit = Util.el('button', 'rs-sub');
      quit.innerHTML = Icons.get('close') + '<span>終える（ここまでの報酬）</span>';
      quit.addEventListener('click', () => {
        if (quit.dataset.arm !== '1') { quit.dataset.arm = '1'; quit.lastChild.textContent = 'もう一度押すと終える'; return; }
        const end = this.abandon(Game.perm);
        Game.save();
        UI.closeModal();
        this.showEnd(end);
      });
      subs.appendChild(quit);
    }
    body.appendChild(subs);
    UI.openModal(body, false);
    UI.el.modal.classList.add('rsmodal');
    UI._rsFx(body, '#ffc24a', {});
  },
  condEl(mr) {
    const c = MOD_COND[mr.cond], d = Util.el('div', 'mdcond');
    d.innerHTML = '<b>' + c.name + '</b><span>' + c.line + '</span>' + (mr.cond === 'six' ? '<em>' + mr.weapons.map(w => '<i style="color:' + WEAPONS[w].color + '">' + WEAPONS[w].icon + '</i>').join('') + '</em>' : '');
    return d;
  },

  // ---------- 章に入る（準備フェーズ） ----------
  enter() {
    const mr = this.state();
    if (!mr) return;
    if (UI.closeBattleCfg) UI.closeBattleCfg();
    UI.setScreen('battle');
    Game.startPrep(mr.boards[mr.ch], mr);
    Snd.bgm('cafe');
    Render.fit();
    Game.paused = false;
    UI.placingType = null; UI.selected = null; UI.moving = null;
    UI.renderTray();
    Main.syncStartButton();
    setTimeout(() => Render.resize(), 0);
    const boss = this.isBossCh(mr);
    UI.cutin('改造 第' + (mr.ch + 1) + '章', (boss ? 'ボスの章　' : '') + MOD_COND[mr.cond].name + ' ─ ' + MOD_COND[mr.cond].line, boss ? 'boss' : 'prep');
  },

  // ---------- 章の終わり（Main.finish から） ----------
  afterChapter(res) {
    if (res.end) { this.showEnd(res.end); return; }
    this.showPick(res);
  },

  // 改造の3択（確認室の見本は demo＝{ mr, evo } を渡す。セーブは変えない）
  showPick(res, demo) {
    const mr = demo ? demo.mr : this.state();
    if (!mr || !mr.offer) return;
    const offer = mr.offer;
    if (!offer.ids.length && !demo) { this.skip(mr); Game.save(); this.enter(); return; }
    const body = Util.el('div', 'draft fx mdpick');
    const hot = offer.ids.map(id => BAL.rarity[MODS[id].rar]).filter(r => r.glow >= 2).sort((a, b) => b.glow - a.glow)[0];
    if (hot) body.style.setProperty('--rk', hot.color);
    const title = offer.boss ? '代償つきの改造' : '改造';
    const sub = demo ? '見本　選んでも何も変わりません' : (res ? '第' + res.ch + '章 突破　' : '') + '1つ選ぶ';
    body.appendChild(UI.choiceHead(title, sub, offer.boss ? '// BOSS DOWN　PRICE MOD' : '// MOD SELECT'));
    const top = Util.el('div', 'mdtop');
    top.appendChild(this.strip(mr));
    top.insertAdjacentHTML('beforeend', '<span class="mdlives">LIFE <b>' + mr.lives + '</b>/' + mr.livesMax + '</span>');
    body.appendChild(top);
    const row = Util.el('div', 'chrow' + (offer.ids.length > 3 ? ' md5' : ''));
    offer.ids.forEach((id, i) => {
      const m = MODS[id];
      const el = Util.el('button', 'chcard pick cfpick' + (BAL.rarity[m.rar].glow >= 2 ? ' hot' : ''));
      el.style.setProperty('--dl', (0.12 + i * 0.09).toFixed(2) + 's');
      const face = Util.el('div', 'ch-face g' + BAL.rarity[m.rar].glow);
      face.style.setProperty('--rc', BAL.rarity[m.rar].color);
      const front = Util.el('div', 'ch-front');
      front.appendChild(this.face(id, { mr }));
      const back = CardFX.back(m.rar); back.classList.add('ch-back');
      face.appendChild(front); face.appendChild(back);
      el.appendChild(face);
      el.insertAdjacentHTML('beforeend', '<div class="chtype" style="color:' + MOD_SYS[m.sys[0]].col + '">' + m.sys.map(s => MOD_SYS[s].en).join(' + ') + '</div>');
      el.addEventListener('click', () => {
        if (row.classList.contains('done')) return;
        row.classList.add('done'); el.classList.add('sel');
        const fr = face.getBoundingClientRect();
        CardFX.hexShock(UI.el.modal, fr.left + fr.width / 2, fr.top + fr.height / 2, MOD_SYS[m.sys[0]].col, true);
        Snd.ui();
        let tk = null;
        if (!demo) { tk = this.take(mr, id); Game.save(); }
        setTimeout(() => {
          UI.closeModal();
          if (demo) {
            UI.toastMsg('見本: ' + m.name, MOD_SYS[m.sys[0]].col, 'select');
            if (demo.evo) this.evoFx(demo.evo); else if (m.need) this.linkFx(id);
            return;
          }
          this.enter();
          const evo = tk && tk.evo;
          if (evo && evo.length) setTimeout(() => this.evoFx(evo[0]), 1700);
          else if (m.need) setTimeout(() => this.linkFx(id), 1700);
        }, 380);
      });
      row.appendChild(el);
    });
    body.appendChild(row);
    // 引き直し・見送る
    const act = Util.el('div', 'rs-subs mdact');
    const rr = Util.el('button', 'rs-sub');
    rr.innerHTML = Icons.get('cycle') + '引き直し ' + mr.rerolls;
    rr.disabled = mr.rerolls <= 0;
    rr.addEventListener('click', () => {
      if (row.classList.contains('done')) return;
      if (demo) { UI.toastMsg('見本：引き直し', '#ffc24a', 'demo'); return; }
      if (!this.reroll(mr)) return;
      Game.save(); Snd.ui();
      UI.closeModal(); this.showPick(res);
    });
    const sk = Util.el('button', 'rs-sub');
    const pass = this.has(mr, 'passer') ? this.M('passer').packs : 0;
    sk.innerHTML = Icons.get('close') + '<span>見送る' + (pass ? '　上位パック +' + pass : '') + '</span>';
    sk.addEventListener('click', () => {
      if (row.classList.contains('done')) return;
      if (demo) { UI.toastMsg('見本：見送り', '#ffc24a', 'demo'); return; }
      if (sk.dataset.arm !== '1' && !pass) { sk.dataset.arm = '1'; sk.lastChild.textContent = 'もう一度押すと見送る'; return; }
      const got = this.skip(mr);
      Game.save();
      UI.closeModal();
      if (got) UI.toastMsg('見送り　上位パック +' + got, MOD_SYS.greed.col, 'select');
      this.enter();
    });
    act.appendChild(rr); act.appendChild(sk);
    body.appendChild(act);
    UI.openModal(body, true);
    setTimeout(() => { body.querySelectorAll('.ch-back, .ch-sweep').forEach(x => x.remove()); }, 1200);
  },

  // 進化・連携の演出：結果画面の語彙（斜めに叩きつける帯・割れて落ちる字・六角の衝撃波）。色は系統の色
  evoFx(sys) {
    const E = MOD_EVO[sys];
    UI.cutin(E.name, E.line, 'evo', MOD_SYS[sys].col);
    if (Snd.stageClear) Snd.stageClear();
  },
  linkFx(id) {
    const m = MODS[id];
    UI.cutin(m.name, this.lineText(m.line), 'evo', MOD_SYS[m.sys[0]].col);
  },

  // ランの終わり（踏破・負け・やめた）
  showEnd(end) {
    if (!end) { Main.toHome(); return; }
    const body = Util.el('div', 'rs ' + (end.won ? 'rs-perfect' : end.cleared ? 'rs-clear' : 'rs-lose') + ' mdend');
    body.innerHTML = '<div class="rs-ban"><i class="rs-sweep"></i><em>' + (end.won ? '// MOD RUN COMPLETE' : '// MOD RUN TERMINATED') + '</em><b>' + (end.won ? 'COMPLETE' : 'END') + '</b>' +
      '<span>改造ラン　' + (end.won ? '全' + BAL.modRun.chapters + '章 踏破' : '第' + end.cleared + '章まで突破') + '</span></div>';
    const ln = Util.el('div', 'rs-line');
    ln.innerHTML = '<span>突破 <b>' + end.cleared + '/' + BAL.modRun.chapters + '</b></span><span>改造 <b>' + end.mods.length + '</b></span><span>条件 <b>' + MOD_COND[end.cond].name + '</b></span>';
    body.appendChild(ln);
    body.appendChild(this.strip({ mods: end.mods }));
    const rew = Util.el('div', 'rs-rew');
    for (const [k, v] of Object.entries(end.packs)) {
      const d = Util.el('div', 'rs-pack');
      d.innerHTML = CardFX.miniPack(PACKS[k]) + '<b>' + PACKS[k].name + '</b><em>×' + v + '</em>';
      rew.appendChild(d);
    }
    body.appendChild(Util.el('div', 'rs-h', rew.children.length ? '獲得' : '報酬なし'));
    if (rew.children.length) body.appendChild(rew);
    const go = Util.el('button', 'rs-go');
    go.innerHTML = '<span>戻る</span><b>ホーム</b>' + Icons.get('play');
    go.addEventListener('click', () => { UI.closeModal(); Main.toHome(); });
    body.appendChild(go);
    UI.openModal(body, true);
    UI.el.modal.classList.add('rsmodal');
    UI._rsFx(body, end.won ? '#ffe27a' : end.cleared ? '#ffc24a' : '#ff4a66', { perfect: end.won });
  },

  // ---------- 戦闘中の札（盤の右上：章と取った改造。押すと一覧） ----------
  hud(run) {
    let b = document.getElementById('mrBadge');
    const on = run && run.mr && document.body.classList.contains('on-battle');
    if (!on) { if (b) b.style.display = 'none'; return; }
    if (!b) {
      b = Util.el('button', 'mrbadge'); b.id = 'mrBadge';
      b.addEventListener('click', () => this.showList());
      (document.getElementById('stage') || document.body).appendChild(b);
    }
    const mr = run.mr, key = mr.ch + '|' + mr.mods.join(',');
    b.style.display = '';
    if (b.dataset.k === key) return;
    b.dataset.k = key;
    b.innerHTML = '<em>MOD ' + (mr.ch + 1) + '/' + BAL.modRun.chapters + '</em>' + mr.mods.map(id => '<i style="--pc:' + MOD_SYS[MODS[id].sys[0]].col + '">' + MODS[id].g + '</i>').join('');
  },
  showList() {
    const run = Game.run, mr = run && run.mr;
    if (!mr) return;
    const body = Util.el('div', 'draft mdlist');
    body.appendChild(UI.choiceHead('改造', '第' + (mr.ch + 1) + '章 / ' + BAL.modRun.chapters, '// MOD LIST'));
    body.appendChild(this.condEl(mr));
    const row = Util.el('div', 'mdgrid');
    for (const id of mr.mods) row.appendChild(this.face(id, { mr, owned: true }));
    if (!mr.mods.length) row.innerHTML = '<span class="mdnone">改造なし</span>';
    body.appendChild(row);
    const subs = Util.el('div', 'rs-subs');
    const close = Util.el('button', 'rs-sub');
    close.innerHTML = Icons.get('close') + '閉じる';
    close.addEventListener('click', () => UI.closeModal());
    subs.appendChild(close);
    body.appendChild(subs);
    Game.paused = true;
    UI.openModal(body, false);
  },

  // ---------- 確認室の見本（セーブは変えない） ----------
  demoMr(mods) {
    return { seed: 7, ch: 2, mods: mods || [], banned: [], rerolls: 2, skips: 0, lives: 24, livesMax: 30, cond: 'six', weapons: WEAPON_IDS.slice(0, 6), hist: [] };
  },
  demoPick() {
    const mr = this.demoMr(['glass', 'zero']);
    mr.offer = { ids: ['backtoback', 'premonition', 'shatter'], boss: false };
    this.showPick(null, { mr });
  },
  demoEvo() {
    const mr = this.demoMr(['shatter', 'breakparty']);
    mr.offer = { ids: ['cascade', 'glass', 'free'], boss: false };
    this.showPick(null, { mr, evo: 'hit' });
  },
  demoLink() {
    const mr = this.demoMr(['backtoback', 'premonition']);
    mr.offer = { ids: ['corridor', 'family', 'inherit'], boss: false };
    this.showPick(null, { mr });
  },
  demoBoss() {
    const mr = this.demoMr(['glass', 'backwater', 'zero', 'family']);
    mr.offer = { ids: ['overclock', 'nova', 'hive'], boss: true };
    this.showPick(null, { mr });
  },
  demoGacha() {
    const mr = this.demoMr(['gacha']);
    mr.offer = { ids: ['backtoback', 'family', 'premonition', 'debt', 'zero'], boss: false };
    this.showPick(null, { mr });
  },
  demoEnd(won) {
    this.showEnd({ won, cleared: won ? 8 : 5, packs: won ? { u_arms: 4, u_syn: 3, u_relic: 2, u_chem: 3 } : { u_basic: 2, u_arms: 3 }, mods: ['glass', 'backwater', 'kamikaze', 'zero', 'overclock'], cond: 'fast' });
  },
});
