// ---------------------------------------------------------------
// fusion.js : 合成武器（2026-10-06・企画書 docs/FUSION-ORDER-2026-10-06.md・一覧 docs/FUSION-LIST-DRAFT-2026-10-06.md）
//
//   A＋B＝C。**C は A として扱う**：盤の上のユニットは `u.id`＝A のまま、`u.fuse`＝合成の id を持つ。
//   だから A の札が乗り、A の15基の上限に数え、A の系統（sys）で上位の敵の無効を判定し、A のカテゴリのツリーの強化が乗る。
//   B の札は乗らない（B は消える）。盤の上で A と B が隣り合っていて、その合成の札を持っているとき、
//   合成ボタンが A の左上に光る（render の fuseBtns）。押すと A の場所に C ができ、B は消える。
//   **コストは A＋B＋BAL.fuseExtraCost（2）。例外なし。**重い合成ほど性能を盛る（BAL.fusion の dmg など）。
//
//   数値は全部 BAL.fusion[id]（stat＝A の基礎性能に上書きする値／p＝その合成だけの値）。ここに数値は書かない。
//   絵（砲塔・攻撃の演出）は fusionfx.js。
// ---------------------------------------------------------------
'use strict';

const _fq = [];

const Fusion = {
  cost(fid) { const f = FUSIONS[fid]; return WEAPONS[f.a].cost + WEAPONS[f.b].cost + BAL.fuseExtraCost; },
  p(w) { return BAL.fusion[w.fuse].p; },
  cardId(fid) { return 'fus_' + fid; },
  owned(fid) { return typeof Game !== 'undefined' && Game.own(Fusion.cardId(fid)) > 0; },

  // ---------- 遅れて起きること・居座る場（ともに Combat.update が毎フレーム進める） ----------
  //   発射したユニット（_by・_src）を覚えておき、実行するときに戻す（Combat.damage が武器の種類と1基を読む）
  as(by, src, fn) {
    const b0 = Combat._by, s0 = Combat._src;
    Combat._by = by; Combat._src = src;
    try { fn(); } finally { Combat._by = b0; Combat._src = s0; }
  },
  later(run, sec, fn) { (run.later || (run.later = [])).push({ t: sec, fn, by: Combat._by, src: Combat._src }); },

  // 場。o: { kind, shape:'circle'|'rect'|'arc', x, y, a, r, hw, hh, arc, dur, tick, dps, slow, slowDur, chill, stun, shock, burn, burnDur,
  //          vuln, armorDown, drift:{x,y}, pulse:{every, fn(run,z)}, color, w }
  zone(run, o) {
    const zs = run.fzones || (run.fzones = []);
    if (zs.length >= BAL.fusionZoneMax) zs.shift();
    zs.push(Object.assign({ t: 0, tk: 0, pk: 0, tick: 0.25, shape: 'circle' }, o, { by: Combat._by, src: Combat._src }));
  },

  tick(run, dt) {
    const L = run.later;
    if (L && L.length) {
      for (let i = L.length - 1; i >= 0; i--) {
        const q = L[i];
        q.t -= dt;
        if (q.t <= 0) { L.splice(i, 1); this.as(q.by, q.src, () => q.fn()); }
      }
    }
    const zs = run.fzones;
    if (!zs || !zs.length) return;
    for (let i = zs.length - 1; i >= 0; i--) {
      const z = zs[i];
      z.t += dt;
      if (z.t >= z.dur) { zs.splice(i, 1); if (z.onEnd) this.as(z.by, z.src, () => z.onEnd(run, z)); continue; }
      if (z.drift) { z.x += z.drift.x * dt; z.y += z.drift.y * dt; }
      z.tk += dt;
      if (z.tk >= z.tick) { const step = z.tk; z.tk = 0; this.as(z.by, z.src, () => this.zoneHit(run, z, step)); }
      if (z.pulse) {
        z.pk += dt;
        if (z.pk >= z.pulse.every) { z.pk = 0; this.as(z.by, z.src, () => z.pulse.fn(run, z)); }
      }
    }
  },

  inZone(z, e) {
    const dx = e.x - z.x, dy = e.y - z.y;
    if (z.shape === 'rect') {
      const c = Math.cos(z.a), s = Math.sin(z.a);
      const u = dx * c + dy * s, v = -dx * s + dy * c;
      return Math.abs(u) <= z.hw + e.r * 0.5 && Math.abs(v) <= z.hh + e.r * 0.5;
    }
    if (z.shape === 'arc') {
      if (Math.abs(Math.hypot(dx, dy) - z.r) > z.hh + e.r) return false;
      let da = Math.atan2(dy, dx) - z.a;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      return Math.abs(da) <= z.arc;
    }
    return Math.hypot(dx, dy) <= z.r + e.r;
  },
  zoneBound(z) {
    return (z.shape === 'rect' ? Math.hypot(z.hw, z.hh) : z.shape === 'arc' ? z.r + z.hh : z.r) + 30;
  },
  zoneHit(run, z, step) {
    const near = Grid.query(z.x, z.y, this.zoneBound(z), _fq);
    const sys = Combat.sysOf(z.by);
    for (const e of near) {
      if (e.dead || !this.inZone(z, e)) continue;
      if (Combat.inShield(run, e)) continue;
      if (e.upper && Combat.immune(e, sys)) { e.immT = 0.2; continue; }
      if (z.vuln) { e.fvuln = z.vuln; e.fvulnT = 0.4; }
      if (z.armorDown) { e.armorDown = (e.armorT > 0) ? Math.max(e.armorDown, z.armorDown) : z.armorDown; e.armorT = 0.6; }
      // 中心へ引き寄せる（狂気の海底）：ボスは動かさない・壁の中へは入れない・止める効果と同じ合計の上限（BAL.ccMaxSec）で打ち止め
      if (z.pull && !e.boss && (e.ccUsed || 0) < BAL.ccMaxSec) {
        const d = Math.hypot(z.x - e.x, z.y - e.y);
        if (d > 5) {
          const k = Math.min(d, z.pull * step * Combat.ccK(e)) / d, nx = e.x + (z.x - e.x) * k, ny = e.y + (z.y - e.y) * k;
          if (run.stage.walkable((nx / TILE) | 0, (ny / TILE) | 0)) { e.x = nx; e.y = ny; }
        }
      }
      // 細かく掴む（航海の悪夢）：触手の掴みと同じ決まり（上位の敵の無効・重量・合計の上限）で、掴む時間は短く何度も掛け直す
      if (z.grabT && !(e.upper && Combat.immune(e, 'grab')) && (e.ccUsed || 0) < BAL.ccMaxSec) {
        const hv = ((e.res && e.res.heavy) ? BAL.resMul : 1) * Combat.ccK(e);
        e.grabT = Math.max(e.grabT, z.grabT * Combat.statusScale(e) * hv);
        e.grabV = z.grabV * hv;
      }
      Combat.damage(run, e, (z.dps || 0) * step, {
        dot: true, color: z.dcolor || z.color, by: z.by, src: z.src,
        slow: z.slow || 0, slowDur: z.slowDur || 0.7, chill: !!z.chill, stun: z.stun || 0, shock: z.shock || 0,
        burn: z.burn || 0, burnDur: z.burnDur || 0,
      });
    }
  },

  // ---------- 道具 ----------
  enemiesIn(x, y, r) {
    const out = [];
    for (const e of Grid.query(x, y, r + 24, _fq)) if (!e.dead && Util.dist(x, y, e.x, e.y) <= r + e.r) out.push(e);
    return out;
  },
  coneEnemies(w, angle, arc, range) {
    const out = [];
    for (const e of Grid.query(w.x, w.y, range + 24, _fq)) {
      if (e.dead || Util.dist(w.x, w.y, e.x, e.y) > range + e.r) continue;
      let da = Util.angle(w.x, w.y, e.x, e.y) - angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) <= arc) out.push(e);
    }
    return out;
  },
  rectEnemies(cx, cy, a, hw, hh) {
    const out = [], c = Math.cos(a), s = Math.sin(a);
    for (const e of Grid.query(cx, cy, Math.hypot(hw, hh) + 24, _fq)) {
      if (e.dead) continue;
      const dx = e.x - cx, dy = e.y - cy;
      if (Math.abs(dx * c + dy * s) <= hw + e.r * 0.5 && Math.abs(-dx * s + dy * c) <= hh + e.r * 0.5) out.push(e);
    }
    return out;
  },
  nearestTo(x, y, r, n, skip) {
    const l = [];
    for (const e of Grid.query(x, y, r + 24, _fq)) {
      if (e.dead || e === skip) continue;
      const d = Util.dist(x, y, e.x, e.y);
      if (d <= r + e.r) l.push({ e, d });
    }
    l.sort((p, q) => p.d - q.d);
    return l.slice(0, n).map(o => o.e);
  },

  // 撃った点から鎖の電撃。first から近くの敵へ n 回、1つ先ごとに威力が falloff 倍（Combat.chainLightning と同じ作り・始点が砲ではない）
  chainFrom(w, run, first, n, dmg, falloff, o) {
    o = o || {};
    let cur = first, d = dmg;
    const used = new Set([first]);
    const pts = [{ x: o.fromX !== undefined ? o.fromX : first.x, y: o.fromY !== undefined ? o.fromY : first.y }];
    if (o.direct) { pts.push({ x: first.x, y: first.y }); Combat.damage(run, first, d, { shock: w.s.shockDur, color: '#d8c7ff', crit: w.s.crit, critMul: w.s.critMul }); d *= falloff; }
    for (let i = 0; i < n; i++) {
      let best = null, bd = 1e9;
      for (const e of Grid.query(cur.x, cur.y, 150, _fq)) {
        if (e.dead || used.has(e)) continue;
        let dd = Util.dist2(cur.x, cur.y, e.x, e.y);
        if (e.stun > 0) dd *= 0.25;
        if (dd < bd) { bd = dd; best = e; }
      }
      if (!best) break;
      used.add(best);
      pts.push({ x: best.x, y: best.y });
      Combat.damage(run, best, d, { shock: w.s.shockDur, color: '#d8c7ff', crit: w.s.crit, critMul: w.s.critMul });
      d *= falloff;
      cur = best;
      if (best.upper && Combat.immune(best, 'elem')) break;
      if (best.res && best.res.elec) break;
    }
    if (pts.length > 1) Combat.fx(run, { type: 'bolt', pts, life: 0.13, color: o.color || '#c9b3ff' });
  },

  // 好きな点から弾を出す（Combat.spawnBullet は撃ち口から出るので、出したあとで置き直す）
  bulletAt(w, run, x, y, angle, o) {
    const n0 = run.bullets.length;
    Combat.spawnBullet(w, run, angle, o);
    const b = run.bullets[run.bullets.length - 1];
    if (!b || run.bullets.length < n0) return null;
    b.x = x; b.y = y; b.ox = x; b.oy = y;
    return b;
  },

  // 着弾円（指定攻撃）へ撃ち込む。Combat.bombard と同じ散らし方で、着弾したときの中身だけ差し替えられる
  bombardWith(w, run, color, land, o) {
    const p = w.aim;
    if (!p) return;
    const R = Game.spotR(w), n = w.n || 1;
    for (let i = 0; i < n; i++) {
      const a = Util.rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * R;
      Combat.spawnLob(w, run, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, Object.assign({ color, mark: true, onLand: (rr, x, y) => land(rr, x, y) }, o || {}));
    }
  },

  fx(run, o) { o.type = 'fx'; Combat.fx(run, o); },

  // ---------- 合成の操作（盤の上） ----------
  //   合成できる組：A（合成していない）の六角の隣に B（合成していない）がいて、その合成の札を持っている
  //   ok が偽のときは why に理由（ボタンは薄く出し、押すと理由を言う）
  options(run) {
    const out = [];
    if (!run || !run.units) return out;
    for (const a of run.units) {
      if (a.fuse || a.broken) continue;
      const nb = MapGen.hexNbr(a.c, a.r);
      for (const b of run.units) {
        if (b === a || b.fuse || b.broken || b.id === a.id) continue;
        if (!nb.some(q => q[0] === b.c && q[1] === b.r)) continue;
        for (const fid of FUSION_IDS) {
          const f = FUSIONS[fid];
          if (f.a !== a.id || f.b !== b.id || !this.owned(fid)) continue;
          const dc = this.cost(fid) - a.def.cost - b.def.cost;
          const ok = Game.costUsed() + dc <= Game.costCap();
          out.push({ a, b, fid, ok, why: ok ? '' : 'コストが足りません（合成は +' + dc + '・残り ' + (Game.costCap() - Game.costUsed()) + '）' });
        }
      }
    }
    return out;
  },
};

// ---------------------------------------------------------------
// 24種。A ごとに2つずつ（12種の武器がちょうど2回ずつ A になる）。
//   fire(w, run) … Combat.update が、A の fire の代わりに呼ぶ。w.s（札とツリーの乗った数値）・w.dyn・w.flags は A のもの
//   color … 盤の上の台座・名札の色 ／ short … 盤の上の3文字 ／ desc … 図鑑と札の説明（挙動と必ず一致させる）
// ---------------------------------------------------------------
const FUSIONS = {

  // 1 ガトリング＋手裏剣：長く広い範囲を制圧する星形弾。貫通の上限に達すると弾けて範囲攻撃
  starassault: {
    id: 'starassault', a: 'gatling', b: 'shuriken', name: 'スターアサルト', short: 'SAS', color: '#ffe066',
    role: '長く広い範囲を制圧', desc: '貫通の限界で弾ける星形弾',
    fire(w, run) {
      const P = Fusion.p(w);
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.n > 1 ? w.n * 0.7 : 1);
        Combat.spawnBullet(w, run, a, {
          color: '#ffe066', fx: 'star', bulletR: w.s.bulletR,
          onConsume: (rr, b) => { Combat.explode(rr, b.x, b.y, P.burstR, b.dmg * P.burstMul, { color: '#ffe066' }); Fusion.fx(rr, { k: 'starburst', x: b.x, y: b.y, r: P.burstR, color: '#ffe066', life: 0.4 }); },
        });
      }
    },
  },

  // 2 ガトリング＋テスラ：弾が当たった敵から近くへ電撃が跳ぶ
  plasmachain: {
    id: 'plasmachain', a: 'gatling', b: 'tesla', name: 'プラズマチェーン', short: 'PLC', color: '#8fb4ff',
    role: '中距離の群れ', desc: '当たった敵から電撃が2回跳ぶ',
    fire(w, run) {
      const P = Fusion.p(w);
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.n > 1 ? w.n * 0.7 : 1);
        Combat.spawnBullet(w, run, a, {
          color: '#8fb4ff',
          onHit: (rr, b, e) => Fusion.chainFrom(w, rr, e, w.s.chain, b.dmg * P.chainMul, w.s.chainFalloff, { fromX: b.x, fromY: b.y, color: '#8fb4ff' }),
        });
      }
    },
  },

  // 3 手裏剣＋刀：跳ね回ったあと持ち主へ戻り、帰り道でもう一度斬る刃
  chakram: {
    id: 'chakram', a: 'shuriken', b: 'katana', name: '円環刃', short: 'CHK', color: '#e6f0ff',
    role: '自分のまわり', desc: '跳ね回って、帰りも斬る輪',
    fire(w, run) {
      const P = Fusion.p(w);
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.n > 1 ? w.n : 1);
        const back = (rr, b) => {
          if (b.child) return;
          const r2 = Fusion.bulletAt(w, rr, b.x, b.y, Util.angle(b.x, b.y, w.x, w.y), { color: '#bcd4ff', fx: 'chakram', pierce: 99, bounce: 0, child: true, dmgMul: P.backMul, bulletR: w.s.bulletR });
          if (r2) { r2.through = true; r2.range = Util.dist(b.x, b.y, w.x, w.y) + 14; r2.life = 2; }
        };
        Combat.spawnBullet(w, run, a, { color: '#e6f0ff', fx: 'chakram', onEnd: back });
      }
    },
  },

  // 4 手裏剣＋毒ガス：悪魔の流れ星。跳ねるたびに小さな毒の雲を残す
  toxblade: {
    id: 'toxblade', a: 'shuriken', b: 'gas', name: '悪魔の流れ星', short: 'DMS', color: '#a8e05a',
    role: '通路の長い区間', desc: '当たるたび毒の雲を残す',
    fire(w, run) {
      const P = Fusion.p(w);
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.n > 1 ? w.n : 1);
        Combat.spawnBullet(w, run, a, {
          color: '#a8e05a', fx: 'kunai',
          onHit: (rr, b, e) => { if (Math.random() < P.chance) Combat.spawnField(rr, e.x, e.y, { kind: 'gas', r: P.cloudR, dur: P.cloudDur, dps: b.dmg * P.cloudDps, slow: P.slow, vuln: P.vuln, color: '#8fd94a', src: w }); },
        });
      }
    },
  },

  // 5 刀＋触手：切り裂いて空間を割き、裂け目から触手が出る（企画書の例。斬撃と裂け目に少し傾きを持たせて二重に斬って見える）
  voidblade: {
    id: 'voidblade', a: 'katana', b: 'tentacle', name: '異界の剣', short: 'VDS', color: '#d070ff',
    role: '目の前の、横に広く縦に狭い長方形', desc: '前を切り裂き、裂け目から触手が出る',
    fire(w, run) {
      const P = Fusion.p(w), n = Math.max(1, Math.round(w.n || 1));
      for (let i = 0; i < n; i++) {
        const tilt = P.tilt * (i % 2 ? -1 : 1) * (1 + Math.floor(i / 2));
        const a = w.angle + tilt;
        const cx = w.x + Math.cos(a) * P.dist, cy = w.y + Math.sin(a) * P.dist;
        const hw = P.len / 2, hh = P.wid / 2;
        for (const e of Fusion.rectEnemies(cx, cy, a, hw, hh)) Combat.damage(run, e, w.s.dmg, { color: '#f4d8ff', crit: w.s.crit, critMul: w.s.critMul, exec: w.s.execThr });
        Fusion.zone(run, { kind: 'rift', shape: 'rect', x: cx, y: cy, a, hw, hh, dur: P.dur, tick: P.tick, dps: w.s.dmg * P.dps, slow: P.slow, slowDur: 0.6, color: '#c85ab0', dcolor: '#ffb0e8' });
        Fusion.fx(run, { k: 'voidslash', x: cx, y: cy, a, hw, hh, life: 0.4, seed: (w.shots * 7 + i * 3) % 100 });
      }
      Snd.shot(w.id);
      Combat.shake(run, 2.4);
    },
  },

  // 6 刀＋火炎：フランベルジュ。目の前を赤く焼き切る、高威力の滅多斬り
  flameblade: {
    id: 'flameblade', a: 'katana', b: 'flame', name: 'フランベルジュ', short: 'FRB', color: '#ff3a2a',
    role: '目の前の扇', desc: '赤く焼き切る3連の滅多斬り',
    fire(w, run) {
      const P = Fusion.p(w), n = Math.max(1, Math.round(w.n || 1)) * P.slashes;
      for (let i = 0; i < n; i++) {
        const a = w.angle + Util.rand(-w.s.cone, w.s.cone) * P.spreadK;
        Combat.coneDamage(w, run, a, P.subArc, w.s.range, w.s.dmg, {
          color: '#ff6a4a', crit: w.s.crit, critMul: w.s.critMul, exec: w.s.execThr, burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur,
        });
        Fusion.fx(run, { k: 'redslash', x: w.x, y: w.y, a, arc: P.subArc, r: w.s.range, life: 0.18 + i * 0.03 });
      }
      Snd.shot(w.id);
      Combat.shake(run, 2.4);
    },
  },

  // 7 触手＋泡：狂気の海底。大きな泡を1つ出して閉じ込め、中央へ強く引き寄せ、集めた所を触手の一突きで破裂させる
  abyssnet: {
    id: 'abyssnet', a: 'tentacle', b: 'bubble', name: '狂気の海底', short: 'ABY', color: '#4ab8d8',
    role: '引き寄せる範囲', desc: '大きな泡に閉じ込め、引き寄せ、触手で破裂',
    fire(w, run) {
      const t = w.target;
      if (!t) return false;      // 狙う敵が居ないときは撃たない（次のフレームでまた試す・combat.js）
      const P = Fusion.p(w);
      const centers = [t], want = Math.max(1, Math.round(w.s.count));
      if (want > 1) for (const e of Fusion.nearestTo(t.x, t.y, w.s.range, 60, t)) {
        if (centers.length >= want) break;
        if (centers.every(c => Util.dist(c.x, c.y, e.x, e.y) > P.R * 1.6)) centers.push(e);
      }
      for (const c of centers) {
        Fusion.zone(run, {
          kind: 'abyss', x: c.x, y: c.y, r: P.R, dur: P.dur, tick: 0.2, dps: w.s.dmg * P.dps, stun: w.s.stunDur, pull: P.pull,
          color: '#4ab8d8', dcolor: '#8ad8ff',
          onEnd: (rr, z) => {
            Combat.explode(rr, z.x, z.y, P.burstR, w.s.dmg * P.burstMul, { color: '#ff9ad0', crit: w.s.crit, critMul: w.s.critMul });
            Fusion.fx(rr, { k: 'abyssburst', x: z.x, y: z.y, r: P.burstR, life: 0.55 });
            Combat.shake(rr, 3);
          },
        });
      }
    },
  },

  // 8 触手＋テスラ：航海の悪夢。雷を纏った竜巻をゆっくり正面へ撃ち出す
  thunderwhip: {
    id: 'thunderwhip', a: 'tentacle', b: 'tesla', name: '航海の悪夢', short: 'NMR', color: '#8a6aff',
    role: '中距離の扇', desc: '雷の竜巻が、ゆっくり前へ進む',
    fire(w, run) {
      if (!w.target) return false;
      const P = Fusion.p(w), a = w.angle;
      const sx = w.x + Math.cos(a) * P.start, sy = w.y + Math.sin(a) * P.start;
      Fusion.zone(run, {
        kind: 'twister', x: sx, y: sy, a, r: P.R, dur: P.dur, tick: 0.15, dps: w.s.dmg * P.dps, shock: w.s.shockDur,
        grabT: w.s.knockDur, grabV: w.s.knock, drift: { x: Math.cos(a) * P.speed, y: Math.sin(a) * P.speed }, color: '#8a6aff', dcolor: '#d8c7ff',
        pulse: { every: P.chainEvery, fn: (rr, z) => {
          const list = Fusion.enemiesIn(z.x, z.y, z.r * 1.2);
          if (!list.length) return;
          const e = list[(Math.random() * list.length) | 0];
          Fusion.chainFrom(w, rr, e, w.s.chain, w.s.dmg * P.chainMul, w.s.chainFalloff, { fromX: z.x, fromY: z.y, direct: true, color: '#c9b3ff' });
        } },
      });
      Snd.shot(w.id);
      Combat.shake(run, 1.2);
    },
  },

  // 9 火炎＋毒ガス：爆裂放射器。炎の扇が長く伸び、先で毒を含んだ爆発が起きる
  hellmist: {
    id: 'hellmist', a: 'flame', b: 'gas', name: '爆裂放射器', short: 'EXP', color: '#c8b02a',
    role: '近い範囲', desc: '長く吹く炎の先で、毒の爆発',
    fire(w, run) {
      const P = Fusion.p(w);
      Combat.coneDamage(w, run, w.angle, w.s.cone, w.s.range, w.s.dmg, {
        color: '#ffb066', burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur, crit: w.s.crit, critMul: w.s.critMul,
        sticky: w.dyn.sticky || 0,
      });
      Combat.fx(run, { type: 'cone', x: w.x, y: w.y, a: w.angle, arc: w.s.cone, r: w.s.range, color: '#ff8a3a', life: 0.20, seed: (w.shots * 2654435761) % 1000 });
      const d = w.s.range * P.at, bx = w.x + Math.cos(w.angle) * d, by = w.y + Math.sin(w.angle) * d;
      Combat.explode(run, bx, by, P.blastR, w.s.dmg * P.blastMul, { color: '#d8e04a', burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur });
      if (w.shots % P.every === 0) {
        Combat.spawnField(run, bx, by, { kind: 'gas', r: w.s.fieldR, dur: w.s.fieldDur, dps: w.s.dmg * P.dps, slow: P.slow, vuln: w.s.fieldVuln,
          color: '#8fd94a', src: w, armorDown: w.dyn.armorDown || 0 });
      }
    },
  },

  // 10 火炎＋迫撃砲：ヴォルケイノブラスト。正面へ火山弾を噴き出し、落ちた所から燃え広がる
  napalm: {
    id: 'napalm', a: 'flame', b: 'mortar', name: 'ヴォルケイノブラスト', short: 'VBL', color: '#ff5a1a',
    role: '正面の長い帯', desc: '正面へ火山弾を噴き出す',
    fire(w, run) {
      const P = Fusion.p(w), n = P.bombs;
      // 正面の扇（射界を P.fanK 倍に広げた範囲）にいる敵を狙って噴き出す。居なければ撃たない（次のフレームでまた試す）。手前から奥へ散らばるよう、遠さで並べて等間隔に拾う
      const foes = Fusion.coneEnemies(w, w.angle, w.arc * P.fanK, w.s.range);
      if (!foes.length) return false;
      foes.sort((p, q) => Util.dist(w.x, w.y, p.x, p.y) - Util.dist(w.x, w.y, q.x, q.y));
      for (let i = 0; i < n; i++) {
        const e = foes[Math.min(foes.length - 1, Math.floor((i + Math.random()) * foes.length / n))];
        const tx = e.x + Util.rand(-P.fan, P.fan) * 40, ty = e.y + Util.rand(-P.fan, P.fan) * 40;
        Combat.spawnLob(w, run, tx, ty, {
          color: '#ff5a1a', rocket: true,
          onLand: (rr, x, y) => {
            Combat.explode(rr, x, y, w.s.splash, w.s.dmg, { color: '#ff9a4a', burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur, crit: w.s.crit, critMul: w.s.critMul });
            Combat.spawnField(rr, x, y, { kind: 'fire', r: P.poolR, dur: P.poolDur, dps: w.s.dmg * w.s.burn * P.poolDps, color: '#ff8a3a', src: w });
          },
        });
      }
      Fusion.fx(run, { k: 'eruption', x: w.x, y: w.y, a: w.angle, life: 0.45 });
      Combat.shake(run, 2);
    },
  },

  // 11 凍結＋火炎：氷と炎が渦巻く（企画書の例）
  vortex: {
    id: 'vortex', a: 'cryo', b: 'flame', name: '相反の渦', short: 'VTX', color: '#ff9ad0',
    role: '凍結の広い範囲のまま', desc: '氷と炎の渦。凍って燃える',
    fire(w, run) {
      Combat.pulse(w, run, w.s.range, w.s.dmg, {
        color: '#ffd2e8', slow: w.s.slow, slowDur: w.s.slowDur, chill: true, burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur, crit: w.s.crit, critMul: w.s.critMul,
      });
      Fusion.fx(run, { k: 'vortex', x: w.x, y: w.y, r: w.s.range, life: 0.75, ph: Math.random() * 6.28 });
      Combat.shake(run, 1.2);
    },
  },

  // 12 凍結＋泡：永久凍土。範囲内を泡で包んで凍らせ、破裂させる。火力は低いが、絶大な足止め
  icefoam: {
    id: 'icefoam', a: 'cryo', b: 'bubble', name: '永久凍土', short: 'PRM', color: '#9fe6ff',
    role: '広い範囲', desc: '範囲を泡で凍らせ、止める。火力は低い',
    fire(w, run) {
      const P = Fusion.p(w);
      Combat.pulse(w, run, w.s.range, w.s.dmg, { color: '#bff0ff', slow: w.s.slow, slowDur: w.s.slowDur, chill: true, crit: w.s.crit, critMul: w.s.critMul });
      Fusion.fx(run, { k: 'frostfoam', x: w.x, y: w.y, r: w.s.range, life: 0.6, ph: Math.random() * 6.28 });
      let shown = 0;
      for (const e of Fusion.nearestTo(w.x, w.y, w.s.range, P.n)) {
        if (Combat.inShield(run, e)) continue;
        Combat.damage(run, e, 0, { stun: w.s.stunDur, slow: w.s.slow, slowDur: w.s.slowDur, chill: true });
        if (shown++ < P.cages) Fusion.fx(run, { k: 'cage', e, x: e.x, y: e.y, r: 15, life: P.delay, color: '#bff0ff', ice: true });
        Fusion.later(run, P.delay, () => {
          if (e.dead) return;
          Combat.explode(run, e.x, e.y, P.shardR, w.s.dmg * P.shardMul, { color: '#bff0ff', slow: P.shardSlow, slowDur: P.shardSlowDur, chill: true });
          if (shown < 40) Fusion.fx(run, { k: 'shards', x: e.x, y: e.y, r: P.shardR, life: 0.45, color: '#bff0ff' });
        });
      }
    },
  },

  // 13 レーザー＋凍結：反射した場所に氷の棘山を生やす
  cryobeam: {
    id: 'cryobeam', a: 'sniper', b: 'cryo', name: '凍結光線', short: 'CRB', color: '#7fe6ff',
    role: '反射する光の線', desc: '反射した所に氷の棘山',
    fire(w, run) {
      const P = Fusion.p(w);
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + (i === 0 ? 0 : ((i % 2) ? 1 : -1) * Math.ceil(i / 2) * 0.06);
        const res = Combat.laser(w, run, a, { opts: { chill: true, slow: w.s.slow, slowDur: w.s.slowDur }, color: '#7fe6ff' });
        if (!res) continue;
        for (let k = 1; k < Math.min(res.pts.length, 6); k++) {
          const p = res.pts[k];
          Fusion.zone(run, { kind: 'spikes', x: p.x, y: p.y, r: P.spikeR, dur: P.spikeDur, tick: 0.2, dps: w.s.dmg * P.spikeDps, slow: P.spikeSlow, slowDur: 0.8, chill: true, color: '#bff0ff' });
        }
      }
      Combat.shake(run, 2);
    },
  },

  // 14 レーザー＋ミサイル：スーパーノヴァ。道1本分の太さのレーザーを絶え間なく撃つ
  convergence: {
    id: 'convergence', a: 'sniper', b: 'missile', name: 'スーパーノヴァ', short: 'SNV', color: '#fff0b0',
    role: '正面の道1本分', desc: '道1本分の太さのレーザーを撃ち続ける',
    fire(w, run) {
      const P = Fusion.p(w);
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + (i === 0 ? 0 : ((i % 2) ? 1 : -1) * Math.ceil(i / 2) * 0.06);
        Combat.laser(w, run, a, { multi: true, color: '#fff0b0', life: P.life });
      }
    },
  },

  // 15 ミサイル＋迫撃砲：滅尽嵐。爆撃した所に火炎旋風が巻き起こる
  carpet: {
    id: 'carpet', a: 'missile', b: 'mortar', name: '滅尽嵐', short: 'MTS', color: '#ff7a2a',
    role: '遠くの広い円', desc: '爆撃の跡に火炎旋風',
    fire(w, run) {
      const P = Fusion.p(w);
      Fusion.bombardWith(w, run, '#ff7a3c', (rr, x, y) => {
        Combat.explode(rr, x, y, w.s.splash, w.s.dmg, { color: '#ff9a4a', crit: w.s.crit, critMul: w.s.critMul });
        const ang = Math.random() * 6.28;
        Fusion.zone(rr, { kind: 'firewhirl', x, y, r: P.R, dur: P.dur, tick: 0.2, dps: w.s.dmg * P.dps, burn: w.s.dmg * P.burn, burnDur: 2,
          drift: { x: Math.cos(ang) * P.drift, y: Math.sin(ang) * P.drift }, color: '#ff7a2a', dcolor: '#ffb066' });
        Fusion.fx(rr, { k: 'pop', x, y, r: P.R, life: 0.35, color: '#ffb066' });
      }, { rocket: true });
    },
  },

  // 16 ミサイル＋テスラ：磁気嵐。着弾点に電撃の嵐が吹き荒れ、周りへ連鎖する
  chainstrike: {
    id: 'chainstrike', a: 'missile', b: 'tesla', name: '磁気嵐', short: 'MGS', color: '#9a7cff',
    role: '遠くの円', desc: '着弾点に電撃の嵐',
    fire(w, run) {
      const P = Fusion.p(w);
      Fusion.bombardWith(w, run, '#b58bff', (rr, x, y) => {
        Combat.explode(rr, x, y, w.s.splash, w.s.dmg, { color: '#d8c7ff', shock: w.s.shockDur, crit: w.s.crit, critMul: w.s.critMul });
        const first = Fusion.nearestTo(x, y, P.pillarR, 1)[0];
        if (first) Fusion.chainFrom(w, rr, first, w.s.chain, w.s.dmg * P.chainMul, w.s.chainFalloff, { fromX: x, fromY: y, direct: true, color: '#b58bff' });
        Fusion.fx(rr, { k: 'magstorm', x, y, r: P.pillarR, life: 0.6, color: '#b58bff', ph: Math.random() * 6.28 });
      }, { rocket: true });
    },
  },

  // 17 テスラ＋毒ガス：帯電した雲が漂い、中の敵へ電撃を落とし続ける
  stormcloud: {
    id: 'stormcloud', a: 'tesla', b: 'gas', name: '雷雲', short: 'STM', color: '#7a6ac8',
    role: '置いた所のまわり', desc: '漂う雷雲が、中の敵へ落雷',
    fire(w, run) {
      const t = w.target;
      if (!t) return false;      // 狙う敵が居ないときは撃たない（次のフレームでまた試す・combat.js）
      const P = Fusion.p(w);
      const ang = Math.random() * Math.PI * 2;
      Fusion.zone(run, {
        kind: 'storm', x: t.x, y: t.y, r: w.s.fieldR, dur: w.s.fieldDur, tick: 0.3, dps: 0, slow: 0.12, shock: 0.4,
        drift: { x: Math.cos(ang) * P.drift, y: Math.sin(ang) * P.drift }, color: '#6a5ab8',
        pulse: { every: P.strikeEvery, fn: (rr, z) => {
          const list = Fusion.enemiesIn(z.x, z.y, z.r * P.strikeR);
          if (!list.length) return;
          const e = list[(Math.random() * list.length) | 0];
          Fusion.fx(rr, { k: 'strike', x: e.x, y: e.y, fromY: z.y - z.r * 0.5, life: 0.22, color: '#d8c7ff' });
          Fusion.chainFrom(w, rr, e, w.s.chain, w.s.dmg * P.strikeMul, w.s.chainFalloff, { fromX: e.x, fromY: e.y, direct: true, color: '#d8c7ff' });
        } },
      });
    },
  },

  // 18 テスラ＋泡：プラズマボール。おもちゃのプラズマボールを正面に出し、一定時間 範囲攻撃と電撃を浴びせる
  resonator: {
    id: 'resonator', a: 'tesla', b: 'bubble', name: 'プラズマボール', short: 'PLB', color: '#c07aff',
    role: '正面の円', desc: '光る球が電撃を浴びせ続ける',
    fire(w, run) {
      const t = w.target;
      if (!t) return false;      // 狙う敵が居ないときは撃たない（次のフレームでまた試す・combat.js）
      const P = Fusion.p(w), a = w.angle;
      const d = Math.min(w.s.range * P.at, Util.dist(w.x, w.y, t.x, t.y));
      const bx = w.x + Math.cos(a) * d, by = w.y + Math.sin(a) * d;
      Fusion.zone(run, {
        kind: 'plasmaball', x: bx, y: by, r: P.R, dur: P.dur, tick: 0.25, dps: w.s.dmg * P.dps, shock: w.s.shockDur, color: '#c07aff', dcolor: '#e6d0ff',
        pulse: { every: P.zapEvery, fn: (rr, z) => {
          for (const e of Fusion.nearestTo(z.x, z.y, z.r * P.reach, P.zaps)) {
            Fusion.chainFrom(w, rr, e, w.s.chain, w.s.dmg * P.zapMul, w.s.chainFalloff, { fromX: z.x, fromY: z.y, direct: true, color: '#e6d0ff' });
          }
        } },
      });
      Combat.shake(run, 1);
    },
  },

  // 19 毒ガス＋泡：王水。黄金の液体が広がり、極めて高い妨害になる
  acidfoam: {
    id: 'acidfoam', a: 'gas', b: 'bubble', name: '王水', short: 'AQR', color: '#ffd24a',
    role: '置いた所のまわり', desc: '黄金の液体で、敵の動きと守りを奪う',
    fire(w, run) {
      const t = w.target;
      if (!t) return false;      // 狙う敵が居ないときは撃たない（次のフレームでまた試す・combat.js）
      const P = Fusion.p(w);
      Fusion.zone(run, {
        kind: 'aquaregia', x: t.x, y: t.y, r: w.s.fieldR, dur: w.s.fieldDur, tick: 0.25, dps: w.s.dmg * P.dps, slow: P.slow, slowDur: 0.8,
        vuln: w.s.fieldVuln, armorDown: Math.min(BAL.cardFx.armorDownMax, P.armorDown + (w.dyn.armorDown || 0)), color: '#ffd24a', dcolor: '#fff0a0',
      });
      Fusion.fx(run, { k: 'pop', x: t.x, y: t.y, r: w.s.fieldR, life: 0.4, color: '#ffe38a' });
    },
  },

  // 20 毒ガス＋迫撃砲：破滅の雨。毒ガスの持続を犠牲に、超高火力の砲撃を浴びせる
  toxmortar: {
    id: 'toxmortar', a: 'gas', b: 'mortar', name: '破滅の雨', short: 'DOM', color: '#7fe35a',
    role: '遠くの円', desc: '超高火力の砲撃。毒は一瞬',
    fire(w, run) {
      const t = w.target;
      if (!t) return false;      // 狙う敵が居ないときは撃たない（次のフレームでまた試す・combat.js）
      const P = Fusion.p(w);
      for (let i = 0; i < P.shells; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * P.spread;
        const tx = t.x + Math.cos(a) * d, ty = t.y + Math.sin(a) * d;
        Fusion.later(run, P.gap * i, () => {
          Combat.spawnLob(w, run, tx, ty, {
            color: '#7fe35a', rocket: true,
            onLand: (rr, x, y) => {
              Combat.explode(rr, x, y, w.s.splash, w.s.dmg, { color: '#b8ff6a', crit: w.s.crit, critMul: w.s.critMul });
              if (i === 0) Combat.spawnField(rr, x, y, { kind: 'gas', r: w.s.fieldR, dur: w.s.fieldDur, dps: w.s.dmg * P.gasDps, slow: w.s.slow, vuln: w.s.fieldVuln, color: '#8fd94a', src: w, armorDown: w.dyn.armorDown || 0 });
            },
          });
        });
      }
    },
  },

  // 21 泡＋ガトリング：ファンシーバブルガン。ガトリングのように泡を連射する
  bubblegun: {
    id: 'bubblegun', a: 'bubble', b: 'gatling', name: 'ファンシーバブルガン', short: 'FBG', color: '#ff9ad8',
    role: '円の方向へ連射', desc: '泡をガトリングのように連射',
    fire(w, run) {
      const P = Fusion.p(w);
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.n > 1 ? w.n * 0.7 : 1);
        Combat.spawnBullet(w, run, a, {
          bubble: true, color: '#ff9ad8', through: true,
          onConsume: (rr, b) => {
            Combat.explode(rr, b.x, b.y, w.s.splash, b.dmg * P.popMul, { color: '#ff9ad8', stun: w.s.stunDur * P.popStun });
            Fusion.fx(rr, { k: 'pop', x: b.x, y: b.y, r: w.s.splash, life: 0.25, color: '#ff9ad8' });
          },
        });
      }
    },
  },

  // 22 迫撃砲＋ガトリング：クラスター爆弾。砲弾が空中で弾け、小さな爆発の雨を降らせる
  scattergun: {
    id: 'scattergun', a: 'mortar', b: 'gatling', name: 'クラスター爆弾', short: 'CLB', color: '#e0c070',
    role: '遠くの円', desc: '空中で弾け、小爆発の雨',
    fire(w, run) {
      const P = Fusion.p(w);
      Fusion.bombardWith(w, run, '#e0c070', (rr, x, y) => {
        for (let i = 0; i < P.pellets; i++) {
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * P.spread;
          const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
          Fusion.later(rr, 0.045 * i, () => { Combat.spotImpact(w, rr, px, py, 0, P.pelMul); Fusion.fx(rr, { k: 'pellet', x: px, y: py, life: 0.18, color: '#ffd890' }); });
        }
      });
    },
  },

  // 23 泡＋手裏剣：ポッピングスター。泡を纏った流れ星を、置いた円へ落とす
  bubbleblade: {
    id: 'bubbleblade', a: 'bubble', b: 'shuriken', name: 'ポッピングスター', short: 'PPS', color: '#ffe38a',
    role: '遠くの円', desc: '泡を纏った流れ星を落とす',
    fire(w, run) {
      const P = Fusion.p(w);
      Fusion.bombardWith(w, run, '#ffe38a', (rr, x, y) => {
        Combat.spotImpact(w, rr, x, y, 0, 1);
        const a0 = Math.random() * 6.28;
        for (let k = 0; k < 5; k++) {
          const a = a0 + k * Math.PI * 2 / 5;
          Combat.lineHit(rr, x, y, x + Math.cos(a) * P.rayLen, y + Math.sin(a) * P.rayLen, P.rayHalf, w.s.dmg * P.rayMul, { color: '#ffe38a', crit: w.s.crit, critMul: w.s.critMul });
        }
        Fusion.fx(rr, { k: 'popstar', x, y, r: P.rayLen, a: a0, life: 0.45 });
      }, { fx: 'meteor' });
    },
  },

  // 24 迫撃砲＋凍結：スノーグレイブ。落とした所に氷の嵐
  icebomb: {
    id: 'icebomb', a: 'mortar', b: 'cryo', name: 'スノーグレイブ', short: 'SNG', color: '#8fd0ff',
    role: '遠くの円', desc: '落とした所に氷の嵐',
    fire(w, run) {
      const P = Fusion.p(w);
      Fusion.bombardWith(w, run, '#8fd0ff', (rr, x, y) => {
        Combat.explode(rr, x, y, w.s.splash, w.s.dmg, { color: '#bff0ff', slow: w.s.slow, slowDur: w.s.slowDur, chill: true, crit: w.s.crit, critMul: w.s.critMul });
        const ang = Math.random() * 6.28;
        Fusion.zone(rr, { kind: 'blizzard', x, y, r: P.R, dur: P.dur, tick: 0.2, dps: w.s.dmg * P.dps, slow: P.slow, slowDur: 0.8, chill: true,
          drift: { x: Math.cos(ang) * P.drift, y: Math.sin(ang) * P.drift }, color: '#bff0ff' });
        Fusion.fx(rr, { k: 'shards', x, y, r: P.R * 0.8, life: 0.5, color: '#bff0ff' });
      }, { rocket: true });
    },
  },
};

// 並び：A ごとに2つずつ。図鑑・札の順
const FUSION_IDS = Object.keys(FUSIONS);
for (const fid of FUSION_IDS) {
  const f = FUSIONS[fid];
  if (!WEAPONS[f.a] || !WEAPONS[f.b]) console.error('[fusion] 武器が無い:', fid, f.a, f.b);
  if (!BAL.fusion || !BAL.fusion[fid]) console.error('[fusion] BAL.fusion に数値が無い:', fid);
  f.cost = WEAPONS[f.a].cost + WEAPONS[f.b].cost + BAL.fuseExtraCost;
}
// 同じ A の合成が2つずつ（12種の武器が2回ずつ A になる）
(function () {
  const n = {};
  for (const fid of FUSION_IDS) n[FUSIONS[fid].a] = (n[FUSIONS[fid].a] || 0) + 1;
  for (const w of WEAPON_IDS) if (n[w] !== 2) console.warn('[fusion] A として2回になっていない:', w, n[w] || 0);
})();
