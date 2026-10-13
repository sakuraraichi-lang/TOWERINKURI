// 確認室の連携の札の見本（debugroom.js の _flBuild・FLD）で、**その札の効果が約7秒のうちに実際に起きるか**を数える（2026-10-13）。
//   SIM_EXTRA=src/debugroom.js node tools/simnode.js --file tools/measure/fusion-cardlayout.js
//   札ごとに、同じ盤・同じ並びで、乱数を変えて REPS 回。数えるのは「その札があるから起きること」（札なしの回と並べて、札ありのほうが増えるものだけ）
//   出力：札ごとの [札なし, 札あり] の合計、札ありで 0 だった回数（zero）。zero が 0 でないものは、見本の7秒で見えないことがある
REAL_MS = 600000;
const REPS = 4, SECS = 7, ONLY = '';
function board(ch) {
  Game.newSave(); seedRng(3); unlockTo(ch);
  Game.perm.deepest = 40; Game.perm.legacyDeep = 40; Game.perm.prestiges = 2; Relic.invalidate();
  Game.perm.loadout = ['wc_gatling'];
  Game.perm.placements = {}; Game.perm.lastPlace = {};
  return Game.startPrep(ch);
}
const Cn = {};
const inc = (k, n) => { Cn[k] = (Cn[k] || 0) + (n === undefined ? 1 : n); };
function wrap(obj, name, f) { const o = obj[name]; obj[name] = function (...a) { const r = o.apply(this, a); f(a, r); return r; }; }
wrap(Combat, 'explode', (a) => { inc('explode:' + (a[5] && a[5].color)); inc('explodeR:' + Math.round(a[3])); });
wrap(Combat, 'lineHit', (a) => { inc('lineHit:' + (a[6] && a[6].color)); if (a[5] === BAL.fusion.plasmachain.p.linkHalf * BAL.fusionCards.fl_spark.thick) inc('hotLine'); });
wrap(Combat, 'spawnField', (a) => inc('field:' + (a[3] && a[3].kind)));
wrap(Combat, 'fx', (a) => { if (a[1] && a[1].type === 'tentacle') inc('tentacleFx'); });
wrap(Fusion, 'chainFrom', (a) => { inc('chain:' + (a[6] && a[6].color)); });
wrap(Fusion, 'starBubbles', () => inc('sbBub'));
wrap(Fusion, 'starsFromBubble', (a, r) => { if (r) inc('sbStar'); });
wrap(Fusion, 'prismReflect', (a, r) => inc('prismRefl', r || 0));
wrap(Fusion, 'prismStorm', (a, r) => inc('prismStorm', r || 0));
wrap(Fusion, 'sparkPop', (a) => { if (a[2]) inc('sparkTouch'); });
wrap(Fusion, 'sparkJump', (a, r) => { if (r) inc('sparkJump'); });
wrap(Fusion, 'combust', (a, r) => inc('combust'));
wrap(Fusion, 'mark', () => inc('mark'));

// 札ごとに「その札で起きたこと」の数え方
const M = {
  fl_mark: C => C.mark || 0,
  fl_rift: C => C.tentacleFx || 0,
  fl_shatter: C => C['explodeR:56'] || 0,
  fl_arc: C => (C['chain:#e6d0ff'] || 0),
  fl_boom: C => C['explode:#ffd84a'] || 0,
  fl_bolt: C => (C['chain:#fff0b0'] || 0) + (C['lineHit:#b58bff'] || 0),
  fl_trail: C => C['field:fire'] || 0,
  fl_acid: C => C['explode:#ffd24a'] || 0,
  fl_starbub: C => (C.sbBub || 0) + (C.sbStar || 0),
  fl_prism: C => (C.prismRefl || 0) + (C.prismStorm || 0),
  fl_spark: C => (C.sparkTouch || 0) + (C.sparkJump || 0),
};
function once(id, withCard, seed) {
  const run = board('ch20');
  const c = CARDS[id];
  // 札は _flBuild が掛ける（applyCardRun／applyCardUnit）。札なしの回は、掛けた効果を外すために flags を空にして applyMods 相当を省く
  seedRng(seed);
  const d = DebugRoom._flBuild(id);
  if (!withCard) { for (const u of d.units) u.flags = {}; }
  for (const k of Object.keys(Cn)) delete Cn[k];
  for (let i = 0; i < SECS * 60; i++) Combat.update(run, 1 / 60);
  const res = Object.assign({}, Cn);
  res.marked = d.enemies.some(e => e.fmarkT > 0) ? 1 : 0;
  DebugRoom._cdState = d; DebugRoom._cdEnd();
  return res;
}
const out = {}, only = ONLY;
for (const id of Object.keys(M)) {
  if (only && !only.split(',').includes(id)) continue;
  let off = 0, on = 0, zero = 0; const each = [], det = {};
  for (let k = 0; k < REPS; k++) {
    const r1 = once(id, true, 300 + k), a = M[id](once(id, false, 300 + k)), b = M[id](r1);
    for (const q of ['sparkTouch', 'sparkJump', 'hotLine', 'sbBub', 'sbStar', 'prismRefl', 'prismStorm', 'combust']) if (r1[q]) det[q] = (det[q] || 0) + r1[q];
    off += a; on += b; each.push(b); if (b === 0) zero++;
  }
  out[id] = { off, on, zero, each, det };
}
out
