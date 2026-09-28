// ---------------------------------------------------------------
// tools/pngbox.js : 黒い背景の PNG から、写っている物の範囲（明るい画素のまとまり）を測る
//
//   使い方：node tools/pngbox.js 画像.png [しきい値 60] [行・列に明るい画素が何割あれば物とみなすか 0.03]
//   出力：{"w":幅,"h":高さ,"x":左,"y":上,"bw":範囲の幅,"bh":範囲の高さ}
//   ComfyUI で作ったパックの絵の大きさをそろえるため（2026-09-29）。追加の部品は使わず、Node の zlib だけで PNG を読む
//   読めるのは 8bit の RGB / RGBA・インターレースなし（ComfyUI の出力はこれ）
// ---------------------------------------------------------------
'use strict';
const fs = require('fs');
const zlib = require('zlib');

function readPng(file) {
  const b = fs.readFileSync(file);
  let p = 8, w, h, ct, idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12] !== 0) throw new Error('8bit・インターレースなしだけ読める'); }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!bpp) throw new Error('RGB か RGBA だけ読める');
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
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
  return { w, h, bpp, px };
}

const [file, T0, R0] = process.argv.slice(2);
const T = +(T0 || 60), R = +(R0 || 0.03);
const { w, h, bpp, px } = readPng(file);
const rows = new Array(h).fill(0), cols = new Array(w).fill(0);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * bpp;
  if (Math.max(px[i], px[i + 1], px[i + 2]) > T) { rows[y]++; cols[x]++; }
}
const y0 = rows.findIndex(n => n > w * R), y1 = h - 1 - rows.slice().reverse().findIndex(n => n > w * R);
const x0 = cols.findIndex(n => n > h * R), x1 = w - 1 - cols.slice().reverse().findIndex(n => n > h * R);
console.log(JSON.stringify({ w, h, x: x0, y: y0, bw: x1 - x0 + 1, bh: y1 - y0 + 1 }));
