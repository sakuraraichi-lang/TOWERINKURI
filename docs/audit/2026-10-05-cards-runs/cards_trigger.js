// 新しい挙動の札が、戦闘の中で本当に発動するか（回数を数える）。単独・第25章・D22・1本ずつ
REAL_MS = 600000;
const results = [];
const D = Combat.damage, CD = Combat.coneDamage, SI = Combat.spotImpact, SF = Combat.spawnField, FX = Combat.fx, UP = Combat.update, SPF = Combat.spreadFlame;

function trial(name, W, pre, hook) {
  const c = { n: 0, n2: 0, extra: null };
  const st = { c };
  Combat.damage = function (run, e, amount, opts) {
    hook.damage && hook.damage(c, run, e, amount, opts || {}, this);
    return D.apply(this, arguments);
  };
  Combat.coneDamage = function (w, run, angle) { hook.cone && hook.cone(c, w, angle); return CD.apply(this, arguments); };
  Combat.spotImpact = function (w, run, x, y, hops, mul) { hook.impact && hook.impact(c, w, hops, mul); return SI.apply(this, arguments); };
  Combat.spawnField = function (run, x, y, o) { hook.field && hook.field(c, o, this._src); return SF.apply(this, arguments); };
  Combat.fx = function (run, o) { hook.fx && hook.fx(c, o); return FX.apply(this, arguments); };
  Combat.update = function (run, dt) { hook.update && hook.update(c, run); return UP.apply(this, arguments); };
  try {
    Game.newSave(); seedRng(1);
    const r = runStage('ch25', [W], 60, { coins: 1e12, deep: { prestiges: 2, deepest: 22 }, lives: 1e6, noDraft: true, preCards: pre });
    results.push({ name, leaked: r.leaked, n: c.n, n2: c.n2, extra: c.extra, run: hook.after ? hook.after(Game.run) : null });
  } finally {
    Combat.damage = D; Combat.coneDamage = CD; Combat.spotImpact = SI; Combat.spawnField = SF; Combat.fx = FX; Combat.update = UP;
    unseedRng();
  }
}

trial('曳光弾 gat_barrels：装甲の削れた敵への命中', 'gatling', { gat_barrels: 2 },
  { damage: (c, run, e, a, o) => { if (e.armor > 0 && e.armorT > 0 && e.armorDown > 0) c.n++; else if (e.armor > 0) c.n2++; } });
trial('掃射 gat_loose：首振りの速さ', 'gatling', { gat_loose: 1 },
  { update: (c, run) => { const u = run.units[0]; if (u && u.dyn.sweepMul) { c.n = 1; c.extra = u.dyn.sweepMul; } } });
trial('粘着燃料 flm_wide：燃え移り', 'flame', { flm_wide: 2 },
  { fx: (c, o) => { if (o.type === 'spark' && o.color === '#ff8a3a' && o.life === 0.16) c.n++; } });
trial('青い炎 flm_inferno：耐火の敵への命中（半減されない）', 'flame', { flm_inferno: 1 },
  { damage: (c, run, e, a, o, self) => { if (e.res && e.res.fire) c.n++; } });
trial('腐蝕の雲 gas_toxic：装甲の削れた敵への命中', 'gas', { gas_toxic: 2 },
  { damage: (c, run, e, a, o) => { if (e.armor > 0 && e.armorT > 0 && e.armorDown >= 0.5) c.n++; else if (e.armor > 0) c.n2++; } });
trial('重い霧 gas_fog：雲が流れた距離（最大・px）', 'gas', { gas_fog: 1 },
  { update: (c, run) => { for (const f of run.fields) { if (!f.flow) continue; if (f.x0 === undefined) { f.x0 = f.x; f.y0 = f.y; } const d = Math.hypot(f.x - f.x0, f.y - f.y0); if (d > (c.extra || 0)) c.extra = +d.toFixed(1); c.n = 1; } } });
trial('氷の棺 cry_permafrost：周りを凍らせた回数', 'cryo', { cry_permafrost: 1 },
  { damage: (c, run, e, a, o) => { if (a === 0 && o.by === 'cryo' && o.chill) c.n++; } });
trial('砕氷 cry_shatter：run.chillVuln', 'cryo', { cry_shatter: 2 },
  { after: (run) => run.chillVuln, damage: (c, run, e) => { if (e.chill > 0 && run.chillVuln > 0) c.n++; } });
trial('返し刃 ktn_swallow：逆向きの斬撃', 'katana', { ktn_swallow: 2 },
  { cone: (c, w, a) => { if (Math.abs(((a - w.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI) < 1e-6) c.n++; } });
trial('追尾刃 shk_sweep：旗', 'shuriken', { shk_sweep: 1 },
  { update: (c, run) => { const u = run.units[0]; if (u && u.flags.seekHigh) c.n = 1; } });
trial('影分身 shu_sakura：分身の弾（同時に飛んでいる最大数）', 'shuriken', { shu_sakura: 1 },
  { update: (c, run) => { let n = 0; for (const b of run.bullets) if (b.child && b.wid === 'shuriken') n++; if (n > c.n) c.n = n; } });
trial('弾む泡 bbl_bounce：跳ねた泡の着弾', 'bubble', { bbl_bounce: 2 },
  { impact: (c, w, hops, mul) => { if (mul < 1) c.n++; else c.n2++; } });
trial('泡の檻 bbl_sea：閉じ込めた敵への命中', 'bubble', { bbl_sea: 1 },
  { damage: (c, run, e, a, o) => { if (e.stun > 0 && run.cageVuln > 0) c.n++; } });
trial('徹甲榴弾 mtr_wide：装甲の敵への命中', 'mortar', { mtr_wide: 1 },
  { damage: (c, run, e, a, o, self) => { if (e.armor > 0 && self._src && self._src.dyn.apen) c.n++; } });
trial('焼夷弾 mtr_barrage：火の海', 'mortar', { mtr_barrage: 1 },
  { field: (c, o) => { if (o.kind === 'fire') c.n++; } });
trial('装甲貫通 gen_ap：装甲の敵への命中', 'gatling', { gen_ap: 2 },
  { after: (run) => run.apen === undefined ? 'なし' : run.apen, damage: (c, run, e) => { if (e.armor > 0 && run.apen > 0) c.n++; } });
results
