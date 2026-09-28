// ---------------------------------------------------------------
// tools/contact.js : 何枚かの PNG を縮めて1枚に並べる（見比べ用の一覧・2026-09-29）
//   使い方：node tools/contact.js 出力.png 列の数 升目の大きさ 画像1.png 画像2.png …
//   PNG の読み書きは tools/packart.js と同じもの（Node の zlib だけ）
// ---------------------------------------------------------------
'use strict';
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/packart.js', 'utf8').split('// ---- 本体 ----')[0];
const { readPng, writePng } = new Function('require', 'process', src + 'return { readPng, writePng };')(require, process);

const [out, colsS, cellS, ...files] = process.argv.slice(2);
const cols = +colsS, cell = +cellS, rows = Math.ceil(files.length / cols), gap = 4;
const W = cols * cell + (cols + 1) * gap, H = rows * cell + (rows + 1) * gap;
const px = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) { px[i * 4] = 40; px[i * 4 + 1] = 40; px[i * 4 + 2] = 46; px[i * 4 + 3] = 255; }
files.forEach((f, n) => {
  const im = readPng(f), sc = Math.min(cell / im.w, cell / im.h), dw = Math.floor(im.w * sc), dh = Math.floor(im.h * sc);
  const ox = gap + (n % cols) * (cell + gap) + ((cell - dw) >> 1), oy = gap + Math.floor(n / cols) * (cell + gap) + ((cell - dh) >> 1);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx = Math.min(im.w - 1, Math.floor(x / sc)), sy = Math.min(im.h - 1, Math.floor(y / sc)), k = (sy * im.w + sx) * 4, o = ((oy + y) * W + ox + x) * 4, a = im.px[k + 3] / 255;
    px[o] = im.px[k] * a + px[o] * (1 - a); px[o + 1] = im.px[k + 1] * a + px[o + 1] * (1 - a); px[o + 2] = im.px[k + 2] * a + px[o + 2] * (1 - a);
  }
});
writePng(out, W, H, px);
console.log('保存 ' + out + '（' + W + '×' + H + '）');
