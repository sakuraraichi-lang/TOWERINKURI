// 測定のひな形（tools/measure/*.js）の __名前__ を置き換えて、tools/simnode.js で回す（Node だけで動く・Windows でも同じ）
//
//   node tools/measure/run.js campaign --SEED 1 > out.json
//   node tools/measure/run.js single --CH 25 --WPN sniper --D 27 > out.json
//   node tools/measure/run.js inflation --SEED 1 > out.json
//   --place adj … 隣り合う異種を狙う置き方（place-adj.js）。省略か range なら今までどおり
//   別の版と比べるとき：--dir <別のフォルダ>（git worktree add <フォルダ> <コミット> で出した版）。ひな形はこのフォルダのものを使う
//
//   1本の通しは 約5分（クラウドの4コア・1本だけのとき）。同時に8本流すと 1本 約25分。12本同時は打ち切りが出たことがある（CLAUDE.md）
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const [name, ...rest] = process.argv.slice(2);
if (!name) { console.error('使い方: node tools/measure/run.js <campaign|single|inflation> --KEY 値 … [--dir フォルダ]'); process.exit(2); }
let src = fs.readFileSync(path.join(__dirname, name + '.js'), 'utf8');
let dir = path.resolve(__dirname, '..', '..');
let place = '';
for (let i = 0; i < rest.length; i += 2) {
  const k = rest[i].replace(/^--/, ''), v = rest[i + 1];
  if (k === 'dir') { dir = path.resolve(v); continue; }
  if (k === 'place') { place = v; continue; }   // --place adj：隣り合う異種を狙う置き方（place-adj.js）を先頭に付ける
  src = src.split('__' + k + '__').join(v);
}
if (place === 'adj') src = fs.readFileSync(path.join(__dirname, 'place-adj.js'), 'utf8') + '
' + src;
else if (place && place !== 'range') { console.error('--place は adj か range'); process.exit(2); }
const left = src.match(/__[A-Z]+__/);
if (left) { console.error('置き換えていない値があります: ' + left[0]); process.exit(2); }
const tmp = path.join(os.tmpdir(), 'measure_' + process.pid + '_' + Date.now() + '.js');
fs.writeFileSync(tmp, src);
const r = cp.spawnSync(process.execPath, [path.join(dir, 'tools', 'simnode.js'), '--file', tmp], { cwd: dir, stdio: ['ignore', 'inherit', 'inherit'] });
fs.unlinkSync(tmp);
process.exit(r.status || 0);
