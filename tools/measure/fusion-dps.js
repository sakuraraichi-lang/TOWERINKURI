// 合成武器の火力の測定（2026-10-13・基準は docs/FUSION-ART-DIRECTION-2026-10-12.md「性能」の節）
//   node tools/simnode.js --file tools/measure/fusion-dps.js
//
//   12種の元の武器と24種の合成武器を、1基ずつ同じ条件で撃たせ、1基が与えたダメージの合計とヒット数を測る。
//   条件（全武器で同じ）：
//     ・盤は第20章。置き場所は、前方の長方形（距離 40〜320px・幅 ±60px）と砲の首振りの扇が壁に邪魔されない（道に乗る）六角と向き。全武器で同じ六角・同じ向き
//     ・的は動かない硬い敵（HP は 1e300 で倒れない。最大HPだけは第20章・ウェーブ5の普通の敵のもの＝感電・閉じ込めの割合ダメージが本番と同じ大きさ）
//       を、前方の長方形に格子で並べる（距離 20px 刻み×幅 30px 刻み＝75体・全武器で同じ並び）
//     ・札なし・耐性なし・無効なし・アセンションのバリアなし（第30章以下の普通の敵）。撃たせるのは 20 秒（1/60 秒刻み）
//     ・指定攻撃の武器（迫撃砲・ミサイル・泡など）の着弾点は、長方形の中心（射程の外なら射程いっぱい）
//     ・合成武器は Game.placeFusedUnit で置く
//   ヒット数＝敵に当たってダメージが入った（run.dealt が増えた）damage の回数（アセンションのバリアは damage の1回ごとに下がる）。
//   hitsDirect＝そのうち、燃焼・感電・閉じ込め・毒のスリップ（毎フレーム当たる状態異常の継続）を除いたもの
//   出力：武器ごとの dealt / hits / hitsDirect、合成ごとに ratio＝合成 ÷（元A＋元B）・target＝3＋(コスト−4)÷3・reached
//   シードは SEEDS の本数。ふれ幅（シード間の最大の差/平均）も出す
REAL_MS = 600000;
const SEEDS = (typeof DPS_SEEDS !== 'undefined') ? DPS_SEEDS : [1, 2];   // 先頭に DPS_SEEDS=[1,2,3,4,5,6]; を付けて回すと本数を増やせる
const SECS = 20, DT = 1 / 60;
const CH = 'ch20';
const DIST0 = 40, DIST1 = 320, DSTEP = 20, WSTEP = 30, HALFW = 60;

function board() {
  Game.newSave(); unlockTo(CH);
  Game.perm.deepest = 40; Game.perm.legacyDeep = 40; Game.perm.prestiges = 2; Relic.invalidate();
  Game.perm.loadout = Object.keys(WEAPONS).map(w => 'wc_' + w);
  for (const w of Object.keys(WEAPONS)) Game.grant('wc_' + w, 1);
  Game.perm.placements = {}; Game.perm.lastPlace = {};
  const run = Game.startPrep(CH);
  Game.costCap = () => 200;
  return run;
}

// 置き場所と向き：前方の長方形（的の格子）と、砲の首振りの扇（±0.4rad・距離 20〜200px）が壁に邪魔されない六角と向き。
//   点数＝（長方形の歩ける割合）×（砲から的の格子の各点へ壁なしで見通せる割合）×（扇の歩ける割合）。同点は先に見つけたほう（盤の六角の並び順で固定）
//   コアに近すぎて的が漏れる（消える）所は除く。壁沿いの六角に置くので、前が壁だと弾が壁に砕けて当たらない（ガトリングが 10 秒で 0 ヒットだった）
function spot(run) {
  const st = run.stage;
  let best = null;
  const walk = (x, y) => x > 0 && y > 0 && x < st.w && y < st.h && st.walkable((x / TILE) | 0, (y / TILE) | 0);
  for (const h of st.hexCells()) {
    if (!Game.canPlaceAt(h.c, h.r)) continue;
    const p = st.hexCenter(h.c, h.r);
    for (const a of Game.FACES) {
      const ca = Math.cos(a), sa = Math.sin(a);
      let n = 0, ok = 0, los = 0, ln = 0, nearCore = false;
      for (let d = DIST0; d <= DIST1; d += 16) for (let w = -HALFW; w <= HALFW; w += 16) {
        const x = p.x + ca * d - sa * w, y = p.y + sa * d + ca * w;
        n++; if (walk(x, y)) ok++;
      }
      for (let d = DIST0; d <= DIST1; d += DSTEP) for (let w = -HALFW; w <= HALFW; w += WSTEP) {
        const x = p.x + ca * d - sa * w, y = p.y + sa * d + ca * w;
        ln++; if (!Combat.losBlocked(st, p.x, p.y, x, y)) los++;
        if ((run.towers || []).some(T => Math.hypot(x - T.x, y - T.y) <= T.r + 10 + 40)) nearCore = true;   // コアの近くの的は漏れて消える
      }
      let fn = 0, fok = 0;
      for (let da = -0.4; da <= 0.4001; da += 0.1) for (let d = 20; d <= 200; d += 15) {
        fn++; if (walk(p.x + Math.cos(a + da) * d, p.y + Math.sin(a + da) * d)) fok++;
      }
      if (nearCore) continue;
      const f = (ok / n) * (los / ln) * (fok / fn);
      if (!best || f > best.f + 1e-9) best = { f, walk: ok / n, los: los / ln, fan: fok / fn, c: h.c, r: h.r, x: p.x, y: p.y, a };
    }
  }
  return best;
}

const HIT = { hits: 0, direct: 0 };
{
  const orig = Combat.damage;
  Combat.damage = function (run, e, amount, opts) {
    const d0 = run.dealt, dead0 = e.dead;
    const r = orig.apply(this, arguments);
    if (!dead0 && amount > 0 && run.dealt > d0) { HIT.hits++; if (!(opts && opts.statusTick)) HIT.direct++; }
    return r;
  };
}

// 1基を置いて SECS 秒撃たせる。fid が null なら元の武器 wid、あれば合成武器 fid（A は FUSIONS[fid].a）
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
  const g = globalWave(run.stageIdx, 5), t = ENEMY_TYPES.grunt;
  const enemies = [];
  for (let d = DIST0; d <= DIST1; d += DSTEP) for (let w = -HALFW; w <= HALFW; w += WSTEP) {
    const en = Combat.makeEnemy(run, t, g, sp.x + ca * d - sa * w, sp.y + sa * d + ca * w, 0);
    en.hp = 1e300;                      // 倒れない（与ダメージは 1e19 台）。maxHp は普通の敵のまま（割合ダメージが本番の大きさ）
    en.spd = 0; en.lane = null; en.res = {}; en.armor = 0; en.regen = 0; en.split = 0; en.nest = 0;
    run.enemies.push(en); enemies.push(en);
  }
  const n0 = run.enemies.length;
  HIT.hits = 0; HIT.direct = 0;
  for (let i = 0; i < SECS / DT; i++) {
    Combat.update(run, DT);
    if (run.enemies.length !== n0 && run.enemies.some(e => !enemies.includes(e))) throw new Error('的以外の敵が湧いた');
  }
  const out = { dealt: run.dealt, hits: HIT.hits, direct: HIT.direct, aliveEnemies: enemies.filter(e => !e.dead).length, n: enemies.length };
  run.units = []; run.enemies = []; run.fzones && (run.fzones.length = 0); run.later && (run.later.length = 0);
  return out;
}

const spBoard = board();
const sp = spot(spBoard);
const wids = Object.keys(WEAPONS);
const plain = {}, fused = {};
for (const w of wids) plain[w] = SEEDS.map(sd => trial(sp, w, null, sd));
for (const fid of FUSION_IDS) fused[fid] = SEEDS.map(sd => trial(sp, FUSIONS[fid].a, fid, sd));
unseedRng();

const mean = (l, k) => l.reduce((a, o) => a + o[k], 0) / l.length;
const spread = (l, k) => { const m = mean(l, k); return m > 0 ? (Math.max(...l.map(o => o[k])) - Math.min(...l.map(o => o[k]))) / m : 0; };
const r1 = (x) => Math.round(x * 10) / 10;
const P = {}, F = {};
for (const w of wids) P[w] = { cost: WEAPONS[w].cost, dealt: Math.round(mean(plain[w], 'dealt')), hits: Math.round(mean(plain[w], 'hits')), hitsDirect: Math.round(mean(plain[w], 'direct')), spread: r1(spread(plain[w], 'dealt') * 100) + '%', perSeed: plain[w].map(o => Math.round(o.dealt)), dead: plain[w].map(o => o.n - o.aliveEnemies) };
let reachedN = 0, maxSpread = 0;
for (const fid of FUSION_IDS) {
  const f = FUSIONS[fid], cost = f.cost;
  const dA = P[f.a].dealt, dB = P[f.b].dealt;
  const dC = Math.round(mean(fused[fid], 'dealt'));
  const ratio = dC / Math.max(1, dA + dB), target = 3 + (cost - 4) / 3;
  const perSeedRatio = fused[fid].map((o, i) => o.dealt / Math.max(1, plain[f.a][i].dealt + plain[f.b][i].dealt));
  const reached = ratio >= target;
  if (reached) reachedN++;
  maxSpread = Math.max(maxSpread, spread(fused[fid], 'dealt'));
  F[fid] = { ab: f.a + '+' + f.b, cost, dealt: dC, hits: Math.round(mean(fused[fid], 'hits')), hitsDirect: Math.round(mean(fused[fid], 'direct')), ratio: r1(ratio * 100) / 100, target: r1(target * 100) / 100, reached, perSeedRatio: perSeedRatio.map(x => r1(x * 100) / 100), perSeed: fused[fid].map(o => Math.round(o.dealt)), spread: r1(spread(fused[fid], 'dealt') * 100) + '%', dead: fused[fid].map(o => o.n - o.aliveEnemies) };
}
for (const w of wids) maxSpread = Math.max(maxSpread, spread(plain[w], 'dealt'));
const noisy = [...wids.filter(w => spread(plain[w], 'dealt') >= 0.25).map(w => w + ' ' + r1(spread(plain[w], 'dealt') * 100) + '%'), ...FUSION_IDS.filter(f => spread(fused[f], 'dealt') >= 0.25).map(f => f + ' ' + r1(spread(fused[f], 'dealt') * 100) + '%')];   // シード間のふれが 25% 以上のもの
({ noisy, spot: { c: sp.c, r: sp.r, a: Math.round(sp.a * 180 / Math.PI), score: r1(sp.f * 100) + '%', walkable: r1(sp.walk * 100) + '%', los: r1(sp.los * 100) + '%', fan: r1(sp.fan * 100) + '%' }, seeds: SEEDS, secs: SECS, plain: P, fused: F, reached: reachedN + '/' + FUSION_IDS.length, maxSpread: r1(maxSpread * 100) + '%' })
