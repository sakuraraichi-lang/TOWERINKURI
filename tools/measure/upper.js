// 上位の敵の測定（アセンションに入ったセーブから第31章〜）。2026-10-06
//   第30章までを1回だけ歩いて保存を取り、**同じ保存から**条件ごとに第31〜 __TO__ 章を歩き直す（条件のあいだで出発点が同じ）。
//   置き換え：__SEED__（シード）・__TO__（最後の章）・__CONDS__（条件の配列の JSON）
//     条件 = { name, bal: { 項目: 値 }, load: 'mix'|'phys'|'elem'|'optfield' … }  bal は BAL と BAL_PRISTINE の両方に書く（CLAUDE.md の注意）
//     load 'mix'＝測定器の既定の編成（強い順に枠の数だけ）。'phys'＝物理だけ・'elem'＝属性だけ・'nophys'＝物理を抜いた混成
//   例：node tools/measure/run.js upper --SEED 1 --TO 40 --CONDS '[{"name":"off","bal":{"ascUpperOn":false}},{"name":"on","bal":{}}]'
//   出力：条件ごとに 章 → { 挑戦回数, 挑戦ごとの漏れ, 1ウェーブの敵の数, 最後の出撃の秒, レベル }
REAL_MS = 600000;
const SEED = __SEED__, TO = __TO__;
const CONDS = __CONDS__;
const SETS = {
  phys: ['katana', 'shuriken', 'gatling', 'mortar', 'missile'],
  elem: ['tesla', 'flame', 'cryo'],
  nophys: ['sniper', 'tesla', 'cryo', 'gas', 'bubble', 'tentacle'],
};
const setBal = (o) => { for (const k in o) { BAL[k] = JSON.parse(JSON.stringify(o[k])); BAL_PRISTINE[k] = JSON.parse(JSON.stringify(o[k])); } };
const keep = {};
const keysOf = new Set(); CONDS.forEach(c => Object.keys(c.bal || {}).forEach(k => keysOf.add(k)));
keysOf.forEach(k => { keep[k] = JSON.parse(JSON.stringify(BAL[k])); });

let save = null;
const res = { seed: SEED, conds: {} };
// 1回目：保存を取るために、最初の条件で歩く（第30章までは条件に依らない）
const order = CONDS.slice();
for (let i = 0; i < order.length; i++) {
  const c = order[i];
  setBal(keep); setBal(c.bal || {});
  const loadout = (c.load && c.load !== 'mix' && SETS[c.load]) ? (() => SETS[c.load]) : null;
  const r = await endlessAsync(SEED, { toCh: TO, save, onSave: (s) => { if (!save) save = s; }, loadout, tries: 3, farm: 5, rounds: 3 });
  res.conds[c.name] = { stop: r.stop, main: r.main, ch: r.chapters.map(x => x.ch + ':' + x.tries + (x.ok ? '' : '×') + ' 漏' + x.leaks + ' 数' + x.cnt + ' ' + x.secLast + 's Lv' + x.lv) };
}
setBal(keep);
res
