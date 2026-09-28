// ---------------------------------------------------------------
// room.js : 再起動の場面に出る「現実の部屋」を、その場で絵にする（Canvas）
//
//   **ここはゲームの外＝現実の世界なので、写実寄りに描く。**（ユーザー 2026-09-28
//     「転生の時のブラウン管や冷蔵庫などは、いわゆるそのゲームの現実世界に相当するため、リアル寄りの生成にしてください」）
//   ゲームの中（ドット絵の敵・六角の盤）とは描き方をはっきり変える：
//     ・光は1つ。暗い部屋を、テレビの青白い光だけが照らしている（明るい側と影の側がある）
//     ・物には材質がある：木目の机／黄ばんだベージュの樹脂／艶のある黒電話／紙の新聞／ガラスのスマートフォン／琺瑯の冷蔵庫
//     ・物は影を落とす（壁と机に、ぼけた影）
//     ・最後にフィルムの粒子と四隅の暗がりをかける
//   画像ファイルは持たない決まりなので、全部ここで描く。**1回の再起動で1枚だけ描く**（毎フレームではない）
//
//   座標は 375×812（縦長の画面）。テレビの画面の位置（x 80〜265・y 212〜362）は style.css の .rb-screen と合わせてある
// ---------------------------------------------------------------
'use strict';

const Room = {
  W: 375, H: 812,

  paint(cv, txt) {
    const W = this.W, H = this.H;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.c = c; this.dpr = dpr;
    let sd = 20260928;
    this.rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };

    this.wall();
    this.fridge(txt.memo);
    this.poster(txt.ad);
    this.pc();
    this.tv();
    this.desk();
    this.mug();
    this.phone();
    this.paper(txt.paper);
    this.smartphone(txt.phone);
    this.light();
    this.grain();
  },

  // ---- 道具 ----
  rr(x, y, w, h, r) {
    const c = this.c;
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  },
  lin(x0, y0, x1, y1, stops) { const g = this.c.createLinearGradient(x0, y0, x1, y1); for (const [o, col] of stops) g.addColorStop(o, col); return g; },
  rad(x, y, r0, r1, stops) { const g = this.c.createRadialGradient(x, y, r0, x, y, r1); for (const [o, col] of stops) g.addColorStop(o, col); return g; },
  // ぼけた影：形そのものは画面の外に描き、影だけを落とす
  shadow(path, blur, alpha, dx, dy) {
    const c = this.c, off = 4000;
    c.save();
    c.shadowColor = 'rgba(0,0,0,' + alpha + ')';
    c.shadowBlur = blur * this.dpr;
    // 影のずらしは回転・拡大の影響を受けない（画素そのまま）ので、いまの変換で「画面の外へ逃がした分」を計算して戻す
    //   （傾けた物＝広告・新聞・スマートフォンで、影が数百px 離れた所に落ちていた）
    const m = c.getTransform();
    c.shadowOffsetX = off * m.a + (dx || 0) * this.dpr; c.shadowOffsetY = off * m.b + (dy || 0) * this.dpr;
    c.translate(-off, 0);
    path(); c.fillStyle = '#000'; c.fill();
    c.restore();
  },
  // 文字を幅で折り返す
  wrap(text, x, y, maxW, lh, maxLines) {
    const c = this.c; let line = '', n = 0;
    for (const ch of text) {
      if (c.measureText(line + ch).width > maxW && line) { c.fillText(line, x, y + n * lh); line = ''; if (++n >= maxLines) return; }
      line += ch === '　' && !line ? '' : ch;
    }
    if (line) c.fillText(line, x, y + n * lh);
  },

  // ---- 壁：くすんだ壁紙。細い縦縞と、ところどころのむら ----
  wall() {
    const c = this.c, W = this.W;
    c.fillStyle = this.lin(0, 0, 0, 470, [[0, '#23212a'], [0.6, '#1b1a20'], [1, '#141317']]);
    c.fillRect(0, 0, W, 470);
    c.globalAlpha = 0.05;
    for (let x = 0; x < W; x += 9) { c.fillStyle = (x / 9) % 2 ? '#fff' : '#000'; c.fillRect(x, 0, 1, 470); }
    c.globalAlpha = 1;
    for (let i = 0; i < 26; i++) {                 // 壁紙のむら
      const x = this.rnd() * W, y = this.rnd() * 460, r = 30 + this.rnd() * 90;
      c.fillStyle = this.rad(x, y, 0, r, [[0, 'rgba(0,0,0,' + (0.04 + this.rnd() * 0.06).toFixed(3) + ')'], [1, 'rgba(0,0,0,0)']]);
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 幅木
    c.fillStyle = '#100f12'; c.fillRect(0, 446, W, 10);
  },

  // ---- 冷蔵庫：クリーム色の琺瑯・クロームの取っ手・磁石とメモ。テレビの光で右の縁だけ明るい ----
  fridge(memo) {
    const c = this.c;
    const x = -24, y = 58, w = 122, h = 400;
    this.shadow(() => this.rr(x, y, w, h, 10), 26, 0.7, 14, 8);
    this.rr(x, y, w, h, 10);
    c.fillStyle = this.lin(x, 0, x + w, 0, [[0, '#2a2721'], [0.5, '#6d6655'], [0.86, '#a39a82'], [1, '#c9c2ae']]);
    c.fill();
    c.save(); this.rr(x, y, w, h, 10); c.clip();
    c.fillStyle = this.lin(0, y, 0, y + h, [[0, 'rgba(255,255,255,0.10)'], [0.3, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.45)']]);
    c.fillRect(x, y, w, h);
    // 扉の分かれ目（上が冷凍室）
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x, y + 128, w, 3);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x, y + 131, w, 1);
    // 右の縁のつや（テレビ側）
    c.fillStyle = this.lin(x + w - 10, 0, x + w, 0, [[0, 'rgba(190,210,255,0)'], [1, 'rgba(190,210,255,0.35)']]);
    c.fillRect(x + w - 10, y, 10, h);
    c.restore();
    // クロームの取っ手
    const handle = (hy, hh) => {
      this.shadow(() => this.rr(x + w - 20, hy, 7, hh, 3), 4, 0.6, 2, 2);
      this.rr(x + w - 20, hy, 7, hh, 3);
      c.fillStyle = this.lin(x + w - 20, 0, x + w - 13, 0, [[0, '#3c3d42'], [0.35, '#e9ecf2'], [0.6, '#8a8d95'], [1, '#2a2b30']]);
      c.fill();
    };
    handle(y + 60, 58); handle(y + 150, 110);
    // 磁石
    const mag = (mx, my, col) => {
      this.shadow(() => { c.beginPath(); c.arc(mx, my, 5, 0, 7); }, 3, 0.6, 1.5, 2);
      c.beginPath(); c.arc(mx, my, 5, 0, 7);
      c.fillStyle = this.rad(mx - 1.6, my - 1.8, 0.5, 6, [[0, '#fff'], [0.25, col], [1, '#1a0a08']]); c.fill();
    };
    // メモ（少し斜めに・上を磁石で留める）
    c.save(); c.translate(x + 38, y + 188); c.rotate(-0.06);
    this.shadow(() => { c.beginPath(); c.rect(0, 0, 48, 58); }, 5, 0.5, 2, 3);
    c.fillStyle = this.lin(0, 0, 0, 58, [[0, '#cfc9b6'], [1, '#a9a393']]); c.fillRect(0, 0, 48, 58);
    c.fillStyle = 'rgba(120,150,210,0.35)'; for (let i = 0; i < 5; i++) c.fillRect(3, 14 + i * 9, 42, 0.6);
    c.fillStyle = '#2b3550'; c.font = '600 7.5px sans-serif';
    memo.forEach((m, i) => c.fillText(m, 5, 12 + i * 9));
    c.restore();
    mag(x + 62, y + 190, '#c8322a'); mag(x + 30, y + 150, '#e0b42a'); mag(x + 70, y + 290, '#2a6ac8');
  },

  // ---- 壁の広告：古い印刷物。四隅をテープで留め、少し波打っている ----
  poster(ad) {
    const c = this.c;
    c.save(); c.translate(232, 70); c.rotate(0.04);
    const w = 108, h = 150;
    this.shadow(() => { c.beginPath(); c.rect(0, 0, w, h); }, 8, 0.6, 3, 4);
    c.fillStyle = this.lin(0, 0, w, h, [[0, '#cbbf9f'], [1, '#9c9175']]); c.fillRect(0, 0, w, h);
    c.fillStyle = this.lin(0, 8, 0, 70, [[0, '#d9612a'], [1, '#a8401a']]); c.fillRect(8, 8, w - 16, 62);
    c.fillStyle = '#fff6e6'; c.font = '900 26px sans-serif'; c.textAlign = 'center';
    c.fillText('NEW!', w / 2, 50);
    c.textAlign = 'left'; c.fillStyle = '#2a2418'; c.font = '800 10px sans-serif';
    this.wrap(ad, 9, 88, w - 18, 13, 4);
    // 紙の波打ちとテープ
    c.fillStyle = this.lin(0, 0, w, 0, [[0, 'rgba(0,0,0,0.12)'], [0.5, 'rgba(255,255,255,0.05)'], [1, 'rgba(0,0,0,0.18)']]); c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(230,225,200,0.55)';
    c.save(); c.translate(-4, -2); c.rotate(-0.6); c.fillRect(0, 0, 22, 8); c.restore();
    c.save(); c.translate(w - 14, -8); c.rotate(0.6); c.fillRect(0, 0, 22, 8); c.restore();
    c.restore();
  },

  // ---- ベージュのパソコン：黄ばんだ樹脂・5インチの口・フロッピーの口・緑の灯 ----
  pc() {
    const c = this.c;
    const x = 288, y = 262, w = 80, h = 196;
    this.shadow(() => this.rr(x, y, w, h, 4), 22, 0.75, 12, 6);
    this.rr(x, y, w, h, 4);
    c.fillStyle = this.lin(x, 0, x + w, 0, [[0, '#b8ad92'], [0.45, '#a39a80'], [1, '#5e5747']]); c.fill();
    c.save(); this.rr(x, y, w, h, 4); c.clip();
    c.fillStyle = this.lin(0, y, 0, y + h, [[0, 'rgba(255,255,240,0.12)'], [1, 'rgba(0,0,0,0.35)']]); c.fillRect(x, y, w, h);
    const bay = (by, hh) => {
      c.fillStyle = 'rgba(40,36,28,0.7)'; c.fillRect(x + 8, by, w - 16, hh);
      c.fillStyle = this.lin(0, by, 0, by + hh, [[0, '#a9a089'], [1, '#8a826c']]); c.fillRect(x + 9, by + 1, w - 18, hh - 2);
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x + 14, by + hh / 2 - 1, w - 38, 2);
      c.fillStyle = '#7d7563'; c.fillRect(x + w - 20, by + hh / 2 - 2.5, 7, 5);
    };
    bay(y + 16, 18); bay(y + 38, 18);
    // フロッピー
    c.fillStyle = 'rgba(40,36,28,0.7)'; c.fillRect(x + 20, y + 66, w - 34, 12);
    c.fillStyle = '#1a1814'; c.fillRect(x + 24, y + 71, w - 42, 2);
    // 通気口
    c.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 0; i < 9; i++) c.fillRect(x + 12, y + 120 + i * 6, w - 24, 2);
    c.restore();
    // 電源と灯
    c.beginPath(); c.arc(x + 20, y + 176, 5, 0, 7); c.fillStyle = this.rad(x + 18.5, y + 174.5, 0.5, 6, [[0, '#d9d0b6'], [1, '#6c6554']]); c.fill();
    c.save(); c.shadowColor = '#7dff8a'; c.shadowBlur = 8 * this.dpr;
    c.fillStyle = '#9dffa8'; c.fillRect(x + 34, y + 174, 8, 3); c.restore();
  },

  // ---- ブラウン管テレビ：黒い樹脂の箱・丸みのある画面・つまみ・スピーカーの穴 ----
  tv() {
    const c = this.c;
    const x = 58, y = 190, w = 259, h = 236;
    this.shadow(() => this.rr(x, y, w, h, 20), 34, 0.85, 16, 10);
    // 箱
    this.rr(x, y, w, h, 20);
    c.fillStyle = this.lin(0, y, 0, y + h, [[0, '#3b3c43'], [0.08, '#2b2c32'], [0.7, '#1c1d22'], [1, '#121216']]); c.fill();
    c.save(); this.rr(x, y, w, h, 20); c.clip();
    c.fillStyle = this.lin(x, 0, x + w, 0, [[0, 'rgba(0,0,0,0.35)'], [0.2, 'rgba(0,0,0,0)'], [0.85, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.4)']]); c.fillRect(x, y, w, h);
    // 上の縁のつや
    c.fillStyle = this.lin(0, y, 0, y + 10, [[0, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(x, y, w, 10);
    c.restore();
    // 画面のまわりの枠（内側へ落ち込む）
    this.rr(x + 12, y + 12, 205, 170, 22);
    c.fillStyle = this.lin(0, y + 12, 0, y + 182, [[0, '#0d0d10'], [1, '#1f2026']]); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 1; c.stroke();
    this.rr(x + 22, y + 22, 185, 150, 18); c.fillStyle = '#030304'; c.fill();   // 画面の地（上に .rb-screen が重なる）
    // つまみ
    const knob = (kx, ky, r) => {
      this.shadow(() => { c.beginPath(); c.arc(kx, ky, r, 0, 7); }, 5, 0.8, 2, 3);
      c.beginPath(); c.arc(kx, ky, r, 0, 7);
      c.fillStyle = this.rad(kx - r * 0.35, ky - r * 0.4, r * 0.1, r * 1.1, [[0, '#6c6d75'], [0.5, '#2a2b31'], [1, '#101014']]); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.2; c.stroke();
      c.strokeStyle = 'rgba(230,230,240,0.55)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(kx, ky); c.lineTo(kx + r * 0.2, ky - r * 0.85); c.stroke();
    };
    knob(x + 229, y + 48, 11); knob(x + 229, y + 84, 11);
    // スピーカーの穴
    c.fillStyle = 'rgba(0,0,0,0.75)';
    for (let r = 0; r < 8; r++) for (let q = 0; q < 4; q++) { c.beginPath(); c.arc(x + 219 + q * 7, y + 112 + r * 7, 1.6, 0, 7); c.fill(); }
    // 下の帯と銘板・電源の灯
    this.rr(x + 22, y + 188, 185, 32, 5); c.fillStyle = this.lin(0, y + 188, 0, y + 220, [[0, '#18181c'], [1, '#0d0d10']]); c.fill();
    c.fillStyle = this.lin(x + 30, 0, x + 92, 0, [[0, '#6d6f78'], [0.5, '#c9ccd6'], [1, '#5b5d66']]); c.fillRect(x + 30, y + 199, 62, 10);
    c.fillStyle = '#1b1c22'; c.font = '800 7px sans-serif'; c.fillText('COLOR TV', x + 40, y + 207);
    c.save(); c.shadowColor = '#ff3a2a'; c.shadowBlur = 7 * this.dpr; c.fillStyle = '#ff5140';
    c.beginPath(); c.arc(x + 194, y + 204, 2.6, 0, 7); c.fill(); c.restore();
    // 台
    this.rr(x + 44, y + h - 2, w - 88, 30, 3); c.fillStyle = this.lin(0, y + h, 0, y + h + 30, [[0, '#141418'], [1, '#0a0a0c']]); c.fill();
  },

  // ---- 机：木目。奥から手前へ暗くなり、テレビの前だけ光が落ちる ----
  desk() {
    const c = this.c, W = this.W, top = 456;
    c.save();
    c.beginPath(); c.rect(0, top, W, this.H - top); c.clip();
    c.fillStyle = this.lin(0, top, 0, this.H, [[0, '#4a2f1d'], [0.25, '#3a2416'], [1, '#170e08']]); c.fillRect(0, top, W, this.H - top);
    // 木目：ゆらぐ細い線を重ねる
    for (let i = 0; i < 170; i++) {
      const yy = top + Math.pow(i / 170, 1.35) * (this.H - top);
      const a = 0.04 + this.rnd() * 0.08, amp = 1 + this.rnd() * 3, fq = 0.01 + this.rnd() * 0.03, ph = this.rnd() * 6;
      c.strokeStyle = (this.rnd() < 0.6 ? 'rgba(0,0,0,' : 'rgba(255,200,150,') + (this.rnd() < 0.6 ? a : a * 0.5).toFixed(3) + ')';
      c.lineWidth = 0.6 + this.rnd() * 1.4;
      c.beginPath();
      for (let x = -10; x <= W + 10; x += 12) { const y2 = yy + Math.sin(x * fq + ph) * amp; x < 0 ? c.moveTo(x, y2) : c.lineTo(x, y2); }
      c.stroke();
    }
    // 奥の縁の明るい線
    c.fillStyle = 'rgba(255,210,170,0.18)'; c.fillRect(0, top, W, 1.5);
    c.restore();
    // テレビの台の影（机の上）
    this.shadow(() => { c.beginPath(); c.ellipse(190, top + 6, 120, 10, 0, 0, 7); }, 14, 0.8, 0, 0);
  },

  // ---- マグカップ（湯気は無し）：白い陶器・持ち手・中のコーヒー ----
  mug() {
    const c = this.c, x = 196, y = 520, w = 34, h = 38;
    this.shadow(() => { c.beginPath(); c.ellipse(x + w / 2 + 4, y + h, w * 0.62, 6, 0, 0, 7); }, 8, 0.7, 0, 2);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + h - 4); c.quadraticCurveTo(x + w / 2, y + h + 5, x + w, y + h - 4); c.lineTo(x + w, y); c.closePath();
    c.fillStyle = this.lin(x, 0, x + w, 0, [[0, '#dfe4ee'], [0.35, '#b9bfcb'], [1, '#4c4f58']]); c.fill();
    c.beginPath(); c.ellipse(x + w / 2, y, w / 2, 4.5, 0, 0, 7); c.fillStyle = '#e6e9f0'; c.fill();
    c.beginPath(); c.ellipse(x + w / 2, y + 0.8, w / 2 - 2.5, 3.2, 0, 0, 7); c.fillStyle = '#2a170c'; c.fill();
    c.strokeStyle = this.lin(x + w, 0, x + w + 12, 0, [[0, '#8e939d'], [1, '#3b3e46']]); c.lineWidth = 4.5;
    c.beginPath(); c.arc(x + w + 1, y + 16, 8.5, -1.2, 1.2); c.stroke();
  },

  // ---- 黒電話：艶のある黒・ダイヤルの指穴・受話器・巻いたコード ----
  phone() {
    const c = this.c, x = 16, y = 500;
    this.shadow(() => { c.beginPath(); c.ellipse(x + 64, y + 84, 66, 12, 0, 0, 7); }, 12, 0.85, 4, 2);
    // 本体
    c.beginPath(); c.moveTo(x + 8, y + 80); c.quadraticCurveTo(x + 12, y + 26, x + 62, y + 24); c.quadraticCurveTo(x + 112, y + 26, x + 118, y + 80); c.closePath();
    c.fillStyle = this.lin(0, y + 24, 0, y + 84, [[0, '#26262b'], [0.5, '#0f0f12'], [1, '#050506']]); c.fill();
    c.strokeStyle = 'rgba(170,190,255,0.22)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x + 22, y + 44); c.quadraticCurveTo(x + 40, y + 30, x + 62, y + 29); c.stroke();
    // ダイヤル
    const dx = x + 63, dy = y + 57;
    c.beginPath(); c.arc(dx, dy, 21, 0, 7); c.fillStyle = this.rad(dx - 6, dy - 7, 2, 24, [[0, '#3a3b42'], [1, '#0b0b0d']]); c.fill();
    for (let i = 0; i < 10; i++) {
      const a = -2.3 + i * 0.43;
      const hx = dx + Math.cos(a) * 14.5, hy = dy + Math.sin(a) * 14.5;
      c.beginPath(); c.arc(hx, hy, 3.4, 0, 7); c.fillStyle = '#c9c4b6'; c.fill();
      c.beginPath(); c.arc(hx + 0.5, hy + 0.6, 3.4, 0, 7); c.fillStyle = 'rgba(0,0,0,0.55)'; c.fill();
    }
    c.beginPath(); c.arc(dx, dy, 6, 0, 7); c.fillStyle = '#d8d2c2'; c.fill();
    // 受話器
    c.beginPath();
    c.moveTo(x + 2, y + 18); c.quadraticCurveTo(x + 62, y - 6, x + 124, y + 18);
    c.lineTo(x + 118, y + 30); c.quadraticCurveTo(x + 62, y + 10, x + 8, y + 30); c.closePath();
    c.fillStyle = this.lin(0, y, 0, y + 30, [[0, '#2e2f35'], [0.4, '#141417'], [1, '#050506']]); c.fill();
    c.strokeStyle = 'rgba(200,215,255,0.35)'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(x + 18, y + 14); c.quadraticCurveTo(x + 62, y - 1, x + 104, y + 12); c.stroke();
    // 巻いたコード
    c.strokeStyle = '#0c0c0e'; c.lineWidth = 2.2;
    c.beginPath();
    for (let i = 0; i <= 26; i++) {
      const t = i / 26, cx = x + 120 + t * 46, cy = y + 76 + Math.sin(t * 3) * 10;
      const px = cx + Math.cos(i * 1.9) * 3, py = cy + Math.sin(i * 1.9) * 3;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.stroke();
  },

  // ---- 新聞：紙の色・折り目の陰・見出し・網点の写真・本文の段 ----
  paper(head) {
    const c = this.c;
    c.save(); c.translate(26, 624); c.rotate(-0.13);
    const w = 206, h = 136;
    this.shadow(() => { c.beginPath(); c.rect(0, 0, w, h); }, 10, 0.75, 4, 6);
    c.fillStyle = this.lin(0, 0, w, h, [[0, '#d6cfbc'], [0.55, '#c3bca8'], [1, '#9e9885']]); c.fillRect(0, 0, w, h);
    c.fillStyle = this.lin(w * 0.48, 0, w * 0.56, 0, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0.16)'], [1, 'rgba(255,255,255,0.06)']]); c.fillRect(0, 0, w, h);
    c.fillStyle = '#26221a'; c.fillRect(8, 8, w - 16, 3);
    c.font = '900 14px "Hiragino Mincho ProN","Yu Mincho","MS Mincho",serif';
    this.wrap(head, 9, 30, w - 18, 17, 2);
    // 網点の写真
    c.fillStyle = '#b9b29d'; c.fillRect(9, 66, 82, 60);
    c.fillStyle = 'rgba(30,26,20,0.55)';
    for (let yy = 0; yy < 60; yy += 3) for (let xx = 0; xx < 82; xx += 3) {
      const v = 0.5 + 0.5 * Math.sin(xx * 0.08 + yy * 0.05) * Math.cos(yy * 0.09);
      c.beginPath(); c.arc(9 + xx + 1.5, 66 + yy + 1.5, 0.3 + v * 1.1, 0, 7); c.fill();
    }
    // 本文の段
    c.fillStyle = 'rgba(40,36,28,0.55)';
    for (let col = 0; col < 2; col++) for (let i = 0; i < 12; i++) c.fillRect(98 + col * 52, 68 + i * 5, 46 - (i % 5 === 4 ? 18 : 0), 1.6);
    c.restore();
  },

  // ---- スマートフォン：黒いガラス・光る画面の通知・斜めの映り込み ----
  smartphone(note) {
    const c = this.c;
    c.save(); c.translate(250, 598); c.rotate(0.17);
    const w = 86, h = 166;
    this.shadow(() => this.rr(0, 0, w, h, 13), 10, 0.8, 4, 6);
    this.rr(0, 0, w, h, 13); c.fillStyle = this.lin(0, 0, w, 0, [[0, '#4a4c54'], [0.08, '#15161a'], [0.92, '#15161a'], [1, '#3c3e45']]); c.fill();
    this.rr(4, 4, w - 8, h - 8, 10); c.fillStyle = '#050608'; c.fill();
    // 画面（点いている）
    this.rr(7, 18, w - 14, h - 36, 6);
    c.fillStyle = this.lin(0, 18, 0, h - 18, [[0, '#1f2b44'], [1, '#0c111c']]); c.fill();
    c.fillStyle = '#e7edf8'; c.font = '700 13px sans-serif'; c.fillText('23:44', 14, 38);
    this.rr(12, 50, w - 24, 50, 7); c.fillStyle = 'rgba(235,240,255,0.14)'; c.fill();
    c.fillStyle = '#9fb3dd'; c.font = '700 6.5px sans-serif'; c.fillText('通知', 17, 60);
    c.fillStyle = '#f2f5fb'; c.font = '700 8px sans-serif'; this.wrap(note, 17, 72, w - 34, 10, 3);
    // ガラスの映り込み
    c.save(); this.rr(4, 4, w - 8, h - 8, 10); c.clip();
    c.fillStyle = this.lin(0, 0, w, h, [[0, 'rgba(255,255,255,0)'], [0.42, 'rgba(255,255,255,0)'], [0.47, 'rgba(255,255,255,0.10)'], [0.6, 'rgba(255,255,255,0)']]);
    c.fillRect(0, 0, w, h); c.restore();
    c.restore();
    // 画面の光が机にこぼれる
    c.save(); c.globalCompositeOperation = 'screen';
    c.fillStyle = this.rad(282, 700, 0, 90, [[0, 'rgba(90,130,220,0.18)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(190, 610, 180, 180);
    c.restore();
  },

  // ---- 光：テレビの青白い光を足し、四隅を落とす ----
  light() {
    const c = this.c, W = this.W, H = this.H;
    c.save();
    c.globalCompositeOperation = 'screen';
    c.fillStyle = this.rad(172, 300, 20, 430, [[0, 'rgba(120,160,255,0.26)'], [0.45, 'rgba(90,120,210,0.10)'], [1, 'rgba(0,0,0,0)']]);
    c.fillRect(0, 0, W, H);
    // 机の上の光だまり
    c.fillStyle = this.rad(175, 470, 0, 200, [[0, 'rgba(150,180,255,0.22)'], [1, 'rgba(0,0,0,0)']]);
    c.fillRect(0, 380, W, 300);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = this.rad(W / 2, H * 0.42, H * 0.25, H * 0.75, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(40,36,48,1)']]);
    c.fillRect(0, 0, W, H);
    c.restore();
  },

  // ---- フィルムの粒子 ----
  grain() {
    const c = this.c;
    if (!this._grain) {
      const g = document.createElement('canvas'); g.width = g.height = 160;
      const gx = g.getContext('2d'), id = gx.createImageData(160, 160);
      for (let i = 0; i < id.data.length; i += 4) { const v = (Math.random() * 255) | 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 22; }
      gx.putImageData(id, 0, 0);
      this._grain = g;
    }
    c.save(); c.globalCompositeOperation = 'overlay';
    c.fillStyle = c.createPattern(this._grain, 'repeat'); c.fillRect(0, 0, this.W, this.H);
    c.restore();
  },
};
