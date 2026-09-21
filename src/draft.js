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
      if (c.kind === 'key') return false;           // 鍵は章の報酬でしか手に入らない
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
  //
  //   **実測で確かめてある**（2026-09-21・第1章・候補29枚・12,000回引いた）：
  //     レア度      設定   所持が均等   コモンだけ30枚
  //     common       62     62.1%        61.3%
  //     rare         26     25.8%        26.4%
  //     epic         10      9.9%        10.3%
  //     legendary     2      2.2%         2.0%
  //   **所持を30倍に偏らせても比が動かない。**
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
      // **運でレア度を消さない。**（2026-09-22）
      //   下限が 0.01 だったので、「幸運回路」（上限なし）を Lv20 まで積むと
      //   コモンの重みが 1 + (-1.0 × 20 × 0.05) = 0 になり、**3択からコモンが消える。**
      //   パックのほうは 0921p で同じ穴を直してあった（「解析装置」でコモンが0%になっていた）のに、
      //   **3択の側が直っていなかった。**同じ直し方を当てる：
      //   もとの重みの 0.4倍 を下回らせず、効き幅も抑える
      const pickR = Util.weighted(rEnt, e => {
        const bias = BAL.rarityDraftLuck[e.r] * luck * BAL.draftLuckPower;
        return Math.max(e.w * 0.4, e.w * (1 + bias));
      }).r;
      const cand = rem.filter(id => CARDS[id].rarity === pickR);
      // **レア度の中では等確率。** ダブりは出やすさではなくランクに回る
      out.push(Util.weighted(cand, id => Game.cardWeight(id)));
    }
    return out;
  },
};
