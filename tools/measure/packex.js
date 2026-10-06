// パックの圧縮の測定（アセンションに入ったセーブから第31章〜）。2026-10-06
//   第30章までを1回だけ歩いて保存を取り、アセンションに入ったところから、**ふつうのパックを開けずにためて、交換できるだけ交換し、上位パックだけを開ける**遊び方で第31章〜 __TO__ 章を歩く
//   （測定器 sim.html の AUTO_EXCHANGE。本体の Asc.exchange と同じ処理）。交換のコイン C は BAL.ascExchCoinMul（__MUL__）で振る。
//   置き換え：__SEED__（シード）・__TO__（最後の章）・__MUL__（ascExchCoinMul）・__NOCOIN__（1でコインの札なし）
//   出力：章ごとに { 挑戦回数, Lv, その章の最後の出撃で入ったコイン, 交換の累計回数, 開けた上位パックの累計, 交換コイン C, 残りコイン, 残りのふつうのパック }
//   例：node tools/measure/run.js packex --SEED 1 --TO 40 --MUL 3e5 --NOCOIN 0
REAL_MS = 600000;
const SEED = __SEED__, TO = __TO__;
if (__NOCOIN__) for (const id of ['ua_coin', 'ur_coin']) { delete CARDS[id]; const i = CARD_IDS.indexOf(id); if (i >= 0) CARD_IDS.splice(i, 1); }   // 1＝コインの札を抜いて測る（比べる用）
BAL.ascExchCoinMul = __MUL__; BAL_PRISTINE.ascExchCoinMul = __MUL__;
const r = await endlessAsync(SEED, { toCh: TO, exchange: true, tries: 3, farm: 5, rounds: 3 });
const f = (v) => (v >= 1e6 ? v.toExponential(2) : String(v));
({ seed: SEED, mul: __MUL__, stop: r.stop, main: r.main,
  ch: r.chapters.map(x => x.ch + ':' + x.tries + (x.ok ? '' : '×') + ' Lv' + x.lv + ' 入' + f(x.coin) + ' 交' + x.exch + ' 上' + x.upOpened + ' 要' + f(x.exchCost) + ' 残' + f(Math.round(x.coinsLeft)) + ' 札' + x.packsLeft) })
