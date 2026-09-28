// ---------------------------------------------------------------
// tools/packart.js : パックの絵（ComfyUI で作った1枚）から、5種のパックの絵を作る（2026-09-29）
//
//   ユーザー「パック5種について いいですけどせめてパックの大きさは整えてください」
//   → 1枚の絵を元に、**光っている線の色だけ**を塗り替える。形は5種とも完全に同じになる。
//     さらに、パックの輪郭の外の黒い背景を透明にし、パックの範囲で切り出して同じ大きさにそろえる。
//   ComfyUI の描き直し（img2img）では色が変わらなかったので、色はプログラムで変える
//
//   使い方：node tools/packart.js 元の絵.png 出力のフォルダ
//   追加の部品は使わない（PNG の読み書きは Node の zlib だけ）
// ---------------------------------------------------------------
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---- PNG を読む（8bit RGB/RGBA・インターレースなし） ----
function readPng(file) {
  const b = fs.readFileSync(file);
  let p = 8, w, h, ct; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0, u = y ? px[dst - stride + x] : 0, c = (x >= bpp && y) ? px[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1;
      else if (f === 4) { const pp = a + u - c, pa = Math.abs(pp - a), pb = Math.abs(pp - u), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : pb <= pc ? u : c; }
      px[dst + x] = v & 255;
    }
  }
  // RGBA にそろえる
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = px[i * bpp]; out[i * 4 + 1] = px[i * bpp + 1]; out[i * 4 + 2] = px[i * bpp + 2]; out[i * 4 + 3] = bpp === 4 ? px[i * bpp + 3] : 255; }
  return { w, h, px: out };
}

// ---- PNG を書く（RGBA） ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (const x of buf) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(file, w, h, px) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

// ---- 色 ----
function rgb2hsv(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx]; }
function hsv2rgb(h, s, v) { const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c; let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]; }

// ---- 本体 ----
//   追加の使い方（カードの枠など）：node tools/packart.js 元.png 出力 幅x高さ '{"名前":"#色",…}'
const [src, outDir, sizeArg, kindsArg] = process.argv.slice(2);
const img = readPng(src);
const { w, h } = img;
// 1) 輪郭の外の黒を透明に：盤の縁から、暗い画素だけをたどって塗りつぶす
const DARK = 22, bg = new Uint8Array(w * h), st = [];
const lum = (i) => Math.max(img.px[i * 4], img.px[i * 4 + 1], img.px[i * 4 + 2]);
for (let x = 0; x < w; x++) { st.push(x, (h - 1) * w + x); }
for (let y = 0; y < h; y++) { st.push(y * w, y * w + w - 1); }
while (st.length) { const i = st.pop(); if (bg[i] || lum(i) > DARK) continue; bg[i] = 1; const x = i % w, y = (i / w) | 0;
  if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w); }
// 2) 範囲：背景でない画素の外接四角
let x0 = w, y0 = h, x1 = 0, y1 = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!bg[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
console.log('範囲', { x0, y0, x1, y1, bw: x1 - x0 + 1, bh: y1 - y0 + 1 });
// 3) 5種の色（ゲームの PACKS の色に合わせる）。光る線（色の濃い画素）の色相だけを替え、明るさと濃さは元のまま
const KINDS = kindsArg ? JSON.parse(kindsArg) : { basic: '#7f93a8', arms: '#ffd24a', chem: '#8fd94a', relic: '#ffb43c', syn: '#c26bff' };
const [OW, OH] = sizeArg ? sizeArg.split('x').map(Number) : [300, 430];
fs.mkdirSync(outDir, { recursive: true });
for (const [id, hex] of Object.entries(KINDS)) {
  const [th, ts] = rgb2hsv(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
  const px = Buffer.from(img.px);
  for (let i = 0; i < w * h; i++) {
    if (bg[i]) { px[i * 4 + 3] = 0; continue; }
    const [hh, s, v] = rgb2hsv(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    if (s > 0.25 && v > 0.12) {
      // 基本（青灰）は彩度も落とす
      const [r, g, b] = hsv2rgb(th, (id === 'basic' || id === 'common') ? s * 0.45 : Math.max(s, ts * 0.9), v);
      px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b;
    }
  }
  // 4) 切り出して、縦横比を保ったまま OW×OH の中央へ（余りは透明）
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, sc = Math.min(OW / bw, OH / bh), dw = Math.round(bw * sc), dh = Math.round(bh * sc);
  const ox = (OW - dw) >> 1, oy = (OH - dh) >> 1, out = Buffer.alloc(OW * OH * 4);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    // 面積平均の縮小（縮めるだけなので、元の画素をまとめて平均する）
    const sx0 = x0 + x / sc, sy0 = y0 + y / sc, sx1 = x0 + (x + 1) / sc, sy1 = y0 + (y + 1) / sc;
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = Math.floor(sy0); yy < Math.ceil(sy1); yy++) for (let xx = Math.floor(sx0); xx < Math.ceil(sx1); xx++) {
      const k = (yy * w + xx) * 4, al = px[k + 3] / 255; r += px[k] * al; g += px[k + 1] * al; b += px[k + 2] * al; a += al; n++;
    }
    const k = ((oy + y) * OW + ox + x) * 4;
    out[k] = a ? Math.round(r / a) : 0; out[k + 1] = a ? Math.round(g / a) : 0; out[k + 2] = a ? Math.round(b / a) : 0; out[k + 3] = Math.round(255 * a / n);
  }
  const f = path.join(outDir, id + '.png');
  writePng(f, OW, OH, out);
  console.log('保存', f, Math.round(fs.statSync(f).size / 1024) + 'KB');
}
