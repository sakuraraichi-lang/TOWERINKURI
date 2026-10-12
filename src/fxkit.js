// ---------------------------------------------------------------
// fxkit.js : 演出の共通の部品（2026-10-12・合成武器の演出の作り直し 段1・設計 docs/FUSION-ART-DIRECTION-2026-10-12.md）
//
//   どの演出も「芯（白）・本体（武器の色）・光（加算）・当たりの手応え（閃光＋六角の衝撃波＋粒）」の4層で描く。その部品。
//   **shadowBlur は使わない**（毎フレームのぼかしは重い）。光は、色ごとに1枚だけ作り置いた放射グラデーションの絵を
//   加算（'lighter'）で貼る。粒は**状態を持たない**：経過時間 t と種から位置を式で出す（止めた時刻の絵が必ず同じになり、
//   確認室で時刻を止めて見られる。配列も作らない）。
//   読み込んだ時点では document に触らない（測定器 tools/sim.html でも読む）。
// ---------------------------------------------------------------
'use strict';

const FxKit = {
  // ---------- 小道具 ----------
  // 決まった乱数：i 番目・種 s → 0〜1（同じ引数なら必ず同じ値）
  h(i, s) { const x = Math.sin((i + 1) * 12.9898 + (s || 0) * 78.233) * 43758.5453; return x - Math.floor(x); },
  ease(k) { k = k < 0 ? 0 : k > 1 ? 1 : k; return 1 - (1 - k) * (1 - k); },
  clamp01(k) { return k < 0 ? 0 : k > 1 ? 1 : k; },
  // '#rrggbb' → 'rgba(r,g,b,a)'
  rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  },

  // ---------- 作り置きの絵 ----------
  //   key ごとに1回だけ描く。h … 絵の半分の大きさ（盤の px）・res … 1px あたりの画素数。draw(c) は原点が真ん中
  _spr: {},
  sprite(key, h, res, draw) {
    const k = key + '@' + res;
    let s = this._spr[k];
    if (s) return s;
    const cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(h * 2 * res);
    const c = cv.getContext('2d'); c.setTransform(res, 0, 0, res, h * res, h * res);
    draw(c);
    return (this._spr[k] = { cv, h });
  },
  res() { return typeof Render !== 'undefined' && Render.spriteRes ? Render.spriteRes() : 2; },

  // ---------- 光（グロー） ----------
  //   色ごとに 128px の放射グラデーションを1枚。半径は貼るときに拡大縮小する（ぼけた円なので拡大しても崩れない）
  _glow: {},
  glowCv(color) {
    let cv = this._glow[color];
    if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, this.rgba(color, 1)); g.addColorStop(0.22, this.rgba(color, 0.6));
    g.addColorStop(0.5, this.rgba(color, 0.2)); g.addColorStop(1, this.rgba(color, 0));
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    return (this._glow[color] = cv);
  },
  // 加算で光を貼る。a … 濃さ（0〜1）
  //   すでに加算のときは切り替えない（合成の切り替えは描画のまとまりを切って重くなる。光を続けて貼るときは、呼ぶ側で 'lighter' にしてから並べる）
  glow(ctx, x, y, r, color, a) {
    if (a <= 0.004 || r <= 0.5) return;
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    if (op !== 'lighter') ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(this.glowCv(color), x - r, y - r, r * 2, r * 2);
    if (op !== 'lighter') ctx.globalCompositeOperation = op;
    ctx.globalAlpha = ga;
  },

  // ---------- 短い閃光 ----------
  //   T … 起きてからの秒。dur（既定 0.08秒）で消える。白い芯の光と、色の光
  flash(ctx, x, y, r, T, color, dur) {
    dur = dur || 0.08;
    if (T < 0 || T >= dur) return;
    const q = T / dur, a = (1 - q) * (1 - q), op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    this.glow(ctx, x, y, r * (0.55 + 0.35 * q), '#ffffff', a);
    this.glow(ctx, x, y, r * (1 + 0.5 * q), color, a * 0.9);
    ctx.globalCompositeOperation = op;
  },

  // ---------- 六角の衝撃波（世界観の語彙） ----------
  //   k … 0〜1（広がりきると消える）。r … 広がりきった半径。lw … 線の太さ
  hexAdd(ctx, x, y, r, rot) {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i + (rot || 0);
      i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  },
  hexWave(ctx, x, y, r, k, color, lw) {
    if (k <= 0 || k >= 1) return;
    const rr = r * (0.22 + 0.78 * this.ease(k)), a = 1 - k, w = (lw || 4) * (1 - k * 0.6);
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.beginPath(); this.hexAdd(ctx, x, y, rr);
    ctx.globalAlpha = a * 0.35; ctx.strokeStyle = color; ctx.lineWidth = w * 2.6; ctx.stroke();
    ctx.globalAlpha = a * 0.95; ctx.lineWidth = w; ctx.stroke();
    ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, w * 0.3); ctx.stroke();
    ctx.globalCompositeOperation = op; ctx.globalAlpha = 1;
  },

  // ---------- 太い線（芯白＋本体色＋外光の3層） ----------
  //   path(ctx) … パスを作る関数（beginPath から）。w … 本体の太さ（8px 以上が決まり）
  beam(ctx, path, w, color, a, glowColor) {
    if (a <= 0.004) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'miter'; ctx.miterLimit = 2.5;   // 継ぎ目を丸くすると重い（稲妻は角が立っていてよい）
    path(ctx);
    ctx.globalAlpha = a * 0.28; ctx.strokeStyle = glowColor || color; ctx.lineWidth = w * 2.6; ctx.stroke();   // 外光は加算にしない（合成の切り替えが重い）
    ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
    ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.2, w * 0.36); ctx.stroke();
    ctx.globalAlpha = 1;
  },

  // ---------- 先の細る帯（斬撃・触手） ----------
  //   pts … 中心線の点 [{x,y}]・wd(q) … q（0〜1）での太さ。多角形にして塗る（線の太さでは先を細くできない）
  ribbon(ctx, pts, wd) {
    const n = pts.length;
    if (n < 2) return;
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const w = wd(i / (n - 1)) * 0.5;
      L.push(p.x - ty * w, p.y + tx * w); R.push(p.x + ty * w, p.y - tx * w);
    }
    ctx.beginPath();
    ctx.moveTo(L[0], L[1]);
    for (let i = 1; i < n; i++) ctx.lineTo(L[i * 2], L[i * 2 + 1]);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i * 2], R[i * 2 + 1]);
    ctx.closePath();
  },

  // ---------- 粒（状態を持たない） ----------
  //   o: { x, y, t（秒）, seed, n, life, v（初速 px/s）, a（向き）, spread（ばらつき・ラジアン）, drag（減速）, g（重力 px/s²）,
  //        size, c0（生まれた色）, c1（消える前の色）, shape:'dot'|'shard'|'star', add（加算で描く）, even（向きを等分する） }
  //   粒ごとに色と濃さを変えて1つずつ塗ると、塗る回数が粒の数だけ増える（2026-10-12：電撃2本の演出で粒を止めると 0.49→0.23ms・0.69→0.42ms。各1回の測定で振れが大きい）。
  //   色2つ×濃さ3段の6つの組に分け、組ごとに1つのパスにまとめて1回で塗る
  _sp: [],
  sparks(ctx, o) {
    const n = o.n || 8, life = o.life || 0.4, t = o.t;
    if (t < 0) return;
    const drag = o.drag || 0, g = o.g || 0, seed = o.seed || 0, size = o.size || 2.5, P = this._sp;
    let m = 0;
    for (let i = 0; i < n; i++) {
      const h1 = this.h(i, seed), h2 = this.h(i + 31, seed), h3 = this.h(i + 57, seed), h4 = this.h(i + 83, seed);
      const li = life * (0.6 + 0.4 * h1);
      if (t >= li) continue;
      const q = t / li;
      const ang = o.even ? (o.a || 0) + (i / n) * Math.PI * 2 + (h2 - 0.5) * 0.3 : (o.a || 0) + (h2 - 0.5) * (o.spread === undefined ? Math.PI * 2 : o.spread);
      const sp = (o.v || 160) * (0.45 + 0.55 * h3);
      const d = drag > 0 ? sp * (1 - Math.exp(-drag * t)) / drag : sp * t;
      P[m++] = o.x + Math.cos(ang) * d; P[m++] = o.y + Math.sin(ang) * d + 0.5 * g * t * t;
      P[m++] = size * (0.6 + 0.7 * h4) * (1 - q * 0.65); P[m++] = ang + (o.shape === 'star' ? (o.rot || 0) + t * 6 + i : 0);
      P[m++] = (q < 0.45 ? 0 : 3) + (q < 0.34 ? 0 : q < 0.67 ? 1 : 2);   // 組：色（0 c0／3 c1）＋濃さの段
    }
    if (!m) return;
    const op = ctx.globalCompositeOperation;
    if (o.add !== false) ctx.globalCompositeOperation = 'lighter';
    const A = [1, 0.62, 0.28], base = o.alpha || 1;
    for (let grp = 0; grp < 6; grp++) {
      let any = false;
      for (let j = 0; j < m; j += 5) {
        if (P[j + 4] !== grp) continue;
        if (!any) { ctx.beginPath(); any = true; }
        const px = P[j], py = P[j + 1], s = P[j + 2], ang = P[j + 3];
        if (o.shape === 'shard') {
          const vx = Math.cos(ang), vy = Math.sin(ang);
          ctx.moveTo(px + vx * s * 2.2, py + vy * s * 2.2);
          ctx.lineTo(px - vy * s * 0.6, py + vx * s * 0.6);
          ctx.lineTo(px - vx * s * 1.2, py - vy * s * 1.2);
          ctx.lineTo(px + vy * s * 0.6, py - vx * s * 0.6);
          ctx.closePath();
        } else if (o.shape === 'star') {
          for (let k = 0; k < 10; k++) { const a = ang + k * Math.PI / 5, r = k % 2 ? s * 0.45 : s; ctx[k ? 'lineTo' : 'moveTo'](px + Math.cos(a) * r, py + Math.sin(a) * r); }
          ctx.closePath();
        } else ctx.rect(px - s / 2, py - s / 2, s, s);
      }
      if (!any) continue;
      ctx.globalAlpha = A[grp % 3] * base;
      ctx.fillStyle = grp < 3 ? (o.c0 || '#ffffff') : (o.c1 || o.c0 || '#ffffff');
      ctx.fill();
    }
    ctx.globalCompositeOperation = op; ctx.globalAlpha = 1;
  },

  // ---------- 残像 ----------
  //   n 枚を古い順に薄く描く。fn(j) … j 枚前（1〜n）の絵を描く関数。a … いちばん新しい残像の濃さ
  afterimage(ctx, n, a, fn) {
    const ga = ctx.globalAlpha;
    for (let j = n; j >= 1; j--) { ctx.globalAlpha = ga * a * (1 - (j - 1) / n); fn(j); }
    ctx.globalAlpha = ga;
  },

  // ---------- 形 ----------
  // 尖った星（n 角）
  starPath(ctx, x, y, r1, r2, rot, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, r = i % 2 ? r2 : r1; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath();
  },
  // 角の丸い星（ぷっくりした星）。round … 角を丸める割合（0〜0.5）
  roundStar(ctx, x, y, r1, r2, rot, n, round) {
    const m = n * 2, P = [];
    for (let i = 0; i < m; i++) { const a = rot + i * Math.PI / n - Math.PI / 2, r = i % 2 ? r2 : r1; P.push(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    const ro = round === undefined ? 0.22 : round, ri = ro * 0.6;
    ctx.beginPath();
    for (let i = 0; i <= m; i++) {
      const j = i % m, p = (j + m - 1) % m, q = (j + 1) % m, t = j % 2 ? ri : ro;
      const vx = P[j * 2], vy = P[j * 2 + 1];
      const ax = vx + (P[p * 2] - vx) * t, ay = vy + (P[p * 2 + 1] - vy) * t;
      const bx = vx + (P[q * 2] - vx) * t, by = vy + (P[q * 2 + 1] - vy) * t;
      if (i === 0) ctx.moveTo(bx, by);
      else { ctx.lineTo(ax, ay); ctx.quadraticCurveTo(vx, vy, bx, by); }
    }
    ctx.closePath();
  },
  // ぎざぎざの稲妻の点列（a→b を n 分割・振れ幅 amp・種 seed）。両端は動かさない
  jag(ax, ay, bx, by, n, amp, seed) {
    const out = [{ x: ax, y: ay }], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    for (let i = 1; i < n; i++) {
      const q = i / n, o = (this.h(i, seed) - 0.5) * 2 * amp * Math.sin(q * Math.PI);
      out.push({ x: ax + dx * q + nx * o, y: ay + dy * q + ny * o });
    }
    out.push({ x: bx, y: by });
    return out;
  },
  poly(ctx, pts) { ctx.beginPath(); for (let i = 0; i < pts.length; i++) ctx[i ? 'lineTo' : 'moveTo'](pts[i].x, pts[i].y); },
};
