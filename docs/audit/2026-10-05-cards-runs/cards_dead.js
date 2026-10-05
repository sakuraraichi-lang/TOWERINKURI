// 札を1枚ずつ掛けて、値（武器の s・flags・dyn と、ラン側の値）が変わるかを見る。変わらない札＝何も起きない札
//   node tools/simnode.js --file cards_dead.js
Game.newSave();
const mk = () => {
  const units = WEAPON_IDS.map(W => ({ id: W, def: WEAPONS[W], s: Object.assign({}, WEAPONS[W].base), flags: {}, dyn: { heat: 0 }, n: 1 }));
  const run = { units, wp: (w) => units.find(u => u.id === w) || null, unitsOf: (w) => units.filter(u => u.id === w),
    livesMax: 10, lives: 10, coinMul: 1, chillVuln: 0, backdraft: 0, cardLog: [] };
  return run;
};
const snap = (run) => JSON.stringify({ u: run.units.map(u => [u.s, u.flags, u.dyn]),
  r: [run.livesMax, run.lives, run.coinMul, run.chillVuln, run.backdraft, run.grabBurn, run.apen, run.cageVuln, run.resonanceStep, run.resonanceMax] });
const out = { dead: [], same: [], ok: 0 };
for (const id of CARD_IDS) {
  const c = CARDS[id];
  if (!c.apply || c.kind === 'weapon' || c.kind === 'perm' || c.kind === 'key') continue;
  const run = mk();
  const a = snap(run);
  Game.applyCard(id, run);
  const b = snap(run);
  if (a === b) out.dead.push(id + ' ' + c.name);
  else out.ok++;
}
out
