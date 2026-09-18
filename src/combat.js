// ---------------------------------------------------------------
// combat.js : 敵・弾・当たり判定・ウェーブ進行。ゲームの中身そのもの
// ---------------------------------------------------------------
'use strict';

const ENEMY_TYPES = {
  grunt: { name: 'grunt', hp: 1.0, spd: 1.0, r: 11, coin: 1.0, xp: 1.0, color: '#ff5b6e', from: 1 },
  swift: { name: 'swift', hp: 0.55, spd: 1.85, r: 8.5, coin: 1.1, xp: 1.1, color: '#ff9cf0', from: 4 },
  tank:  { name: 'tank',  hp: 3.2, spd: 0.58, r: 17, coin: 2.4, xp: 2.2, color: '#c8a05a', from: 7 },
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
    const F = Game.field;
    const w = run.wave;
    const t = boss ? ENEMY_TYPES.grunt : this.pickType(w);
    const hp = BAL.enemyHpBase * Math.pow(BAL.enemyHpGrowth, w - 1) * t.hp * (boss ? BAL.bossHpMul : 1);
    // 画面の少し外側（矩形の外周）に湧かせる。円周だと画面比によって
    // 接敵までの時間が大きくブレて、縦長のスマホで待ち時間が長くなる
    const a = Math.random() * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    const m = BAL.spawnMargin;
    const k = Math.min((F.w / 2 + m) / Math.max(1e-6, Math.abs(dx)),
                       (F.h / 2 + m) / Math.max(1e-6, Math.abs(dy)));
    const e = {
      x: F.cx + dx * k,
      y: F.cy + dy * k,
      hp, maxHp: hp,
      spd: Math.min(BAL.enemySpdCap, BAL.enemySpdBase * Math.pow(BAL.enemySpdGrowth, w)) * t.spd * (boss ? BAL.bossSpdMul : 1),
      r: boss ? 34 : t.r,
      dmg: BAL.enemyDpsBase * Math.pow(BAL.enemyDpsGrowth, w - 1) * (boss ? BAL.bossDpsMul : 1),
      coin: BAL.enemyCoinBase * Math.pow(BAL.enemyCoinGrowth, w - 1) * t.coin * (boss ? BAL.bossCoinMul : 1),
      xp: BAL.enemyXpBase * Math.pow(BAL.enemyXpGrowth, w - 1) * t.xp * (boss ? BAL.bossXpMul : 1),
      color: boss ? '#ff2d55' : t.color,
      boss: !!boss,
      shock: 0, slow: 0, burn: 0, burnT: 0,
      hitFlash: 0, dead: false,
    };
    run.enemies.push(e);
  },

  // ================= ダメージ =================
  damage(run, e, amount, opts) {
    if (e.dead) return 0;
    opts = opts || {};
    let dmg = amount;
    if (e.shock > 0) dmg *= 1.25;
    if (opts.crit) dmg *= opts.critMul || 2;
    e.hp -= dmg;
    e.hitFlash = 0.1;
    run.dealt += dmg;

    if (opts.shock) e.shock = Math.max(e.shock, opts.shock);
    if (opts.slow) e.slow = Math.max(e.slow, opts.slow);

    // 処刑（スナイパーのレジェンド）
    if (!e.dead && opts.exec && e.hp > 0 && e.hp / e.maxHp <= opts.exec) e.hp = 0;

    if (run.nums.length < 90 && (dmg > 0)) {
      run.nums.push({ x: e.x + Util.rand(-6, 6), y: e.y - e.r, t: 0, life: 0.65,
        txt: Util.fmt(dmg), crit: !!opts.crit, color: opts.color || '#fff' });
    }

    if (e.hp <= 0 && !e.dead) this.kill(run, e);
    return dmg;
  },

  kill(run, e) {
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

    this.fx(run, { type: 'boom', x: e.x, y: e.y, r: e.r * (e.boss ? 4 : 1.6), color: e.color, life: e.boss ? 0.5 : 0.24 });
    if (e.boss) this.shake(run, 16);
  },

  // ================= 弾 =================
  spawnBullet(w, run, angle, o) {
    if (run.bullets.length > 900) run.bullets.shift();
    o = o || {};
    const s = w.s;
    const crit = s.crit > 0 && Util.chance(s.crit);
    const speed = s.speed * (o.speedMul || 1);
    let dmg = s.dmg * (o.dmgMul || 1);
    // シナジー「弾道共鳴」: ガトリングが当てるほどスナイパーが伸びる
    if (w.id === 'sniper' && run.resonance > 0) dmg *= (1 + run.resonance);

    run.bullets.push({
      x: w.x, y: w.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      dmg, r: o.bulletR || s.bulletR,
      pierce: o.pierce !== undefined ? o.pierce : s.pierce,
      hit: null,
      splash: o.splash !== undefined ? o.splash : s.splash,
      splashMul: s.splashMul,
      homing: o.homing !== undefined ? o.homing : s.homing,
      crit, critMul: s.critMul,
      exec: s.execThr, shock: s.shockDur, slow: s.slow,
      color: o.color || '#fff',
      trail: o.trail || 0.5,
      long: !!o.long,
      life: o.life || 2.6,
      src: w,
      wid: w.id,
      range: s.range * 1.25,
      ox: w.x, oy: w.y,
      target: null,
      child: !!o.child,
    });
  },

  // テスラ本体・帯電弾・雷神が使う連鎖電撃
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
        crit: w.s.crit > 0 && Util.chance(w.s.crit), critMul: w.s.critMul });
      d *= falloff;
      // 次の連鎖先
      const near = Grid.query(cur.x, cur.y, 150, _q);
      let best = null, bd = 1e9;
      for (const e of near) {
        if (e.dead || used.has(e)) continue;
        const dd = Util.dist2(cur.x, cur.y, e.x, e.y);
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
      this.damage(run, e, dmg * fall, { shock: opts.shock, color: '#ffc38a' });
    }
    this.fx(run, { type: 'boom', x, y, r: radius, color: opts.color || '#ff9a4a', life: 0.3 });
    this.shake(run, Math.min(10, radius * 0.06));
  },

  fx(run, o) { if (run.fx.length < 260) { o.t = 0; run.fx.push(o); } },
  shake(run, v) { run.shake = Math.min(26, run.shake + v * 0.35); },

  // ================= 照準 =================
  findTarget(w, run) {
    const F = Game.field;
    const mode = w.def.target;
    // シナジー「曳光指示」: スナイパーが撃った敵をミサイルが最優先
    if (w.flags.followSpot && run.spotTarget && !run.spotTarget.dead) {
      if (Util.dist(w.x, w.y, run.spotTarget.x, run.spotTarget.y) <= w.s.range) return run.spotTarget;
    }
    const near = Grid.query(w.x, w.y, w.s.range, _q);
    let best = null, score = -Infinity;
    for (const e of near) {
      if (e.dead) continue;
      const d = Util.dist(w.x, w.y, e.x, e.y);
      if (d > w.s.range + e.r) continue;
      let sc;
      if (mode === 'closest') sc = -d;
      else if (mode === 'strongest') sc = e.hp;
      else sc = -Util.dist(F.cx, F.cy, e.x, e.y); // nearest = 拠点に一番近い＝一番危ない
      if (sc > score) { score = sc; best = e; }
    }
    return best;
  },

  // ================= 更新 =================
  update(run, dt) {
    const F = Game.field;
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
      if (run.toSpawn <= 0) run.phase = 'clear';
    } else if (run.phase === 'clear') {
      if (run.enemies.length === 0) { run.phase = 'gap'; run.gapTimer = BAL.waveGap; }
    } else {
      run.gapTimer -= dt;
      if (run.gapTimer <= 0) { run.wave++; this.startWave(run); }
    }

    // --- 拠点 ---
    const tw = run.tower;
    if (run.mods.regen > 0 && tw.hp > 0) tw.hp = Math.min(tw.maxHp, tw.hp + run.mods.regen * dt);

    // --- 敵 ---
    for (let i = run.enemies.length - 1; i >= 0; i--) {
      const e = run.enemies[i];
      if (e.dead) { run.enemies.splice(i, 1); continue; }
      if (e.shock > 0) e.shock -= dt;
      if (e.slow > 0) e.slow -= dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.burnT > 0) { e.burnT -= dt; this.damage(run, e, e.burn * dt, { color: '#ff8a3a' }); if (e.dead) continue; }

      const a = Util.angle(e.x, e.y, tw.x, tw.y);
      const stop = tw.r + e.r;
      const d = Util.dist(e.x, e.y, tw.x, tw.y);
      if (d > stop) {
        const sp = e.spd * (e.slow > 0 ? 0.55 : 1);
        e.x += Math.cos(a) * sp * dt;
        e.y += Math.sin(a) * sp * dt;
      } else {
        tw.hp -= e.dmg * dt;
        if (Math.random() < dt * 6) this.fx(run, { type: 'spark', x: e.x, y: e.y, color: '#ff5b6e', life: 0.2 });
      }
    }

    if (tw.hp <= 0) { tw.hp = 0; return 'dead'; }

    // --- 武器 ---
    for (const w of run.weapons) {
      // 加熱暴走の冷却
      if (w.flags.heat) w.dyn.heat = Math.max(0, w.dyn.heat - dt * 0.42);
      // 雷神
      if (w.flags.thunderGod) {
        w.dyn.godCd -= dt;
        if (w.dyn.godCd <= 0) {
          w.dyn.godCd = 5;
          const targets = run.enemies.slice(0, 120);
          for (const e of targets) {
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
      if (b.life <= 0) { run.bullets.splice(i, 1); continue; }

      // 誘導
      if (b.homing > 0) {
        if (!b.target || b.target.dead) {
          const near = Grid.query(b.x, b.y, 240, _q);
          let best = null, bd = 1e9;
          for (const e of near) {
            if (e.dead) continue;
            const dd = Util.dist2(b.x, b.y, e.x, e.y);
            if (dd < bd) { bd = dd; best = e; }
          }
          b.target = best;
        }
        if (b.target && !b.target.dead) {
          const sp = Math.hypot(b.vx, b.vy);
          const want = Util.angle(b.x, b.y, b.target.x, b.target.y);
          const cur = Math.atan2(b.vy, b.vx);
          const na = Util.turnToward(cur, want, b.homing * dt);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < -80 || b.y < -80 || b.x > F.w + 80 || b.y > F.h + 80) { run.bullets.splice(i, 1); continue; }
      if (Util.dist(b.x, b.y, b.ox, b.oy) > b.range) { this.bulletEnd(run, b); run.bullets.splice(i, 1); continue; }

      // 命中判定
      const near = Grid.query(b.x, b.y, b.r + 24, _q);
      let consumed = false;
      for (const e of near) {
        if (e.dead) continue;
        if (b.hit && b.hit.has(e)) continue;
        if (Util.dist(b.x, b.y, e.x, e.y) > e.r + b.r) continue;

        this.damage(run, e, b.dmg, { crit: b.crit, critMul: b.critMul, exec: b.exec,
          shock: b.shock, slow: b.slow, color: b.color });

        // シナジー：ガトリング命中でスナイパーが伸びる
        if (b.src && b.src.flags.resonance && b.wid === 'gatling') {
          run.resonance = Math.min(4.0, run.resonance + 0.006);
        }
        // シナジー：スナイパーが当てた敵をマーク
        if (b.src && b.src.flags.spot && b.wid === 'sniper' && !e.dead) run.spotTarget = e;
        // シナジー：帯電弾
        if (b.src && b.src.flags.charged && b.wid === 'gatling') {
          this.chainLightning(b.src, run, e, b.src.dyn.chargedChain || 2, b.dmg * 0.55);
        }

        if (b.splash > 0) {
          this.explode(run, b.x, b.y, b.splash, b.dmg * b.splashMul,
            { shock: b.src && b.src.flags.implode ? (b.src.s.shockDur || 2.5) : 0 });
          if (b.src && b.src.dyn.cluster && !b.child) this.cluster(run, b);
          consumed = true; break;
        }

        this.fx(run, { type: 'spark', x: b.x, y: b.y, color: b.color, life: 0.14 });

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
    if (b.splash > 0) {
      this.explode(run, b.x, b.y, b.splash, b.dmg * b.splashMul, {});
      if (b.src && b.src.dyn.cluster && !b.child) this.cluster(run, b);
    }
  },

  // クラスター弾：爆発点から子ミサイルをばら撒く
  cluster(run, b) {
    const n = b.src.dyn.cluster;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random();
      run.bullets.push({
        x: b.x, y: b.y,
        vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
        dmg: b.dmg * 0.4, r: 4, pierce: 0, hit: null,
        splash: b.splash * 0.55, splashMul: b.splashMul,
        homing: 2.4, crit: false, critMul: 2, exec: 0, shock: 0, slow: 0,
        color: '#ffb066', trail: 0.7, life: 1.4, src: b.src, wid: b.wid,
        range: 420, ox: b.x, oy: b.y, target: null, child: true,
      });
    }
  },
};
