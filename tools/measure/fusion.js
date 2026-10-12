// 合成武器の測定（2026-10-06）：合成 C を、A だけ・B だけ・A と B の混成（同じコストの上限）と比べる。漏れの中央値で見る。
//   置き換え：__CH__（章の番号。第35章はアセンション側なので ensureStages で足す）・__D__（深さ。標準は 章＋2）・__CAP__（コストの上限）・
//             __FIDS__（合成の id の配列。例 ["starassault"]）・__SEEDS__（シードの配列）・__CONDS__（条件の配列：C・A・B・AB）・
//             __PATCH__（BAL.fusion の数字を測定のあいだだけ差し替える文。例 BAL.fusion.abyssnet.stat.rate = 1.4;  無ければ空）
//   ライフ 1e6（5ウェーブ最後まで回す）・測定ごとに Game.newSave()・置き方は測定器の 'range'＋指定攻撃の円は通り道の多い点
//   C … 合成だけをコストの上限まで（同じ武器は15基まで）／ A … A だけ／ B … B だけ／ AB … A と B を同じコストずつ（本体の置き方は隣り合わせを狙わない）
//   条件は交互（シードごとに C→A→B→AB の順で回す）
REAL_MS = 600000;
const CH = __CH__, D = __D__, CAP = __CAP__, FIDS = __FIDS__, SEEDS = __SEEDS__, CONDS = __CONDS__;
Game.costCap = function () { return CAP; };
AIM_SMART = true;
(function () { __PATCH__ })();
BAL_PRISTINE['fusion'] = JSON.parse(JSON.stringify(BAL.fusion));      // runStage の入口が「原本と違う項目」を戻すので、差し替えた BAL.fusion を原本にする
const med = (a) => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const out = [];
for (const fid of FIDS) {
  const f = FUSIONS[fid], rows = {};
  for (const c of CONDS) rows[c] = [];
  for (const sd of SEEDS) {
    for (const c of CONDS) {
      Game.newSave(); ensureStages(CH + 1); seedRng(sd);
      const ws = c === 'C' || c === 'A' ? [f.a] : c === 'B' ? [f.b] : [f.a, f.b];
      const o = { coins: 1e12, deep: { prestiges: 2, deepest: D }, lives: 1e6 };
      if (c === 'C') { o.fusions = [fid]; o.noPlain = true; }
      const r = runStage('ch' + CH, ws, 60, o);
      rows[c].push({ leaked: r.leaked, kills: r.kills, units: r.units, cost: r.cost, res: r.res });
    }
  }
  unseedRng();
  const row = { fid, cost: f.cost, ab: f.a + '+' + f.b };
  for (const c of CONDS) row[c] = { median: med(rows[c].map(x => x.leaked)), leaked: rows[c].map(x => x.leaked), units: med(rows[c].map(x => x.units)), killsMed: med(rows[c].map(x => x.kills)) };
  out.push(row);
}
out
