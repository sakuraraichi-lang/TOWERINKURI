// ---------------------------------------------------------------
// draft.js : ウェーブ突破ごとのカード抽選
//
//   **ここに置いてあるのは、本体と測定器の両方から使うため。**
//   以前は ui.js と tools/sim.html に同じロジックが二重に書かれていて、
//   片方だけ直すと「測定しているものが、遊んでいるものと違う」状態になっていた。
//   DOM に触らないので、描画の無い測定器からもそのまま読める
// ---------------------------------------------------------------
'use strict';

const Draft = {
  // いま引ける可能性のあるカード。
  // **持っていないカードは出ない。** カードはパックでしか手に入らないので、
  // 「引く」のは手持ちの中からの抽選になる
  eligible() {
    const ids = Game.loadoutWeapons();
    const run = Game.run;
    return CARD_IDS.filter(id => {
      const c = CARDS[id];
      if (c.kind === 'weapon') return false;        // 武器そのものはパックから
      if (c.kind === 'perm') return false;          // 遺物は3択に出さない（転生でしか増えない）
      if (Game.own(id) <= 0) return false;
      if ((run.cards[id] || 0) >= Game.stackLimit(id)) return false;
      if (c.kind === 'mod') return ids.includes(c.weapon);
      if (c.kind === 'synergy') return c.requires.every(w => ids.includes(w));
      return true;
    });
  },

  // n枚の選択肢を作る。**先にレア度を決めてから、その中で等確率に選ぶ。**
  //   レア度の重みは BAL.rarityWeight に固定してあり、所持枚数では動かない。
  //   ダブりは Game.rankMul（ランクアップ）に回る（2026-09-21 の決定）
  roll(n) {
    const pool = this.eligible();
    if (!pool.length) return [];
    const luck = Game.run.mods.luck;
    const out = [];
    for (let i = 0; i < n && out.length < pool.length; i++) {
      const rem = pool.filter(id => !out.includes(id));
      const rEnt = BAL.rarityOrder
        .map(r => ({ r, w: BAL.rarityWeight[r], n: rem.filter(id => CARDS[id].rarity === r).length }))
        .filter(e => e.n > 0);
      if (!rEnt.length) break;
      const pickR = Util.weighted(rEnt, e => Math.max(0.01, e.w * (1 + BAL.rarityDraftLuck[e.r] * luck * 0.05))).r;
      const cand = rem.filter(id => CARDS[id].rarity === pickR);
      // **レア度の中では等確率。** ダブりは出やすさではなくランクに回る
      out.push(Util.weighted(cand, id => Game.cardWeight(id)));
    }
    return out;
  },
};
