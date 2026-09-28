// ---------------------------------------------------------------
// tools/iconize.js : ComfyUI で作った黒い背景のアイコンを、ゲームで使う形にそろえる（2026-09-29）
//   ① 縁から黒い画素をたどって透明にする（絵の中の黒い線は残る）
//   ② 絵の範囲で切り出す
//   ③ 大きさ S×S の中央に、余白を付けて収める（アイコンごとに大きさがばらつかないように）
//   使い方：node tools/iconize.js 出力のフォルダ 大きさ 画像1.png[=名前] 画像2.png[=名前] …
// ---------------------------------------------------------------
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(__dirname + '/packart.js', 'utf8').split('// ---- 本体 ----')[0];
const { readPng, writePng } = new Function('require', 'process', src + 'return { readPng, writePng };')(require, process);

const [outDir, sizeS, ...items] = process.argv.slice(2);
const S = +sizeS, PAD = 0.08, DARK = 26;
fs.mkdirSync(outDir, { recursive: true });
for (const it of items) {
  const [file, nameArg] = it.split('=');
  const name = nameArg || path.basename(file, '.png');
  const im = readPng(file), { w, h } = im, px = im.px;
  const lum = (i) => Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
  const bg = new Uint8Array(w * h), st = [];
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) { const i = st.pop(); if (bg[i] || lum(i) > DARK) continue; bg[i] = 1; const x = i % w, y = (i / w) | 0;
    if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w); }
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!bg[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, inner = S * (1 - PAD * 2), sc = Math.min(inner / bw, inner / bh);
  const dw = Math.round(bw * sc), dh = Math.round(bh * sc), ox = (S - dw) >> 1, oy = (S - dh) >> 1, out = Buffer.alloc(S * S * 4);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx0 = x0 + x / sc, sy0 = y0 + y / sc, sx1 = x0 + (x + 1) / sc, sy1 = y0 + (y + 1) / sc;
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = Math.floor(sy0); yy < Math.max(Math.floor(sy0) + 1, Math.ceil(sy1)); yy++)
      for (let xx = Math.floor(sx0); xx < Math.max(Math.floor(sx0) + 1, Math.ceil(sx1)); xx++) {
        const i = yy * w + xx, al = bg[i] ? 0 : 1; r += px[i * 4] * al; g += px[i * 4 + 1] * al; b += px[i * 4 + 2] * al; a += al; n++;
      }
    const k = ((oy + y) * S + ox + x) * 4;
    out[k] = a ? r / a : 0; out[k + 1] = a ? g / a : 0; out[k + 2] = a ? b / a : 0; out[k + 3] = Math.round(255 * a / n);
  }
  const f = path.join(outDir, name + '.png');
  writePng(f, S, S, out);
  console.log(name + ' ' + Math.round(fs.statSync(f).size / 1024) + 'KB（範囲 ' + bw + '×' + bh + '）');
}
