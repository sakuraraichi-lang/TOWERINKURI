// パックの圧縮の測定（アセンションに入ったセーブから第31章〜）。2026-10-06
//   第30章までを1回だけ歩いて保存を取り、**同じ保存から**「交換しない」「交換する」を順に歩く（出発点が同じ）。
//   置き換え：__SEED__（シード）・__TO__（最後の章）
//   出力：条件ごとに、章ごとの { 挑戦回数, Lv, 入ったコイン（その章の最後の出撃）, 交換の累計回数, 開けた上位パックの累計, 交換コイン, 残りコイン, 残りのふつうのパック }
//   例：node tools/measure/run.js packex --SEED 1 --TO 40
REAL_MS = 600000;
const SEED = __SEED__, TO = __TO__;
let save = null;
const res = { seed: SEED, conds: {} };
for (const c of [{ name: 'noexch', exchange: false }, { name: 'exch', exchange: true }]) {
  const r = await endlessAsync(SEED, { toCh: TO, save, onSave: (s) => { if (!save) save = s; }, exchange: c.exchange, tries: 3, farm: 5, rounds: 3 });
  const f = (v) => (v >= 1e6 ? v.toExponential(2) : String(v));
  res.conds[c.name] = { stop: r.stop, main: r.main,
    ch: r.chapters.map(x => x.ch + ':' + x.tries + (x.ok ? '' : '×') + ' Lv' + x.lv + ' 入' + f(x.coin) + ' 交' + x.exch + ' 上' + x.upOpened + ' 要' + f(x.exchCost) + ' 残' + f(Math.round(x.coinsLeft)) + ' 札' + x.packsLeft + ' 開' + x.packs) };
}
res
