// ---------------------------------------------------------------
// combat.js : 敵・弾・場・状態異常・ウェーブ進行
//
//   1ステージ = 5ウェーブ。ウェーブを1つ凌ぐごとにカードを引ける。
//   敵の強さは「通算ウェーブ番号」（ステージをまたいで増える）で決まる
// ---------------------------------------------------------------
'use strict';

const ENEMY_TYPES = {
  grunt: { name: 'grunt', hp: 1.0, spd: 1.0, r: 10, coin: 1.0, color: '#ff5b6e', from: 1 },
  swift: { name: 'swift', hp: 0.5, spd: 1.9, r: 8, coin: 1.15, color: '#ff9cf0', from: 3 },
  tank:  { name: 'tank',  hp: 3.4, spd: 0.58, r: 15, coin: 2.5, color: '#c8a05a', from: 6 },
};

// 敵同士の押し合い（2026-09-19 取り込み）
//
// これまで敵はすり抜けていて、ペアの98%が重なり、細い一本の線になっていた。
// **専用の格子で、近いペアだけを1回ずつ見て押し離す。**
// 既存の Grid（セル70）を使うと1体あたりの候補が多すぎて重いので、
// 敵の直径くらいの格子を別に持つ。
//   実測（PC、敵900体）: 既存Gridを使う素朴な方法 7.0ms → この方法 2.1ms
const Crowd = {
  head: null, next: null, w: 0, h: 0,

  apply(run, dt) {
    if (!BAL.crowdOn) return;
    const es = run.enemies, n = es.length;
    if (n < 2) return;
    const st = run.stage;
    const C = BAL.crowdCell;
    this.w = Math.ceil(st.w / C); this.h = Math.ceil(st.h / C);
    const cells = this.w * this.h;
    if (!this.head || this.head.length !== cells) this.head = new Int32Array(cells);
    this.head.fill(-1);
    if (!this.next || this.next.length < n) this.next = new Int32Array(Math.max(n * 2, 2048));

    for (let i = 0; i < n; i++) {
      const e = es[i];
      e.pushX = 0; e.pushY = 0;
      let cx = (e.x / C) | 0, cy = (e.y / C) | 0;
      if (cx < 0) cx = 0; if (cy < 0) cy = 0;
      if (cx >= this.w) cx = this.w - 1; if (cy >= this.h) cy = this.h - 1;
      const k = cy * this.w + cx;
      this.next[i] = this.head[k]; this.head[k] = i;
    }
    // 同じ格子＋右・下の3つ。こうすると各ペアをちょうど1回だけ見られる
    for (let cy = 0; cy < this.h; cy++) for (let cx = 0; cx < this.w; cx++) {
      for (let i = this.head[cy * this.w + cx]; i !== -1; i = this.next[i]) {
        const a = es[i];
        for (let j = this.next[i]; j !== -1; j = this.next[j]) this.pair(a, es[j]);
        if (cx + 1 < this.w) for (let j = this.head[cy * this.w + cx + 1]; j !== -1; j = this.next[j]) this.pair(a, es[j]);
        if (cy + 1 < this.h) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx; if (nx < 0 || nx >= this.w) continue;
          for (let j = this.head[(cy + 1) * this.w + nx]; j !== -1; j = this.next[j]) this.pair(a, es[j]);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const e = es[i];
      if (!e.pushX && !e.pushY) continue;
      let px = e.pushX, py = e.pushY;
      const cap = e.spd * dt * BAL.crowdCap;
      const m = Math.hypot(px, py);
      if (m > cap) { px = px / m * cap; py = py / m * cap; }
      const nx = e.x + px, ny = e.y + py;
      // 壁に押し出さない
      if (st.walkable((nx / TILE) | 0, (ny / TILE) | 0)) { e.x = nx; e.y = ny; }
    }
  },

  pair(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 < 0.01) return;
    const d = Math.sqrt(d2), f = (rr - d) * BAL.crowdPush;
    const ix = dx / d * f, iy = dy / d * f;
    a.pushX += ix; a.pushY += iy; b.pushX -= ix; b.pushY -= iy;
  },
};

// 敵をセルに分けて近傍検索を速くする（スマホで敵900体でも落ちないように）
const Grid = {
  cell: 70, map: new Map(),

  // セルの鍵は**数値**。`gx + ',' + gy` だと、引くたびに文字列を1つ作る。
  //   第10章の実測で targetAhead が全体の65%（1回 11µs・1秒あたり2,400回）を
  //   食っていて、その中身がほとんどこの文字列の生成だった。
  //   盤は 15×21タイル なので、余裕を見て ±512セルまで衝突しない形にする
  key(gx, gy) { return (gx + 512) * 4096 + (gy + 512); },

  build(enemies) {
    this.map.clear();
    const c = this.cell;
    for (const e of enemies) {
      const k = this.key((e.x / c) | 0, (e.y / c) | 0);
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
        const a = this.map.get(this.key(gx, gy));
        if (a) for (const e of a) out.push(e);
      }
    }
    return out;
  },
};

const _q = [];
// targetAhead がセルの重複を弾くのに使う。毎フレーム使い回して確保を避ける
const _seenCells = new Set();

const Combat = {
  //   **出撃ごとに戻す。** これはモジュール側に置いてあるので、
  //   出撃をまたいで残る。前の出撃の残りが26に近いと、次の出撃で
  //   コインが飛ばなくなっていた（見た目だけの影響）
  coinFx: 0,        // 同時に飛んでいるコインの数。**多すぎると盤面が見えなくなる**


  // ================= ウェーブ =================
  gw(run) { return globalWave(run.stageIdx, run.wave); },

  waveCount(run) {
    const g = this.gw(run);
    const n = (BAL.waveCountBase + g * BAL.waveCountPerWave) * run.mods.spawn;
    return Math.min(BAL.waveCountMax, Math.floor(n));
  },

  isLastWave(run) { return run.wave >= BAL.wavesPerStage; },

  startWave(run) {
    run.phase = 'spawn';
    run.toSpawn = this.waveCount(run);
    // **湧き間隔は「そのウェーブの総数」で割る。**
    // 残り数で割ると、減るほど間隔が伸びて最後の1体に湧き秒数まるごとかかる
    run.waveTotal = run.toSpawn;
    run.spawnTimer = 0;
    run.spawnPick = 0;
  },

  // そのウェーブが湧き切るまでの秒数。
  //   **下限は spawnSeconds、そこから先は「1秒あたり spawnRateMax 体」で伸びる。**
  //   数が少ないうちは一定時間、増えてきたら出し切るのに時間がかかる、という形。
  //   測定器も同じ式を使うので、ここを直せば両方が揃う
  spawnSecFor(n) {
    const c = Math.max(1, n);
    return Math.max(BAL.spawnSeconds, c / Math.max(0.1, BAL.spawnRateMax));
  },

  spawnInterval(run) {
    const n = Math.max(1, run.waveTotal || this.waveCount(run));
    return Math.max(BAL.spawnIntervalMin, this.spawnSecFor(n) / n);
  },

  pickType(g) {
    const avail = Object.values(ENEMY_TYPES).filter(t => g >= t.from);
    if (avail.length === 1) return avail[0];
    return Util.weighted(avail, t => t.name === 'grunt' ? 58 : t.name === 'swift' ? 28 : 22);
  },

  // **ボスは置かない。**
  //   実測で5ステージすべて撃破0（毎回漏れてライフ5を持っていくだけで、
  //   コイン報酬は一度も支払われていなかった）。
  //   出す順番を最後に変えても 7体中1体しか倒せず、
  //   「倒せない1体に必ず税金を取られる」以上の役をしていなかったので外した
  spawnEnemy(run) {
    if (run.enemies.length >= BAL.enemyCap) return;
    const st = run.stage;
    const g = this.gw(run);
    const t = this.pickType(g);
    const si = run.spawnPick++ % st.spawns.length;      // 出現口は順番に使う
    const sp = st.spawns[si];
    const p = st.center(sp.c, sp.r);
    const stageMul = Math.pow(BAL.stageHpMul, run.stageIdx);
    const hp = BAL.enemyHpBase * Math.pow(BAL.enemyHpGrowth, g - 1) * stageMul * t.hp;
    run.enemies.push({
      x: p.x + Util.rand(-10, 10), y: p.y + Util.rand(-10, 10),
      hp, maxHp: hp, si,
      spd: Math.min(BAL.enemySpdCap, BAL.enemySpdBase * Math.pow(BAL.enemySpdGrowth, g)) * t.spd,
      r: t.r,
      dmg: BAL.enemyDpsBase * Math.pow(BAL.enemyDpsGrowth, g - 1),
      coin: BAL.enemyCoinBase * Math.pow(BAL.enemyCoinGrowth, g - 1) * t.coin,
      color: t.color,
      tname: t.name,                   // 死因の内訳に使う

      pushX: 0, pushY: 0,
      shock: 0, slow: 0, slowT: 0, stun: 0, chill: 0,
      burn: 0, burnT: 0, fvuln: 0, fvulnT: 0,
      grabT: 0, grabV: 0, spotT: 0, dist: 1e9, counted: false,
      hitFlash: 0, dead: false, ang: 0,
    });
  },

  statusScale(e) { return 1; },       // ボスを外したので、今はどの敵も同じ

  // 倒した場所の「深さ」による取り分。
  //   湧き口で倒すと ×1、コアの目の前で倒すと ×(1 + coinDepth)。
  //   e.dist は流れ場が持つ「コアまでの残りタイル数」なので、
  //   マップの形が変わっても同じ意味で効く
  depthBonus(run, e) {
    if (!BAL.coinDepth) return 1;
    const far = run.maxDist || 1;
    const t = Util.clamp(1 - (e.dist || 0) / far, 0, 1);   // 0=湧き口 / 1=コア
    return 1 + BAL.coinDepth * t;
  },

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
                 opts.forceCrit === true;
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

    if (run.nums.length < 70 && dmg > 0) {
      run.nums.push({ x: e.x + Util.rand(-6, 6), y: e.y - e.r, t: 0, life: 0.6,
        txt: Util.fmt(dmg), crit: crit, color: opts.color || '#fff' });
    }

    if (e.hp <= 0 && !e.dead) this.kill(run, e, opts);
    return dmg;
  },

  kill(run, e, opts) {
    e.dead = true;
    run.kills++;
    Game.perm.totalKills++;
    Snd.kill();

    // **どこで倒したかで取り分が変わる。**
    //   湧き口は「敵が必ず、常に、最大密度でいる1点」なので、
    //   そこへ置くのが無条件の最適解になっていた（指定攻撃に射線が無いため）。
    //   禁止するのではなく、**奥まで通してから倒すほうが儲かる**ようにして、
    //   置き場所をプレイヤーに選ばせる。止め損ねる危険が、そのまま対価
    const coin = e.coin * run.coinMul * run.mods.coin * this.depthBonus(run, e);
    Game.meta.coins += coin;
    run.coinsEarned += coin;

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

    if (run.fx.length < 180) {
      this.fx(run, { type: 'boom', x: e.x, y: e.y, r: e.r * 1.5, color: e.color, life: 0.22 });
      // **倒す＝儲かる、を目で見えるようにする。**
      // これまでHUDの数字が静かに増えるだけで、報酬を得た実感が無かった
      if (this.coinFx < 26) {
        this.coinFx++;
        this.fx(run, { type: 'coin', x: e.x, y: e.y, life: 0.5 });
      }
    }
  },

  // ================= 攻撃のかたち =================
  spawnBullet(w, run, angle, o) {
    Snd.shot(w.id);
    if (run.bullets.length > 1200) run.bullets.shift();
    o = o || {};
    const s = w.s;
    // 扇を広げているほど弾がばらける。狭く絞れば一点に集まる
    const g = w.group !== undefined ? w.group : 1;
    if (g < 1) angle += Util.rand(-1, 1) * (1 - g) * BAL.spreadRad;
    const speed = s.speed * (o.speedMul || 1);
    let dmg = s.dmg * (o.dmgMul || 1);
    // 散撃砲身：**扇の広さがそのまま威力になる。** 広げる側にも見返りを置く
    if (w.flags.wideDmg) dmg *= 1 + Game.arcT(w) * w.dyn.wideDmg;
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
      hits: 0,                       // 何体を貫いたか。軌跡の太さになる
      target: null,
    });
  },

  // 目標地点へ投げる（毒ガスの散布弾・迫撃砲の砲弾）
  spawnLob(w, run, tx, ty, o) {
    Snd.shot(w.id);
    if (run.bullets.length > 1200) run.bullets.shift();
    const a = Util.angle(w.x, w.y, tx, ty);
    const speed = w.s.speed;
    run.bullets.push({
      x: w.x, y: w.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      dmg: 0, r: w.s.bulletR, pierce: 0, bounce: 0, hit: null,
      splash: 0, splashMul: 1, homing: 0, crit: 0, critMul: 2,
      exec: 0, shock: 0, slow: 0, slowDur: 0, stun: 0, burn: 0, burnDur: 0,
      color: o.color || '#8fd94a', lob: true, mark: !!o.mark,
      landX: tx, landY: ty, onLand: o.onLand,
      life: 5, src: w, wid: w.id, range: w.s.range * 1.8, ox: w.x, oy: w.y, target: null,
    });
  },

  coneDamage(w, run, angle, arc, range, dmg, opts) {
    opts = opts || {};
    dmg *= (w.group !== undefined ? w.group : 1);   // 即着系は出力が散るぶん1体あたりが落ちる
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
      if (w.flags.frostCrit && e.chill > 0) o.forceCrit = true;
      this.damage(run, e, dmg, o);
      hits++;
    }
    if (w.flags.mugen && hits > 0)
      w.s.range = Math.min(w.dyn.mugenBase * (w.dyn.mugenMax || 2), w.s.range * (w.dyn.mugenStep || 1.06));
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

  pulse(w, run, range, dmg, opts) {
    Snd.shot(w.id);
    dmg *= (w.group !== undefined ? w.group : 1);   // 即着系は出力が散るぶん1体あたりが落ちる
    const near = Grid.query(w.x, w.y, range + 20, _q);
    for (const e of near) {
      if (e.dead) continue;
      if (Util.dist(w.x, w.y, e.x, e.y) > range + e.r) continue;
      this.damage(run, e, dmg, opts);
    }
  },

  spawnField(run, x, y, o) {
    if (run.fields.length > 70) run.fields.shift();
    run.fields.push({
      x, y, r: o.r, dur: o.dur, t: 0, tick: 0,
      dps: o.dps, slow: o.slow || 0, vuln: o.vuln || 0,
      color: o.color, kind: o.kind || 'gas',
    });
  },

  grab(w, run, first, power, dur, dmg) {
    const targets = [first];
    if (w.s.count > 1) {
      const near = Grid.query(w.x, w.y, w.s.range, _q);
      const extra = near.filter(e => !e.dead && e !== first && Util.dist(w.x, w.y, e.x, e.y) <= w.s.range)
        .sort((a, b) => a.dist - b.dist).slice(0, w.s.count - 1);
      for (const e of extra) targets.push(e);
    }
    for (const t of targets) {
      if (!t || t.dead) continue;
      t.grabT = Math.max(t.grabT, dur * this.statusScale(t));
      t.grabV = power;
      this.damage(run, t, dmg, { color: '#ffb0e8' });
      this.fx(run, { type: 'link', x1: w.x, y1: w.y, e: t, color: '#c85ab0', life: Math.min(0.6, dur) });
    }
  },

  chainLightning(w, run, first, chains, dmg) {
    let cur = first, d = dmg * (w.group !== undefined ? w.group : 1);
    const used = new Set();
    const pts = [{ x: w.x, y: w.y }];
    for (let i = 0; i <= chains; i++) {
      if (!cur || cur.dead) break;
      used.add(cur);
      pts.push({ x: cur.x, y: cur.y });
      this.damage(run, cur, d, { shock: w.s.shockDur, color: '#d8c7ff', crit: w.s.crit, critMul: w.s.critMul });
      d *= w.s.chainFalloff;
      const near = Grid.query(cur.x, cur.y, 150, _q);
      let best = null, bd = 1e9;
      for (const e of near) {
        if (e.dead || used.has(e)) continue;
        let dd = Util.dist2(cur.x, cur.y, e.x, e.y);
        if (e.stun > 0) dd *= 0.25;      // 感電泡：閉じ込めた敵を優先して通る
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
      let v = dmg * fall;
      // 特定の状態の敵だけ増える分（シナジー）。**狙いは変えない。**
      // 「その敵を狙う」のではなく「その敵に落ちたときに効く」
      if (opts.grabMul && e.grabT > 0) v *= opts.grabMul;
      if (opts.spotMul && e.spotT > 0) v *= opts.spotMul;
      this.damage(run, e, v, Object.assign({ color: '#ffc38a' }, opts));
    }
    this.fx(run, { type: 'boom', x, y, r: radius, color: opts.color || '#ff9a4a', life: 0.3 });
    this.shake(run, Math.min(10, radius * 0.06));
  },

  // この発射で撃つ弾数。
  // **扇を広げるのが得になるカード**（多銃身）がここに乗る。
  // 広げるとカバー範囲は増えるが集弾率が落ちる、という一方通行だったので、
  // 「広さそのものを利益に変える」道をカードで用意している
  shotCount(w) {
    let n = w.s.count;
    if (w.flags.wideCount) n += Math.round(Game.arcT(w) * w.dyn.wideCount);
    return Math.max(1, Math.round(n));
  },

  // ================= 指定攻撃（着弾円） =================
  //
  //   **この分類だけは、砲身から敵へ弾が飛ばない。**
  //   プレイヤーが盤面に円を置き、その中へ砲弾が降り注ぐ。
  //
  //   ・砲弾は **着弾するまで一切の当たり判定を持たない**（敵も壁も素通りする）。
  //     だから射線を持たず、スナイパーやガトリングが置きたい地面を食わない。
  //     好きな場所に置けるのが、この分類の強み
  //   ・**円を絞るほど強い。** 倍率は掛けていない。同じ発射数が狭い面に落ちるので
  //     同じ敵に重なるだけ。広げれば、道を外した砲弾はただの空振りになる
  bombard(w, run, color) {
    const p = w.aim;
    if (!p) return;
    const R = Game.spotR(w);
    const n = w.n || 1;
    for (let i = 0; i < n; i++) {
      // 円の中に一様に散らす（sqrt を掛けないと中心に寄る）
      const a = Util.rand(0, Math.PI * 2);
      const d = Math.sqrt(Math.random()) * R;
      this.spawnLob(w, run, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, {
        color: color || w.def.color, mark: true,
        onLand: (rr, x, y) => this.spotImpact(w, rr, x, y),
      });
    }
  },

  // 着弾。**弾が当たったときと同じことをする**ので、
  // クラスター・酸・感電・内破といったカードがそのまま効く
  spotImpact(w, run, x, y) {
    const dmg = w.s.dmg;
    const R = Math.max(18, w.s.splash);
    let shock = 0;
    if (w.flags.implode) shock = Math.max(shock, w.s.shockDur || 2.5);
    if (w.flags.staticFoam) shock = Math.max(shock, w.s.shockDur || 3);
    this.explode(run, x, y, R, dmg * (w.s.splashMul || 1), {
      color: w.def.color,
      shock,
      stun: w.s.stunDur || 0,
      slow: w.s.slow, slowDur: w.s.slowDur,
      burn: w.s.burn ? dmg * w.s.burn : 0, burnDur: w.s.burnDur,
      crit: w.s.crit, critMul: w.s.critMul, exec: w.s.execThr,
      grabMul: w.dyn.grabMul || 0,
      spotMul: w.dyn.spotMul || 0,
    });
    if (w.dyn.cluster) {
      this.cluster(run, { x, y, dmg, splash: R, splashMul: w.s.splashMul || 1, src: w, wid: w.id });
    }
    if (w.flags.acid) {
      this.spawnField(run, x, y, { kind: 'acid', r: w.s.fieldR, dur: w.s.fieldDur,
        dps: dmg * 0.35, vuln: 0.15, color: '#a8f0c0' });
    }
  },

  fx(run, o) { if (run.fx.length < 240) { o.t = 0; run.fx.push(o); } },
  // 画面の揺れ。**撃ちっぱなしにしたので、撃つたびに揺らすと一生揺れる。**
  //   日常の揺れ（発砲・爆発）は 3px までしか積めない
  //   一発ものの衝撃（ボス撃破・雷神・漏れ）だけが 16px まで上げられる
  shake(run, v, big) {
    const cap = big ? 16 : 3;
    if (run.shake >= cap) return;
    run.shake = Math.min(cap, run.shake + v * 0.35);
  },

  // ================= 照準 =================

  // 扇の中に入っているか
  inArc(w, x, y) {
    let da = Util.angle(w.x, w.y, x, y) - w.face;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    return Math.abs(da) <= w.arc;
  },

  // **武器に敵を探させない。**
  //   以前は「最も密集した点」「最も硬い敵」などを武器が自分で選んでいた。
  //   いまは、砲身が向いている線の上にいるものを拾うだけ。
  //   着弾点を持つ武器（指定攻撃・ミサイル）は、その点にいるものを拾う
  findTarget(w, run) {
    // 指定攻撃は「どこに落とすか」だけで動く。狙う敵という概念を持たない
    if (w.ax !== undefined && w.ax !== null) return null;
    return this.targetAhead(w, run);
  },

  // 砲身の動かし方。**敵を追わない。**
  //   ふつうの武器 … 扇の端から端まで、一定の速さで往復する（首振り扇風機）
  //   指定攻撃     … プレイヤーが決めた着弾点へ向ける（そこへ撃ち込むための武器）
  aimUpdate(w, run, dt) {
    if (w.ax !== undefined && w.ax !== null) {
      // 指定攻撃。**扇は持たない。** 砲身は着弾円の中心を向くだけで、
      // 制約は射程だけ（向きのスライダーは、円を置ける方向を決めるのに使う）
      const want = Util.angle(w.x, w.y, w.ax, w.ay);
      w.angle = Util.turnToward(w.angle, want, w.s.turn * dt);
      w.aim = { x: w.ax, y: w.ay };
      return;
    }
    const sp = (w.def.sweep || BAL.sweepSpeed) * dt;
    if (w.sweepDir === undefined) { w.sweepDir = 1; w.sweepA = 0; }
    w.sweepA += sp * w.sweepDir;
    if (w.sweepA >= w.arc) { w.sweepA = w.arc; w.sweepDir = -1; }
    else if (w.sweepA <= -w.arc) { w.sweepA = -w.arc; w.sweepDir = 1; }
    w.angle = w.face + w.sweepA;
    w.aim = null;
  },

  // 砲身の線が実際に通っている敵のうち、一番近いもの
  // 砲身の線が通っている敵のうち、いちばん近いもの。
  //
  //   **射程まるごとを探すのをやめた。** 以前は Grid.query(w.x, w.y, w.s.range)
  //   で円の中の敵を全部取っていたが、走査するセル数が **射程の2乗** で増える。
  //   実測：ユニット52基・射程がインフレした状態で、
  //   **敵が1〜2体しかいないのに1フレーム 23.7ms**（60fpsの予算16.7msを超える）。
  //   弾を全部消しても 23.9ms だったので、犯人は弾ではなくここだった。
  //
  //   探すのは「砲身の線の上」だけでよいので、線に沿ってセルを辿る。
  //   セル数が射程に**比例**するだけになる（2乗ではなくなる）
  //   **いま持っている当たりより外側は見ない。** 1回 11µs → 3.26µs（3.4倍）。
  //
  //   一度これを「結果が変わるから」と却下しかけた。同じシードで1回ずつ比べて
  //   撃破数が違ったからだが、**測定器はシードを固定しても毎回わずかに違う**
  //   （原因未特定。組み込み前から同じ）。1回の差は雑音だった。
  //   4回ずつ回した平均は 5,192撃破 対 5,201撃破（差 0.2%、振れ幅 ±10%の中）、
  //   到達章は両方 8/8 で変わらず、全体は 23.0秒 → 16.0秒（1.44倍）
  //
  //   **「敵全体を囲む枠で線を切る」案は、測ったら効かなかったので入れていない。**
  //   首振りなので大半の角度は空を向いている、という読みだったが、
  //   敵は盤面のほとんどに散っていて枠がほぼ全面になる。
  //   4回ずつで 19.4秒（枠なし）対 19.8秒（枠あり）で、**むしろ遅い。**
  //   ここは「線の上に敵がいないときの走査」が本体で、枠では減らせない
  targetAhead(w, run) {
    const ca = Math.cos(w.angle), sa = Math.sin(w.angle);
    const range = w.s.range;
    const cs = Grid.cell;
    const pad = (w.s.bulletR || 3) + 20;      // 線の太さ＋敵の半径ぶんの余裕
    let best = null, bd = Infinity;
    const seen = _seenCells;
    seen.clear();
    for (let d = 0; d <= range + cs; d += cs * 0.5) {
      if (best && d - pad - cs > bd) break;
      const x = w.x + ca * Math.min(d, range), y = w.y + sa * Math.min(d, range);
      const gx0 = ((x - pad) / cs) | 0, gx1 = ((x + pad) / cs) | 0;
      const gy0 = ((y - pad) / cs) | 0, gy1 = ((y + pad) / cs) | 0;
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gy = gy0; gy <= gy1; gy++) {
          const k = Grid.key(gx, gy);
          if (seen.has(k)) continue;
          seen.add(k);
          const arr = Grid.map.get(k);
          if (!arr) continue;
          for (const e of arr) {
            if (e.dead) continue;
            const dx = e.x - w.x, dy = e.y - w.y;
            const along = dx * ca + dy * sa;                  // 砲身方向の距離
            if (along < 0 || along > range + e.r) continue;
            if (along >= bd) continue;
            const off = Math.abs(-dx * sa + dy * ca);         // 線からの横ずれ
            if (off > e.r + (w.s.bulletR || 3) + 2) continue; // 線が体に掛かっていない
            bd = along; best = e;
          }
        }
      }
    }
    return best;
  },

  // ================= 更新 =================
  // 戻り値: null / 'dead'（コア破壊）/ 'waveclear' / 'stageclear'
  update(run, dt) {
    const st = run.stage;
    Grid.build(run.enemies);
    let signal = null;

    // --- ウェーブ進行 ---
    if (run.phase === 'spawn') {
      // **「敵がいないときだけ湧きを早める」は入れなかった。**
      // 実測で効果が誤差（1周 19.5→20.4分、待ち率 65→67%）。
      // 湧き間隔が0.16秒なので、湧いている最中に盤面が空になることがほぼ無く、
      // 早める対象そのものが存在しなかった
      run.spawnTimer -= dt;
      let guard = 0;
      while (run.spawnTimer <= 0 && run.toSpawn > 0 && guard++ < 60) {
        this.spawnEnemy(run);
        run.toSpawn--;
        run.spawnTimer += this.spawnInterval(run);
      }
      if (run.toSpawn <= 0) run.phase = 'clear';
    } else if (run.phase === 'clear') {
      // このウェーブの敵を全部片づけたら突破。
      // 次のウェーブは自動で来ない。ビルドフェーズに戻して、置き直す時間を作る
      if (run.enemies.length === 0) {
        signal = this.isLastWave(run) ? 'stageclear' : 'waveclear';
        run.phase = 'build';
      }
    }

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
    const tw = run.tower;
    run.trafficT += dt;
    const sample = run.trafficT >= BAL.trafficSample;
    if (sample) run.trafficT = 0;

    for (let i = run.enemies.length - 1; i >= 0; i--) {
      const e = run.enemies[i];
      if (e.dead) { run.enemies.splice(i, 1); continue; }
      if (e.shock > 0) e.shock -= dt;
      if (e.chill > 0) e.chill -= dt;
      if (e.stun > 0) e.stun -= dt;
      if (e.grabT > 0) e.grabT -= dt;
      if (e.spotT > 0) e.spotT -= dt;
      if (e.fvulnT > 0) e.fvulnT -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.burnT > 0) { e.burnT -= dt; this.damage(run, e, e.burn * dt, { color: '#ff8a3a' }); if (e.dead) continue; }

      const tc = (e.x / TILE) | 0, tr = (e.y / TILE) | 0;
      const inside = st.walkable(tc, tr);
      e.dist = inside ? st.dist[st.idx(tc, tr)] : 1e9;

      // 通行量の記録（どこに溜まるかを、次の準備フェーズで見せるため）
      if (sample && inside) run.traffic[st.idx(tc, tr)]++;

      const goal = inside ? st.flowTo(tc, tr) : { x: tw.x, y: tw.y };
      const a = Util.angle(e.x, e.y, goal.x, goal.y);

      if (e.stun <= 0) {
        if (e.grabT > 0) {
          // **来た道へ引き戻す。** 道の上にいるあいだだけ後退させる。
          //   道を外れると goal がコア直通になり、そこから後退させると
          //   「壁を無視してコアの真逆（このマップ群では画面の上）へ飛ぶ」
          //   になっていた。引っ張るのであって、弾き飛ばすのではない
          if (inside) {
            const nx = e.x - Math.cos(a) * e.grabV * dt;
            const ny = e.y - Math.sin(a) * e.grabV * dt;
            if (st.walkable((nx / TILE) | 0, (ny / TILE) | 0)) { e.x = nx; e.y = ny; }
          }
        } else {
          const slowMul = Math.max(BAL.enemySlowFloor, 1 - e.slow);
          e.x += Math.cos(a) * e.spd * slowMul * dt;
          e.y += Math.sin(a) * e.spd * slowMul * dt;
          e.ang = a;      // 描画で向きを出すため。挙動には使わない
        }
      }

      // コアに触れた敵は、ライフを1つ持っていって消える（＝漏れ）
      if (Util.dist(e.x, e.y, tw.x, tw.y) <= tw.r + e.r) {
        const cost = BAL.leakLives;
        run.lives -= cost;
        run.leaked++;
        run.livesLost += cost;
        Snd.leak();
        // 何に抜けられたか。死因を「どの敵に負けたか」まで残す
        const tn = e.tname || 'grunt';
        run.leakBy[tn] = (run.leakBy[tn] || 0) + 1;
        // 経路全体を塗るが、コアに近い区間ほど濃くする。
        // 「どこで止め損ねたか」が知りたいので、手前ほど強調しても意味が薄い
        const route = st.routes[e.si];
        if (route) for (let k = 0; k < route.length; k++) {
          run.leak[route[k]] += 0.15 + 0.85 * (k / Math.max(1, route.length - 1));
        }
        this.fx(run, { type: 'boom', x: e.x, y: e.y, r: 26, color: '#ff5b6e', life: 0.3 });
        this.shake(run, 3, true);
        e.dead = true;
        run.enemies.splice(i, 1);
        continue;
      }
    }

    // 敵が動き終わったあとで押し合う。**重なったまま進ませない**
    Crowd.apply(run, dt);

    if (run.lives <= 0) { run.lives = 0; return 'dead'; }

    // --- ユニット ---
    for (const w of run.units) {
      if (w.flags.heat) w.dyn.heat = Math.max(0, w.dyn.heat - dt * 0.85);
      if (w.flags.thunderGod) {
        w.dyn.godCd -= dt;
        if (w.dyn.godCd <= 0) {
          w.dyn.godCd = w.dyn.godEvery || 5;
          for (const e of run.enemies.slice(0, 150)) {
            if (e.dead) continue;
            this.damage(run, e, w.s.dmg * 3, { shock: Math.max(2, w.s.shockDur), color: '#d8c7ff' });
          }
          this.fx(run, { type: 'ring', x: run.tower.x, y: run.tower.y, r: Math.max(st.w, st.h), color: '#e2d6ff', life: 0.4 });
          this.shake(run, 14, true);
        }
      }

      if (w.muzzle > 0) w.muzzle -= dt;
      this.aimUpdate(w, run, dt);
      w.target = this.findTarget(w, run);

      // **撃ちっぱなし。** 敵がいるかどうかで撃つ／撃たないを武器に決めさせない。
      // 首を振り続ける扇風機のガトリング、というのがこの武器たちの姿
      // 加熱には**上限がある。** 撃ちっぱなしにしたので、青天井だと
      // 「撃っているだけで速くなり続ける」になってしまう（heatCap で頭打ち）
      const rate = w.s.rate *
        (w.flags.heat ? (1 + w.dyn.heat * Math.min(BAL.heatCap, w.dyn.heatMax || 0)) : 1);
      w.cd -= dt;
      if (w.cd <= 0) {
        w.cd = 1 / Math.max(0.02, rate);
        w.muzzle = 0.07;
        w.shots++;
        w.group = Game.groupingOf(w);  // 扇の広さで決まる集弾率。fire から参照する
        w.n = this.shotCount(w);       // この発射で撃つ弾数。fire から参照する
        w.def.fire(w, run);
      }
    }

    // --- 弾 ---
    for (let i = run.bullets.length - 1; i >= 0; i--) {
      const b = run.bullets[i];
      b.life -= dt;
      if (b.life <= 0) { this.bulletEnd(run, b); run.bullets.splice(i, 1); continue; }

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

        if (b.src && b.src.flags.resonance && b.wid === 'gatling')
          run.resonance = Math.min(run.resonanceMax || 4.0, run.resonance + (run.resonanceStep || 0.006));
        // 曳光指示：スナイパーが撃ち抜いた敵に印が残る。
        // **ミサイルの狙いは変えない。**印の付いた敵に落ちたときだけ効く
        if (b.src && b.src.flags.spot && b.wid === 'sniper' && !e.dead) e.spotT = 3;
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

        if (run.fx.length < 150) this.fx(run, { type: 'spark', x: b.x, y: b.y, color: b.color, life: 0.14 });

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
            b.ox = b.x; b.oy = b.y;
            b.target = best;
          } else consumed = true;
          break;
        }

        b.hits++;
        if (b.pierce > 0) {
          b.pierce--;
          if (!b.hit) b.hit = new Set();
          b.hit.add(e);
        } else { consumed = true; break; }
      }
      if (consumed) {
        // **貫通したことを見せる。** カウンタを減らすだけでは何も伝わらない
        if (b.long && b.hits > 0 && run.fx.length < 150) {
          this.fx(run, { type: 'trail', x1: b.ox, y1: b.oy, x2: b.x, y2: b.y,
                         n: b.hits, color: b.color, life: 0.22 });
        }
        run.bullets.splice(i, 1);
      }
    }

    // --- 演出 ---
    for (let i = run.fx.length - 1; i >= 0; i--) {
      const f = run.fx[i]; f.t += dt;
      if (f.t >= f.life) {
        if (f.type === 'coin') this.coinFx = Math.max(0, this.coinFx - 1);
        run.fx.splice(i, 1);
      }
    }
    for (let i = run.nums.length - 1; i >= 0; i--) {
      const n = run.nums[i]; n.t += dt; n.y -= dt * 34;
      if (n.t >= n.life) run.nums.splice(i, 1);
    }
    if (run.shake > 0) run.shake = Math.max(0, run.shake - dt * 42);

    run.time += dt;
    return signal;
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
