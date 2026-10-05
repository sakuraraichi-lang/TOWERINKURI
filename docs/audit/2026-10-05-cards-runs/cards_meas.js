// 使い方: node cards_meas.js --dir <worktree> --wpn gatling --mode none|all|<カードid> --ch 25 --d 22 --n 12 --out file.json
// その武器の mod 札（上位札を除く）を maxStack まで積む／積まない／1枚だけを、単独・n本で測る。漏れの中央値を返す
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const a = {}; const av = process.argv.slice(2);
for (let i = 0; i < av.length; i += 2) a[av[i].replace(/^--/, '')] = av[i + 1];
const BAL_OVER = a.bal || '{}';
const MIX = a.mix || '';
const dir = path.resolve(a.dir), n = +(a.n || 12), ch = a.ch || 25, d = a.d || 22, wpn = a.wpn, mode = a.mode || 'none';
const src = `
REAL_MS = 600000;
const WL = '${wpn}'.split(','), W = WL[0], MODE = '${mode}';
let pre = {};
if (MODE.indexOf('allx:') === 0) { const X = MODE.slice(5).split('+'); for (const id of CARD_IDS) { const c = CARDS[id]; if (c.kind === 'mod' && c.weapon === W && !c.upper && X.indexOf(id) < 0) pre[id] = c.maxStack; } }
else if (MODE === 'all') { for (const id of CARD_IDS) { const c = CARDS[id]; if (c.kind === 'mod' && c.weapon === W && !c.upper) pre[id] = c.maxStack; } }
else if (MODE !== 'none') { pre[MODE] = CARDS[MODE].maxStack; }
const B = ${BAL_OVER}; if (B.cardFx) B.cardFx = Object.assign({}, BAL.cardFx, B.cardFx);
for (const kv of '${MIX}'.split(',').filter(Boolean)) { const [k, v] = kv.split(':'); ENEMY_TYPES[k].weight = +v; }
const out = [];
for (let sd = 1; sd <= ${n}; sd++) {
  Game.newSave(); seedRng(sd);
  const r = runStage('ch${ch}', WL, 60, { coins: 1e12, deep: { prestiges: 2, deepest: ${d} }, lives: 1e6, noDraft: true, preCards: pre, bal: B });
  out.push({ sd, leaked: r.leaked, kills: r.kills, res: r.res });
}
unseedRng();
const L = out.map(o => o.leaked).sort((x, y) => x - y);
({ wpn: W, mode: MODE, pre, median: (L[Math.floor((L.length-1)/2)] + L[Math.ceil((L.length-1)/2)]) / 2, leaked: out.map(o => o.leaked), res: out.map(o => o.res).join('') })
`;
const tmp = path.join(os.tmpdir(), 'cm_' + process.pid + '_' + Date.now() + '.js');
fs.writeFileSync(tmp, src);
const r = cp.spawnSync(process.execPath, [path.join(dir, 'tools', 'simnode.js'), '--file', tmp], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26 });
fs.unlinkSync(tmp);
if (a.out) fs.writeFileSync(a.out, r.stdout || ('ERR ' + r.stderr));
else process.stdout.write(r.stdout + (r.stderr ? '\n' + r.stderr.slice(-500) : ''));
