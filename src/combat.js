// ---------------------------------------------------------------
// combat.js : 敵・弾・場・状態異常・ウェーブ進行
//   敵はフローフィールドに沿って通路を歩き、コアを目指す
// ---------------------------------------------------------------
'use strict';

const ENEMY_TYPES = {
  grunt: { name: 'grunt', hp: 1.0, spd: 1.0, r: 11, coin: 1.0, xp: 1.0, color: '#ff5b6e', from: 1 },
  swift: { name: 'swift', hp: 0.55, spd: 1.8, r: 8.5, coin: 1.1, xp: 1.1, color: '#ff9cf0', from: 4 },
  tank:  { name: 'tank',  hp: 3.2, spd: 0.6, r: 16, coin: 2.4, xp: 2.2, color: '#c8a05a', from: 7 },
};

// 敵をセルに分けて近傍検索を速くする（スマホで敵400体でも落ちないように）
const Grid = {
  cell: 70, map: new Map(),
  build(enemies) {
    this.map.clear();
    for (const e of enemies) {
      const k = ((e.x / this.cell) | 0) + ',' + ((e.y / this.cell) | 0);
      let a = this.map.get(k);
      if (!a) { a = []; this.map.set(k, a); }
      a.push(e);
    }
  },
  query(x, y, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = ((x - r) / c) | 0, x1 = ((x + r) / c) | 0;
    const y0 = ((y - r) / c) | 0, y1 = ((y + r) / c) | 0;
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const a = this.map.get(gx + ',' + gy);
        if (a) for (const e of a) out.push(e);
      }
    }
    return out;
  },
};

const _q = [];

const Combat = {

  // ================= ウェーブ =================
  waveCount(run, wave) {
    const n = (BAL.waveCountBase + wave * BAL.waveCountPerWave) * run.mods.spawn;
    return Math.min(BAL.waveCountMax, Math.floor(n));
  },

  isBossWave(wave) { return wave % BAL.bossEvery === 0; },

  startWave(run) {
    run.phase = 'spawn';
    run.toSpawn = this.waveCount(run, run.wave);
    if (this.isBossWave(run.wave)) run.toSpawn = Math.max(4, Math.floor(run.toSpawn * 0.6)) + 1;
    run.spawnTimer = 0;
    run.bossSpawned = false;
    run.spawnPick = 0;
  },

  spawnInterval(run) {
    const v = BAL.spawnIntervalBase * Math.pow(0.986, run.wave) * run.mods.waveSpd;
    return Math.max(BAL.spawnIntervalMin, v);
  },

  pickType(wave) {
    const avail = Object.values(ENEMY_TYPES).filter(t => wave >= t.from);
    if (avail.length === 1) return avail[0];
    return Util.weighted(avail, t => t.name === 'grunt' ? 60 : t.name === 'swift' ? 28 : 20);
  },

  spawnEnemy(run, boss) {
    if (run.enemies.length >= BAL.enemyCap) return;
    const st = run.stage;
    const w = run.wave;
    const t = boss ? ENEMY_TYPES.grunt : this.pickType(w);
    // 出現口は順番に使う（1か所に偏らせない）
    const sp = st.spawns[run.spawnPick++ % st.spawns.length];
    const p = st.center(sp.c, sp.r);
    const hp = BAL.enemyHpBase * Math.pow(BAL.enemyHpGrowth, w - 1) * t.hp * (boss ? BAL.bossHpMul : 1);
    run.enemies.push({
      x: p.x + Util.rand(-8, 8), y: p.y + Util.rand(-8, 8),
      hp, maxHp: hp,
      spd: Math.min(BAL.enemySpdCap, BAL.enemySpdBase * Math.pow(BAL.enemySpdGrowth, w)) * t.spd * (boss ? BAL.bossSpdMul : 1),
      r: boss ? 18 : t.r,
      dmg: BAL.enemyDpsBase * Math.pow(BAL.enemyDpsGrowth, w - 1) * (boss ? BAL.bossDpsMul : 1),
      coin: BAL.enemyCoinBase * Math.pow(BAL.enemyCoinGrowth, w - 1) * t.coin * (boss ? BAL.bossCoinMul : 1),
      xp: BAL.enemyXpBase * Math.pow(BAL.enemyXpGrowth, w - 1) * t.xp * (boss ? BAL.bossXpMul : 1),
      color: boss ? '#ff2d55' : t.color,
      boss: !!boss,
      shock: 0, slow: 0, slowT: 0, stun: 0, chill: 0,
      burn: 0, burnT: 0, fvuln: 0, fvulnT: 0,
      grabT: 0, grabV: 0, dist: 1e9,
      hitFlash: 0, dead: false,
    });
  },

  // ボスは拘束・減速に強い
  statusScale(e) { return e.boss ? BAL.bossStunResist : 1; },

  // ================= ダメージ =================
  vuln(run, e) {
    let v = 1;
    if (e.shock > 0) v += BAL.shockVuln;
    if (e.chill > 0) v += run.chillVuln;
    if (e.fvulnT > 0) v += e.fvuln;
    return v;
  },

  damage(run, e, amount, opts) {
    if (e.dead) return 0;
    opts = opts || {};
    let dmg = amount * this.vuln(run, e);
    const crit = opts.crit === true || (typeof opts.crit === 'number' && Util.chance(opts.crit)) ||
                 (opts.forceCrit === true);
    if (crit) dmg *= opts.critMul || 2;
    e.hp -= dmg;
    e.hitFlash = 0.1;
    run.dealt += dmg;

    const sc = this.statusScale(e);
    if (opts.shock) e.shock = Math.max(e.shock, opts.shock * sc);
    if (opts.slow) {
      e.slow = Math.max(e.slow, opts.slow);
      e.slowT = Math.max(e.slowT, (opts.slowDur || 1) * sc);
      if (opts.chill) e.chill = Math.max(e.chill, (opts.slowDur || 1) * sc);
    }
    if (opts.stun) e.stun = Math.max(e.stun, opts.stun * sc);
    if (opts.burn) { e.burn = Math.max(e.burn, opts.burn); e.burnT = Math.max(e.burnT, opts.burnDur || 3); }

    if (!e.dead && opts.exec && e.hp > 0 && e.hp / e.maxHp <= opts.exec) e.hp = 0;

    if (run.nums.length < 90 && dmg > 0) {
      run.nums.push({ x: e.x + Util.rand(-6, 6), y: e.y - e.r, t: 0, life: 0.65,
        txt: Util.fmt(dmg), crit: crit, color: opts.color || '#fff' });
    }

    if (e.hp <= 0 && !e.dead) this.kill(run, e, opts);
    return dmg;
  },

  kill(run, e, opts) {
    e.dead = true;
    run.kills++;
    Game.perm.totalKills++;

    const coin = e.coin * run.coinMul * run.mods.coin;
    Game.meta.coins += coin;
    run.coinsEarned += coin;

    const xp = e.xp * run.mods.xp;
    run.xp += xp;
    while (run.xp >= run.xpNeed) {
      run.xp -= run.xpNeed;
      run.level++;
      run.xpNeed = BAL.xpNeedBase * Math.pow(BAL.xpNeedGrowth, run.level - 1);
      run.pendingDrafts++;
    }

    // 砕氷：凍ったまま死ぬと氷片が飛ぶ
    const cw = run.wp('cryo');
    if (cw && cw.flags.shatter && e.chill > 0 && !(opts && opts.shard)) {
      const near = Grid.query(e.x, e.y, 90, _q);
      for (const o of near) {
        if (o.dead || o === e) continue;
        if (Util.dist(e.x, e.y, o.x, o.y) > 90) continue;
        this.damage(run, o, cw.s.dmg * 1.6, { color: '#bff0ff', shard: true });
      }
      this.fx(run, { type: 'boom', x: e.x, y: e.y, r: 90, color: '#bff0ff', life: 0.25 });
    }

    this.fx(run, { type: 'boom', x: e.x, y: e.y, r: e.r * (e.boss ? 4 : 1.6), color: e.color, life: e.boss ? 0.5 : 0.24 });
    if (e.boss) this.shake(run, 16);
  },

  // ================= 攻撃のかたち =================
  spawnBullet(w, run, angle, o) {
    if (run.bullets.length > 900) run.bullets.shift();
    o = o || {};
    const s = w.s;
    const speed = s.speed * (o.speedMul || 1);
    let dmg = s.dmg * (o.dmgMul || 1);
    if (w.id === 'sniper' && run.resonance > 0) dmg *= (1 + run.resonance);

    run.bullets.push({
      x: w.x, y: w.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      dmg, r: o.bulletR || s.bulletR,
      pierce: o.pierce !== undefined ? o.pierce : s.pierce,
      bounce: o.bounce !== undefined ? o.bounce : s.bounce,
      hit: null,
      splash: o.splash !== undefined ? o.splash : s.splash,
      splashMul: s.splashMul,
      homing: o.homing !== undefined ? o.homing : s.homing,
      crit: s.crit, critMul: s.critMul,
      exec: s.execThr, shock: s.shockDur,
      slow: s.slow, slowDur: s.slowDur,
      stun: o.bubble ? s.stunDur : 0,
      burn: s.burn ? s.dmg * s.burn : 0, burnDur: s.burnDur,
      color: o.color || '#fff',
      long: !!o.long, spin: !!o.spin, bubble: !!o.bubble,
      life: o.life || 3.2,
      src: w, wid: w.id,
      range: s.range * 1.35,
      ox: w.x, oy: w.y,
      target: null,
    });
  },

  // 目標地点へ投げる（毒ガスの散布弾）
  spawnLob(w, run, tx, ty, o) {
    const a = Util.angle(w.x, w.y, tx, ty);
    const speed = w.s.speed;
    run.bullets.push({
      x: w.x, y: w.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      dmg: 0, r: w.s.bulletR, pierce: 0, bounce: 0, hit: null,
      splash: 0, splashMul: 1, homing: 0, crit: 0, critMul: 2,
      exec: 0, shock: 0, slow: 0, slowDur: 0, stun: 0, burn: 0, burnDur: 0,
      color: o.color || '#8fd94a', lob: true, landX: tx, landY: ty, onLand: o.onLand,
      life: 4, src: w, wid: w.id, range: w.s.range * 1.6, ox: w.x, oy: w.y, target: null,
    });
  },

  // 扇状の即時攻撃（火炎放射器・刀）
  coneDamage(w, run, angle, arc, range, dmg, opts) {
    opts = opts || {};
    const near = Grid.query(w.x, w.y, range + 20, _q);
    let hits = 0;
    for (const e of near) {
      if (e.dead) continue;
      const d = Util.dist(w.x, w.y, e.x, e.y);
      if (d > range + e.r) continue;
      let da = Util.angle(w.x, w.y, e.x, e.y) - angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > arc) continue;
      const o = Object.assign({}, opts);
      // 兜割り：凍っている敵には必ず会心
      if (w.flags.frostCrit && e.chill > 0) o.forceCrit = true;
      this.damage(run, e, dmg, o);
      hits++;
    }
    // 無限刃：斬るたびに間合いが伸びる
    if (w.flags.mugen && hits > 0) {
      w.s.range = Math.min(w.dyn.mugenBase * 2, w.s.range * 1.06);
    }
    // 爆燃：炎が毒の雲に届いたら引火させる
    if (w.flags.ignite) {
      for (let i = run.fields.length - 1; i >= 0; i--) {
        const f = run.fields[i];
        if (f.kind !== 'gas') continue;
        if (Util.dist(w.x, w.y, f.x, f.y) > range + f.r) continue;
        this.explode(run, f.x, f.y, f.r * 1.5, f.dps * 9 * (1 + run.backdraft * 0.5),
          { color: '#ff9a4a', burn: f.dps * 0.6, burnDur: 3 });
        run.fields.splice(i, 1);
      }
    }
    return hits;
  },

  // 自分を中心にした全方位の一撃（凍結装置）
  pulse(w, run, range, dmg, opts) {
    const near = Grid.query(w.x, w.y, range + 20, _q);
    for (const e of near) {
      if (e.dead) continue;
      if (Util.dist(w.x, w.y, e.x, e.y) > range + e.r) continue;
      this.damage(run, e, dmg, opts);
    }
  },

  // 設置型の場（毒の雲・火の海・酸だまり）
  spawnField(run, x, y, o) {
    if (run.fields.length > 60) run.fields.shift();
    run.fields.push({
      x, y, r: o.r, dur: o.dur, t: 0, tick: 0,
      dps: o.dps, slow: o.slow || 0, vuln: o.vuln || 0,
      color: o.color, kind: o.kind || 'gas', burn: o.burn || 0,
    });
  },

  // 敵を掴んで来た道へ引き戻す（触手）
  grab(w, run, first, power, dur, dmg) {
    const targets = [first];
    if (w.s.count > 1) {
      const near = Grid.query(w.x, w.y, w.s.range, _q);
      const extra = near.filter(e => !e.dead && e !== first &&
        Util.dist(w.x, w.y, e.x, e.y) <= w.s.range)
        .sort((a, b) => a.dist - b.dist).slice(0, w.s.count - 1);
      for (const e of extra) targets.push(e);
    }
    for (const t of targets) {
      if (!t || t.dead) continue;
      t.grabT = Math.max(t.grabT, dur * this.statusScale(t));
      t.grabV = power;
      this.damage(run, t, dmg, { color: '#ffb0e8' });
      this.fx(run, { type: 'link', x1: w.x, y1: w.y, e: t, color: '#c85ab0', life: Math.min(0.6, dur) });
      if (w.flags.hang) run.grabTarget = t;
    }
  },

  chainLightning(w, run, first, chains, dmg) {
    let cur = first;
    let d = dmg;
    const used = new Set();
    const pts = [{ x: w.x, y: w.y }];
    const falloff = w.s.chainFalloff;
    for (let i = 0; i <= chains; i++) {
      if (!cur || cur.dead) break;
      used.add(cur);
      pts.push({ x: cur.x, y: cur.y });
      this.damage(run, cur, d, { shock: w.s.shockDur, color: '#d8c7ff',
        crit: w.s.crit, critMul: w.s.critMul });
      d *= falloff;
      const near = Grid.query(cur.x, cur.y, 150, _q);
      let best = null, bd = 1e9;
      for (const e of near) {
        if (e.dead || used.has(e)) continue;
        let dd = Util.dist2(cur.x, cur.y, e.x, e.y);
        if (e.stun > 0) dd *= 0.25;   // 感電泡：泡に閉じ込めた敵を優先して通る
        if (dd < bd) { bd = dd; best = e; }
      }
      cur = best;
    }
    if (pts.length > 1) this.fx(run, { type: 'bolt', pts, life: 0.13, color: '#c9b3ff' });
  },

  explode(run, x, y, radius, dmg, opts) {
    opts = opts || {};
    const near = Grid.query(x, y, radius, _q);
    for (const e of near) {
      if (e.dead) continue;
      const d = Util.dist(x, y, e.x, e.y);
      if (d > radius + e.r) continue;
      const fall = Util.clamp(1 - (d / (radius + e.r)) * 0.55, 0.45, 1);
      this.damage(run, e, dmg * fall, Object.assign({ color: '#ffc38a' }, opts));
    }
    this.fx(run, { type: 'boom', x, y, r: radius, color: opts.color || '#ff9a4a', life: 0.3 });
    this.shake(run, Math.min(10, radius * 0.06));
  },

  fx(run, o) { if (run.fx.length < 260) { o.t = 0; run.fx.push(o); } },
  shake(run, v) { run.shake = Math.min(26, run.shake + v * 0.35); },

  // ================= 照準 =================
  findTarget(w, run) {
    const mode = w.def.target;
    if (w.flags.followGrab && run.grabTarget && !run.grabTarget.dead &&
        Util.dist(w.x, w.y, run.grabTarget.x, run.grabTarget.y) <= w.s.range) return run.grabTarget;
    if (w.flags.followSpot && run.spotTarget && !run.spotTarget.dead &&
        Util.dist(w.x, w.y, run.spotTarget.x, run.spotTarget.y) <= w.s.range) return run.spotTarget;

    const near = Grid.query(w.x, w.y, w.s.range, _q);
    let best = null, score = -Infinity;
    for (const e of near) {
      if (e.dead) continue;
      const d = Util.dist(w.x, w.y, e.x, e.y);
      if (d > w.s.range + e.r) continue;
      let sc;
      if (mode === 'closest') sc = -d;
      else if (mode === 'strongest') sc = e.hp;
      else sc = -e.dist;                 // lead = コアに一番近い＝一番危ない
      if (sc > score) { score = sc; best = e; }
    }
    return best;
  },

  // ================= 更新 =================
  update(run, dt) {
    const st = run.stage;
    Grid.build(run.enemies);

    // --- ウェーブ進行 ---
    if (run.phase === 'spawn') {
      run.spawnTimer -= dt;
      while (run.spawnTimer <= 0 && run.toSpawn > 0) {
        const boss = this.isBossWave(run.wave) && !run.bossSpawned;
        this.spawnEnemy(run, boss);
        if (boss) run.bossSpawned = true;
        run.toSpawn--;
        run.spawnTimer += this.spawnInterval(run);
      }
      if (run.toSpawn <= 0) { run.phase = 'clear'; run.clearTimer = BAL.clearWait; }
    } else if (run.phase === 'clear') {
      // 全部倒せば即、倒しきれなくても clearWait 秒で次のウェーブへ。
      // 倒し残しは次のウェーブに持ち越され、そのまま圧力になる
      run.clearTimer -= dt;
      if (run.enemies.length === 0 || run.clearTimer <= 0) {
        run.phase = 'gap';
        run.gapTimer = BAL.waveGap;
        run.justClearedWave = run.wave;
      }
    } else {
      run.gapTimer -= dt;
      if (run.gapTimer <= 0) { run.wave++; this.startWave(run); }
    }

    // --- コア ---
    const tw = run.tower;
    if (run.mods.regen > 0 && tw.hp > 0) tw.hp = Math.min(tw.maxHp, tw.hp + run.mods.regen * dt);

    // --- 場（毒の雲など） ---
    for (let i = run.fields.length - 1; i >= 0; i--) {
      const f = run.fields[i];
      f.t += dt;
      if (f.t >= f.dur) { run.fields.splice(i, 1); continue; }
      f.tick += dt;
      if (f.tick >= BAL.fieldTick) {
        const step = f.tick;
        f.tick = 0;
        const near = Grid.query(f.x, f.y, f.r, _q);
        for (const e of near) {
          if (e.dead) continue;
          if (Util.dist(f.x, f.y, e.x, e.y) > f.r + e.r) continue;
          if (f.vuln) { e.fvuln = f.vuln; e.fvulnT = 0.4; }
          if (f.slow) { e.slow = Math.max(e.slow, f.slow); e.slowT = Math.max(e.slowT, 0.5); }
          this.damage(run, e, f.dps * step, { color: f.kind === 'gas' ? '#c6ff7a' : '#ffb066' });
        }
      }
    }

    // --- 敵 ---
    for (let i = run.enemies.length - 1; i >= 0; i--) {
      const e = run.enemies[i];
      if (e.dead) { run.enemies.splice(i, 1); continue; }
      if (e.shock > 0) e.shock -= dt;
      if (e.chill > 0) e.chill -= dt;
      if (e.stun > 0) e.stun -= dt;
      if (e.grabT > 0) e.grabT -= dt;
      if (e.fvulnT > 0) e.fvulnT -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.burnT > 0) { e.burnT -= dt; this.damage(run, e, e.burn * dt, { color: '#ff8a3a' }); if (e.dead) continue; }

      // 現在タイルとコアまでの距離
      const tc = (e.x / TILE) | 0, tr = (e.y / TILE) | 0;
      e.dist = st.walkable(tc, tr) ? st.dist[st.idx(tc, tr)] : 1e9;

      const goal = st.walkable(tc, tr) ? st.flowTo(tc, tr) : { x: tw.x, y: tw.y };
      const a = Util.angle(e.x, e.y, goal.x, goal.y);

      if (e.stun <= 0) {
        if (e.grabT > 0) {
          // 掴まれている間は来た道へ戻される
          e.x -= Math.cos(a) * e.grabV * dt;
          e.y -= Math.sin(a) * e.grabV * dt;
        } else {
          const slowMul = Math.max(BAL.enemySlowFloor, 1 - e.slow);
          e.x += Math.cos(a) * e.spd * slowMul * dt;
          e.y += Math.sin(a) * e.spd * slowMul * dt;
        }
      }

      // コアに触れたら削る
      if (Util.dist(e.x, e.y, tw.x, tw.y) <= tw.r + e.r) {
        tw.hp -= e.dmg * dt;
        if (Math.random() < dt * 6) this.fx(run, { type: 'spark', x: e.x, y: e.y, color: '#ff5b6e', life: 0.2 });
      }
    }

    if (tw.hp <= 0) { tw.hp = 0; return 'dead'; }

    // --- 武器 ---
    for (const w of run.weapons) {
      if (w.flags.heat) w.dyn.heat = Math.max(0, w.dyn.heat - dt * 0.42);
      if (w.flags.thunderGod) {
        w.dyn.godCd -= dt;
        if (w.dyn.godCd <= 0) {
          w.dyn.godCd = 5;
          for (const e of run.enemies.slice(0, 120)) {
            if (e.dead) continue;
            this.damage(run, e, w.s.dmg * 3, { shock: Math.max(2, w.s.shockDur), color: '#d8c7ff' });
            this.fx(run, { type: 'bolt', pts: [{ x: e.x, y: e.y - 260 }, { x: e.x, y: e.y }], life: 0.16, color: '#e2d6ff' });
          }
          this.shake(run, 14);
        }
      }

      w.target = this.findTarget(w, run);
      if (w.muzzle > 0) w.muzzle -= dt;
      if (w.target) {
        const want = Util.angle(w.x, w.y, w.target.x, w.target.y);
        w.angle = Util.turnToward(w.angle, want, w.s.turn * dt);
      }
      const rate = w.s.rate * (w.flags.heat ? (1 + w.dyn.heat * (w.dyn.heatMax || 0)) : 1);
      w.cd -= dt;
      if (w.cd <= 0) {
        if (w.target) {
          w.cd = 1 / Math.max(0.02, rate);
          w.muzzle = 0.07;
          w.shots++;
          w.def.fire(w, run);
        } else {
          w.cd = 0;
        }
      }
    }

    // --- 弾 ---
    for (let i = run.bullets.length - 1; i >= 0; i--) {
      const b = run.bullets[i];
      b.life -= dt;
      if (b.life <= 0) { this.bulletEnd(run, b); run.bullets.splice(i, 1); continue; }

      // 投擲弾は目標地点に着いたら効果を出す
      if (b.lob) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (Util.dist(b.x, b.y, b.landX, b.landY) < 14) {
          if (b.onLand) b.onLand(run, b.landX, b.landY);
          run.bullets.splice(i, 1);
        }
        continue;
      }

      if (b.homing > 0) {
        if (!b.target || b.target.dead) {
          const near = Grid.query(b.x, b.y, 240, _q);
          let best = null, bd = 1e9;
          for (const e of near) {
            if (e.dead) continue;
            if (b.hit && b.hit.has(e)) continue;
            const dd = Util.dist2(b.x, b.y, e.x, e.y);
            if (dd < bd) { bd = dd; best = e; }
          }
          b.target = best;
        }
        if (b.target && !b.target.dead) {
          const sp = Math.hypot(b.vx, b.vy);
          const na = Util.turnToward(Math.atan2(b.vy, b.vx),
            Util.angle(b.x, b.y, b.target.x, b.target.y), b.homing * dt);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < -60 || b.y < -60 || b.x > st.w + 60 || b.y > st.h + 60) { run.bullets.splice(i, 1); continue; }
      if (Util.dist(b.x, b.y, b.ox, b.oy) > b.range) { this.bulletEnd(run, b); run.bullets.splice(i, 1); continue; }

      const near = Grid.query(b.x, b.y, b.r + 24, _q);
      let consumed = false;
      for (const e of near) {
        if (e.dead) continue;
        if (b.hit && b.hit.has(e)) continue;
        if (Util.dist(b.x, b.y, e.x, e.y) > e.r + b.r) continue;

        this.damage(run, e, b.dmg, {
          crit: b.crit, critMul: b.critMul, exec: b.exec, shock: b.shock,
          slow: b.slow, slowDur: b.slowDur, stun: b.stun,
          burn: b.burn, burnDur: b.burnDur, color: b.color,
        });

        if (b.src && b.src.flags.resonance && b.wid === 'gatling') {
          run.resonance = Math.min(4.0, run.resonance + 0.006);
        }
        if (b.src && b.src.flags.spot && b.wid === 'sniper' && !e.dead) run.spotTarget = e;
        if (b.src && b.src.flags.charged && b.wid === 'gatling') {
          this.chainLightning(b.src, run, e, b.src.dyn.chargedChain || 2, b.dmg * 0.55);
        }
        if (b.src && b.src.flags.staticFoam && b.wid === 'bubble' && !e.dead) {
          e.shock = Math.max(e.shock, b.src.s.shockDur);
        }

        if (b.splash > 0) {
          this.explode(run, b.x, b.y, b.splash, b.dmg * b.splashMul,
            { shock: b.src && b.src.flags.implode ? (b.src.s.shockDur || 2.5) : 0 });
          if (b.src && b.src.dyn.cluster && !b.child) this.cluster(run, b);
          if (b.src && b.src.flags.acid) {
            this.spawnField(run, b.x, b.y, { kind: 'acid', r: b.src.s.fieldR, dur: b.src.s.fieldDur,
              dps: b.dmg * 0.35, vuln: 0.15, color: '#a8f0c0' });
          }
          consumed = true; break;
        }

        this.fx(run, { type: 'spark', x: b.x, y: b.y, color: b.color, life: 0.14 });

        // 跳弾（手裏剣）
        if (b.bounce > 0) {
          b.bounce--;
          if (!b.hit) b.hit = new Set();
          b.hit.add(e);
          if (b.src && b.src.flags.ramp) b.dmg *= 1.12;
          const cand = Grid.query(b.x, b.y, 220, _q);
          let best = null, bd = 1e9;
          for (const o of cand) {
            if (o.dead || b.hit.has(o)) continue;
            const dd = Util.dist2(b.x, b.y, o.x, o.y);
            if (dd < bd) { bd = dd; best = o; }
          }
          if (best) {
            const sp = Math.hypot(b.vx, b.vy) || 400;
            const na = Util.angle(b.x, b.y, best.x, best.y);
            b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
            b.ox = b.x; b.oy = b.y;   // 射程の起点を打ち直す
            b.target = best;
          } else { consumed = true; }
          break;
        }

        if (b.pierce > 0) {
          b.pierce--;
          if (!b.hit) b.hit = new Set();
          b.hit.add(e);
        } else { consumed = true; break; }
      }
      if (consumed) run.bullets.splice(i, 1);
    }

    // --- 演出 ---
    for (let i = run.fx.length - 1; i >= 0; i--) {
      const f = run.fx[i]; f.t += dt;
      if (f.t >= f.life) run.fx.splice(i, 1);
    }
    for (let i = run.nums.length - 1; i >= 0; i--) {
      const n = run.nums[i]; n.t += dt; n.y -= dt * 34;
      if (n.t >= n.life) run.nums.splice(i, 1);
    }
    if (run.shake > 0) run.shake = Math.max(0, run.shake - dt * 42);

    run.time += dt;
    return null;
  },

  bulletEnd(run, b) {
    if (b.lob && b.onLand) { b.onLand(run, b.x, b.y); return; }
    if (b.splash > 0) {
      this.explode(run, b.x, b.y, b.splash, b.dmg * b.splashMul, {});
      if (b.src && b.src.dyn.cluster && !b.child) this.cluster(run, b);
    }
  },

  cluster(run, b) {
    const n = b.src.dyn.cluster;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random();
      run.bullets.push({
        x: b.x, y: b.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
        dmg: b.dmg * 0.4, r: 4, pierce: 0, bounce: 0, hit: null,
        splash: b.splash * 0.55, splashMul: b.splashMul,
        homing: 2.4, crit: 0, critMul: 2, exec: 0, shock: 0,
        slow: 0, slowDur: 0, stun: 0, burn: 0, burnDur: 0,
        color: '#ffb066', life: 1.4, src: b.src, wid: b.wid,
        range: 420, ox: b.x, oy: b.y, target: null, child: true,
      });
    }
  },
};
