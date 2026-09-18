// ---------------------------------------------------------------
// render.js : Canvas描画。タイルマップ＋敵＋弾＋場＋演出
// ---------------------------------------------------------------
'use strict';

const Render = {
  canvas: null, ctx: null, dpr: 1,
  scale: 1, offX: 0, offY: 0,
  cssW: 1, cssH: 1,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.resize();
  },

  resize() {
    const c = this.canvas;
    const rect = c.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(this.cssW * this.dpr);
    c.height = Math.round(this.cssH * this.dpr);
    this.fit();
  },

  // ステージ全体が収まるように拡大率と余白を決める
  fit() {
    const st = Game.run ? Game.run.stage : Stage.build(Game.perm ? (Game.perm.currentStage || 'st1') : 'st1');
    this.stage = st;
    const s = Math.min(this.cssW / st.w, this.cssH / st.h);
    this.scale = s;
    this.offX = (this.cssW - st.w * s) / 2;
    this.offY = (this.cssH - st.h * s) / 2;
  },

  // 画面座標 -> ステージ座標
  toStage(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) - this.offX) / this.scale,
      y: ((clientY - r.top) - this.offY) / this.scale,
    };
  },

  tileAt(clientX, clientY) {
    const p = this.toStage(clientX, clientY);
    return { c: Math.floor(p.x / TILE), r: Math.floor(p.y / TILE), x: p.x, y: p.y };
  },

  draw(run) {
    const ctx = this.ctx;
    const k = this.scale * this.dpr;
    const st = (run && run.stage) || this.stage;
    this.stage = st;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    let sx = 0, sy = 0;
    if (run && run.shake > 0) { sx = Util.rand(-run.shake, run.shake); sy = Util.rand(-run.shake, run.shake); }
    ctx.setTransform(k, 0, 0, k, (this.offX * this.dpr) + sx * k, (this.offY * this.dpr) + sy * k);

    this.tiles(ctx, st);
    if (!run) { ctx.setTransform(1, 0, 0, 1, 0, 0); return; }

    this.fields(ctx, run);
    this.core(ctx, run);
    this.enemies(ctx, run);
    this.bullets(ctx, run);
    this.weapons(ctx, run);
    this.effects(ctx, run);
    this.numbers(ctx, run);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },

  tiles(ctx, st) {
    const sel = UI.placing;
    for (let r = 0; r < st.rows; r++) {
      for (let c = 0; c < st.cols; c++) {
        const ch = st.grid[r][c];
        const x = c * TILE, y = r * TILE;
        if (ch === '#') {
          // 壁 = 明るいブロック。武器が置ける場所なので一番はっきり見せる
          ctx.fillStyle = '#25384f';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.fillRect(x, y, TILE, 3);
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fillRect(x, y + TILE - 3, TILE, 3);
          ctx.strokeStyle = '#3a5170';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else if (ch === ' ') {
          ctx.fillStyle = '#04060a';
          ctx.fillRect(x, y, TILE, TILE);
        } else {
          // 通路 = 暗く沈める
          ctx.fillStyle = '#070c14';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = 'rgba(90,140,200,0.10)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        }
        if (ch === 'S') {
          ctx.fillStyle = 'rgba(255,60,90,0.16)';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = '#ff4e63'; ctx.lineWidth = 2;
          ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
        }
      }
    }
    // 通路に進行方向の矢印を薄く出す（どこを通ってくるか一目で分かるように）
    ctx.strokeStyle = 'rgba(120,170,230,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let r = 0; r < st.rows; r++) {
      for (let c = 0; c < st.cols; c++) {
        if (!st.walkable(c, r)) continue;
        const n = st.next[st.idx(c, r)];
        if (!n) continue;
        const a = Math.atan2(n.r - r, n.c - c);
        const cx = c * TILE + TILE / 2, cy = r * TILE + TILE / 2;
        const L = 7, tipx = cx + Math.cos(a) * L, tipy = cy + Math.sin(a) * L;
        ctx.moveTo(tipx, tipy);
        ctx.lineTo(cx + Math.cos(a + 2.5) * L, cy + Math.sin(a + 2.5) * L);
        ctx.moveTo(tipx, tipy);
        ctx.lineTo(cx + Math.cos(a - 2.5) * L, cy + Math.sin(a - 2.5) * L);
      }
    }
    ctx.stroke();

    // 設置モードのとき、置ける壁を光らせる
    if (sel) {
      const occupied = {};
      if (Game.run) for (const w of Game.run.weapons) if (w !== sel) occupied[w.c + ',' + w.r] = 1;
      for (let r = 0; r < st.rows; r++) {
        for (let c = 0; c < st.cols; c++) {
          if (!st.isWall(c, r) || occupied[c + ',' + r]) continue;
          ctx.fillStyle = 'rgba(78,168,255,0.18)';
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
          ctx.strokeStyle = 'rgba(120,200,255,0.55)'; ctx.lineWidth = 1.5;
          ctx.strokeRect(c * TILE + 2, r * TILE + 2, TILE - 4, TILE - 4);
        }
      }
      // 選択中の武器の射程
      ctx.strokeStyle = sel.def.color + '77';
      ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(sel.x, sel.y, sel.s.range, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  },

  fields(ctx, run) {
    for (const f of run.fields) {
      const k = f.t / f.dur;
      ctx.globalAlpha = 0.20 * (1 - k * 0.5) + 0.06;
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5 * (1 - k);
      ctx.strokeStyle = f.color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  },

  core(ctx, run) {
    const t = run.tower;
    const hpR = Util.clamp(t.hp / t.maxHp, 0, 1);
    ctx.save();
    ctx.shadowColor = '#4ea8ff'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#12243c';
    ctx.strokeStyle = '#5ec8ff'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 3;
      const px = t.x + Math.cos(a) * t.r, py = t.y + Math.sin(a) * t.r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 7, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = hpR > 0.5 ? '#48e08a' : hpR > 0.22 ? '#ffc23c' : '#ff4e63';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpR);
    ctx.stroke();
  },

  weapons(ctx, run) {
    for (const w of run.weapons) {
      const c = w.def.color;
      const sel = UI.placing === w;
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.angle);
      ctx.fillStyle = c;
      const bl = w.id === 'sniper' ? 24 : w.id === 'tesla' || w.id === 'cryo' ? 9
               : w.id === 'katana' ? 20 : 16;
      ctx.fillRect(0, -3, bl, 6);
      if (w.muzzle > 0) {
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(bl + 3, 0, 5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      ctx.save();
      ctx.shadowColor = c; ctx.shadowBlur = sel ? 20 : 11;
      ctx.fillStyle = '#0e1622';
      ctx.strokeStyle = sel ? '#ffffff' : c; ctx.lineWidth = sel ? 3 : 2;
      ctx.beginPath(); ctx.arc(w.x, w.y, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = c;
      ctx.font = 'bold 9px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(w.def.short, w.x, w.y + 0.5);
    }
  },

  enemies(ctx, run) {
    for (const e of run.enemies) {
      ctx.save();
      if (e.boss) { ctx.shadowColor = '#ff2d55'; ctx.shadowBlur = 18; }
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff'
                    : e.chill > 0 ? '#7fd8ff'
                    : e.burnT > 0 ? '#ff9a4a' : e.color;
      ctx.beginPath();
      if (e.boss) {
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4 + run.time * 0.6;
          const rr = e.r * (i % 2 ? 0.72 : 1);
          const px = e.x + Math.cos(a) * rr, py = e.y + Math.sin(a) * rr;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
      } else ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (e.stun > 0) {   // 泡に閉じ込められている
        ctx.strokeStyle = 'rgba(160,220,255,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(140,216,255,0.16)';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6, 0, Math.PI * 2); ctx.fill();
      } else if (e.shock > 0) {
        ctx.strokeStyle = 'rgba(190,160,255,0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2); ctx.stroke();
      }
      if (e.grabT > 0) {
        ctx.strokeStyle = 'rgba(200,90,176,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2); ctx.stroke();
      }
      if (e.hp < e.maxHp) {
        const bw = e.r * 2.2, bh = e.boss ? 5 : 2.5;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 7, bw, bh);
        ctx.fillStyle = e.boss ? '#ff4e63' : '#7ef08a';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 7, bw * Util.clamp(e.hp / e.maxHp, 0, 1), bh);
      }
    }
  },

  bullets(ctx, run) {
    ctx.lineCap = 'round';
    for (const b of run.bullets) {
      if (b.bubble || b.lob) {
        ctx.fillStyle = b.color;
        ctx.globalAlpha = b.bubble ? 0.4 : 0.9;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = b.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
        continue;
      }
      if (b.spin) {    // 手裏剣
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(run.time * 22);
        ctx.strokeStyle = b.color; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-b.r, 0); ctx.lineTo(b.r, 0);
        ctx.moveTo(0, -b.r); ctx.lineTo(0, b.r);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const len = b.long ? 22 : Math.min(16, sp * 0.018);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.r * 1.6;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx / sp * len, b.y - b.vy / sp * len);
      ctx.stroke();
    }
  },

  effects(ctx, run) {
    for (const f of run.fx) {
      const k = f.t / f.life;
      if (f.type === 'boom') {
        const r = f.r * (0.35 + k * 0.9);
        ctx.globalAlpha = (1 - k) * 0.85;
        ctx.strokeStyle = f.color; ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = (1 - k) * 0.26;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.8, 0, Math.PI * 2); ctx.fill();
      } else if (f.type === 'ring') {
        ctx.globalAlpha = (1 - k) * 0.7;
        ctx.strokeStyle = f.color; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + k * 0.8), 0, Math.PI * 2); ctx.stroke();
      } else if (f.type === 'spark') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, 3 * (1 - k) + 1, 0, Math.PI * 2); ctx.fill();
      } else if (f.type === 'cone') {
        ctx.globalAlpha = (1 - k) * 0.5;
        const g = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.r);
        g.addColorStop(0, '#fff3c0'); g.addColorStop(0.45, f.color); g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(f.x, f.y);
        ctx.arc(f.x, f.y, f.r, f.a - f.arc, f.a + f.arc);
        ctx.closePath(); ctx.fill();
      } else if (f.type === 'slash') {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = f.color; ctx.lineWidth = 3.5 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * 0.92, f.a - f.arc, f.a + f.arc);
        ctx.stroke();
      } else if (f.type === 'link') {
        if (f.e && !f.e.dead) {
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.strokeStyle = f.color; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(f.x1, f.y1);
          const mx = (f.x1 + f.e.x) / 2 + Util.rand(-10, 10);
          const my = (f.y1 + f.e.y) / 2 + Util.rand(-10, 10);
          ctx.quadraticCurveTo(mx, my, f.e.x, f.e.y);
          ctx.stroke();
        }
      } else if (f.type === 'bolt') {
        ctx.globalAlpha = 1 - k;
        ctx.save();
        ctx.shadowColor = f.color; ctx.shadowBlur = 14;
        ctx.strokeStyle = f.color; ctx.lineWidth = 2.4;
        ctx.beginPath();
        for (let i = 0; i < f.pts.length; i++) {
          const p = f.pts[i];
          const jx = i === 0 ? 0 : Util.rand(-7, 7), jy = i === 0 ? 0 : Util.rand(-7, 7);
          i ? ctx.lineTo(p.x + jx, p.y + jy) : ctx.moveTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  },

  numbers(ctx, run) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const n of run.nums) {
      const k = n.t / n.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = (n.crit ? 'bold 15px ' : '11px ') + 'system-ui,sans-serif';
      ctx.fillStyle = n.crit ? '#ffd24a' : n.color;
      ctx.fillText(n.txt, n.x, n.y);
    }
    ctx.globalAlpha = 1;
  },
};
