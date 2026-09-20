// ---------------------------------------------------------------
// relics.js : 遺物（永続パッシブ）の集計
//
//   **転生で消えない唯一の数値成長。** ここが無いと、周回のたびに
//   同じ道のりを同じ時間かけて登り直すことになる（第1版の実測：転生しても 0.99〜1.10倍）。
//
//   遺物カードの定義は cards.js（kind:'perm'）。所持枚数は他のカードと同じく
//   perm.collection に入るので、転生で消えない仕組みをここで作る必要はない。
//
//   積み方
//     add  … 枚数ぶん加算してから 1+合計 を掛ける。**後半で1枚の価値が薄まる＝暴走しない**
//     mul  … 枚数ぶん累乗。エピック以上だけ
//     flat … そのまま加算（ライフ・初期コイン・初期レベル）
//
//   **設置枠を配る遺物は置かない。**
//   遊んでもらった結果「転生エピックの基数追加で無強化プレイができる、
//   転生2回でゲームが崩壊する」という報告が出た。
//   設置枠は火力・カバー範囲・漏れにくさが同時に増え、他の全強化と掛け算になるので、
//   踏破したステージ数以外では増えない（unitCap / Skill.maxOf / Skill.lv を参照）。
//   key:'units' の集計は、実際どこからも読まれていない死に道だったので落とした
// ---------------------------------------------------------------
'use strict';

const RELIC_IDS = CARD_IDS.filter(id => CARDS[id].kind === 'perm');

const Relic = {
  _cache: null,

  // 所持枚数が変わったら呼ぶ。次に読まれたときに数え直す
  invalidate() { this._cache = null; },

  // 今の所持から、出撃に掛かる倍率一式を作る
  mods(perm) {
    if (this._cache) return this._cache;
    const col = (perm && perm.collection) || {};
    const add = { dmg: 0, coin: 0, rate: 0 };
    const mul = { dmg: 1, coin: 1, rate: 1 };
    let lives = 0, seed = 0, startLv = 0;

    for (const id of RELIC_IDS) {
      const n = col[id] || 0;
      if (n <= 0) continue;
      const c = CARDS[id];
      if (c.mode === 'add') add[c.key] += c.eff * n;
      else if (c.mode === 'mul') mul[c.key] *= Math.pow(c.eff, n);
      else if (c.key === 'lives') lives += c.eff * n;
      else if (c.key === 'seed') seed += c.eff * n;
      else if (c.key === 'startLv') startLv += c.eff * n;
    }

    this._cache = {
      dmg: (1 + add.dmg) * mul.dmg,
      coin: (1 + add.coin) * mul.coin,
      rate: (1 + add.rate) * mul.rate,
      lives, seed, startLv,
      count: RELIC_IDS.reduce((a, id) => a + (col[id] || 0), 0),
    };
    return this._cache;
  },

  // 所持している遺物を、種類ごとにまとめて返す（画面用）
  owned(perm) {
    const col = (perm && perm.collection) || {};
    return RELIC_IDS.filter(id => (col[id] || 0) > 0)
      .map(id => ({ card: CARDS[id], n: col[id] }))
      .sort((a, b) => BAL.rarityOrder.indexOf(b.card.rarity) - BAL.rarityOrder.indexOf(a.card.rarity));
  },
};
