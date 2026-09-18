// ---------------------------------------------------------------
// render.js : Canvas描画。数字だけでなく画面でも強くなったと分かるように
// ---------------------------------------------------------------
'use strict';

const Render = {
  canvas: null, ctx: null, dpr: 1, scale: 1,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.resize();
  },

  resize() {
    const c = this.canvas;
    const rect = c.getBoundingClientRect();
    const cssW = Math.max(1, rect.width), cssH = Math.max(1, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(cssW * this.dpr);
    c.height = Math.round(cssH * this.dpr);
    Game.setField(cssW, cssH);
    this.scale = c.width / Game.field.w;
    Game.syncWeaponPos();
  },

  // 画面座標 -> 盤面座標
  toField(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width * Game.field.w,
             y: (clientY - r.top) / r.height * Game.field.h };
  },

  draw(run) {
    const ctx = this.ctx, F = Game.field;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    // 背景
    ctx.fillStyle = '#070a10';
    ctx.fillRect(0, 0, F.w, F.h);

    let sx = 0, sy = 0;
    if (run && run.shake > 0) {
      sx = Util.rand(-run.shake, run.shake); sy = Util.rand(-run.shake, run.shake);
      ctx.translate(sx, sy);
    }

    this.grid(ctx, F);

    if (!run) { ctx.setTransform(1, 0, 0, 1, 0, 0); return; }

    this.rangeRings(ctx, run);
    this.tower(ctx, run);
    this.enemies(ctx, run);
    this.bullets(ctx, run);
    this.weapons(ctx, run);
    this.effects(ctx, run);
    this.numbers(ctx, run);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },

  grid(ctx, F) {
    ctx.strokeStyle = 'rgba(90,130,190,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const g = 64;
    for (let x = (F.cx % g); x < F.w; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, F.h); }
    for (let y = (F.cy % g); y < F.h; y += g) { ctx.moveTo(0, y); ctx.lineTo(F.w, y); }
    ctx.stroke();

    const rg = ctx.createRadialGradient(F.cx, F.cy, 40, F.cx, F.cy, Math.max(F.w, F.h) * 0.62);
    rg.addColorStop(0, 'rgba(60,110,190,0.10)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, F.w, F.h);
  },

  rangeRings(ctx, run) {
    if (!Game.dragging) return;
    for (const w of run.weapons) {
      ctx.strokeStyle = w.def.color + '55';
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.s.range, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // 配置可能範囲
    const t = run.tower;
    ctx.strokeStyle = 'rgba(120,200,255,0.35)';
    ctx.setLineDash([3, 7]);
    ctx.beginPath(); ctx.arc(t.x, t.y, BAL.placeR, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  },

  tower(ctx, run) {
    const t = run.tower;
    const hpR = Util.clamp(t.hp / t.maxHp, 0, 1);

    ctx.save();
    ctx.shadowColor = '#4ea8ff'; ctx.shadowBlur = 24;
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

    // HPリング
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 9, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = hpR > 0.5 ? '#48e08a' : hpR > 0.22 ? '#ffc23c' : '#ff4e63';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpR);
    ctx.stroke();
  },

  weapons(ctx, run) {
    for (const w of run.weapons) {
      const c = w.def.color;
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.angle);
      // 砲身
      ctx.fillStyle = c;
      const bl = w.id === 'sniper' ? 26 : w.id === 'tesla' ? 10 : 18;
      ctx.fillRect(0, -3, bl, 6);
      if (w.muzzle > 0) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(bl + 3, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // 基部
      ctx.save();
      ctx.shadowColor = c; ctx.shadowBlur = 12;
      ctx.fillStyle = '#0e1622';
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w.x, w.y, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = c;
      ctx.font = 'bold 9px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(w.def.short, w.x, w.y + 0.5);
    }
  },

  enemies(ctx, run) {
    ctx.textAlign = 'center';
    for (const e of run.enemies) {
      ctx.save();
      if (e.boss) { ctx.shadowColor = '#ff2d55'; ctx.shadowBlur = 20; }
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.color;
      ctx.beginPath();
      if (e.boss) {
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4 + run.time * 0.6;
          const rr = e.r * (i % 2 ? 0.72 : 1);
          const px = e.x + Math.cos(a) * rr, py = e.y + Math.sin(a) * rr;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
      } else {
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();

      if (e.shock > 0) {
        ctx.strokeStyle = 'rgba(190,160,255,0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2); ctx.stroke();
      }
      // HPバー（ダメージを受けた敵だけ）
      if (e.hp < e.maxHp) {
        const w = e.r * 2.1, h = e.boss ? 5 : 2.5;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 7, w, h);
        ctx.fillStyle = e.boss ? '#ff4e63' : '#7ef08a';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 7, w * Util.clamp(e.hp / e.maxHp, 0, 1), h);
      }
    }
  },

  bullets(ctx, run) {
    ctx.lineCap = 'round';
    for (const b of run.bullets) {
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
        ctx.globalAlpha = (1 - k) * 0.28;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.8, 0, Math.PI * 2); ctx.fill();
      } else if (f.type === 'spark') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, 3 * (1 - k) + 1, 0, Math.PI * 2); ctx.fill();
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
