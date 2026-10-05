// 使い方: node cards_jobs.js <jobs.json> [並列数]
//   jobs.json = [{ tag, dir, wpn, mode, bal, mix, ch, d, n }]   結果は cards_out/job_<tag>.json
const fs = require('fs'), path = require('path'), cp = require('child_process');
const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const P = +(process.argv[3] || 9);
let i = 0, running = 0, done = 0;
function next() {
  while (running < P && i < jobs.length) {
    const j = jobs[i++]; running++;
    const args = ['cards_meas.js', '--dir', j.dir, '--wpn', j.wpn, '--mode', j.mode, '--ch', String(j.ch || 25), '--d', String(j.d || 22), '--n', String(j.n || 12),
      '--bal', JSON.stringify(j.bal || {}), '--mix', j.mix || '', '--out', path.join('cards_out', 'job_' + j.tag + '.json')];
    const c = cp.spawn(process.execPath, args, { cwd: __dirname, stdio: 'ignore' });
    c.on('exit', () => { running--; done++; console.log('done', done + '/' + jobs.length, j.tag); next(); });
  }
}
next();
