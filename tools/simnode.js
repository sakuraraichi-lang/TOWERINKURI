// 測定器（tools/sim.html）をブラウザなしで回す。Node 18 以上。
//
//   node tools/simnode.js "Game.newSave(); seedRng(1); runStage('ch15', ['sniper'], 60, {coins:1e9, lives:400})"
//   node tools/simnode.js --file 測定.js
//
// 式・文のどちらでも書ける。**最後の文の値を JSON で標準出力へ出す**（await も使える）。
// 途中の console.log / warn は標準エラーへ出る。
//
// **sim.html をそのまま読む。**本体（src/*.js）と sim.html の中の測定コードを、
// sim.html が並べている順に1つの環境で読み込むだけなので、測定器を二重に持たない。
// sim.html を直せば、こちらも同じものを測る。
// 画面の部品（document.getElementById など）は、何を呼ばれても受け流す置き物で代わりをする。
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(__dirname, 'sim.html'), 'utf8');

// 何を呼ばれても何かを返す置き物（DOM の代わり）
function stub(name) {
  const fn = function () { return stub(name + '()'); };
  return new Proxy(fn, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then') return undefined;           // await に渡っても Promise に見せない
      if (k in t) return t[k];
      return (t[k] = stub(name + '.' + String(k)));
    },
    set(t, k, v) { t[k] = v; return true; },
    apply() { return stub(name + '()'); },
    construct() { return stub('new ' + name); },
  });
}

const store = {};
const ctx = {
  console: {
    log: (...a) => console.error(...a), warn: (...a) => console.error('[warn]', ...a),
    error: (...a) => console.error('[error]', ...a), info: () => {}, debug: () => {},
  },
  setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
  performance: { now: () => performance.now() },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  document: stub('document'),
  navigator: { userAgent: 'node', vibrate: () => {} },
  location: { search: '', hash: '', href: 'node://sim' },
  requestAnimationFrame: (f) => setTimeout(() => f(performance.now()), 0),
  cancelAnimationFrame: () => {},
  addEventListener: () => {}, removeEventListener: () => {},
  Image: function () { return stub('Image'); },
};
ctx.window = ctx; ctx.self = ctx;
vm.createContext(ctx);

// sim.html の <script src> と中の <script> を、書いてある順に読む
let code = '';
const re = /<script(?:\s+src="([^"]+)")?\s*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) {
  if (m[1]) {
    const f = path.resolve(__dirname, m[1]);
    code += '\n;// ---- ' + path.relative(ROOT, f) + '\n' + fs.readFileSync(f, 'utf8');
  } else {
    code += '\n;// ---- tools/sim.html（中の測定コード）\n' + m[2];
  }
}
vm.runInContext(code, ctx, { filename: 'sim-bundle.js' });

// 最後の文の前に return を差し込む（括弧・文字列の中の ; と改行は区切りにしない）
function withReturn(src) {
  src = src.trim().replace(/;\s*$/, '');
  let depth = 0, q = null;
  const cuts = [0];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { depth--; if (c === '}' && depth === 0) cuts.push(i + 1); }
    else if (depth === 0 && (c === ';' || c === '\n')) cuts.push(i + 1);
  }
  // 後ろの区切りから見て、残りが「式」になる最初のところで切る
  for (let j = cuts.length - 1; j >= 0; j--) {
    const last = src.slice(cuts[j]).trim();
    if (!last) continue;
    if (/^(return|const|let|var|for|while|do|if|else|try|catch|finally|switch|function|class)\b/.test(last)) return src;
    return src.slice(0, cuts[j]) + '\nreturn (' + last + ');';
  }
  return src;
}

(async () => {
  const args = process.argv.slice(2);
  const expr = args[0] === '--file' ? fs.readFileSync(args[1], 'utf8') : args.join(' ');
  if (!expr.trim()) {
    console.error('使い方: node tools/simnode.js "<式>"  ／  node tools/simnode.js --file <ファイル>');
    process.exit(2);
  }
  const val = await vm.runInContext('(async () => {\n' + withReturn(expr) + '\n})()', ctx, { filename: 'expr.js' });
  process.stdout.write(JSON.stringify(val, null, 1) + '\n');
  process.exit(0);
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
