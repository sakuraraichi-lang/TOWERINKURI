// 合成武器の火力の「実戦に近い」測定（2026-10-13・fusion-dps.js の動かない的の測定の対）
//   node tools/simnode.js --file tools/measure/fusion-real.js
//   バリアは既定で切る（REAL_BARRIER=1 で本物）。1基だけだとバリアは剥がれず、ダメージがヒット数の累乗で決まって倍率が 0.5〜340倍に散ったため（バリアありの数字は報告に残す）。ヒット数は別に出す
//   先頭に REAL_SEEDS=[1,2,3,4,5,6]; REAL_ONLY=['carpet']; REAL_WAVE=5; REAL_ASC=1; を付けると変えられる。
//
//   第31章の本物のウェーブ（動く敵・レーン・上位の敵・アセンションのバリア）を、1基だけ置いて迎え撃つ。
//   条件（全武器で同じ）：
//     ・敵は倒れない（HP を 1e300 にする。maxHp は第31章のまま）。倒せる強さだと与ダメージが敵の総HPで頭打ちになり、倍率が 0.5〜20 に潰れた／散った（バリア切り・HPそのままの試行）
//     ・盤は第31章（アセンションのレベル REAL_ASC・既定1）。置き場所は fusion-dps.js と同じ基準（道に乗る六角と向き）
//     ・札なし・ライフは実質無限（漏れても続ける）。ウェーブ REAL_WAVE（既定5）を頭から湧かせ、全員が倒れるか漏れるかするまで（上限 REAL_CAP 秒）
//     ・指定攻撃の武器の着弾点は、fusion-dps.js と同じ（長方形の中心）
//     ・合成武器は Game.placeFusedUnit で置く
//   出力：武器ごとの dealt / hits（Combat.damage で実際に入ったダメージの回数）、合成ごとに ratio＝合成 ÷（元A＋元B）・target・band（目標の1.0〜2.0倍に入っているか）
REAL_MS = 600000;
const SEEDS = (typeof REAL_SEEDS !== 'undefined') ? REAL_SEEDS : [1, 2, 3, 4];
const ONLY = (typeof REAL_ONLY !== 'undefined') ? REAL_ONLY : null;
const WAVE = (typeof REAL_WAVE !== 'undefined') ? REAL_WAVE : 5;
const ASCLV = (typeof REAL_ASC !== 'undefined') ? REAL_ASC : 1;
const CAP = (typeof REAL_CAP !== 'undefined') ? REAL_CAP : 150, DT = 1 / 60;
const CH = 'ch31';
const BARRIER = (typeof REAL_BARRIER !== 'undefined') ? REAL_BARRIER : 0;   // 0＝アセンションのバリアなし（既定）／1＝本物のバリア（100%カット・当たるたびに下がる）
const BAR0 = BAL.ascBarrier; BAL.ascBarrier = BARRIER; BAL_PRISTINE.ascBarrier = BARRIER;
const DIST0 = 40, DIST1 = 320, DSTEP = 20, WSTEP = 30, HALFW = 60;

function board() {
  Game.newSave(); ensureStages(32); unlockTo(CH);
  Game.perm.deepest = 40; Game.perm.legacyDeep = 40; Game.perm.prestiges = 2;
  Game.perm.asc = { lv: ASCLV, exp: 0, total: 0 }; Relic.invalidate();
  Game.perm.loadout = Object.keys(WEAPONS).map(w => 'wc_' + w);
  for (const w of Object.keys(WEAPONS)) Game.grant('wc_' + w, 1);
  Game.perm.placements = {}; Game.perm.lastPlace = {};
  const run = Game.startPrep(CH);
  Game.costCap = () => 200;
  return run;
}

// 置き場所と向き：何も置かずに同じウェーブ（シード1）を流し、敵の通った位置を 1/6 秒ごとに記録する。
//   六角と向きの候補ごとに、前方の長方形（距離 40〜320px・幅 ±60px）に入った記録の数（砲から壁なしで見通せるものだけ）を数え、いちばん多い所を選ぶ。
//   砲の首振りの扇（±0.4rad・距離 20〜200px）が壁に邪魔されない所だけ。コアに近すぎる所は除く。全武器で同じ六角・同じ向き
function exposure() {
  seedRng(1);
  const run = board();
  Game.applyMods(); Game.beginBattle();
  run.livesMax = run.lives = 1e9;
  run.enemies = []; run.wave = WAVE; Combat.startWave(run);
  const pts = [];
  for (let t = 0; t < CAP / DT; t++) {
    const sig = Combat.update(run, DT);
    if (t % 10 === 0) for (const e of run.enemies) if (!e.dead) pts.push([e.x, e.y]);
    if (sig === 'dead' || sig === 'stageclear' || sig === 'waveclear') break;
  }
  return { pts, run };
}
function spot(run, pts) {
  const st = run.stage;
  let best = null;
  const walk = (x, y) => x > 0 && y > 0 && x < st.w && y < st.h && st.walkable((x / TILE) | 0, (y / TILE) | 0);
  for (const h of st.hexCells()) {
    if (!Game.canPlaceAt(h.c, h.r)) continue;
    const p = st.hexCenter(h.c, h.r);
    if ((run.towers || []).some(T => Math.hypot(p.x - T.x, p.y - T.y) <= T.r + 10 + 120)) continue;   // コアの近く
    for (const a of Game.FACES) {
      const ca = Math.cos(a), sa = Math.sin(a);
      let fn = 0, fok = 0;
      for (let da = -0.4; da <= 0.4001; da += 0.1) for (let d = 20; d <= 200; d += 15) {
        fn++; if (walk(p.x + Math.cos(a + da) * d, p.y + Math.sin(a + da) * d)) fok++;
      }
      if (fok / fn < 0.9) continue;
      let n = 0;
      for (const q of pts) {
        const dx = q[0] - p.x, dy = q[1] - p.y;
        const d = dx * ca + dy * sa, w = -dx * sa + dy * ca;
        if (d < DIST0 || d > DIST1 || w < -HALFW || w > HALFW) continue;
        if (!Combat.losBlocked(st, p.x, p.y, q[0], q[1])) n++;
      }
      if (!best || n > best.n) best = { n, fan: fok / fn, c: h.c, r: h.r, x: p.x, y: p.y, a };
    }
  }
  return best;
}

const HIT = { hits: 0 };
{
  const orig = Combat.damage;
  Combat.damage = function (run, e, amount, opts) {
    const d0 = run.dealt, dead0 = e.dead;
    const r = orig.apply(this, arguments);
    if (!dead0 && amount > 0 && run.dealt > d0) HIT.hits++;
    return r;
  };
}

function trial(sp, wid, fid, seed) {
  seedRng(seed);
  const run = board();
  Game.perm.placements = {};
  const u = fid ? Game.placeFusedUnit(fid, sp.c, sp.r) : Game.placeUnit(wid, sp.c, sp.r);
  if (!u) throw new Error('置けない ' + (fid || wid));
  u.face = u.angle = sp.a;
  const ca = Math.cos(sp.a), sa = Math.sin(sp.a);
  if (Game.usesAimPoint(u.def)) {
    const dm = (DIST0 + DIST1) / 2;
    Game.setAimPoint(u, sp.x + ca * dm, sp.y + sa * dm);
  }
  Game.applyMods();
  Game.beginBattle();
  run.livesMax = run.lives = 1e9;
  run.enemies = []; run.wave = WAVE; Combat.startWave(run);
  HIT.hits = 0;
  const d0 = run.dealt;
  let sig = null, t = 0;
  while (t < CAP / DT) {
    sig = Combat.update(run, DT); t++;
    for (const e of run.enemies) if (!e._inv) { e._inv = 1; e.hp = 1e300; }   // 倒れない（湧いた次のフレームから）。動き・耐性・割合ダメージの大きさ（maxHp）は本物のまま
    if (sig === 'dead' || sig === 'stageclear' || sig === 'waveclear') break;
  }
  const out = { dealt: run.dealt - d0, hits: HIT.hits, sec: t * DT, kills: run.kills, leaked: run.leaked, end: sig || 'cap' };
  run.units = []; run.enemies = []; run.fzones && (run.fzones.length = 0); run.later && (run.later.length = 0);
  return out;
}

const ex = exposure();
const sp = spot(ex.run, ex.pts);
const FIDS = ONLY ? FUSION_IDS.filter(f => ONLY.includes(f)) : FUSION_IDS;
const wids = ONLY ? Object.keys(WEAPONS).filter(w => FIDS.some(f => FUSIONS[f].a === w || FUSIONS[f].b === w)) : Object.keys(WEAPONS);
const plain = {}, fused = {};
for (const w of wids) plain[w] = SEEDS.map(sd => trial(sp, w, null, sd));
for (const fid of FIDS) fused[fid] = SEEDS.map(sd => trial(sp, FUSIONS[fid].a, fid, sd));
unseedRng();
BAL.ascBarrier = BAR0; BAL_PRISTINE.ascBarrier = BAR0;

const mean = (l, k) => l.reduce((a, o) => a + o[k], 0) / l.length;
const spread = (l, k) => { const m = mean(l, k); return m > 0 ? (Math.max(...l.map(o => o[k])) - Math.min(...l.map(o => o[k]))) / m : 0; };
const r2 = (x) => Math.round(x * 100) / 100;
const P = {}, F = {};
for (const w of wids) P[w] = { cost: WEAPONS[w].cost, dealt: Math.round(mean(plain[w], 'dealt')), hits: Math.round(mean(plain[w], 'hits')), spread: r2(spread(plain[w], 'dealt') * 100) + '%', secs: r2(mean(plain[w], 'sec')), ends: plain[w].map(o => o.end).join(',') };
let inBand = 0;
for (const fid of FIDS) {
  const f = FUSIONS[fid], cost = f.cost;
  const dA = P[f.a].dealt, dB = P[f.b].dealt, dC = Math.round(mean(fused[fid], 'dealt'));
  const ratio = dC / Math.max(1, dA + dB), target = 3 + (cost - 4) / 3;
  const band = ratio >= target && ratio <= target * 2;
  if (band) inBand++;
  F[fid] = { ab: f.a + '+' + f.b, cost, dealt: dC, hits: Math.round(mean(fused[fid], 'hits')), ratio: r2(ratio), target: r2(target), xTarget: r2(ratio / target), band, perSeedRatio: fused[fid].map((o, i) => r2(o.dealt / Math.max(1, plain[f.a][i].dealt + plain[f.b][i].dealt))), spread: r2(spread(fused[fid], 'dealt') * 100) + '%', secs: r2(mean(fused[fid], 'sec')) };
}
({ spot: { c: sp.c, r: sp.r, a: Math.round(sp.a * 180 / Math.PI), samples: sp.n, of: ex.pts.length }, seeds: SEEDS, wave: WAVE, asc: ASCLV, plain: P, fused: F, inBand: inBand + '/' + FIDS.length })
