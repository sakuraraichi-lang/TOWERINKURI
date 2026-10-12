// ---------------------------------------------------------------
// fusionfx.js : 合成武器の絵（2026-10-06・fusion.js の絵の側）
//
//   **ドット絵にしない。**砲塔は、A と B の部品（武器ごとの小さなベクタの絵）を重ねて描く：A を前に大きく、B を後ろに小さく、
//   真ん中に合成の色の六角の芯。24種は A と B の組が全部違うので、形で見分けられる。
//   攻撃の演出は `type:'fx'` の演出（k で種類）と、居座る場（run.fzones）と、弾の形（b.fx）。
//   合成ボタン（盤の上・A の左上に光る）もここで描く／当たりを取る。
// ---------------------------------------------------------------
'use strict';

const FusionFX = {
  // ---------- 部品：武器ごとのベクタの絵。+x が砲身の向き。大きさはおよそ ±12 ----------
  //   path で形を作って dark 縁 → 色（光る）→ 白い縁取り、の順
  fin(c, col, lw, glow) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.lineWidth = lw || 2.6; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    c.save(); c.shadowColor = col; c.shadowBlur = glow === undefined ? 4 : glow; c.fillStyle = col; c.fill(); c.restore();
  },
  part(c, id, col) {
    const P = this;
    c.save();
    switch (id) {
      case 'gatling':           // 3本の銃身と丸い胴
        c.beginPath(); c.arc(0, 0, 5.2, 0, 7); P.fin(c, '#59606e', 2.4, 0);
        for (const y of [-4.2, -0.2, 3.8]) { c.beginPath(); c.rect(3, y - 1.4, 15, 2.8); P.fin(c, col, 2, 3); }
        break;
      case 'shuriken': {        // 4枚刃の星
        c.beginPath();
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8, r = i % 2 ? 3.4 : 11; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
        c.closePath(); P.fin(c, col, 2.4, 4);
        c.fillStyle = '#10131a'; c.beginPath(); c.arc(0, 0, 1.8, 0, 7); c.fill();
        break; }
      case 'tesla':             // 2本の電極と火花
        c.beginPath(); c.arc(0, 0, 4.4, 0, 7); P.fin(c, '#59606e', 2.2, 0);
        for (const s of [-1, 1]) { c.beginPath(); c.moveTo(2, s * 3); c.lineTo(14, s * 7.5); c.lineTo(14, s * 4.5); c.lineTo(3, s * 1); c.closePath(); P.fin(c, col, 2, 3); }
        c.strokeStyle = '#ffffff'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(14, -6); c.lineTo(17, -2); c.lineTo(15, 1); c.lineTo(18, 3); c.lineTo(14, 6); c.stroke();
        break;
      case 'katana':            // 反った刃
        c.beginPath(); c.moveTo(-2, 2.5); c.quadraticCurveTo(12, -7, 24, -5); c.quadraticCurveTo(12, -2.4, -2, 5.5); c.closePath(); P.fin(c, '#eef2fb', 2.2, 5);
        c.beginPath(); c.rect(-6, 1.5, 6, 4.4); P.fin(c, col === '#f4f6fb' ? '#8a93a6' : col, 2, 0);
        break;
      case 'tentacle':          // うねる腕
        c.beginPath(); c.moveTo(0, 0);
        for (let x = 0; x <= 22; x += 2) c.lineTo(x, Math.sin(x * 0.5) * 4.2 * (x / 22 + 0.3));
        c.lineWidth = 6.2; c.lineCap = 'round'; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
        c.lineWidth = 4; c.strokeStyle = col; c.save(); c.shadowColor = col; c.shadowBlur = 4; c.stroke(); c.restore();
        c.fillStyle = '#ffd0f0'; for (const x of [6, 11, 16]) { c.beginPath(); c.arc(x, Math.sin(x * 0.5) * 4.2 * (x / 22 + 0.3) + 1.8, 1, 0, 7); c.fill(); }
        break;
      case 'flame':             // ノズルと炎の舌
        c.beginPath(); c.rect(0, -3.4, 11, 6.8); P.fin(c, '#59606e', 2.2, 0);
        c.beginPath(); c.moveTo(11, -3); c.quadraticCurveTo(19, -4, 24, 0); c.quadraticCurveTo(19, 4, 11, 3); c.closePath(); P.fin(c, col, 2, 6);
        c.fillStyle = '#fff2c0'; c.beginPath(); c.moveTo(12, -1.3); c.quadraticCurveTo(18, -1.4, 20, 0); c.quadraticCurveTo(18, 1.4, 12, 1.3); c.closePath(); c.fill();
        break;
      case 'gas':               // ボンベとノズル
        c.beginPath(); c.arc(1, 0, 6.4, 0, 7); P.fin(c, '#59606e', 2.2, 0);
        c.beginPath(); c.rect(6, -2, 8, 4); P.fin(c, col, 2, 3);
        c.fillStyle = col; for (const [x, y, r] of [[17, -3, 2.2], [19, 2, 2.6], [22, -1, 2]]) { c.globalAlpha = 0.8; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
        break;
      case 'cryo':              // 雪の結晶
        c.beginPath(); c.arc(0, 0, 3.6, 0, 7); P.fin(c, '#59606e', 2, 0);
        for (let i = 0; i < 3; i++) {
          const a = i * Math.PI / 3 + 0.2;
          c.beginPath(); c.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); c.lineTo(-Math.cos(a) * 12, -Math.sin(a) * 12);
          c.lineWidth = 4.4; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke(); c.lineWidth = 2.2; c.strokeStyle = col; c.stroke();
        }
        break;
      case 'bubble':            // 泡の房
        for (const [x, y, r] of [[3, 3, 3.6], [8, -4, 5], [12, 3.5, 4]]) {
          c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = 'rgba(138,216,255,0.35)'; c.fill();
          c.lineWidth = 1.8; c.strokeStyle = col; c.stroke();
          c.fillStyle = '#fff'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.2, 0, 7); c.fill();
        }
        break;
      case 'mortar':            // 太い筒と台座
        c.beginPath(); c.rect(-4, -6, 5, 12); P.fin(c, '#59606e', 2, 0);
        c.beginPath(); c.moveTo(1, -3.6); c.lineTo(13, -4.4); c.lineTo(17, -6.4); c.lineTo(17, 6.4); c.lineTo(13, 4.4); c.lineTo(1, 3.6); c.closePath(); P.fin(c, col, 2.2, 3);
        c.fillStyle = '#10131a'; c.beginPath(); c.ellipse(17, 0, 1.6, 5.4, 0, 0, 7); c.fill();
        break;
      case 'missile':           // ポッドと弾頭
        c.beginPath(); c.rect(0, -6.2, 14, 12.4); P.fin(c, '#59606e', 2.2, 0);
        for (const y of [-3, 3]) { c.beginPath(); c.moveTo(7, y - 2.4); c.lineTo(20, y); c.lineTo(7, y + 2.4); c.closePath(); P.fin(c, col, 1.8, 3); }
        break;
      case 'sniper':            // 長い銃身とレンズ
        c.beginPath(); c.rect(-4, -3.6, 9, 7.2); P.fin(c, '#59606e', 2.2, 0);
        c.beginPath(); c.rect(5, -1.5, 19, 3); P.fin(c, col, 2, 4);
        c.beginPath(); c.arc(9, 0, 4, 0, 7); P.fin(c, '#1c3a4a', 2, 0);
        c.fillStyle = col; c.beginPath(); c.arc(9, 0, 2, 0, 7); c.fill();
        break;
      default:
        c.beginPath(); c.arc(0, 0, 6, 0, 7); P.fin(c, col, 2, 3);
    }
    c.restore();
  },

  // 合成武器の砲塔（作り置き）。A を前に大きく・B を後ろに小さく・真ん中に合成の色の六角の芯・後ろに金の印
  turretSprite(R, fid) {
    const res = R.spriteRes();
    const key = fid + '@' + res;
    this._tur = this._tur || {};
    if (this._tur[key]) return this._tur[key];
    const f = FUSIONS[fid], A = WEAPONS[f.a], B = WEAPONS[f.b];
    const h = 40, K = 1.12;                   // 部品は ±12 ほど。台座の六角（半径27）に対して小さく見えたので少し大きく描く
    const cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(h * 2 * res);
    const c = cv.getContext('2d'); c.setTransform(res * K, 0, 0, res * K, h * res, h * res);
    c.save(); c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 5; c.shadowOffsetY = 2;   // 作り置きの絵なので影のぼかしは1回だけ
    if (this.turretArt[fid]) { c.save(); c.scale(1.2, 1.2); this.turretArt[fid].call(this.REG[fid], c, f); c.restore(); }
    else {
      // 後ろ：B（逆向き・小さく）。前：A。前後に伸びた2つの部品で、どの A＋B かが形で読める
      c.save(); c.translate(-3, 0); c.rotate(Math.PI); c.scale(0.78, 0.78); this.part(c, f.b, B.color); c.restore();
      c.save(); c.translate(2, 0); this.part(c, f.a, A.color); c.restore();
      // 真ん中：合成の色の六角の芯と、金の印（後ろの2点）
      c.beginPath();
      for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 6.6, Math.sin(a) * 6.6); }
      c.closePath(); this.fin(c, f.color, 2.4, 6);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 1.9, 0, 7); c.fill();
      c.fillStyle = '#ffd24a';
      for (const y of [-6.2, 6.2]) { c.beginPath(); c.moveTo(-1.5, y); c.lineTo(1.5, y - 2.2); c.lineTo(1.5, y + 2.2); c.closePath(); c.fill(); }
    }
    c.restore();
    c.globalCompositeOperation = 'source-atop';
    const g = c.createLinearGradient(-h * 0.6, -h * 0.6, h * 0.6, h * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.34)'); g.addColorStop(0.45, 'rgba(255,255,255,0.03)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
    c.fillStyle = g; c.fillRect(-h, -h, h * 2, h * 2);
    return (this._tur[key] = { cv, h });
  },

  // 合成した砲台の絵：src/fusionfx/*.js が register の turret で登録する（無い合成武器は、A と B の部品を重ねた絵）
  turretArt: {},

  // 図鑑用の絵（データURL）。台座の上に砲塔を右向きで
  icon(R, fid) {
    this._ico = this._ico || {};
    if (this._ico[fid]) return this._ico[fid];
    const f = FUSIONS[fid], S = 76;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d');
    const ped = R.pedestalSprite(f.color), tur = R.turretSprite ? FusionFX.turretSprite(R, fid) : null;
    const k = S / (ped.h * 2);
    c.drawImage(ped.cv, 0, 0, S, S);
    if (tur) { const t = tur.h * 2 * k * 0.95; c.drawImage(tur.cv, (S - t) / 2, (S - t) / 2, t, t); }
    return (this._ico[fid] = cv.toDataURL());
  },

  // ---------- 弾の形（b.fx） ----------
  star(ctx, x, y, r1, r2, rot, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, r = i % 2 ? r2 : r1; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath();
  },
  bullets(ctx, list, run) {
    const t = run.time;
    for (const b of list) {
      const hb = this._bul[b.fx];                                    // 合成武器ごとのファイル（src/fusionfx/*.js）が登録した形
      if (hb) { ctx.save(); hb.fn.call(hb.o, ctx, b, t, run); ctx.restore(); continue; }
      const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
      // 尾（進んできた向きの逆へ）
      ctx.globalAlpha = 0.45; ctx.strokeStyle = b.color; ctx.lineWidth = Math.max(2, b.r * 0.8); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - ux * b.r * 3.2, b.y - uy * b.r * 3.2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.lineCap = 'butt';
  },

  // ---------- 演出（Combat.fx の { type:'fx', k }） ----------
  crescent(ctx, x, y, a, arc, R, W, color, k) {
    const a0 = a - arc, a1 = a + arc, N = 16;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { const t = a0 + (a1 - a0) * (i / N), w = W * Math.sin((i / N) * Math.PI), rr = R + w * 0.5; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(t) * rr, y + Math.sin(t) * rr); }
    for (let i = N; i >= 0; i--) { const t = a0 + (a1 - a0) * (i / N), w = W * Math.sin((i / N) * Math.PI); ctx.lineTo(x + Math.cos(t) * (R - w * 0.5), y + Math.sin(t) * (R - w * 0.5)); }
    ctx.closePath();
    ctx.globalAlpha = (1 - k) * 0.9; ctx.fillStyle = color; ctx.fill();
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, R + W * 0.5, a0, a1); ctx.stroke();
  },
  draw(ctx, f, k, R) {
    const hf = this._fx[f.k];                                       // 合成武器ごとのファイルが登録した演出
    if (hf) { ctx.save(); hf.fn.call(hf.o, ctx, f, k, R); ctx.restore(); ctx.globalAlpha = 1; return; }
    const ease = 1 - (1 - k) * (1 - k);
    switch (f.k) {
      case 'cage': {        // 泡の檻（敵を包む）。ice なら氷の面を足す
        const e = f.e, x = e ? (e.dead ? f.x : e.x) : f.x, y = e ? (e.dead ? f.y : e.y) : f.y;
        const r = f.r * (1 + 0.06 * Math.sin(k * 30)), fade = k > 0.85 ? (1 - k) / 0.15 : 1;
        ctx.globalAlpha = 0.28 * fade; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.9 * fade; ctx.lineWidth = 1.8; ctx.strokeStyle = f.color; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.8 * fade; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.18, 0, 7); ctx.fill();
        if (f.ice) {
          ctx.globalAlpha = 0.7 * fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
          ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + 0.3; ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x - Math.cos(a) * r, y - Math.sin(a) * r); } ctx.stroke();
        }
        break; }
      case 'abyssburst': {  // 狂気の海底：泡がはじけ、下から触手が一突き。中心へ集まっていた光の筋が外へ弾ける
        const r = f.r * (0.3 + ease * 0.85);
        ctx.globalAlpha = (1 - k) * 0.5; ctx.fillStyle = '#4ab8d8'; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill();
        ctx.globalAlpha = (1 - k) * 0.95; ctx.strokeStyle = '#d8f4ff'; ctx.lineWidth = 3 * (1 - k) + 1; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.stroke();
        const up = Math.min(1, k * 4), L = f.r * 1.5 * up * (1 - Math.max(0, (k - 0.5) / 0.5));
        ctx.save(); ctx.lineCap = 'round'; ctx.translate(f.x, f.y);
        ctx.globalAlpha = (1 - k * 0.6);
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 11 * (1 - k * 0.5) + 2;
        ctx.beginPath(); ctx.moveTo(0, f.r * 0.9); ctx.bezierCurveTo(-14, f.r * 0.9 - L * 0.35, 14, f.r * 0.9 - L * 0.7, 0, f.r * 0.9 - L); ctx.stroke();
        ctx.strokeStyle = '#ff7ac8'; ctx.lineWidth = 8 * (1 - k * 0.5);
        ctx.beginPath(); ctx.moveTo(0, f.r * 0.9); ctx.bezierCurveTo(-14, f.r * 0.9 - L * 0.35, 14, f.r * 0.9 - L * 0.7, 0, f.r * 0.9 - L); ctx.stroke();
        ctx.restore();
        break; }
      case 'eruption': {    // ヴォルケイノブラスト：砲口から火山弾が噴き上がる（炎の柱と火の粉）
        const ux = Math.cos(f.a), uy = Math.sin(f.a);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let j = 0; j < 3; j++) {
          const L = (36 + j * 16) * (0.6 + ease * 0.5);
          ctx.globalAlpha = (1 - k) * (0.5 - j * 0.12); ctx.fillStyle = j === 0 ? '#fff0c0' : j === 1 ? '#ffb43c' : '#ff5a1a';
          ctx.beginPath(); ctx.moveTo(f.x + uy * 7, f.y - ux * 7); ctx.lineTo(f.x + ux * L, f.y + uy * L); ctx.lineTo(f.x - uy * 7, f.y + ux * 7); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = '#ff9a3a';
        for (let i = 0; i < 9; i++) { const sp = (i * 13) % 7 - 3, d = (10 + i * 6) * ease; ctx.globalAlpha = (1 - k) * 0.9; ctx.fillRect(f.x + ux * d + uy * sp * 3 - 1.5, f.y + uy * d - ux * sp * 3 - 1.5, 3, 3); }
        break; }
      case 'vortex': {      // 相反の渦：氷（青）と炎（橙）の2本の腕が逆に巻いて広がる
        const r = f.r * (0.25 + ease * 0.85);
        ctx.lineCap = 'round';
        for (const [col, off, sgn] of [['#7fe6ff', 0, 1], ['#ff7a3a', Math.PI, 1]]) {
          ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = col; ctx.lineWidth = 5 * (1 - k) + 1.5;
          ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 10;
          ctx.beginPath();
          for (let i = 0; i <= 28; i++) {
            const q = i / 28, a = f.ph + off + sgn * (q * 7 + k * 5), rr = r * q;
            ctx[i ? 'lineTo' : 'moveTo'](f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr);
          }
          ctx.stroke(); ctx.restore();
        }
        ctx.globalAlpha = (1 - k) * 0.12; ctx.fillStyle = '#ffd0e8'; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill();
        break; }
      case 'frostfoam': {   // 永久凍土：霜の輪と、広がる小さな泡
        ctx.globalAlpha = (1 - k) * 0.6; ctx.strokeStyle = '#bff0ff'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + ease * 0.75), 0, 7); ctx.stroke();
        for (let i = 0; i < 12; i++) {
          const a = f.ph + i * 0.52, d = f.r * (0.2 + ease * 0.75) * (0.55 + ((i * 37) % 10) / 22), r = 3 + (i % 3) * 1.6;
          ctx.globalAlpha = (1 - k) * 0.8; ctx.lineWidth = 1.3; ctx.strokeStyle = '#e6fbff';
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, r, 0, 7); ctx.stroke();
        }
        break; }
      case 'shards': {      // 氷の破片が飛び散る
        ctx.fillStyle = f.color;
        for (let i = 0; i < 12; i++) {
          const a = i * 0.5236 + (i % 2) * 0.2, d = f.r * (0.2 + ease * 0.9) * (0.7 + (i % 3) * 0.15), s = 6 * (1 - k) + 1;
          ctx.globalAlpha = (1 - k) * 0.95;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(a) * d + Math.cos(a) * s * 1.6, f.y + Math.sin(a) * d + Math.sin(a) * s * 1.6);
          ctx.lineTo(f.x + Math.cos(a) * d + Math.cos(a + 2.2) * s, f.y + Math.sin(a) * d + Math.sin(a + 2.2) * s);
          ctx.lineTo(f.x + Math.cos(a) * d + Math.cos(a - 2.2) * s, f.y + Math.sin(a) * d + Math.sin(a - 2.2) * s);
          ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = (1 - k) * 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + ease * 0.7), 0, 7); ctx.stroke();
        break; }
      case 'magstorm': {    // 磁気嵐：着弾点に渦巻く電撃の嵐（逆向きに回る2重の弧・走る火花・磁力線の輪）
        const r = f.r * (0.4 + ease * 0.7);
        ctx.save(); ctx.shadowColor = f.color; ctx.shadowBlur = 12; ctx.lineCap = 'round';
        for (let j = 0; j < 3; j++) {
          const dir = j % 2 ? -1 : 1, rr = r * (0.45 + j * 0.28), a0 = f.ph + dir * (k * 9 + j * 2.1);
          ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = j === 1 ? '#ffffff' : f.color; ctx.lineWidth = 3 * (1 - k) + 1;
          ctx.beginPath();
          for (let i = 0; i <= 14; i++) { const a = a0 + i * 0.22, jit = (i % 2 ? 1 : -1) * 3 * (1 - k); ctx[i ? 'lineTo' : 'moveTo'](f.x + Math.cos(a) * (rr + jit), f.y + Math.sin(a) * (rr + jit)); }
          ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = (1 - k) * 0.55; ctx.strokeStyle = '#d8c7ff'; ctx.lineWidth = 1.4; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.arc(f.x, f.y, r * 1.12, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        break; }
      case 'strike': {      // 雷雲の落雷
        ctx.save(); ctx.shadowColor = f.color; ctx.shadowBlur = 12;
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6 * (1 - k) + 0.8;
        const y0 = f.fromY;
        ctx.beginPath(); ctx.moveTo(f.x, y0);
        for (let i = 1; i <= 6; i++) ctx.lineTo(f.x + (i % 2 ? 1 : -1) * 6 * (i < 6 ? 1 : 0), y0 + (f.y - y0) * i / 6);
        ctx.stroke(); ctx.restore();
        break; }
      case 'pop':
        ctx.globalAlpha = (1 - k) * 0.85; ctx.strokeStyle = f.color; ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + ease * 0.7), 0, 7); ctx.stroke();
        break;
    }
    ctx.globalAlpha = 1;
  },

  // 落ちてくる弾（Combat.spawnLob の fx）。形は合成武器ごとのファイル（src/fusionfx/*.js）が lobs で登録する
  lob(ctx, b, by, br, run) {
    const hl = this._lob[b.fx];                                     // 合成武器ごとのファイルが登録した落ちてくる弾
    if (hl) { ctx.save(); hl.fn.call(hl.o, ctx, b, by, br, run); ctx.restore(); return; }
    ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, by, Math.max(4, br), 0, 7); ctx.fill();   // 登録の無い形（ふつうは通らない）
  },

  // ---------- 居座る場（run.fzones） ----------
  zones(ctx, run) {
    const zs = run.fzones;
    if (!zs || !zs.length) return;
    const t = run.time;
    for (const z of zs) {
      const k = z.t / z.dur, fade = Math.min(1, (1 - k) * 2.2, k * 8 + 0.3);
      ctx.save();
      const hz = this._zone[z.kind];                                 // 合成武器ごとのファイルが登録した場
      if (hz) {
        hz.fn.call(hz.o, ctx, z, run);
      } else if (z.kind === 'abyss') {    // 狂気の海底：大きな泡（深い青緑）。外から中心へ流れ込む渦の筋と、閉じ込められた光
        const near = Math.max(0, (k - 0.78) / 0.22);          // 破裂の間際：泡が膨らんで赤みを帯びる
        const R = z.r * (1 + near * 0.12);
        ctx.globalAlpha = (0.2 + near * 0.18) * fade; ctx.fillStyle = near > 0 ? '#7a4aa8' : '#2a8fb0'; ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.95 * fade; ctx.strokeStyle = '#a8e8ff'; ctx.lineWidth = 2.4; ctx.stroke();
        ctx.lineCap = 'round'; ctx.strokeStyle = '#d8f8ff'; ctx.lineWidth = 1.6;
        for (let i = 0; i < 6; i++) {                          // 中心へ巻き込む渦の筋
          const a0 = t * 2.2 + i * 1.047;
          ctx.globalAlpha = 0.55 * fade; ctx.beginPath();
          for (let j = 0; j <= 10; j++) { const q = j / 10, a = a0 + q * 1.6, rr = R * (0.95 - q * 0.8); ctx[j ? 'lineTo' : 'moveTo'](z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr); }
          ctx.stroke();
        }
        ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.7 * fade; ctx.beginPath(); ctx.arc(z.x - R * 0.4, z.y - R * 0.45, R * 0.1, 0, 7); ctx.fill();
        ctx.globalAlpha = (0.5 + near * 0.5) * fade; ctx.fillStyle = '#ff7ac8'; ctx.beginPath(); ctx.arc(z.x, z.y, 3 + near * 6, 0, 7); ctx.fill();
      } else if (z.kind === 'twister') {  // 航海の悪夢：雷を纏った竜巻（上から見た渦）。逆向きに回る弧と、走る稲光
        const R = z.r;
        ctx.globalAlpha = 0.2 * fade; ctx.fillStyle = '#4a3a98'; ctx.beginPath(); ctx.arc(z.x, z.y, R * 1.05, 0, 7); ctx.fill();
        ctx.save(); ctx.shadowColor = '#8a6aff'; ctx.shadowBlur = 8; ctx.lineCap = 'round';
        for (let j = 0; j < 4; j++) {
          const a0 = t * (6 - j) * (j % 2 ? -1 : 1) + j * 1.7, rr = R * (0.3 + j * 0.22);
          ctx.globalAlpha = (0.9 - j * 0.12) * fade; ctx.strokeStyle = j === 0 ? '#ffffff' : '#a890ff'; ctx.lineWidth = 3.2 - j * 0.5;
          ctx.beginPath(); ctx.arc(z.x, z.y, rr, a0, a0 + 3.4); ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9 * fade;
        if (Math.sin(t * 31 + z.x) > 0) {
          ctx.beginPath(); const a = t * 17;
          ctx.moveTo(z.x + Math.cos(a) * R * 0.2, z.y + Math.sin(a) * R * 0.2);
          ctx.lineTo(z.x + Math.cos(a + 0.4) * R * 0.6, z.y + Math.sin(a + 0.4) * R * 0.6);
          ctx.lineTo(z.x + Math.cos(a - 0.2) * R * 0.8, z.y + Math.sin(a - 0.2) * R * 0.8);
          ctx.lineTo(z.x + Math.cos(a + 0.3) * R * 1.15, z.y + Math.sin(a + 0.3) * R * 1.15);
          ctx.stroke();
        }
      } else if (z.kind === 'firewhirl') { // 滅尽嵐：火炎旋風（上から見た炎の渦）。橙と黄の腕が巻き、中心が白く熱い
        const R = z.r;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.16 * fade; ctx.fillStyle = '#ff6a1a'; ctx.beginPath(); ctx.arc(z.x, z.y, R * 1.1, 0, 7); ctx.fill();
        ctx.lineCap = 'round';
        for (let j = 0; j < 3; j++) {
          const a0 = t * 7 + j * 2.094;
          ctx.globalAlpha = 0.8 * fade; ctx.strokeStyle = j === 1 ? '#ffd060' : '#ff7a2a'; ctx.lineWidth = 6 - j;
          ctx.beginPath();
          for (let i = 0; i <= 16; i++) { const q = i / 16, a = a0 + q * 4.4, rr = R * q * (1 + 0.08 * Math.sin(t * 9 + i)); ctx[i ? 'lineTo' : 'moveTo'](z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr); }
          ctx.stroke();
        }
        ctx.globalAlpha = 0.7 * fade; ctx.fillStyle = '#fff0c0'; ctx.beginPath(); ctx.arc(z.x, z.y, R * 0.16, 0, 7); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (z.kind === 'aquaregia') {  // 王水：黄金の液体。金の面・ゆっくり広がる波紋・きらめき
        const R = z.r * (0.9 + 0.1 * Math.min(1, k * 6));
        const gr = ctx.createRadialGradient(z.x, z.y, R * 0.1, z.x, z.y, R);
        gr.addColorStop(0, 'rgba(255,236,150,0.55)'); gr.addColorStop(0.7, 'rgba(255,196,60,0.38)'); gr.addColorStop(1, 'rgba(210,140,20,0.22)');
        ctx.globalAlpha = fade; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, 7); ctx.fill();
        ctx.strokeStyle = '#ffe38a'; ctx.lineWidth = 1.6;
        for (let i = 0; i < 3; i++) { const q = ((t * 0.5 + i / 3) % 1); ctx.globalAlpha = (1 - q) * 0.6 * fade; ctx.beginPath(); ctx.arc(z.x, z.y, R * (0.2 + q * 0.8), 0, 7); ctx.stroke(); }
        ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, 7); ctx.stroke();
        ctx.fillStyle = '#fffbe0';
        for (let i = 0; i < 6; i++) {
          const tw = 0.5 + 0.5 * Math.sin(t * 5 + i * 2.3), a = i * 2.4 + 0.5, d = R * (0.2 + ((i * 37) % 10) / 14);
          ctx.globalAlpha = tw * fade; const s = 1.6 + tw * 1.6; ctx.fillRect(z.x + Math.cos(a) * d - s / 2, z.y + Math.sin(a) * d - s / 2, s, s);
        }
      } else if (z.kind === 'blizzard') {   // スノーグレイブ：氷の嵐（白青の渦の筋・流れる雪・氷片）
        const R = z.r;
        ctx.globalAlpha = 0.14 * fade; ctx.fillStyle = '#9fe0ff'; ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, 7); ctx.fill();
        ctx.lineCap = 'round';
        for (let j = 0; j < 5; j++) {
          const a0 = t * 4.5 + j * 1.2566;
          ctx.globalAlpha = 0.7 * fade; ctx.strokeStyle = j % 2 ? '#e6fbff' : '#8fd0ff'; ctx.lineWidth = 3;
          ctx.beginPath(); for (let i = 0; i <= 10; i++) { const q = i / 10, a = a0 + q * 2.6, rr = R * (0.25 + q * 0.7); ctx[i ? 'lineTo' : 'moveTo'](z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr); } ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 14; i++) { const a = t * (1.5 + (i % 3) * 0.5) + i * 0.9, d = R * (0.2 + ((i * 53) % 10) / 12); ctx.globalAlpha = 0.85 * fade; ctx.fillRect(z.x + Math.cos(a) * d - 1.2, z.y + Math.sin(a) * d - 1.2, 2.4, 2.4); }
        ctx.globalAlpha = 0.6 * fade; ctx.strokeStyle = '#bff0ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, 7); ctx.stroke();
      } else if (z.kind === 'spikes') {     // 凍結光線：氷の棘山。反射した所から素早く生える
        const grow = Math.min(1, z.t / 0.18), R = z.r;
        ctx.globalAlpha = 0.18 * fade; ctx.fillStyle = '#bff0ff'; ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, 7); ctx.fill();
        for (let i = 0; i < 9; i++) {
          const a = i * 0.698 + 0.3, d = R * (0.15 + ((i * 41) % 10) / 14), h = (12 + ((i * 29) % 7) * 3) * grow, w = 4.2 + (i % 3);
          const bx = z.x + Math.cos(a) * d, by = z.y + Math.sin(a) * d;
          ctx.globalAlpha = 0.95 * fade;
          ctx.beginPath(); ctx.moveTo(bx - w, by + 3); ctx.lineTo(bx + 1, by - h); ctx.lineTo(bx + w, by + 3); ctx.closePath();
          ctx.fillStyle = i % 2 ? '#d8f6ff' : '#9fe0ff'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        }
        ctx.globalAlpha = 0.6 * fade; ctx.strokeStyle = '#e6fbff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, 7); ctx.stroke();
      } else if (z.kind === 'storm') {    // 雷雲：黒紫の雲の塊と、ときどき光る
        for (let i = 0; i < 5; i++) {
          const a = t * 0.4 + i * 1.26, d = z.r * 0.4, rr = z.r * (0.42 + 0.06 * Math.sin(t * 1.7 + i));
          ctx.globalAlpha = 0.34 * fade; ctx.fillStyle = i % 2 ? '#3a2c6a' : '#54449a';
          ctx.beginPath(); ctx.arc(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, rr, 0, 7); ctx.fill();
        }
        if (Math.sin(t * 23 + z.x) > 0.93) { ctx.globalAlpha = 0.35 * fade; ctx.fillStyle = '#e8dcff'; ctx.beginPath(); ctx.arc(z.x, z.y, z.r * 0.7, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 0.55 * fade; ctx.strokeStyle = '#8a7ad8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.stroke();
      }
      ctx.restore();
    }
  },

  // ---------- 敵の上に描く場の部分（Render.draw が敵のあとで呼ぶ） ----------
  zonesOver(ctx, run) {
    const zs = run.fzones;
    if (!zs || !zs.length) return;
    for (const z of zs) {
      const h = this._over[z.kind];
      if (!h) continue;
      ctx.save(); h.fn.call(h.o, ctx, z, run); ctx.restore();
    }
    ctx.globalAlpha = 1;
  },

  // ---------- 合成武器ごとの絵の登録（レジストリ・2026-10-12 段1） ----------
  //   src/fusionfx/fx-*.js が FusionFX.register(合成の id, 物) で登録する。書き方は各ファイルの冒頭。
  //   形（弾の fx）・演出の k・場の kind は全体で1つの名前。同じ名前を2回登録したら警告を出す（3人が並べて作るとき、ぶつかりに気づけるように）
  REG: {}, _bul: {}, _lob: {}, _fx: {}, _zone: {}, _over: {},
  register(fid, o) {
    if (this.REG[fid]) console.warn('FusionFX.register：' + fid + ' を2回登録しました');
    if (typeof FUSIONS !== 'undefined' && !FUSIONS[fid]) console.warn('FusionFX.register：' + fid + ' という合成武器はありません');
    this.REG[fid] = o;
    if (o.turret) this.turretArt[fid] = o.turret;
    for (const [part, tbl] of [['bullets', this._bul], ['lobs', this._lob], ['fx', this._fx], ['zones', this._zone], ['over', this._over]]) {
      for (const name of Object.keys(o[part] || {})) {
        if (tbl[name]) console.warn('FusionFX.register：' + part + ' の「' + name + '」は ' + tbl[name].fid + ' が登録済み（' + fid + '）');
        tbl[name] = { fid, o, fn: o[part][name] };
      }
    }
  },

  // ---------- 合成した砲台の縁の光（全24種）：合成の色の柔らかい光と金の線（作り置き） ----------
  rim(R, ctx, u, fd) {
    const S = FxKit.sprite('fz-rim-' + fd.color, MapGen.HEX_R + 9, FxKit.res(), c => {
      c.lineJoin = 'round';
      for (const [w, a] of [[10, 0.1], [6.5, 0.16], [3.6, 0.3]]) { c.beginPath(); FxKit.hexAdd(c, 0, 0, MapGen.HEX_R - 1.5); c.globalAlpha = a; c.strokeStyle = fd.color; c.lineWidth = w; c.stroke(); }
      c.globalAlpha = 0.95; c.beginPath(); FxKit.hexAdd(c, 0, 0, MapGen.HEX_R - 1.5); c.strokeStyle = '#ffd24a'; c.lineWidth = 1.7; c.stroke();
      c.globalAlpha = 0.6; c.strokeStyle = '#ffffff'; c.lineWidth = 0.6; c.stroke();
    });
    ctx.save(); ctx.globalAlpha = 0.85 + 0.15 * Math.sin((Game.run ? Game.run.time : 0) * 3 + u.x * 0.01);
    ctx.drawImage(S.cv, u.x - S.h, u.y - S.h, S.h * 2, S.h * 2); ctx.restore();
  },

  // ---------- 合成ボタン（盤の上・A の左上に光る） ----------
  //   準備フェーズとウェーブの合間（Game.canBuild）だけ。**合成できる組があるときだけ**出る（その合成の札を持っているとき）。
  //   足りないとき（コスト）は薄く出して、押すと理由を言う。1回目のタップで「合成 → ○○ コスト+n」の札に開き、2回目で合成する
  _arm: null, _armT: 0,
  btns(R) {
    const run = Game.run;
    if (!run || run.over || !Game.canBuild() || typeof Fusion === 'undefined') return [];
    const opts = Fusion.options(run), out = [], seen = {};
    const r = Math.max(11, 17 / (R.scale || 1));
    for (const o of opts) {
      const key = o.a.c + ',' + o.a.r, n = seen[key] = (seen[key] || 0) + 1;
      const x = o.a.x - (MapGen.HEX_R * 0.72 + r * 0.25) + (n - 1) * (r * 2.1);
      const y = o.a.y - (MapGen.HEX_R * 0.78 + r * 0.45);
      out.push({ o, x, y, r, key: key + o.fid });
    }
    return out;
  },
  hit(R, clientX, clientY) {
    const bs = this.btns(R);
    if (!bs.length) return null;
    const p = R.toStage(clientX, clientY);
    let best = null, bd = 1e9;
    for (const b of bs) { const d = Math.hypot(p.x - b.x, p.y - b.y); if (d <= b.r * 1.35 && d < bd) { bd = d; best = b; } }
    return best;
  },
  drawBtns(R, ctx) {
    const bs = this.btns(R);
    if (!bs.length) { this._arm = null; return; }
    const now = performance.now(), px = 1 / (R.scale || 1);
    if (this._arm && now - this._armT > 2800) this._arm = null;
    // 初めて合成できる組が出たとき、短い一言（導線）
    if (typeof UI !== 'undefined' && UI.isNew && UI.isNew('fuse')) { UI.markSeen('fuse'); UI.toastMsg('「合」をタップで合成', '#ffd24a', 'fuse'); }
    for (const b of bs) {
      const f = FUSIONS[b.o.fid], on = b.o.ok, armed = this._arm === b.key;
      const pulse = 0.5 + 0.5 * Math.sin(now / 220 + b.x);
      ctx.save();
      ctx.globalAlpha = on ? 1 : 0.55;
      if (on) { ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 8 + pulse * 10; }
      R.hexPathOn(ctx, b.x, b.y, b.r);
      ctx.fillStyle = on ? (armed ? '#ffd24a' : '#2a1d05') : '#1a1d24'; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = (on ? 2.2 : 1.4) * px; ctx.strokeStyle = on ? '#ffd24a' : '#6a7384'; ctx.stroke();
      ctx.fillStyle = on ? (armed ? '#2a1d05' : '#ffe38a') : '#8a93a6';
      ctx.font = '900 ' + Math.round(b.r * 1.15) + 'px "Noto Sans JP",system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('合', b.x, b.y + b.r * 0.06);
      if (armed || !on) {                        // 開いた札：合成後の名前とコスト／足りないとき
        const txt = on ? f.name + '　コスト +' + (f.cost - b.o.a.def.cost - b.o.b.def.cost) + '　もう一度タップ' : 'コスト不足';
        ctx.font = '700 ' + Math.round(12 * px) + 'px "Noto Sans JP",system-ui,sans-serif';
        const w = ctx.measureText(txt).width + 12 * px, h = 17 * px;
        let bx = b.x - w / 2;
        const lo = -R.offX / R.scale + 2, hi = (R.cssW - R.offX) / R.scale - w - 2;
        bx = Math.max(lo, Math.min(hi, bx));
        ctx.globalAlpha = 0.96; ctx.fillStyle = 'rgba(8,10,15,0.94)'; ctx.fillRect(bx, b.y - b.r - h - 3, w, h);
        ctx.strokeStyle = on ? '#ffd24a' : '#6a7384'; ctx.lineWidth = px; ctx.strokeRect(bx, b.y - b.r - h - 3, w, h);
        ctx.fillStyle = on ? '#fff3c8' : '#c0c8d8'; ctx.textAlign = 'left';
        ctx.fillText(txt, bx + 6 * px, b.y - b.r - h / 2 - 3);
      }
      ctx.restore();
    }
  },
  arm(key) { this._arm = key; this._armT = performance.now(); },
};
