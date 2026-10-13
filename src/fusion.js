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
const _F0 = Object.freeze({});      // 札の値が無い合成武器の flags.fc の代わり（Fusion.fc）

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
  //   撃つ回数とは別の間隔（吹き続ける武器の爆発・雲）。sec 秒に1回だけ真を返す。w[key] に次の時刻を持つ（run.time が戻ったら＝出撃が変わったら、すぐ真）
  due(w, key, run, sec) {
    const t = w[key];
    if (t === undefined || run.time >= t || t > run.time + sec) { w[key] = run.time + sec; return true; }
    return false;
  },

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
      if (z.vuln) { e.fvuln = z.vuln; e.fvulnT = z.vulnT || 0.4; }
      if (z.armorDown) { e.armorDown = (e.armorT > 0) ? Math.max(e.armorDown, z.armorDown) : z.armorDown; e.armorT = z.armorT || 0.6; }
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
    if (pts.length > 1) {
      if (o.fxk) this.fx(run, { k: o.fxk, pts, life: 0.2, color: o.color || '#c9b3ff', r0: o.r0 || 0, seed: ((run.time * 1000) | 0) % 997 });   // 合成武器の絵（fusionfx.js）
      else Combat.fx(run, { type: 'bolt', pts, life: 0.13, color: o.color || '#c9b3ff' });
    }
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
  //   Combat が直前に出した演出（type＝'laser'・'boom' など）を、合成武器の演出 k に差し替える（絵だけ。当たりは変えない・fusionfx.js）
  reskin(run, type, k, o) {
    const f = run.fx[run.fx.length - 1];
    if (f && f.type === type && f.t === 0) { f.type = 'fx'; f.k = k; if (o) Object.assign(f, o); }   // t＝0：いま出したもの（演出の数が上限で出せなかったときは、前の演出を書き換えない）
  },

  // ---------- 合成武器の札（cards.js の fp_*／fl_*・数値は BAL.fusionCards） ----------
  //   札の中身は apply が `w.flags.fc`（A の札）・`w.flags.fl`（B の札）に書く。applyMods が組み直すたびに flags は空に戻り、引いた順に掛け直される
  fc(w) { return w.flags.fc || _F0; },
  //   B の札の値。自分に札の値があり、**相手の合成武器が盤にいる**ときだけ返す（無ければ 0）
  link(w, run, key, partner) {
    const L = w.flags.fl, v = L && L[key];
    if (!v) return 0;
    for (const u of run.units) if (u.fuse === partner && !u.broken) return v;
    return 0;
  },
  //   「被弾の印」：受けるダメージが増える（Combat.vuln が読む）
  mark(run, x, y, r, v) {
    const K = BAL.fusionCards.fl_mark;
    for (const e of this.enemiesIn(x, y, r)) { e.fmark = Math.max(e.fmarkT > 0 ? e.fmark : 0, v); e.fmarkT = K.sec; }
  },
  //   折れ線 pts の、全長の t（0〜1）の点
  along(pts, t) {
    let tot = 0;
    for (let i = 1; i < pts.length; i++) tot += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    let d = tot * t;
    for (let i = 1; i < pts.length; i++) {
      const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (d <= L || i === pts.length - 1) { const k = L > 0 ? Math.min(1, d / L) : 0; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k }; }
      d -= L;
    }
    return pts[0];
  },
  //   燃える溜まり（fire）と毒の雲（gas）が重なると爆ぜる（爆裂放射器＋ヴォルケイノブラストの札）。f＝いま出した場。1つの場は1回だけ
  combust(w, run, f, L) {
    if (!L || !f) return;
    const K = BAL.fusionCards.fl_boom;
    for (const o of run.fields) {
      if (o === f || o.fcb || f.fcb) continue;
      if (!((f.kind === 'gas' && o.kind === 'fire') || (f.kind === 'fire' && o.kind === 'gas'))) continue;
      if (Util.dist(f.x, f.y, o.x, o.y) > f.r + o.r) continue;
      f.fcb = o.fcb = true;
      const mx = (f.x + o.x) / 2, my = (f.y + o.y) / 2, R = (f.r + o.r) * K.r;
      Combat.explode(run, mx, my, R, w.s.dmg * L, { color: '#ffd84a', burn: w.s.dmg * (w.s.burn || 0), burnDur: w.s.burnDur || 2 });
      this.fx(run, { k: 'pop', x: mx, y: my, r: R, life: 0.4, color: '#ffd84a' });
      return;
    }
  },

  // ---------- 星と泡（fl_starbub・スターアサルト＋ファンシーバブルガン） ----------
  //   星が弾けた点から泡が放射状に飛び、割れる（スターアサルト側）。泡が割れた点から星が飛び、弾ける（ファンシーバブルガン側）。
  //   出てきた泡・星は、出た先でさらに泡・星を呼ばない（連鎖しない）
  starBubbles(run, w, x, y, v) {
    const K = BAL.fusionCards.fl_starbub;
    const a0 = Math.random() * 6.28;
    for (let k = 0; k < K.bubbles; k++) {
      const c = this.bulletAt(w, run, x, y, a0 + k * 6.2832 / K.bubbles, { bubble: true, color: '#ff9ad8', through: true, fx: 'fancybubble', child: true, pierce: 0, splash: 0, bulletR: 8, dmgMul: K.bubMul * v,
        onEnd: (r2, cb) => {
          if (cb.popped) return; cb.popped = true;
          Combat.explode(r2, cb.x, cb.y, K.bubR, cb.dmg, { color: '#ff9ad8', stun: K.bubStun });
          Fusion.fx(r2, { k: 'bubblepop', x: cb.x, y: cb.y, r: K.bubR, life: 0.45, seed: Math.abs((cb.x * 5 + cb.y * 3) | 0) % 97 });
        } });
      if (c) c.range = K.bubRange;
    }
  },
  starsFromBubble(run, w, x, y, v) {
    const K = BAL.fusionCards.fl_starbub;
    if (run.time - (w._sbT === undefined ? -9 : w._sbT) < K.starGap) return 0;
    w._sbT = run.time;
    const a0 = Math.random() * 6.28;
    for (let k = 0; k < K.stars; k++) {
      const c = this.bulletAt(w, run, x, y, a0 + k * 6.2832 / K.stars, { color: '#ffe066', through: true, fx: 'star', child: true, pierce: 0, splash: 0, bulletR: 14, speedMul: 0.7, dmgMul: K.starMul * v,
        onEnd: (r2, cb) => {
          if (cb.popped) return; cb.popped = true;
          Combat.explode(r2, cb.x, cb.y, K.starR, cb.dmg, { color: '#ffe066' });
          Fusion.fx(r2, { k: 'starburst', x: cb.x, y: cb.y, r: K.starR, color: '#ffe066', life: 0.6, rot: (cb.x * 0.07) % 6.28, seed: Math.abs((cb.x * 7 + cb.y * 3) | 0) % 97 });
        } });
      if (c) c.range = K.starRange;
    }
    return 1;
  },

  // ---------- 白い乱反射（fl_prism・凍結光線＋スノーグレイブ） ----------
  //   円 (cx,cy,R) の中の点 (px,py) から向き a へ進んだとき、円のふちに当たる点と、そこで反射した向き
  circleBounce(cx, cy, R, px, py, a) {
    const dx = Math.cos(a), dy = Math.sin(a), ox = px - cx, oy = py - cy;
    const b = ox * dx + oy * dy, c = ox * ox + oy * oy - R * R;
    const t = -b + Math.sqrt(Math.max(0, b * b - c));
    const qx = px + dx * t, qy = py + dy * t, nx = (qx - cx) / R, ny = (qy - cy) / R, dn = dx * nx + dy * ny;
    return { x: qx, y: qy, a: Math.atan2(dy - 2 * dn * ny, dx - 2 * dn * nx) };
  },
  //   光線 res.pts が氷の嵐（blizzard・光線が起こした小さな嵐は除く）を通ったら、通った所から嵐の中で乱反射する光を rays 本、bounces 回
  prismReflect(run, w, res, v) {
    const K = BAL.fusionCards.fl_prism, zs = run.fzones;
    if (!zs || !res || !res.pts) return 0;
    let used = 0;
    for (const z of zs) {
      if (used >= K.maxStorms) break;
      if (z.kind !== 'blizzard' || z.mini) continue;
      let bd = 1e18, bx = 0, by = 0, ba = 0;
      for (let i = 1; i < res.pts.length; i++) {
        const p = res.pts[i - 1], q = res.pts[i], dx = q.x - p.x, dy = q.y - p.y, l2 = dx * dx + dy * dy;
        if (l2 < 1) continue;
        const t = Math.max(0, Math.min(1, ((z.x - p.x) * dx + (z.y - p.y) * dy) / l2)), sx = p.x + dx * t, sy = p.y + dy * t, d2 = Util.dist2(sx, sy, z.x, z.y);
        if (d2 < bd) { bd = d2; bx = sx; by = sy; ba = Math.atan2(dy, dx); }
      }
      if (bd > z.r * z.r) continue;
      used++;
      const dd = Math.sqrt(bd), pull = dd > z.r * 0.8 ? (z.r * 0.8) / dd : 1;
      const sx = z.x + (bx - z.x) * pull, sy = z.y + (by - z.y) * pull;       // ふちすれすれなら少し内側から
      const dmg = w.s.dmg * K.dmgK * v;
      for (let k = 0; k < K.rays; k++) {
        let px = sx, py = sy, a = ba + (k - (K.rays - 1) / 2) * 2.1 + Util.rand(-0.35, 0.35);
        for (let n = 0; n <= K.bounces; n++) {
          const o = this.circleBounce(z.x, z.y, z.r, px, py, a), p0 = { x: px, y: py }, p1 = { x: o.x, y: o.y };
          this.later(run, (k * (K.bounces + 1) + n) * K.gap, () => {
            Combat.lineHit(run, p0.x, p0.y, p1.x, p1.y, K.half, dmg, { color: '#bff0ff', chill: true, slow: w.s.slow, slowDur: w.s.slowDur });
            Fusion.fx(run, { k: 'cryoray', pts: [p0, p1], w: K.half, life: 0.3, seed: (k * 7 + n * 3) % 97 });
          });
          px = o.x - (o.x - z.x) / z.r * 2; py = o.y - (o.y - z.y) / z.r * 2; a = o.a;
        }
      }
    }
    return used;
  },
  //   光線が当たった敵の足もとに小さな氷の嵐（すでに嵐の中の敵・近すぎる敵は飛ばす・1発に mini 個まで）
  prismStorm(run, w, hits, v) {
    const K = BAL.fusionCards.fl_prism, PI = BAL.fusion.icebomb.p, zs = run.fzones || [], got = [];
    if (!hits) return 0;
    for (const e of hits) {
      if (got.length >= K.mini) break;
      if (e.dead || zs.some(z => z.kind === 'blizzard' && Util.dist(z.x, z.y, e.x, e.y) <= z.r)) continue;
      if (got.some(g => Util.dist(g.x, g.y, e.x, e.y) < K.spacing)) continue;
      got.push({ x: e.x, y: e.y });
      const R = PI.R * K.miniR;
      this.zone(run, { kind: 'blizzard', mini: true, x: e.x, y: e.y, r: R, dur: K.miniDur, tick: PI.tick, dps: w.s.dmg * K.miniDps * v, slow: PI.slow, slowDur: 0.8, chill: true, color: '#bff0ff' });
      this.fx(run, { k: 'snowburst', x: e.x, y: e.y, r: R * 0.8, life: 0.5, seed: Math.abs((e.x * 7 + e.y * 3) | 0) % 97 });
    }
    return got.length;
  },

  // ---------- 火花の泡（fl_spark・ポッピングスター＋プラズマチェーン） ----------
  //   ポッピングスターの着弾に、泡が漂う（上限あり）。電撃の線に触れると割れて光の刃が走る。割れた泡は近くの電撃の線へ稲妻を跳ばし、その線を太く強くする
  sparkBubbles(run, w, x, y, v) {
    const K = BAL.fusionCards.fl_spark, P = this.p(w);
    let have = 0;
    for (const b of run.bullets) if (b.sparkBub && !b.popped) have++;
    for (let k = 0; k < K.stay && have < K.max; k++) {
      const a = Math.random() * 6.28, d = P.rayLen * (0.3 + 0.5 * Math.random());
      const c = this.bulletAt(w, run, x + Math.cos(a) * d, y + Math.sin(a) * d, 0, { bubble: true, color: '#b8e6ff', through: true, fx: 'fancybubble', pierce: 0, splash: 0, bulletR: K.bubR, speedMul: 0, dmgMul: K.touchMul, life: K.life,
        onEnd: (r2, cb) => Fusion.sparkPop(r2, cb, false, 0) });
      if (c) { c.sparkBub = true; c.sparkW = w; c.sparkV = v; have++; }
    }
  },
  //   漂う泡 cb を割る。viaLine … 電撃の線に触れて割れた（光の刃が走る）／ ang … 線の向き
  sparkPop(run, cb, viaLine, ang) {
    if (cb.popped) return;
    cb.popped = true; cb.life = 0;
    const w = cb.sparkW, v = cb.sparkV || 1, K = BAL.fusionCards.fl_spark, P = this.p(w);
    this.as(w.id, w, () => {
      Combat.explode(run, cb.x, cb.y, P.popR * K.popRK, w.s.dmg * P.popMul, { color: '#b8e6ff', stun: (w.s.stunDur || 0) * 0.5 });
      this.fx(run, { k: 'bubblepop', x: cb.x, y: cb.y, r: P.popR * K.popRK, life: 0.45, seed: Math.abs((cb.x * 5 + cb.y * 3) | 0) % 97 });
      if (viaLine) {
        const len = P.rayLen * K.lenMul;
        for (let k = 0; k < K.rays; k++) {
          const a = ang + k * 6.2832 / K.rays;
          Combat.lineHit(run, cb.x, cb.y, cb.x + Math.cos(a) * len, cb.y + Math.sin(a) * len, P.rayHalf, w.s.dmg * P.rayMul * K.blade * v, { color: '#ffe38a', crit: w.s.crit, critMul: w.s.critMul });
        }
        this.fx(run, { k: 'popstar', x: cb.x, y: cb.y, r: len, a: ang, n: K.rays, w: P.rayHalf, life: 0.6, seed: Math.abs((cb.x * 3 + cb.y) | 0) % 97 });
      }
      this.sparkJump(run, w, cb.x, cb.y, v);
    });
  },
  //   (x,y) の泡が割れた：近くの電撃の線（プラズマチェーンの弾どうしの線）へ稲妻が跳び、その線が sec 秒 太く強くなる。跳べたら1
  sparkJump(run, w, x, y, v) {
    const K = BAL.fusionCards.fl_spark;
    let best = null, bd = K.reach * K.reach, qx = 0, qy = 0;
    for (const b of run.bullets) {
      const l = b.link;
      if (b.fx !== 'plasma' || !l || l.gone || !b.src || b.src.fuse !== 'plasmachain') continue;
      if (Util.dist(b.x, b.y, l.x, l.y) > (b.linkMax || 120)) continue;
      const dx = l.x - b.x, dy = l.y - b.y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - b.x) * dx + (y - b.y) * dy) / l2));
      const sx = b.x + dx * t, sy = b.y + dy * t, d2 = Util.dist2(sx, sy, x, y);
      if (d2 < bd) { bd = d2; best = b; qx = sx; qy = sy; }
    }
    if (!best) return 0;
    best.sparkT = best.link.sparkT = run.time + K.sec;
    Combat.lineHit(run, x, y, qx, qy, 10, w.s.dmg * K.boltMul * v, { color: '#8fb4ff', shock: 0.8 });
    this.fx(run, { k: 'plasmabolt', pts: [{ x, y }, { x: qx, y: qy }], life: 0.25, color: '#8fb4ff', seed: Math.abs((x * 7 + y * 3) | 0) % 97 });
    return 1;
  },
  //   プラズマチェーンの線 b→l に、漂う泡が触れていたら割る
  sparkTouch(run, b, l) {
    const K = BAL.fusionCards.fl_spark;
    for (const cb of run.bullets) {
      if (!cb.sparkBub || cb.popped) continue;
      if (Util.segDist2(b.x, b.y, l.x, l.y, cb.x, cb.y) > (cb.r + K.touch) * (cb.r + K.touch)) continue;
      this.sparkPop(run, cb, true, Math.atan2(l.y - b.y, l.x - b.x));
    }
  },

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
      const P = Fusion.p(w), F = Fusion.fc(w), K = BAL.fusionCards.fp_starassault;
      const mk = Fusion.link(w, run, 'mark', 'scattergun'), sb = Fusion.link(w, run, 'sb', 'bubblegun');
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.n > 1 ? w.n * 0.7 : 1);
        Combat.spawnBullet(w, run, a, {
          color: '#ffe066', fx: 'star', bulletR: w.s.bulletR,
          onConsume: (rr, b) => {
            Combat.explode(rr, b.x, b.y, P.burstR, b.dmg * P.burstMul, { color: '#ffe066' }); Fusion.fx(rr, { k: 'starburst', x: b.x, y: b.y, r: P.burstR, color: '#ffe066', life: 0.9, rot: (b.x * 0.07) % 6.28, seed: Math.abs((b.x * 7 + b.y * 3) | 0) % 97 });
            if (mk) Fusion.mark(rr, b.x, b.y, P.burstR, mk);
            if (sb) Fusion.starBubbles(rr, w, b.x, b.y, sb);       // 星と泡（fl_starbub）：弾けた星から泡が飛ぶ
            // 連鎖星砕（fp_starassault）：弾けた破片がもう一度弾ける
            if (F.frag) {
              const a0 = Math.random() * 6.28;
              for (let k = 0; k < F.frag; k++) {
                const px = b.x + Math.cos(a0 + k * 6.2832 / F.frag) * P.burstR * 0.8, py = b.y + Math.sin(a0 + k * 6.2832 / F.frag) * P.burstR * 0.8;
                Fusion.later(rr, K.delay, () => {
                  Combat.explode(rr, px, py, P.burstR * K.r, b.dmg * P.burstMul * K.mul, { color: '#ffe066' });
                  Fusion.fx(rr, { k: 'starburst', x: px, y: py, r: P.burstR * K.r, color: '#ffe066', life: 0.6, rot: (px * 0.07) % 6.28, seed: Math.abs((px * 7 + py * 3) | 0) % 97 });
                  if (mk) Fusion.mark(rr, px, py, P.burstR * K.r, mk);
                });
              }
            }
          },
        });
      }
      Fusion.fx(run, { k: 'starmuzzle', x: w.x + Math.cos(w.angle) * 24, y: w.y + Math.sin(w.angle) * 24, a: w.angle, life: 0.1 });   // 撃つ瞬間の発射炎（絵だけ）
    },
  },

  // 2 ガトリング＋テスラ：弾が当たった敵から近くへ電撃が跳ぶ
  plasmachain: {
    id: 'plasmachain', a: 'gatling', b: 'tesla', name: 'プラズマチェーン', short: 'PLC', color: '#8fb4ff',
    role: '中距離の群れ', desc: '弾どうしが電撃の線でつながり、触れた敵を刻む',
    // 2026-10-13：撃った弾どうし（前後）が電撃の線でつながり、線に触れた敵へ刻む（撃つたびと、その半分の間に）。当たった敵からは電撃が跳ぶ
    fire(w, run) {
      const P = Fusion.p(w), spark = Fusion.link(w, run, 'spark', 'bubbleblade'), KS = BAL.fusionCards.fl_spark;
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.n > 1 ? w.n * 0.7 : 1);
        Combat.spawnBullet(w, run, a, {
          color: '#8fb4ff', fx: 'plasma',
          onHit: (rr, b, e) => {
            Fusion.fx(rr, { k: 'plasmahit', x: b.x, y: b.y, life: 0.4, seed: ((b.x * 7 + b.y * 3) | 0) % 97 });
            Fusion.chainFrom(w, rr, e, w.s.chain, b.dmg * P.chainMul, w.s.chainFalloff, { fromX: b.x, fromY: b.y, color: '#8fb4ff', fxk: 'plasmabolt' });
          },
          onEnd: (rr, b) => { b.gone = true; },
        });
        const nb = run.bullets[run.bullets.length - 1];
        if (nb && nb.src === w) { nb.link = w._plPrev && !w._plPrev.gone ? w._plPrev : null; nb.linkMax = P.linkMax; w._plPrev = nb; }
      }
      const net = () => {
        for (const b of run.bullets) {
          const l = b.link;
          if (b.src !== w || !l || l.gone || Util.dist(b.x, b.y, l.x, l.y) > P.linkMax) continue;
          // 火花の泡（fl_spark）：稲妻を受けた線は sparkT まで太く強い／漂う泡に触れたら割る
          const hot = b.sparkT > run.time;
          Combat.lineHit(run, l.x, l.y, b.x, b.y, P.linkHalf * (hot ? KS.thick : 1), w.s.dmg * P.linkMul * (hot ? KS.strong : 1), { color: '#bcd4ff', shock: w.s.shockDur });
          if (spark) Fusion.sparkTouch(run, b, l);
        }
      };
      net();
      Fusion.later(run, 0.5 / Math.max(0.1, w.s.rate), net);
      Fusion.fx(run, { k: 'plasmamuzzle', x: w.x + Math.cos(w.angle) * 24, y: w.y + Math.sin(w.angle) * 24, a: w.angle, life: 0.1 });
    },
  },

  // 3 手裏剣＋刀：跳ね回ったあと持ち主へ戻り、帰り道でもう一度斬る刃
  chakram: {
    id: 'chakram', a: 'shuriken', b: 'katana', name: '円環刃', short: 'CHK', color: '#e6f0ff',
    role: '一直線と、いちばん遠い所', desc: '大きな輪を3枚投げ、遠くで広がって回って刻み、帰りも斬る',
    // 2026-10-13 第2版：大きな輪を rings 枚、扇に投げる（全部貫通）→ いちばん遠い所（射程の端・壁）で輪が spinR まで広がり、spin 秒その場で回って刻む → 戻り道でもう一度全部斬る
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w), KT = BAL.fusionCards.fl_trail;
      const trail = Fusion.link(w, run, 'trail', 'flameblade');
      const cut = (rr, b, e) => Fusion.fx(rr, { k: 'chakcut', x: e.x, y: e.y, a: Math.atan2(b.vy, b.vx) + 2.0, life: 0.32, seed: ((e.x * 3 + e.y) | 0) % 97 });
      const rings = Math.max(1, Math.round(P.rings || 1)) * Math.max(1, Math.round(w.n || 1));
      for (let i = 0; i < rings; i++) {
        const a = w.angle + (i - (rings - 1) / 2) * P.fan + Util.rand(-w.s.spread, w.s.spread);
        const back = (rr, b0) => {
          if (b0.child) return;
          const b = { x: b0.x, y: b0.y };
          const z = { kind: 'chakspin', x: b.x, y: b.y, r: P.spinR, dur: P.spin, tick: P.spinTick, dps: w.s.dmg * P.spinDps, color: '#e6f0ff', dcolor: '#e6f0ff', seed: i };
          // 刻んでいる敵に切り傷を出す（絵だけ。当たりは上の tick が入れている）
          z.pulse = { every: P.cutEvery, fn: (r3, zz) => {
            const l = Fusion.enemiesIn(zz.x, zz.y, zz.r);
            for (let k = 0; k < l.length && k < 3; k++) Fusion.fx(r3, { k: 'chakcut', x: l[k].x, y: l[k].y, a: zz.t * 9 + k * 2.1, life: 0.26, seed: ((l[k].x * 3 + k) | 0) % 97 });
          } };
          Fusion.zone(rr, z);
          Fusion.later(rr, P.spin, () => ret(rr, b));
        };
        const ret = (rr, b) => {
          // 双輪の帰還（fp_chakram）：戻る刃が増えて、扇に広がって帰る
          const rets = 1 + (F.back || 0);
          for (let k = 0; k < rets; k++) {
            const off = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.32;
            const r2 = Fusion.bulletAt(w, rr, b.x, b.y, Util.angle(b.x, b.y, w.x, w.y) + off, { color: '#bcd4ff', fx: 'chakram', pierce: 99, bounce: 0, child: true, dmgMul: P.backMul, bulletR: w.s.bulletR, onHit: cut });
            if (r2) { r2.through = true; r2.range = Util.dist(b.x, b.y, w.x, w.y) + 14; r2.life = 2; }
          }
          // 炎の軌跡（fl_trail）：戻る道に燃える溜まりを残す
          if (trail) {
            for (let k = 1; k <= KT.n; k++) {
              const t = k / (KT.n + 1);
              Combat.spawnField(rr, b.x + (w.x - b.x) * t, b.y + (w.y - b.y) * t, { kind: 'fire', r: KT.r, dur: KT.dur, dps: w.s.dmg * KT.dps * trail, color: '#ff7a3a', src: w });
            }
          }
        };
        Combat.spawnBullet(w, run, a, { color: '#e6f0ff', fx: 'chakram', pierce: 99, bounce: 0, bulletR: w.s.bulletR, onHit: cut, onEnd: back });
        const nb = run.bullets[run.bullets.length - 1];
        if (nb && nb.src === w) nb.range = w.s.range;      // 射程の端（いちばん遠い所）で回る
      }
      Fusion.fx(run, { k: 'chakthrow', x: w.x + Math.cos(w.angle) * 22, y: w.y + Math.sin(w.angle) * 22, a: w.angle, fan: P.fan * (rings - 1) / 2, life: 0.18 });
    },
  },

  // 4 手裏剣＋毒ガス：悪魔の流れ星。大きな流れ星が跳ね回り（10回）、跳ねるたび毒の爆発、通った跡に太い毒の尾の筋が残って刻む。当たった所に毒の雲（2026-10-13 第2版）
  toxblade: {
    id: 'toxblade', a: 'shuriken', b: 'gas', name: '悪魔の流れ星', short: 'DMS', color: '#a8e05a',
    role: '通路の長い区間', desc: '大きな流れ星が跳ね回り、跳ねるたび毒が弾け、通った跡に毒の筋を残す',
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w);
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.n > 1 ? w.n : 1);
        Combat.spawnBullet(w, run, a, {
          color: '#a8e05a', fx: 'devilstar', bulletR: w.s.bulletR,
          onHit: (rr, b, e) => {
            // 毒の尾の筋：跳ねる前の点から当たった所まで（帯の場・刻む）
            const L = Util.dist(b.ox, b.oy, b.x, b.y);
            if (L > 16) Fusion.zone(rr, { kind: 'toxtrail', shape: 'rect', x: (b.ox + b.x) / 2, y: (b.oy + b.y) / 2, a: Math.atan2(b.y - b.oy, b.x - b.ox), hw: L / 2, hh: P.trailW, dur: P.trailDur, tick: P.trailTick, dps: b.dmg * P.trailDps, color: '#8fd94a', dcolor: '#c8ff6a' });
            // 跳ねるたびの毒の爆発（当たった所・半径 burstR）。絵は toxhit の緑の衝撃波（同じ半径）
            for (const o of Fusion.enemiesIn(e.x, e.y, P.burstR)) if (o !== e) Combat.damage(rr, o, b.dmg * P.burstMul, { color: '#c8ff6a' });
            // 猛毒の尾（fp_toxblade）：雲が必ず出て、毒が強く、雲が広がる
            const cloud = F.sure || Math.random() < P.chance, cr = P.cloudR + (F.dr || 0);
            if (cloud) Combat.spawnField(rr, e.x, e.y, { kind: 'gas', r: cr, dur: P.cloudDur, dps: b.dmg * P.cloudDps * (1 + (F.dpsK || 0)), slow: P.slow, vuln: P.vuln, color: '#8fd94a', src: w });
            Fusion.fx(rr, { k: 'toxhit', x: e.x, y: e.y, cr: cloud ? cr : 0, br: P.burstR, life: cloud ? 0.7 : 0.42, seed: ((e.x * 5 + e.y) | 0) % 97 });
          },
        });
      }
      Fusion.fx(run, { k: 'toxmuzzle', x: w.x + Math.cos(w.angle) * 20, y: w.y + Math.sin(w.angle) * 20, a: w.angle, life: 0.12 });
    },
  },

  // 5 刀＋触手：切り裂いて空間を割き、裂け目から触手が出る（企画書の例。斬撃と裂け目に少し傾きを持たせて二重に斬って見える）
  voidblade: {
    id: 'voidblade', a: 'katana', b: 'tentacle', name: '異界の剣', short: 'VDS', color: '#d070ff',
    role: '目の前の、横に広く縦に狭い長方形', desc: '大きく切り裂き、裂け目の触手が何度も突く',
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w), n = Math.max(1, Math.round(w.n || 1)), stabs = P.stabs + (F.tent || 0);
      const rift = Fusion.link(w, run, 'rift', 'abyssnet'), KR = BAL.fusionCards.fl_rift;
      for (let i = 0; i < n; i++) {
        const tilt = P.tilt * (i % 2 ? -1 : 1) * (1 + Math.floor(i / 2));
        const a = w.angle + tilt;
        const cx = w.x + Math.cos(a) * P.dist, cy = w.y + Math.sin(a) * P.dist;
        const hw = P.len / 2, hh = P.wid / 2;
        for (const e of Fusion.rectEnemies(cx, cy, a, hw, hh)) Combat.damage(run, e, w.s.dmg, { color: '#f4d8ff', crit: w.s.crit, critMul: w.s.critMul, exec: w.s.execThr });
        const seed = (w.shots * 7 + i * 3) % 100;
        const rz = { kind: 'rift', shape: 'rect', x: cx, y: cy, a, hw, hh, dur: P.dur * (1 + (F.durK || 0)), tick: P.tick, dps: w.s.dmg * P.dps, slow: P.slow, slowDur: 0.6, color: '#c85ab0', dcolor: '#ffb0e8', seed };
        // 裂け目の触手：stabEvery 秒ごとに、裂け目の中の敵を stabs 本で突き刺す（二本の触手 fp_voidblade で本数が増える）。絵は裂け目の触手（fx-field.js）
        rz.pulse = { every: P.stabEvery, fn: (rr, z) => {
          const list = Fusion.rectEnemies(z.x, z.y, z.a, z.hw, z.hh);
          for (let k = 0; k < stabs && list.length; k++) {
            const e = list.splice((Math.random() * list.length) | 0, 1)[0];
            Combat.damage(rr, e, w.s.dmg * P.stabMul, { color: '#ffb0e8', crit: w.s.crit, critMul: w.s.critMul });
            Fusion.fx(rr, { k: 'riftstab', x: z.x, y: z.y, ex: e.x, ey: e.y, life: 0.22, seed: k });
          }
        } };
        Fusion.zone(run, rz);
        // 裂け目の触手（fl_rift）：狂気の海底の泡に捕まった敵へ、裂け目から触手が伸びる
        if (rift) {
          let hit = 0;
          for (const zz of run.fzones || []) {
            if (zz.kind !== 'abyss' || Util.dist(cx, cy, zz.x, zz.y) > KR.reach) continue;
            for (const e of Fusion.enemiesIn(zz.x, zz.y, zz.r)) {
              if (hit++ >= KR.max) break;
              Combat.damage(run, e, w.s.dmg * rift, { color: '#ffb0e8', crit: w.s.crit, critMul: w.s.critMul });
              Combat.fx(run, { type: 'tentacle', x1: cx, y1: cy, e, color: '#c85ab0', ph: Math.random() * 6.28, life: 0.4 });
            }
          }
        }
        Fusion.fx(run, { k: 'voidslash', x: cx, y: cy, a, hw, hh, life: 0.45, seed });
      }
      Snd.shot(w.id);
      Combat.shake(run, 2.4);
    },
  },

  // 6 刀＋火炎：フランベルジュ。火炎放射器のように紅蓮の炎を噴きっぱなしにし（毎回、正面の扇を焼く）、P.every 秒ぶんの発射ごとに
  //   扇に広がる8連の滅多斬り（1本ずつずらして当たる）→ 十字の大斬り＋炎の爆発。十字の跡は燃える線になって刻む（2026-10-13）
  flameblade: {
    id: 'flameblade', a: 'katana', b: 'flame', name: 'フランベルジュ', short: 'FRB', color: '#ff3a2a',
    role: '目の前の扇', desc: '紅蓮の炎を吹き続け、8連の滅多斬りから十字の大斬りと炎の爆発',
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w), K = BAL.fusionCards.fp_flameblade;
      // 刀の間合い（扇 cone・射程 range）に敵が居ないときは噴かない（次のフレームでまた試す）。w.target は首振りの線の上の敵なので使わない（線から外れるたびに炎が途切れる）
      if (!Fusion.coneEnemies(w, w.angle, w.s.cone, w.s.range).length) return false;
      // 炎の放射（噴きっぱなし）：火炎放射器と同じく、撃つたびに正面の扇を焼く（当たるたびにバリアが下がる＝ヒット数を稼ぐ）
      const fr = w.s.range * P.flameK;
      Combat.coneDamage(w, run, w.angle, P.flameArc, fr, w.s.dmg * P.flameMul, { color: '#ff6a4a', burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur, crit: w.s.crit, critMul: w.s.critMul });
      Fusion.fx(run, { k: 'fbstream', x: w.x, y: w.y, a: w.angle, arc: P.flameArc, r: fr, life: 0.22, seed: (w.shots * 2654435761) % 1000 });
      // 滅多斬り：レートに合わせて P.every 発ごと（時刻で数える。レートの札で速くなる）
      if (w.fbT !== undefined && run.time >= w.fbT && run.time - w.fbT < P.every / w.s.rate) return;
      w.fbT = run.time;
      const n = Math.max(1, Math.round(w.n || 1)) * P.slashes;
      const burn = { burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur }, h = Math.ceil((n - 1) / 2) || 1;
      for (let i = 0; i < n; i++) {
        // 扇に左右交互に広がる（真ん中から外へ）
        const a = w.angle + (i % 2 ? 1 : -1) * Math.ceil(i / 2) / h * w.s.cone * P.spreadK + Util.rand(-0.06, 0.06);
        Fusion.later(run, i * P.gap, () => {
          Combat.coneDamage(w, run, a, P.subArc, w.s.range, w.s.dmg, Object.assign({ color: '#ff6a4a', crit: w.s.crit, critMul: w.s.critMul, exec: w.s.execThr }, burn));
          Fusion.fx(run, { k: 'flamberge', x: w.x, y: w.y, a, arc: P.subArc, r: w.s.range, life: 0.7, seed: (w.shots * 13 + i * 7) % 97 });
        });
      }
      // 十字の大斬り＋炎の爆発：滅多斬りの終わりに、前の点で2本が交差する。斬った跡は燃える線（帯の場）
      Fusion.later(run, n * P.gap + 0.04, () => {
        const ux = Math.cos(w.angle), uy = Math.sin(w.angle), cx = w.x + ux * w.s.range * 0.55, cy = w.y + uy * w.s.range * 0.55, hl = w.s.range * 0.42;
        for (const s of [-1, 1]) {
          const a = w.angle + s * Math.PI / 4, vx = Math.cos(a), vy = Math.sin(a);
          Combat.lineHit(run, cx - vx * hl, cy - vy * hl, cx + vx * hl, cy + vy * hl, P.crossHalf, w.s.dmg * P.crossMul, Object.assign({ color: '#ff2a1a', crit: w.s.crit, critMul: w.s.critMul }, burn));
          Fusion.fx(run, { k: 'flamberge', line: true, x: cx - vx * hl, y: cy - vy * hl, s0: 0, a, r: hl * 2, w: P.crossHalf, life: 0.9, seed: (w.shots * 5 + s + 50) % 97 });
          Fusion.zone(run, { kind: 'flametrail', shape: 'rect', x: cx, y: cy, a, hw: hl, hh: P.crossHalf * 0.6, dur: P.lineDur, tick: 0.25, dps: w.s.dmg * P.lineDps, color: '#ff6a2a', dcolor: '#ffb040', seed: (w.shots * 3 + s + 60) % 97 });
        }
        Combat.explode(run, cx, cy, P.boomR, w.s.dmg * P.boomMul, Object.assign({ color: '#ff6a2a' }, burn));
        Fusion.fx(run, { k: 'flameboom', x: cx, y: cy, r: P.boomR, life: 0.7, seed: w.shots % 97 });
        Combat.shake(run, 2.4);
      });
      // 紅蓮の一閃（fp_flameblade）：滅多斬りの終わりに、前方へ炎の斬撃が走る
      if (F.fin) {
        const L = w.s.range * K.len;
        Combat.lineHit(run, w.x, w.y, w.x + Math.cos(w.angle) * L, w.y + Math.sin(w.angle) * L, K.half, w.s.dmg * F.fin, {
          color: '#ff2a1a', crit: w.s.crit, critMul: w.s.critMul, burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur,
        });
        Fusion.fx(run, { k: 'flamberge', line: true, x: w.x, y: w.y, a: w.angle, r: L, w: K.half, life: 0.7, seed: w.shots % 97 });
      }
      Snd.shot(w.id);
      Combat.shake(run, 2.4);
    },
  },

  // 7 触手＋泡：狂気の海底。大きな泡を1つ出して閉じ込め、中央へ強く引き寄せ、集めた所を触手の一突きで破裂させる
  abyssnet: {
    id: 'abyssnet', a: 'tentacle', b: 'bubble', name: '狂気の海底', short: 'ABY', color: '#4ab8d8',
    role: '引き寄せる範囲', desc: '泡に集め、触手が何度も突き、破裂',
    fire(w, run) {
      const t = w.target;
      if (!t) return false;      // 狙う敵が居ないときは撃たない（次のフレームでまた試す・combat.js）
      const P = Fusion.p(w), F = Fusion.fc(w), K = BAL.fusionCards.fp_abyssnet;
      const centers = [t], want = Math.max(1, Math.round(w.s.count));
      if (want > 1) for (const e of Fusion.nearestTo(t.x, t.y, w.s.range, 60, t)) {
        if (centers.length >= want) break;
        if (centers.every(c => Util.dist(c.x, c.y, e.x, e.y) > P.R * 1.6)) centers.push(e);
      }
      for (const c of centers) {
        Fusion.zone(run, {
          kind: 'abyss', x: c.x, y: c.y, r: P.R, dur: P.dur, tick: P.tick, dps: w.s.dmg * P.dps, stun: w.s.stunDur, pull: P.pull,
          color: '#4ab8d8', dcolor: '#8ad8ff',
          // 泡の中の敵を、下から触手が stabs 本ずつ突く（絵は泡の下から伸びる触手・fx-field.js）
          pulse: { every: P.stabEvery, fn: (rr, z) => {
            const list = Fusion.enemiesIn(z.x, z.y, z.r);
            for (let k = 0; k < P.stabs && list.length; k++) {
              const e = list.splice((Math.random() * list.length) | 0, 1)[0];
              Combat.damage(rr, e, w.s.dmg * P.stabMul, { color: '#ff9ad0', crit: w.s.crit, critMul: w.s.critMul });
              Fusion.fx(rr, { k: 'abyssstab', x: z.x, y: z.y, r: z.r, ex: e.x, ey: e.y, life: 0.24, seed: k });
            }
          } },
          onEnd: (rr, z) => {
            Combat.explode(rr, z.x, z.y, P.burstR, w.s.dmg * P.burstMul, { color: '#ff9ad0', crit: w.s.crit, critMul: w.s.critMul });
            Fusion.fx(rr, { k: 'abyssburst', x: z.x, y: z.y, r: P.burstR, life: 0.55 });
            Combat.shake(rr, 3);
            // 二度目の潮（fp_abyssnet）：一回り広く、もう一度破裂する
            if (F.echo) Fusion.later(rr, K.gap, () => {
              Combat.explode(rr, z.x, z.y, P.burstR * K.r, w.s.dmg * P.burstMul * F.echo, { color: '#ff9ad0', crit: w.s.crit, critMul: w.s.critMul });
              Fusion.fx(rr, { k: 'abyssburst', x: z.x, y: z.y, r: P.burstR * K.r, life: 0.55 });
            });
          },
        });
      }
    },
  },

  // 8 触手＋テスラ：航海の悪夢。雷を纏った竜巻をゆっくり正面へ撃ち出す
  thunderwhip: {
    id: 'thunderwhip', a: 'tentacle', b: 'tesla', name: '航海の悪夢', short: 'NMR', color: '#8a6aff',
    role: '中距離の扇', desc: '雷の竜巻が敵を巻き込み、刻み続ける',
    fire(w, run) {
      if (!w.target) return false;
      const P = Fusion.p(w), F = Fusion.fc(w), K = BAL.fusionCards.fp_thunderwhip;
      // 双子の竜巻（fp_thunderwhip）：左右に竜巻が増える（増えた分は mul 倍の威力）
      const twist = (a, mul) => {
        const sx = w.x + Math.cos(a) * P.start, sy = w.y + Math.sin(a) * P.start;
        Fusion.zone(run, {
          kind: 'twister', x: sx, y: sy, a, r: P.R, dur: P.dur, tick: P.tick, dps: w.s.dmg * P.dps * mul, shock: w.s.shockDur, pull: P.pull,   // 中へ巻き込む（引き寄せ）・速い刻み（ヒット数）
          grabT: w.s.knockDur, grabV: w.s.knock, drift: { x: Math.cos(a) * P.speed, y: Math.sin(a) * P.speed }, color: '#8a6aff', dcolor: '#d8c7ff',
          pulse: { every: P.chainEvery, fn: (rr, z) => {
            const list = Fusion.enemiesIn(z.x, z.y, z.r * 1.2);
            if (!list.length) return;
            const e = list[(Math.random() * list.length) | 0];
            Fusion.chainFrom(w, rr, e, w.s.chain, w.s.dmg * P.chainMul * mul, w.s.chainFalloff, { fromX: z.x, fromY: z.y, direct: true, color: '#c9b3ff', fxk: 'nmzap' });
          } },
        });
      };
      twist(w.angle, 1);
      for (let k = 0; k < (F.twin || 0); k++) twist(w.angle + (k % 2 ? -1 : 1) * Math.ceil((k + 1) / 2) * K.ang, K.mul);
      Snd.shot(w.id);
      Combat.shake(run, 1.2);
    },
  },

  // 9 火炎＋毒ガス：爆裂放射器。火炎放射器と同じく炎を吹き続け（毎秒 rate 回・扇の中の全員に当たる）、炎が敵に掛かっているあいだ、
  //   炎の線に沿って爆発が連鎖し、炎の先に毒の雲が残る（2026-10-13 fx2：ユーザー「元の火炎放射器のように出しっぱでいい」）
  hellmist: {
    id: 'hellmist', a: 'flame', b: 'gas', name: '爆裂放射器', short: 'EXP', color: '#c8b02a',
    role: '近い範囲', desc: '毒の炎を吹き続け、炎の線に沿って爆発が続き、毒が残る',
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w);
      const boom = Fusion.link(w, run, 'boom', 'napalm');
      const hits = Combat.coneDamage(w, run, w.angle, w.s.cone, w.s.range, w.s.dmg, {
        color: '#ffb066', burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur, crit: w.s.crit, critMul: w.s.critMul,
        sticky: w.dyn.sticky || 0,
      });
      Fusion.fx(run, { k: 'hellcone', x: w.x, y: w.y, a: w.angle, arc: w.s.cone, r: w.s.range, life: P.flameLife, seed: (w.shots * 37) % 1000 });   // 絵だけ（fusionfx/fx-elem.js）。毎秒 rate 枚が重なって、途切れない炎になる
      if (!hits) return;                       // 爆発と毒は、炎が敵に掛かっているときだけ（何も無い所で爆ぜない）
      // 炎の線に沿って、手前から奥へ爆発が次々起きる（P.blasts 個・連鎖爆燃 fp_hellmist で増える）。爆発ひとつずつが範囲の当たり
      if (Fusion.due(w, 'fxBT', run, P.blastEvery)) {
        const nB = P.blasts + (F.blasts || 0), a = w.angle, sh = w.shots;
        for (let k = 0; k < nB; k++) {
          const dk = w.s.range * (P.from + (P.at - P.from) * (nB > 1 ? k / (nB - 1) : 1)), px = w.x + Math.cos(a) * dk, py = w.y + Math.sin(a) * dk;
          const blow = () => {
            Combat.explode(run, px, py, P.blastR, w.s.dmg * P.blastMul, { color: '#d8e04a', burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur });
            Fusion.reskin(run, 'boom', 'hellblast', { life: k === nB - 1 ? 1.0 : 0.45, big: k === nB - 1, seed: (k * 29 + sh) % 97 });
          };
          if (k === 0) blow(); else Fusion.later(run, P.gap * k, blow);
        }
      }
      if (Fusion.due(w, 'fxGT', run, P.gasEvery)) {
        const d = w.s.range * P.at, bx = w.x + Math.cos(w.angle) * d, by = w.y + Math.sin(w.angle) * d;
        Combat.spawnField(run, bx, by, { kind: 'gas', r: w.s.fieldR, dur: w.s.fieldDur, dps: w.s.dmg * P.dps, slow: P.slow, vuln: w.s.fieldVuln,
          color: '#8fd94a', src: w, armorDown: w.dyn.armorDown || 0 });
        if (boom) Fusion.combust(w, run, run.fields[run.fields.length - 1], boom);   // 燃える溜まりと重なれば爆ぜる（fl_boom）
      }
    },
  },

  // 10 火炎＋迫撃砲：ヴォルケイノブラスト。正面へ火山弾を噴き出し、落ちた所から燃え広がる
  napalm: {
    id: 'napalm', a: 'flame', b: 'mortar', name: 'ヴォルケイノブラスト', short: 'VBL', color: '#ff5a1a',
    role: '正面の長い帯', desc: '溶岩の炎を吹き続け、火山弾を噴き上げて溶岩の溜まりを残す',
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w), boom = Fusion.link(w, run, 'boom', 'hellmist'), n = P.bombs + (F.bombs || 0);   // 噴火の連打（fp_napalm）：火山弾が増える
      // 炎の放射（噴きっぱなし・2026-10-13）：火炎放射器と同じく、撃つたびに正面の扇を焼く。炎の届く長さの中で、射界（P.fanK 倍）に敵が居るあいだ噴き続ける
      let did = false;
      if (Fusion.coneEnemies(w, w.angle, w.arc * P.fanK, P.flameR).length) {
        Combat.coneDamage(w, run, w.angle, P.flameArc, P.flameR, w.s.dmg * P.flameMul, { color: '#ffb066', burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur, crit: w.s.crit, critMul: w.s.critMul });
        Fusion.fx(run, { k: 'vbstream', x: w.x, y: w.y, a: w.angle, arc: P.flameArc, r: P.flameR, life: 0.22, seed: (w.shots * 2654435761) % 1000 });
        did = true;
      }
      // 火山弾：レートに合わせて P.every 発ごと（時刻で数える。レートの札で速くなる）
      if (w.vbT !== undefined && run.time >= w.vbT && run.time - w.vbT < P.every / w.s.rate) return did ? undefined : false;
      // 正面の扇（射界を P.fanK 倍に広げた範囲）にいる敵を狙って噴き出す。居なければ撃たない（次のフレームでまた試す）。手前から奥へ散らばるよう、遠さで並べて等間隔に拾う
      const foes = Fusion.coneEnemies(w, w.angle, w.arc * P.fanK, w.s.range);
      if (!foes.length) return did ? undefined : false;
      w.vbT = run.time;
      foes.sort((p, q) => Util.dist(w.x, w.y, p.x, p.y) - Util.dist(w.x, w.y, q.x, q.y));
      for (let i = 0; i < n; i++) {
        const e = foes[Math.min(foes.length - 1, Math.floor((i + Math.random()) * foes.length / n))];
        const tx = e.x + Util.rand(-P.fan, P.fan) * 40, ty = e.y + Util.rand(-P.fan, P.fan) * 40;
        Combat.spawnLob(w, run, tx, ty, {
          color: '#ff5a1a', rocket: true, fx: 'magma',       // fx＝絵だけ（fusionfx/fx-field.js）
          onLand: (rr, x, y) => {
            Fusion.fx(rr, { k: 'magmaland', x, y, r: w.s.splash, life: 0.5, seed: Math.abs((x * 7 + y * 3) | 0) % 97 });
            Combat.explode(rr, x, y, w.s.splash, w.s.dmg, { color: '#ff9a4a', burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur, crit: w.s.crit, critMul: w.s.critMul });
            Combat.spawnField(rr, x, y, { kind: 'fire', r: P.poolR, dur: P.poolDur, dps: w.s.dmg * w.s.burn * P.poolDps, color: '#ff8a3a', src: w });
            if (boom) Fusion.combust(w, rr, rr.fields[rr.fields.length - 1], boom);   // 毒の雲と重なれば爆ぜる（fl_boom）
          },
        });
      }
      Fusion.fx(run, { k: 'eruption', x: w.x, y: w.y, a: w.angle, life: 0.45 });
      Combat.shake(run, 2);
    },
  },

  // 11 凍結＋火炎：相反の渦。氷の放射と炎の放射が背中合わせに吹き続けながら回る（2026-10-13 fx2：ユーザー「根本から表現方法を変えて」「火炎放射器が元のものは出しっぱで」）
  //   回る向きは run.time で決める（撃つ回数で回すと、フレームの刻みで速さが変わる）。氷が掛けた凍結に炎が掛かると熱衝撃で砕ける
  vortex: {
    id: 'vortex', a: 'cryo', b: 'flame', name: '相反の渦', short: 'VTX', color: '#ff9ad0',
    role: '凍結の広い範囲のまま', desc: '氷と炎を背中合わせに吹きながら回る。凍った敵に炎が掛かると砕ける',
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w), KS = BAL.fusionCards.fl_shatter, shK = P.shatter + (F.shatter || 0);
      const sh = Fusion.link(w, run, 'burst', 'icefoam');
      if (w.fxA0 === undefined) w.fxA0 = Math.random() * Math.PI * 2;
      const ai = w.fxA0 + run.time * P.spin, af = ai + Math.PI, R = w.s.range;
      // 炎の側：先に熱衝撃を見る（氷の側が前に通って凍らせた敵）。砕けたら凍結は解ける（次に氷が通ればまた凍る）
      for (const e of Fusion.coneEnemies(w, af, P.arc, R)) {
        if (e.dead) continue;
        if (e.chill > 0 && !(e.fshT > run.time)) {
          e.fshT = run.time + P.cool; e.chill = 0;
          Combat.explode(run, e.x, e.y, P.shR, w.s.dmg * shK, { color: '#ffffff' });
          Fusion.fx(run, { k: 'vtxshock', x: e.x, y: e.y, r: P.shR, life: 0.6, seed: (e.id || 0) % 97 });
        }
        // 凍泡炸裂（fl_shatter）：永久凍土の凍った泡に包まれている敵は、渦に入ると爆ぜる
        if (sh && e.fcage > run.time) {
          e.fcage = 0;
          Combat.explode(run, e.x, e.y, KS.r, w.s.dmg * sh, { color: '#bff0ff', chill: true });
          Fusion.fx(run, { k: 'vtxshock', x: e.x, y: e.y, r: KS.r, life: 0.6, seed: 7 });
        }
      }
      Combat.coneDamage(w, run, af, P.arc, R, w.s.dmg, { color: '#ffb066', burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur, crit: w.s.crit, critMul: w.s.critMul });
      Combat.coneDamage(w, run, ai, P.arc, R, w.s.dmg, { color: '#bff0ff', slow: w.s.slow, slowDur: w.s.slowDur, chill: true, crit: w.s.crit, critMul: w.s.critMul });
      // 絵（fusionfx/fx-elem.js）：氷と炎の2枚。毎秒 rate 枚ずつ、回りながら重なって、途切れない放射の帯になる
      const seed = (w.shots * 37) % 1000;
      Fusion.fx(run, { k: 'vtxjet', x: w.x, y: w.y, a: ai, arc: P.arc, r: R, life: P.jetLife, seed, ice: 1 });
      Fusion.fx(run, { k: 'vtxjet', x: w.x, y: w.y, a: af, arc: P.arc, r: R, life: P.jetLife, seed: seed + 500, ice: 0 });
    },
  },

  // 12 凍結＋泡：永久凍土。砲台を包む大きな泡（半径＝射程）が膨らんで凍りつき、中の敵を止める → 氷のドームが砕け、破片が中の敵へ刺さる → 足元が凍土として残る
  //   （2026-10-13 fx2：ユーザー「根本から表現方法を変えて」。前は敵1体ずつに小さな泡の殻）。範囲に敵が居ないときは撃たない（何も無い所でドームを出さない）
  icefoam: {
    id: 'icefoam', a: 'cryo', b: 'bubble', name: '永久凍土', short: 'PRM', color: '#9fe6ff',
    role: '広い範囲', desc: '大きな泡で範囲を包んで凍らせ、砕けた氷が中の敵に何度も刺さる。足元は凍土になる',
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w), K = BAL.fusionCards.fp_icefoam, R = w.s.range;
      const foes = Fusion.nearestTo(w.x, w.y, R, P.n);
      if (!foes.length) return false;
      const caged = Fusion.link(w, run, 'burst', 'vortex');
      Snd.shot(w.id);
      const seed = (w.shots * 13) % 97;
      Fusion.fx(run, { k: 'pfdome', x: w.x, y: w.y, r: R, life: P.delay + 0.5, hold: P.delay, seed });
      let shown = 0;
      for (const e of foes) {
        if (Combat.inShield(run, e)) continue;
        Combat.damage(run, e, w.s.dmg, { color: '#bff0ff', stun: w.s.stunDur, slow: w.s.slow, slowDur: w.s.slowDur, chill: true, crit: w.s.crit, critMul: w.s.critMul });
        if (caged) e.fcage = run.time + P.delay;      // 凍った泡の中にいる印（fl_shatter・相反の渦が読む）
        const vis = shown++ < P.cages;
        if (vis) Fusion.fx(run, { k: 'pfcoat', e, x: e.x, y: e.y, r: 15, life: P.delay, seed: shown });
        // 砕ける少し前に、破片がドームの縁から飛び出す（絵）。刺さる時刻が当たりの時刻と同じになるよう travel 秒前に出す
        if (vis) Fusion.later(run, P.delay - P.travel, () => {
          if (e.dead) return;
          const a = Math.atan2(e.y - w.y, e.x - w.x);
          Fusion.fx(run, { k: 'pfshard', e, x: e.x, y: e.y, cx: w.x, cy: w.y, R, a, n: P.shardHits, gap: P.shardGap, travel: P.travel, r: P.shardR, life: P.travel + P.shardGap * P.shardHits + 0.5, seed: shown * 7 });
        });
        Fusion.later(run, P.delay, () => {
          if (e.dead) return;
          // 砕けた破片が shardHits 回に分かれて刺さる（1回目はその場で・残りは shardGap 秒ずつ遅れて）。周りの敵にも当たる
          const ex = e.x, ey = e.y;
          for (let h = 0; h < P.shardHits; h++) {
            const hit = () => Combat.explode(run, ex, ey, P.shardR, w.s.dmg * P.shardMul, { color: '#bff0ff', slow: P.shardSlow, slowDur: P.shardSlowDur, chill: true });
            if (h === 0) hit(); else Fusion.later(run, P.shardGap * h, hit);
          }
          // 連鎖凍裂（fp_icefoam）：破裂が近くの敵へ連鎖する
          if (F.chain) {
            Fusion.nearestTo(ex, ey, P.shardR * K.reach, F.chain + 1, e).slice(0, F.chain).forEach((o, k) => Fusion.later(run, K.gap * (k + 1), () => {
              Combat.explode(run, o.x, o.y, P.shardR, w.s.dmg * P.shardMul * K.mul, { color: '#bff0ff', slow: P.shardSlow, slowDur: P.shardSlowDur, chill: true });
              Fusion.fx(run, { k: 'pfburst', x: o.x, y: o.y, r: P.shardR, life: 0.6, seed: k + 3 });
            }));
          }
        });
      }
      // ドームが砕けたら、足元が凍土になる（1基に1枚・新しいものに置き換える）。中の敵へ刻み続け、凍らせて遅くする
      Fusion.later(run, P.delay, () => {
        const zs = run.fzones;
        if (zs) for (let i = zs.length - 1; i >= 0; i--) if (zs[i].kind === 'permafrost' && zs[i].src === w) zs.splice(i, 1);
        Fusion.zone(run, { kind: 'permafrost', x: w.x, y: w.y, r: R, dur: P.groundDur, tick: P.groundTick, dps: w.s.dmg * P.groundDps,
          slow: w.s.slow, slowDur: 1, chill: true, color: '#bff0ff', seed });
      });
    },
  },

  // 13 レーザー＋凍結：反射した場所に氷の棘山を生やす
  cryobeam: {
    id: 'cryobeam', a: 'sniper', b: 'cryo', name: '凍結光線', short: 'CRB', color: '#7fe6ff',
    role: '反射する光の線', desc: '通った線に霜が残り、反射した所に氷の棘山',
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w), prism = Fusion.link(w, run, 'prism', 'icebomb');
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + (i === 0 ? 0 : ((i % 2) ? 1 : -1) * Math.ceil(i / 2) * 0.06);
        const hitL = prism ? [] : null;
        const res = Combat.laser(w, run, a, { opts: { chill: true, slow: w.s.slow, slowDur: w.s.slowDur }, color: '#7fe6ff', life: 0.45, hits: hitL });
        if (!res) continue;
        Fusion.reskin(run, 'laser', 'cryoray', { seed: (w.shots * 7 + i) % 97 });   // 絵だけ（0.45秒も絵の長さ）
        if (prism) { Fusion.prismReflect(run, w, res, prism); Fusion.prismStorm(run, w, hitL, prism); }   // 白い乱反射（fl_prism）：氷の嵐の中で乱反射／当たった敵の足もとに小さな嵐
        // 通った線の上に霜が残り、刻み続ける（区間ごとに長方形の場）
        for (let k = 1; k < res.pts.length; k++) {
          const p = res.pts[k - 1], q = res.pts[k], L = Math.hypot(q.x - p.x, q.y - p.y);
          if (L < 8) continue;
          Fusion.zone(run, { kind: 'frostline', shape: 'rect', x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, a: Math.atan2(q.y - p.y, q.x - p.x), hw: L / 2, hh: w.s.bulletR,
            dur: P.lineDur, tick: P.lineTick, dps: w.s.dmg * P.lineDps, slow: w.s.slow, slowDur: 0.6, chill: true, color: '#bff0ff' });
        }
        // 棘山の道（fp_cryobeam）：光線の道すがらにも棘山が生える
        for (let k = 1; k <= (F.along || 0); k++) {
          const p = Fusion.along(res.pts, k / (F.along + 1));
          Fusion.zone(run, { kind: 'spikes', x: p.x, y: p.y, r: P.spikeR, dur: P.spikeDur, tick: P.spikeTick, dps: w.s.dmg * P.spikeDps, slow: P.spikeSlow, slowDur: 0.8, chill: true, color: '#bff0ff' });
        }
        for (let k = 1; k < Math.min(res.pts.length, 6); k++) {
          const p = res.pts[k];
          Fusion.zone(run, { kind: 'spikes', x: p.x, y: p.y, r: P.spikeR, dur: P.spikeDur, tick: P.spikeTick, dps: w.s.dmg * P.spikeDps, slow: P.spikeSlow, slowDur: 0.8, chill: true, color: '#bff0ff' });
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
      const P = Fusion.p(w), KB = BAL.fusionCards.fl_bolt, bolt = Fusion.link(w, run, 'bolt', 'chainstrike');
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + (i === 0 ? 0 : ((i % 2) ? 1 : -1) * Math.ceil(i / 2) * 0.06);
        const hits = [], res = Combat.laser(w, run, a, { multi: true, color: '#fff0b0', life: P.life, hits });
        if (res) Fusion.reskin(run, 'laser', 'novaray', { hits });   // 絵だけ（当たった敵に多段ヒットの光）
        // 電光の結線（fl_bolt）：光線の折れ点から、近くの敵へ電撃が走る（毎 every 発に1回）
        if (bolt && res && w.shots % KB.every === 0) {
          for (let k = 1; k < Math.min(res.pts.length, KB.max + 1); k++) {
            const p = res.pts[k], e = Fusion.nearestTo(p.x, p.y, KB.reach, 1)[0];
            if (e) Fusion.chainFrom(w, run, e, 2, w.s.dmg * KB.snvK * bolt, 0.85, { fromX: p.x, fromY: p.y, direct: true, color: '#fff0b0' });
          }
        }
      }
    },
  },

  // 15 ミサイル＋迫撃砲：滅尽嵐。爆撃した所に火炎旋風が巻き起こる
  carpet: {
    id: 'carpet', a: 'missile', b: 'mortar', name: '滅尽嵐', short: 'MTS', color: '#ff7a2a',
    role: '遠くの広い円', desc: '爆撃の跡に火炎旋風',
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w), K = BAL.fusionCards.fp_carpet;
      Fusion.bombardWith(w, run, '#ff7a3c', (rr, x, y) => {
        Combat.explode(rr, x, y, w.s.splash, w.s.dmg, { color: '#ff9a4a', crit: w.s.crit, critMul: w.s.critMul });
        // 旋風の群れ（fp_carpet）：着弾点のまわりに旋風が増える
        const n = 1 + (F.whirls || 0), a0 = Math.random() * 6.28;
        for (let k = 0; k < n; k++) {
          const ang = Math.random() * 6.28, wx = k === 0 ? x : x + Math.cos(a0 + k * 6.2832 / (n - 1)) * P.R * K.off, wy = k === 0 ? y : y + Math.sin(a0 + k * 6.2832 / (n - 1)) * P.R * K.off;
          Fusion.zone(rr, { kind: 'firewhirl', x: wx, y: wy, r: P.R, dur: P.dur, tick: P.tick, dps: w.s.dmg * P.dps, burn: w.s.dmg * P.burn, burnDur: 2, pull: P.pull,   // 中へ吸い込む（炎の舌が中へ巻く絵）
            drift: { x: Math.cos(ang) * P.drift, y: Math.sin(ang) * P.drift }, color: '#ff7a2a', dcolor: '#ffb066' });
        }
        Fusion.fx(rr, { k: 'carpetblast', x, y, r: P.R, life: 0.6, seed: Math.abs((x * 7 + y * 3) | 0) % 97 });
      }, { rocket: true, fx: 'stormmsl' });
    },
  },

  // 16 ミサイル＋テスラ：磁気嵐。着弾点に電撃の嵐が吹き荒れ、周りへ連鎖する
  chainstrike: {
    id: 'chainstrike', a: 'missile', b: 'tesla', name: '磁気嵐', short: 'MGS', color: '#9a7cff',
    role: '遠くの円', desc: '着弾点に嵐が残り、稲妻を落とし続ける',
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w), K = BAL.fusionCards.fp_chainstrike, KB = BAL.fusionCards.fl_bolt;
      const bolt = Fusion.link(w, run, 'bolt', 'convergence');
      Fusion.bombardWith(w, run, '#b58bff', (rr, x, y) => {
        Combat.explode(rr, x, y, w.s.splash, w.s.dmg, { color: '#d8c7ff', shock: w.s.shockDur, crit: w.s.crit, critMul: w.s.critMul });
        Fusion.reskin(rr, 'boom', 'magboom', { r: P.pillarR, life: 0.5, seed: Math.abs((x * 7 + y * 3) | 0) % 97 });   // 絵だけ（着弾の閃光）
        // 嵐が残り、中の敵へ稲妻を次々落とす（P.stormDur 秒・P.boltEvery 秒ごとに P.bolts 本）＋嵐そのものも刻む
        Fusion.zone(rr, { kind: 'magstorm', x, y, r: P.pillarR, dur: P.stormDur, tick: P.tick, dps: w.s.dmg * P.dps, shock: w.s.shockDur, color: '#b58bff', dcolor: '#d8c7ff',
          ph: (x * 0.031 + y * 0.017) % 6.28, sd: Math.abs((x * 7 + y * 3) | 0) % 97,
          pulse: { every: P.boltEvery, fn: (r2, z) => {
            const l = Fusion.enemiesIn(z.x, z.y, z.r);
            for (let i = 0; i < P.bolts && l.length; i++) {
              const e = l.splice((Math.random() * l.length) | 0, 1)[0];
              Fusion.chainFrom(w, r2, e, 1, w.s.dmg * P.boltMul, w.s.chainFalloff, { fromX: z.x, fromY: z.y, direct: true, color: '#b58bff', fxk: 'magzap' });
            }
          } } });
        const first = Fusion.nearestTo(x, y, P.pillarR, 1)[0];
        if (first) Fusion.chainFrom(w, rr, first, w.s.chain, w.s.dmg * P.chainMul, w.s.chainFalloff, { fromX: x, fromY: y, direct: true, color: '#b58bff', fxk: 'magzap' });
        // 落雷の群れ（fp_chainstrike）：着弾点のまわりで雷が増える
        if (F.bolts) for (const e of Fusion.nearestTo(x, y, P.pillarR * K.reach, F.bolts + 1, first).slice(0, F.bolts)) {
          Fusion.chainFrom(w, rr, e, Math.min(K.n, w.s.chain), w.s.dmg * P.chainMul, w.s.chainFalloff, { fromX: x, fromY: y, direct: true, color: '#b58bff', fxk: 'magzap' });
        }
        // 電光の結線（fl_bolt）：直前の着弾点との間を電撃の線が結ぶ
        if (bolt) {
          const L = rr.fcLast;
          if (L && rr.time - L.t < KB.gapSec && Util.dist(L.x, L.y, x, y) > 20) {
            Combat.lineHit(rr, L.x, L.y, x, y, 16, w.s.dmg * KB.msK * bolt, { color: '#b58bff', shock: w.s.shockDur });
            Fusion.fx(rr, { k: 'magzap', pts: [{ x: L.x, y: L.y }, { x, y }], life: 0.2, seed: Math.abs((x + y) | 0) % 97 });
          }
          rr.fcLast = { x, y, t: rr.time };
        }
      }, { rocket: true, fx: 'magmissile' });
    },
  },

  // 17 テスラ＋毒ガス：帯電した雲が漂い、中の敵へ電撃を落とし続ける
  stormcloud: {
    id: 'stormcloud', a: 'tesla', b: 'gas', name: '雷雲', short: 'STM', color: '#7a6ac8',
    role: '置いた所のまわり', desc: '雷雲の下へ落雷が続き、毒の雨が刻む',
    fire(w, run) {
      const t = w.target;
      if (!t) return false;      // 狙う敵が居ないときは撃たない（次のフレームでまた試す・combat.js）
      const P = Fusion.p(w), F = Fusion.fc(w), arc = Fusion.link(w, run, 'arc', 'resonator'), KA = BAL.fusionCards.fl_arc;
      const ang = Math.random() * Math.PI * 2;
      Fusion.zone(run, {
        kind: 'storm', x: t.x, y: t.y, r: w.s.fieldR, dur: w.s.fieldDur, tick: P.tick, dps: w.s.dmg * P.rainDps, slow: 0.12, shock: 0.4,   // 毒の雨が速い刻みで当たる
        drift: { x: Math.cos(ang) * P.drift, y: Math.sin(ang) * P.drift }, color: '#6a5ab8',
        pulse: { every: P.strikeEvery, fn: (rr, z) => {
          const list = Fusion.enemiesIn(z.x, z.y, z.r * P.strikeR);
          if (!list.length) return;
          // 積乱雲（fp_stormcloud）：一度に落ちる雷が増える
          for (let k = 0; k <= (F.strikes || 0) && list.length; k++) {
            const e = list.splice((Math.random() * list.length) | 0, 1)[0];
            Fusion.fx(rr, { k: 'strike', x: e.x, y: e.y, fromX: z.x, fromY: z.y - z.r * 0.45, life: 0.32, color: '#d8c7ff', seed: Math.abs((e.x * 3 + e.y) | 0) % 97 });   // 0.32秒は絵の長さ
            Fusion.chainFrom(w, rr, e, w.s.chain, w.s.dmg * P.strikeMul, w.s.chainFalloff, { fromX: e.x, fromY: e.y, direct: true, color: '#d8c7ff', fxk: 'stormzap' });
          }
          // 雷の往復（fl_arc）：落雷が、プラズマボールのまわりの敵にも跳ぶ
          if (arc) {
            let n = 0;
            for (const bz of rr.fzones || []) {
              if (bz.kind !== 'plasmaball' || n++ >= KA.max) continue;
              const b = Fusion.nearestTo(bz.x, bz.y, bz.r * 1.5, 1)[0];
              if (b) Fusion.chainFrom(w, rr, b, KA.n, w.s.dmg * P.strikeMul * arc, w.s.chainFalloff, { fromX: z.x, fromY: z.y, direct: true, color: '#e6d0ff' });
            }
          }
        } },
      });
    },
  },

  // 18 テスラ＋泡：プラズマボール。おもちゃのプラズマボールを正面に出し、一定時間 範囲攻撃と電撃を浴びせる
  resonator: {
    id: 'resonator', a: 'tesla', b: 'bubble', name: 'プラズマボール', short: 'PLB', color: '#c07aff',
    role: '正面の円', desc: '球の中の敵全員へ、電撃を何度も',
    fire(w, run) {
      const t = w.target;
      if (!t) return false;      // 狙う敵が居ないときは撃たない（次のフレームでまた試す・combat.js）
      const P = Fusion.p(w), F = Fusion.fc(w), arc = Fusion.link(w, run, 'arc', 'stormcloud'), KA = BAL.fusionCards.fl_arc, a = w.angle;
      const d = Math.min(w.s.range * P.at, Util.dist(w.x, w.y, t.x, t.y));
      const bx = w.x + Math.cos(a) * d, by = w.y + Math.sin(a) * d;
      Fusion.zone(run, {
        kind: 'plasmaball', x: bx, y: by, r: P.R, dur: P.dur, tick: 0.25, dps: w.s.dmg * P.dps, shock: w.s.shockDur, color: '#c07aff', dcolor: '#e6d0ff',
        pulse: { every: P.zapEvery, fn: (rr, z) => {
          // 放電過多（fp_resonator）：電撃が当たる敵が増える
          for (const e of Fusion.nearestTo(z.x, z.y, z.r * P.reach, P.zaps + (F.zaps || 0))) {
            Fusion.chainFrom(w, rr, e, w.s.chain, w.s.dmg * P.zapMul, w.s.chainFalloff, { fromX: z.x, fromY: z.y, direct: true, color: '#e6d0ff', fxk: 'zap', r0: z.r });
          }
          // 雷の往復（fl_arc）：電撃が、雷雲の中の敵にも跳ぶ
          if (arc) {
            let n = 0;
            for (const sz of rr.fzones || []) {
              if (sz.kind !== 'storm' || n++ >= KA.max) continue;
              const e = Fusion.nearestTo(sz.x, sz.y, sz.r, 1)[0];
              if (e) Fusion.chainFrom(w, rr, e, KA.n, w.s.dmg * P.zapMul * arc, w.s.chainFalloff, { fromX: z.x, fromY: z.y, direct: true, color: '#e6d0ff' });
            }
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
      const P = Fusion.p(w), F = Fusion.fc(w);
      Fusion.zone(run, {
        kind: 'aquaregia', x: t.x, y: t.y, r: w.s.fieldR, dur: w.s.fieldDur, tick: P.tick, dps: w.s.dmg * P.dps, slow: P.slow, slowDur: 0.8,
        vulnT: 0.4 + (F.linger || 0), armorT: 0.6 + (F.linger || 0),       // 黄金の残滓（fp_acidfoam）：場を出ても脆弱と装甲ダウンが残る
        vuln: w.s.fieldVuln, armorDown: Math.min(BAL.cardFx.armorDownMax, P.armorDown + (w.dyn.armorDown || 0)), color: '#ffd24a', dcolor: '#fff0a0',
      });
      Fusion.fx(run, { k: 'aquasplash', x: t.x, y: t.y, r: w.s.fieldR, life: 0.5 });
    },
  },

  // 20 毒ガス＋迫撃砲：破滅の雨。毒ガスの持続を犠牲に、超高火力の砲撃を浴びせる
  toxmortar: {
    id: 'toxmortar', a: 'gas', b: 'mortar', name: '破滅の雨', short: 'DOM', color: '#7fe35a',
    role: '遠くの円', desc: '毒の砲弾の雨を絶え間なく。毒は一瞬',
    fire(w, run) {
      const t = w.target;
      if (!t) return false;      // 狙う敵が居ないときは撃たない（次のフレームでまた試す・combat.js）
      const P = Fusion.p(w), F = Fusion.fc(w), acid = Fusion.link(w, run, 'acid', 'acidfoam'), KA = BAL.fusionCards.fl_acid;
      const shells = P.shells + (F.shells || 0);       // 雨脚の強まり（fp_toxmortar）：砲弾が増える
      for (let i = 0; i < shells; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * P.spread;
        const tx = t.x + Math.cos(a) * d, ty = t.y + Math.sin(a) * d;
        Fusion.later(run, P.gap * i, () => {
          Combat.spawnLob(w, run, tx, ty, {
            color: '#7fe35a', rocket: true, fx: 'doomshell',       // fx＝絵だけ（fusionfx/fx-field.js）
            onLand: (rr, x, y) => {
              Fusion.fx(rr, { k: 'doomblast', x, y, r: w.s.splash, life: 0.75, seed: Math.abs((x * 7 + y * 3) | 0) % 97 });
              Combat.explode(rr, x, y, w.s.splash, w.s.dmg, { color: '#b8ff6a', crit: w.s.crit, critMul: w.s.critMul });
              // 酸の爆発（fl_acid）：王水の黄金の液体に落ちた砲弾は、もう一度爆ぜる
              if (acid && (rr.fzones || []).some(z => z.kind === 'aquaregia' && Util.dist(z.x, z.y, x, y) <= z.r)) {
                Combat.explode(rr, x, y, w.s.splash * KA.r, w.s.dmg * acid, { color: '#ffd24a', crit: w.s.crit, critMul: w.s.critMul });
                Fusion.fx(rr, { k: 'pop', x, y, r: w.s.splash * KA.r, life: 0.35, color: '#ffd24a' });
              }
              if (i === 0) Combat.spawnField(rr, x, y, { kind: 'gas', r: w.s.fieldR, dur: w.s.fieldDur, dps: w.s.dmg * P.gasDps, slow: w.s.slow, vuln: w.s.fieldVuln, color: '#8fd94a', src: w, armorDown: w.dyn.armorDown || 0 });
            },
          });
        });
      }
    },
  },

  // 21 泡＋ガトリング：ファンシーバブルガン。泡を連射し、割れると小さな泡 kids 個に分かれて、それぞれまた割れる（2026-10-13）
  bubblegun: {
    id: 'bubblegun', a: 'bubble', b: 'gatling', name: 'ファンシーバブルガン', short: 'FBG', color: '#ff9ad8',
    role: '円の方向へ連射', desc: '泡を連射・割れると小さな泡に分かれてまた割れる',
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w), K = BAL.fusionCards.fp_bubblegun, sb = Fusion.link(w, run, 'sb', 'starassault');
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.n > 1 ? w.n * 0.7 : 1);
        Combat.spawnBullet(w, run, a, {
          bubble: true, color: '#ff9ad8', through: true, fx: 'fancybubble',
          onConsume: (rr, b) => {
            Combat.explode(rr, b.x, b.y, w.s.splash, b.dmg * P.popMul, { color: '#ff9ad8', stun: w.s.stunDur * P.popStun });
            Fusion.fx(rr, { k: 'bubblepop', x: b.x, y: b.y, r: w.s.splash, life: 0.5, seed: ((b.x * 7 + b.y * 3) | 0) % 97 });
            if (sb) Fusion.starsFromBubble(rr, w, b.x, b.y, sb);   // 星と泡（fl_starbub）：割れた泡から星が飛ぶ
            // 小さな泡に分かれる：割れた所から放射状に飛び、何かに当たるか、kidRange 進んだら割れる
            const ka0 = Math.random() * 6.28;
            for (let k = 0; k < P.kids; k++) {
              const c = Fusion.bulletAt(w, rr, b.x, b.y, ka0 + k * 6.2832 / P.kids, { bubble: true, color: '#ff9ad8', through: true, fx: 'fancybubble', child: true, pierce: 0, dmgMul: P.kidMul,
                onEnd: (r2, cb) => {
                  Combat.explode(r2, cb.x, cb.y, w.s.splash * P.kidR, cb.dmg * P.popMul, { color: '#ff9ad8', stun: w.s.stunDur * P.popStun * 0.5 });
                  Fusion.fx(r2, { k: 'bubblepop', x: cb.x, y: cb.y, r: w.s.splash * P.kidR, life: 0.45, seed: ((cb.x * 5 + cb.y * 3) | 0) % 97 });
                } });
              if (c) c.range = P.kidRange;
            }
            // 弾ける泡（fp_bubblegun）：割れた泡から小さな泡が分かれて、もう一度割れる
            for (let k = 0; k < (F.kids || 0); k++) {
              const ka = Math.random() * 6.28, kd = w.s.splash * 1.1, px = b.x + Math.cos(ka) * kd, py = b.y + Math.sin(ka) * kd;
              Fusion.later(rr, K.gap * (k + 1), () => {
                Combat.explode(rr, px, py, w.s.splash * K.r, b.dmg * P.popMul * K.mul, { color: '#ff9ad8', stun: w.s.stunDur * P.popStun * K.stun });
                Fusion.fx(rr, { k: 'bubblepop', x: px, y: py, r: w.s.splash * K.r, life: 0.45, seed: ((px * 5 + py) | 0) % 97 });
              });
            }
          },
        });
      }
      Fusion.fx(run, { k: 'bubblemuzzle', x: w.x + Math.cos(w.angle) * 22, y: w.y + Math.sin(w.angle) * 22, a: w.angle, life: 0.14 });
    },
  },

  // 22 迫撃砲＋ガトリング：クラスター爆弾。砲弾が空中で弾け、小さな爆発の雨を降らせる
  scattergun: {
    id: 'scattergun', a: 'mortar', b: 'gatling', name: 'クラスター爆弾', short: 'CLB', color: '#e0c070',
    role: '遠くの円', desc: '空中で割れ、子弾の雨が広く降る',
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w), K = BAL.fusionCards.fp_scattergun, KM = BAL.fusionCards.fl_mark;
      const mk = Fusion.link(w, run, 'mark', 'starassault');
      Fusion.bombardWith(w, run, '#e0c070', (rr, x, y) => {
        const total = P.pellets + (F.pel || 0);       // 親子爆弾（fp_scattergun）：子弾が増え、最後の1発は大きく炸裂する
        const pts = [];
        for (let i = 0; i < total; i++) {
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * P.spread;
          const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
          const big = F.pel && i === total - 1 ? K.finale : 1;
          pts.push({ x: px, y: py, d: 0.045 * i });
          Fusion.later(rr, 0.045 * i, () => {
            Combat.spotImpact(w, rr, px, py, 0, P.pelMul * big); Fusion.fx(rr, { k: 'pellet', x: px, y: py, life: 0.55, big: big > 1, seed: ((px * 7 + py) | 0) % 97 });
            if (mk) Fusion.mark(rr, px, py, KM.pelR, mk);       // 被弾の印（fl_mark）
          });
        }
        Fusion.fx(rr, { k: 'clusteropen', x, y, pts, life: Math.max(0.7, 0.045 * total + 0.1), seed: ((x * 3 + y) | 0) % 97 });
      }, { fx: 'cluster' });
      Fusion.fx(run, { k: 'clustermuzzle', x: w.x + Math.cos(w.angle) * 22, y: w.y + Math.sin(w.angle) * 22, a: w.angle, life: 0.35 });
    },
  },

  // 23 泡＋手裏剣：ポッピングスター。泡を纏った流れ星を、置いた円へ落とす
  bubbleblade: {
    id: 'bubbleblade', a: 'bubble', b: 'shuriken', name: 'ポッピングスター', short: 'PPS', color: '#ffe38a',
    role: '遠くの円', desc: '泡を纏った流れ星を落とし、光の刃と泡が次々弾ける',
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w), spark = Fusion.link(w, run, 'spark', 'plasmachain');
      Fusion.bombardWith(w, run, '#ffe38a', (rr, x, y) => {
        Combat.spotImpact(w, rr, x, y, 0, 1);
        if (spark) Fusion.sparkBubbles(rr, w, x, y, spark);       // 火花の泡（fl_spark）：着弾に漂う泡
        const a0 = Math.random() * 6.28, rays = 5 + (F.rays || 0);       // 流星群（fp_bubbleblade）：光の刃が増える
        for (let k = 0; k < rays; k++) {
          const a = a0 + k * Math.PI * 2 / rays;
          Combat.lineHit(rr, x, y, x + Math.cos(a) * P.rayLen, y + Math.sin(a) * P.rayLen, P.rayHalf, w.s.dmg * P.rayMul, { color: '#ffe38a', crit: w.s.crit, critMul: w.s.critMul });
        }
        Fusion.fx(rr, { k: 'popstar', x, y, r: P.rayLen, a: a0, n: rays, w: P.rayHalf, life: 0.6, seed: ((x * 3 + y) | 0) % 97 });
        // 泡が次々割れる：着地のまわりで pops 個、popGap 秒ずつ（ひとつずつが範囲の当たり）
        for (let k = 0; k < P.pops; k++) {
          const pa = a0 + (k + 0.5) * 6.2832 / P.pops, pd = P.rayLen * (0.35 + 0.3 * (k % 2)), px = x + Math.cos(pa) * pd, py = y + Math.sin(pa) * pd;
          Fusion.later(rr, 0.12 + k * P.popGap, () => {
            Combat.explode(rr, px, py, P.popR, w.s.dmg * P.popMul, { color: '#b8e6ff', stun: (w.s.stunDur || 0) * 0.5 });
            Fusion.fx(rr, { k: 'bubblepop', x: px, y: py, r: P.popR, life: 0.45, seed: (k * 13 + 5) % 97 });
            if (spark) Fusion.sparkJump(rr, w, px, py, spark);       // 火花の泡（fl_spark）：近くの電撃の線へ稲妻
          });
        }
      }, { fx: 'meteor' });
      Fusion.fx(run, { k: 'popmuzzle', x: w.x + Math.cos(w.angle) * 20, y: w.y + Math.sin(w.angle) * 20, a: w.angle, life: 0.14 });
    },
  },

  // 24 迫撃砲＋凍結：スノーグレイブ。落とした所に氷の嵐
  icebomb: {
    id: 'icebomb', a: 'mortar', b: 'cryo', name: 'スノーグレイブ', short: 'SNG', color: '#8fd0ff',
    role: '遠くの円', desc: '落とした所に氷の嵐',
    fire(w, run) {
      const P = Fusion.p(w), F = Fusion.fc(w), K = BAL.fusionCards.fp_icebomb;
      Fusion.bombardWith(w, run, '#8fd0ff', (rr, x, y) => {
        Combat.explode(rr, x, y, w.s.splash, w.s.dmg, { color: '#bff0ff', slow: w.s.slow, slowDur: w.s.slowDur, chill: true, crit: w.s.crit, critMul: w.s.critMul });
        const ang = Math.random() * 6.28;
        Fusion.zone(rr, { kind: 'blizzard', x, y, r: P.R, dur: P.dur, tick: P.tick, dps: w.s.dmg * P.dps, slow: P.slow, slowDur: 0.8, chill: true,
          drift: { x: Math.cos(ang) * P.drift, y: Math.sin(ang) * P.drift }, color: '#bff0ff' });
        // 双つの吹雪（fp_icebomb）：逆向きに漂う氷の嵐が増える
        for (let k = 0; k < (F.storms || 0); k++) {
          const sa = ang + Math.PI + k * 1.3, ox = Math.cos(sa) * P.R * K.off, oy = Math.sin(sa) * P.R * K.off;
          Fusion.zone(rr, { kind: 'blizzard', x: x + ox, y: y + oy, r: P.R, dur: P.dur, tick: P.tick, dps: w.s.dmg * P.dps, slow: P.slow, slowDur: 0.8, chill: true,
            drift: { x: Math.cos(sa) * P.drift, y: Math.sin(sa) * P.drift }, color: '#bff0ff' });
        }
        Fusion.fx(rr, { k: 'snowburst', x, y, r: P.R * 0.8, life: 0.6, seed: Math.abs((x * 7 + y * 3) | 0) % 97 });
      }, { rocket: true, fx: 'iceshell' });
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
