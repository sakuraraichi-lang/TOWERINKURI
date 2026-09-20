// ---------------------------------------------------------------
// skilltree.js : インクリメンタル側。ここは「数字を大きくする」だけ
//   武器の挙動は一切変えない（それはカードの担当）
//
//   火力系は武器カテゴリ単位で上げる。武器が増えても
//   「短射程を伸ばすビルド」「支援を伸ばすビルド」という選択が残るようにするため
//
//   **効果量はこのファイルの eff だけが持つ。**
//   表示文（desc）も mods() の計算も、どちらも eff から作る。
//   以前は説明文と計算式の両方に倍率がベタ書きされていて、
//   片方だけ直すと表示と実効果がズレる状態だった
// ---------------------------------------------------------------
'use strict';

// mode: 'mul' … レベルごとに eff 倍（累乗）
//       'add' … レベルごとに eff を加算
// tmpl の {e} が eff に置き換わる
const SKILLS = [
  // ============ 資源・拠点 ============
  // **累乗をやめた。** ×1.11 の上限無しだと、安いので延々買われて
  // 実測で Lv39・×153倍まで伸び、これが収入爆発の本体だった
  // （1面あたりの稼ぎが ×25.7 / ×6.4 / ×38.1 と暴れていた原因）。
  // 加算なら、レベルを積んでも収入の「次数」が上がらない
  { id: 'coin', name: '集金効率', icon: '◈', group: '資源',
    eff: 0.14, mode: 'add', tmpl: '敵から得るコイン +{e}倍',
    cost0: 15, costG: 1.33, max: Infinity, unlock: 0 },
  { id: 'core', name: '防衛線', icon: '▣', group: '拠点',
    eff: 3, mode: 'add', tmpl: 'ライフ +{e}（抜けられてよい敵が{e}体増える）',
    cost0: 40, costG: 1.26, max: Infinity, unlock: 0 },
  { id: 'regen', name: '応急修理班', icon: '✚', group: '拠点',
    eff: 1, mode: 'add', tmpl: 'ウェーブを1つ突破するごとにライフ +{e}（上限まで）',
    cost0: 90, costG: 1.55, max: 10, unlock: 1 },
  { id: 'units', name: '増設基盤', icon: '⛁', group: '拠点',
    eff: 1, mode: 'add', tmpl: 'どの武器も設置できる数が +{e} 基',
    cost0: 900, costG: 7.5, max: 5, unlock: 1 },

  // ============ カテゴリ別（その分類の武器を1つでも持つと解放） ============
  { id: 'short_dmg', name: '近接兵装', icon: '◤', group: '短射程', cat: 'short', key: 'dmg',
    eff: 1.15, mode: 'mul', tmpl: '短射程カテゴリのダメージ ×{e}',
    cost0: 30, costG: 1.30, max: Infinity, unlock: 0 },
  { id: 'short_rng', name: '間合い拡張', icon: '◤', group: '短射程', cat: 'short', key: 'range',
    eff: 1.09, mode: 'mul', tmpl: '短射程カテゴリの射程 ×{e}',
    cost0: 45, costG: 1.36, max: Infinity, unlock: 0 },
  { id: 'short_unit', name: '前線基盤', icon: '◤', group: '短射程', cat: 'short', key: 'units',
    eff: 1, mode: 'add', tmpl: '短射程カテゴリの武器を置ける数 +{e} 基',
    cost0: 440, costG: 3.1, max: 4, maxPerClear: 1, unlock: 0 },

  { id: 'mid_dmg', name: '汎用弾薬', icon: '◈', group: '中射程', cat: 'mid', key: 'dmg',
    eff: 1.13, mode: 'mul', tmpl: '中射程カテゴリのダメージ ×{e}',
    cost0: 25, costG: 1.28, max: Infinity, unlock: 0 },
  { id: 'mid_rate', name: '給弾機構', icon: '◈', group: '中射程', cat: 'mid', key: 'rate',
    eff: 1.07, mode: 'mul', tmpl: '中射程カテゴリの発射レート ×{e}',
    cost0: 40, costG: 1.34, max: Infinity, unlock: 0 },
  { id: 'mid_unit', name: '量産設備', icon: '◈', group: '中射程', cat: 'mid', key: 'units',
    eff: 1, mode: 'add', tmpl: '中射程カテゴリの武器を置ける数 +{e} 基',
    cost0: 430, costG: 3.1, max: 4, maxPerClear: 1, unlock: 0 },

  { id: 'long_dmg', name: '徹甲弾頭', icon: '◎', group: '長射程', cat: 'long', key: 'dmg',
    eff: 1.18, mode: 'mul', tmpl: '長射程カテゴリのダメージ ×{e}',
    cost0: 38, costG: 1.31, max: Infinity, unlock: 0 },
  { id: 'long_crit', name: '照準計算機', icon: '◎', group: '長射程', cat: 'long', key: 'crit',
    eff: 0.04, mode: 'add', tmpl: '長射程カテゴリの会心率 +{e}（会心倍率も上がる）',
    cost0: 90, costG: 1.42, max: 20, unlock: 0 },
  { id: 'long_unit', name: '狙撃陣地', icon: '◎', group: '長射程', cat: 'long', key: 'units',
    eff: 1, mode: 'add', tmpl: '長射程カテゴリの武器を置ける数 +{e} 基',
    cost0: 380, costG: 3.1, max: 4, maxPerClear: 1, unlock: 0 },

  { id: 'area_dmg', name: '高熱反応', icon: '▲', group: '範囲攻撃', cat: 'area', key: 'dmg',
    eff: 1.14, mode: 'mul', tmpl: '範囲攻撃カテゴリのダメージ ×{e}',
    cost0: 34, costG: 1.30, max: Infinity, unlock: 0 },
  { id: 'area_size', name: '拡散増幅', icon: '▲', group: '範囲攻撃', cat: 'area', key: 'size',
    eff: 1.10, mode: 'mul', tmpl: '範囲攻撃カテゴリの効果範囲 ×{e}（扇・爆風・撒いた場すべて）',
    cost0: 70, costG: 1.38, max: Infinity, unlock: 0 },
  { id: 'area_unit', name: '散布基盤', icon: '▲', group: '範囲攻撃', cat: 'area', key: 'units',
    eff: 1, mode: 'add', tmpl: '範囲攻撃カテゴリの武器を置ける数 +{e} 基',
    cost0: 160, costG: 3.1, max: 4, maxPerClear: 1, unlock: 0 },

  { id: 'target_dmg', name: '成形炸薬', icon: '✛', group: '指定攻撃', cat: 'target', key: 'dmg',
    eff: 1.16, mode: 'mul', tmpl: '指定攻撃カテゴリのダメージ ×{e}',
    cost0: 36, costG: 1.31, max: Infinity, unlock: 0 },
  { id: 'target_rate', name: '装填補助', icon: '✛', group: '指定攻撃', cat: 'target', key: 'rate',
    eff: 1.08, mode: 'mul', tmpl: '指定攻撃カテゴリの発射レート ×{e}',
    cost0: 65, costG: 1.36, max: Infinity, unlock: 0 },
  { id: 'target_unit', name: '支持架台', icon: '✛', group: '指定攻撃', cat: 'target', key: 'units',
    eff: 1, mode: 'add', tmpl: '指定攻撃カテゴリの武器を置ける数 +{e} 基',
    cost0: 500, costG: 3.1, max: 4, maxPerClear: 1, unlock: 0 },

  { id: 'sup_pow', name: '制圧出力', icon: '❉', group: '支援', cat: 'support', key: 'dur',
    eff: 1.12, mode: 'mul', tmpl: '支援カテゴリの 減速・拘束・感電の持続 ×{e}',
    cost0: 55, costG: 1.34, max: Infinity, unlock: 0 },
  { id: 'sup_rng', name: '照射範囲', icon: '❉', group: '支援', cat: 'support', key: 'range',
    eff: 1.10, mode: 'mul', tmpl: '支援カテゴリの射程・効果範囲 ×{e}',
    cost0: 55, costG: 1.34, max: Infinity, unlock: 0 },
  { id: 'support_unit', name: '支援拠点', icon: '❉', group: '支援', cat: 'support', key: 'units',
    eff: 1, mode: 'add', tmpl: '支援カテゴリの武器を置ける数 +{e} 基',
    cost0: 620, costG: 3.1, max: 4, maxPerClear: 1, unlock: 0 },

  // ============ カード側の枠を増やす ============
  { id: 'picks', name: '増設スロット', icon: '★', group: 'カード',
    eff: 1, mode: 'add', tmpl: 'ウェーブ突破ごとに取れるカードが +{e} 枚',
    cost0: 900, costG: 6.0, max: 3, unlock: 2 },
  { id: 'choices', name: '選択肢拡張', icon: '✧', group: 'カード',
    eff: 1, mode: 'add', tmpl: 'カード選択の提示枚数 +{e}（3択 → 4択 …）',
    cost0: 500, costG: 4.2, max: 3, unlock: 2 },
  { id: 'luck', name: '幸運回路', icon: '✧', group: 'カード',
    eff: 1, mode: 'add', tmpl: 'カード選択で高レアリティが出やすくなる',
    cost0: 120, costG: 1.55, max: Infinity, unlock: 1 },
  { id: 'pack', name: '解析装置', icon: '⬢', group: 'カード',
    eff: 1, mode: 'add', tmpl: '転生で得るカードパックの等級が上がりやすくなる',
    cost0: 300, costG: 1.80, max: 12, unlock: 3 },

  // ============ 危険と引き換え ============
  { id: 'lure', name: '敵誘引', icon: '◌', group: '危険',
    eff: 0.12, mode: 'add', tmpl: '敵の出現数 +{e}倍 / コイン獲得 +6%（危険だが儲かる）',
    cost0: 40, costG: 1.45, max: 60, unlock: 1 },
];

const SKILL_BY_ID = {};
for (const s of SKILLS) SKILL_BY_ID[s.id] = s;

// ============ 換装 ============
//
//   【何と何を入れ替えるのか】
//     スキルツリーの**特定の1ノードだけ**を、別の効き方に差し替える。
//     どのノードに刺さるかは `base` が持っている（1つの部品は1つのノード専用）。
//     例：`sw_short_rate 速振り` は `short_rng 突破力` にしか刺さらない。
//
//   【何が変わって、何が変わらないか】
//     変わる   … 名前・アイコン・効き方（key / eff / mode）
//     変わらない … 値段・上限・解放条件・カテゴリ・**買ったレベル**
//     つまり強くなるのではなく、**伸ばす方向が変わる**だけ。
//
//   【どこで手に入り、どこで付け替えるのか】
//     手に入る … パック開封の3択（`Pack.swapChance` の確率で出る）。
//                **選んだ1つだけが手持ちになる。選ばなかった2つは手に入らない。**
//     付け替え … 一度手に入れた部品は `perm.swapsOwned` に残り、
//                **スキルツリーで、そのノードをタップすればいつでも付け替えられる。**
//                元の効き方にも、いつでも戻せる（`Skill.setSwap(perm, base, null)`）。
//     → だからパックで「今は換えない」を選んでも、**あとから直せる**。
//        ただし部品そのものは、選ばなければ手に入らない。
//
//   eff は、同じ key を持つ既存ノードから写している（新しい数字を作らない）。
//     rate 1.07 = mid_rate / rate 1.08 = target_rate
//     crit 0.04 = long_crit / range 1.09 = short_rng / size 1.10 = area_size
const SWAPS = [
  { id: 'sw_mid_crit', base: 'mid_rate', name: '収束照準', icon: '◈', key: 'crit',
    eff: 0.04, mode: 'add', tmpl: '中射程カテゴリの会心率 +{e}（会心倍率も上がる）' },
  { id: 'sw_short_rate', base: 'short_rng', name: '速振り', icon: '◤', key: 'rate',
    eff: 1.07, mode: 'mul', tmpl: '短射程カテゴリの発射レート ×{e}' },
  { id: 'sw_long_rate', base: 'long_crit', name: '速射砲身', icon: '◎', key: 'rate',
    eff: 1.08, mode: 'mul', tmpl: '長射程カテゴリの発射レート ×{e}' },
  { id: 'sw_area_crit', base: 'area_size', name: '起爆同調', icon: '▲', key: 'crit',
    eff: 0.04, mode: 'add', tmpl: '範囲攻撃カテゴリの会心率 +{e}（会心倍率も上がる）' },
  { id: 'sw_target_rng', base: 'target_rate', name: '遠隔観測', icon: '✛', key: 'range',
    eff: 1.09, mode: 'mul', tmpl: '指定攻撃カテゴリの射程 ×{e}' },
  { id: 'sw_sup_dmg', base: 'sup_pow', name: '過負荷回路', icon: '❉', key: 'dmg',
    eff: 1.12, mode: 'mul', tmpl: '支援カテゴリのダメージ ×{e}' },
];

const SWAP_BY_ID = {};
const SWAPS_FOR = {};
for (const s of SWAPS) {
  SWAP_BY_ID[s.id] = s;
  (SWAPS_FOR[s.base] || (SWAPS_FOR[s.base] = [])).push(s);
}

const Skill = {
  // 買ったレベル ＋ 遺物「初期投資」がくれる下駄。
  // **下駄のぶんは値段にも乗る**（安いレベルを飛ばして始める、という意味）
  lv(meta, id) {
    const p = (typeof Game !== 'undefined' && Game.perm) ? Game.perm : null;
    const s = SKILL_BY_ID[id];
    // **設置枠には遺物の下駄を履かせない。**
    //   遊んでもらった結果「転生エピックの基数追加で無強化プレイができる、
    //   転生2回でゲームが崩壊する」という報告が出た。
    //   設置枠は火力・カバー範囲・漏れにくさが同時に増えて他の全強化と掛け算になるので、
    //   踏破したステージ数以外では絶対に増えないようにする（maxPerClear と同じ理屈）
    const base = (p && typeof Relic !== 'undefined' && !(s && s.maxPerClear))
      ? Relic.mods(p).startLv : 0;
    const lv = (meta.skills[id] || 0) + base;
    return s ? Math.min(lv, Skill.maxOf(p, id)) : lv;
  },

  // 換装を当てはめたあとのノード定義。**ここ以外で SKILL_BY_ID を直に見ない**
  node(id, perm) {
    const base = SKILL_BY_ID[id];
    const p = perm || ((typeof Game !== 'undefined' && Game.perm) ? Game.perm : null);
    const sw = p && p.swaps && SWAP_BY_ID[p.swaps[id]];
    if (!sw) return base;
    return {
      id: base.id, cat: base.cat, group: base.group,
      cost0: base.cost0, costG: base.costG, max: base.max, unlock: base.unlock,
      name: sw.name, icon: sw.icon, tmpl: sw.tmpl, eff: sw.eff, mode: sw.mode, key: sw.key,
      swappedFrom: base.name, swapId: sw.id,
    };
  },

  // 表示文は eff から作る。計算式と同じ値を見ているので、ズレようがない
  desc(s) { return s.tmpl.split('{e}').join(String(s.eff)); },

  // 短い表示。**カテゴリ名は枝の色と見出しが示すので、文からは落とす。**
  //   「短射程カテゴリのダメージ ×1.15」→「ダメージ ×1.15」
  shortDesc(s) {
    return Skill.desc(s)
      .replace(/^[^のカ]*カテゴリの/, '')
      .replace(/（[^）]*）/g, '')
      .trim();
  },

  // 値段は「レベル」だけでなく「どこまで進んだか」でも上がる。
  //
  //   **これが無いと、コインに重みが戻らない。**
  //   収入は1ステージで ×40〜70 に伸びるのに、段の値上がりは ×1.3 しかない。
  //   実測：1面終了時に残高が次の1段の108倍、5面では162万倍。
  //   costG を ×1.45 まで上げても 4,179倍のままで、先に突破できなくなった
  //   （＝値上がりの「次数」が収入と違うので、係数では追いつかない）。
  //   ステージを踏むたびに値段の桁も上がる形にして、次数を揃える
  cost(meta, id, perm) {
    const s = SKILL_BY_ID[id];
    const p = perm || ((typeof Game !== 'undefined' && Game.perm) ? Game.perm : null);
    const cleared = p ? MAIN_STAGES.filter(x => (p.stages[x.id] || {}).cleared).length : 0;
    return Math.ceil(s.cost0
      * Math.pow(s.costG, Skill.lv(meta, id))
      * Math.pow(BAL.costPerStage, cleared));
  },

  // レベルぶんの効果量。mul なら累乗、add なら加算
  amount(meta, id) {
    const s = Skill.node(id);
    const lv = Skill.lv(meta, id);
    return s.mode === 'mul' ? Math.pow(s.eff, lv) : s.eff * lv;
  },

  // カテゴリのノードは、そのカテゴリの武器を1つでも持っていれば解放される
  isUnlocked(perm, id) {
    const s = SKILL_BY_ID[id];
    if (s.cat) {
      return WEAPON_IDS.some(wid => WEAPONS[wid].cat === s.cat && (perm.collection['wc_' + wid] || 0) > 0);
    }
    const cleared = MAIN_STAGES.filter(x => (perm.stages[x.id] || {}).cleared).length;
    return cleared >= s.unlock;
  },

  lockReason(perm, id) {
    const s = SKILL_BY_ID[id];
    if (s.cat) return CATEGORIES[s.cat].name + 'の武器を手に入れると解放';
    return 'ステージを ' + s.unlock + ' 個突破すると解放';
  },

  // そのノードの今の上限。
  //
  //   **設置枠だけは「お金では前借りできない」。**
  //   コインは終盤に余るので、値段をいくら上げても止まらない。
  //   実測：1面終了時に既に残高が次の1段の70倍、5面で78万倍あった。
  //   設置枠は火力・カバー範囲・漏れにくさが同時に増えて他の全強化と掛け算になるので、
  //   ここだけは**踏破したステージ数**という、お金で買えないもので止める
  maxOf(perm, id) {
    const s = SKILL_BY_ID[id];
    if (!s.maxPerClear) return s.max;
    const p = perm || ((typeof Game !== 'undefined' && Game.perm) ? Game.perm : null);
    const cleared = p ? MAIN_STAGES.filter(x => (p.stages[x.id] || {}).cleared).length : 0;
    return Math.min(s.max, cleared * s.maxPerClear);
  },

  // 上限に届いていて、その理由が進行なら、そう言う（値段のせいだと誤解させない）
  capReason(perm, id) {
    const s = SKILL_BY_ID[id];
    if (!s.maxPerClear) return '';
    if (Skill.maxOf(perm, id) >= s.max) return '';
    return 'ステージを突破すると、あと ' + (s.max - Skill.maxOf(perm, id)) + ' 段まで伸ばせます';
  },

  canBuy(meta, perm, id) {
    if (!Skill.isUnlocked(perm, id)) return false;
    if (Skill.lv(meta, id) >= Skill.maxOf(perm, id)) return false;
    return meta.coins >= Skill.cost(meta, id);
  },

  buy(meta, perm, id) {
    if (!Skill.canBuy(meta, perm, id)) return false;
    meta.coins -= Skill.cost(meta, id);
    // **買った数だけを数える。** ここで Skill.lv を使うと遺物の下駄が二重に乗る
    meta.skills[id] = (meta.skills[id] || 0) + 1;
    return true;
  },

  // そのカテゴリの「置ける数」の加算ぶん。
  // **設置数は倍率ではなく加算なので、mods を通さず直接引けるようにしておく**
  unitBonusFor(meta, cat) {
    const node = SKILLS.find(s => s.cat === cat && s.key === 'units');
    return node ? Skill.amount(meta, node.id) : 0;
  },

  // 安い順にまとめ買いする。**周回のたびに同じ買い物を手で繰り返させないため。**
  //   測定器が1周を回すときと同じ買い方（安い順）なので、
  //   実測の数字と、プレイヤーが押したときの結果がずれない。
  //   **敵誘引だけは買わない。** 敵の数が増えるノードなので、勝手に押されると事故になる
  buyAll(meta, perm, cap) {
    let n = 0, spent = 0;
    for (let i = 0; i < (cap || 500); i++) {
      const ids = SKILLS.map(s => s.id)
        .filter(id => id !== 'lure' && Skill.canBuy(meta, perm, id));
      if (!ids.length) break;
      ids.sort((a, b) => Skill.cost(meta, a) - Skill.cost(meta, b));
      const c = Skill.cost(meta, ids[0]);
      if (!Skill.buy(meta, perm, ids[0])) break;
      spent += c; n++;
    }
    return { n, spent };
  },

  // まとめ買いで1つでも買えるか
  canBuyAny(meta, perm) {
    return SKILLS.some(s => s.id !== 'lure' && Skill.canBuy(meta, perm, s.id));
  },

  // パックで出す換装の候補。**買っていないノードは換えられない**（換える意味が無い）。
  // すでに持っている部品は出さない（持っているものはツリーで付け替えられるため）
  swapChoices(meta, perm, n) {
    const pool = SWAPS.filter(sw =>
      Skill.isUnlocked(perm, sw.base) &&
      Skill.lv(meta, sw.base) > 0 &&
      !(perm.swapsOwned && perm.swapsOwned[sw.id]));
    Util.shuffle(pool);
    return pool.slice(0, n || 3);
  },

  // 部品を持っているか／そのノード用に持っている部品は何か
  ownsSwap(perm, swapId) { return !!(perm.swapsOwned && perm.swapsOwned[swapId]); },
  ownedSwapsFor(perm, baseId) {
    return (SWAPS_FOR[baseId] || []).filter(sw => Skill.ownsSwap(perm, sw.id));
  },
  // そのノードに刺さりうる部品が、そもそも世の中に在るか（説明に使う）
  hasSwapFor(baseId) { return !!(SWAPS_FOR[baseId] || []).length; },

  // パックで選んだ＝**手に入れて、そのまま付ける**
  applySwap(perm, swapId) {
    const sw = SWAP_BY_ID[swapId];
    if (!sw) return false;
    if (!perm.swapsOwned) perm.swapsOwned = {};
    perm.swapsOwned[sw.id] = 1;
    return Skill.setSwap(perm, sw.base, sw.id);
  },

  // ツリーから付け替える。swapId に null を渡すと元の効き方へ戻る。
  // **持っていない部品は付けられない**
  setSwap(perm, baseId, swapId) {
    if (!perm.swaps) perm.swaps = {};
    if (!swapId) { delete perm.swaps[baseId]; return true; }
    const sw = SWAP_BY_ID[swapId];
    if (!sw || sw.base !== baseId || !Skill.ownsSwap(perm, swapId)) return false;
    perm.swaps[baseId] = swapId;
    return true;
  },

  // アップグレード＋転生ボーナスを、出撃時の倍率一式にまとめる
  mods(meta, perm) {
    const A = (id) => Skill.amount(meta, id);
    // 転生で残る層。**以前は prestigePower^回数 の ×1.35 一本だった。**
    // それだと1周で積む ×133 に対して 1% しかなく、実測で 2周目が 0.99〜1.10倍の速さ
    // ＝ ほとんど楽にならなかったので、遺物カードに置き換えた
    const R = Relic.mods(perm);
    const pw = R.dmg;

    // カテゴリ別のノードを、定義から自動で組み立てる。
    // ノードを足したら cat と key を書くだけで、ここを直す必要は無い
    const cat = {};
    for (const c of CATEGORY_IDS) cat[c] = {};
    for (const base of SKILLS) {
      const s = Skill.node(base.id, perm);
      if (!s.cat || !s.key) continue;
      const v = A(s.id);
      cat[s.cat][s.key] = s.mode === 'mul' ? v : v;
      if (s.key === 'dmg' && s.mode === 'mul') cat[s.cat].dmg = v * pw;
      if (s.key === 'crit') cat[s.cat].critMul = v * 3.75;   // 会心率1%につき倍率+0.0375
    }
    for (const c of CATEGORY_IDS) {
      if (cat[c].dmg === undefined && SKILLS.some(s => s.cat === c && s.key === 'dmg')) cat[c].dmg = pw;
      // 遺物のレートは全カテゴリに掛かる（スキルのレートを持たないカテゴリにも）
      cat[c].rate = (cat[c].rate || 1) * R.rate;
    }

    return {
      coin:   (1 + A('coin')) * (1 + 0.06 * Skill.lv(meta, 'lure')) * R.coin,
      lives:  A('core') + R.lives,
      regen:  A('regen'),
      spawn:  1 + A('lure'),
      luck:   Skill.lv(meta, 'luck'),
      packLuck: Skill.lv(meta, 'pack'),
      picks:   1 + A('picks'),
      choices: BAL.draftSize + A('choices'),
      units:   A('units') + R.units,
      prestige: pw,
      relic: R,
      cat,
    };
  },

  // 1つの武器へ、そのカテゴリの倍率を適用する
  applyTo(w, mods) {
    const c = mods.cat[w.def.cat];
    if (!c) return;
    if (c.dmg) w.s.dmg *= c.dmg;
    if (c.rate) w.s.rate *= c.rate;
    if (c.range) w.s.range *= c.range;
    if (c.crit) { w.s.crit += c.crit; w.s.critMul += c.critMul || 0; }
    if (c.size) {
      w.s.splash *= c.size;
      w.s.fieldR *= c.size;
      w.s.cone = Math.min(Math.PI * 0.95, w.s.cone * c.size);
    }
    if (c.dur) {
      w.s.slowDur *= c.dur;
      w.s.stunDur *= c.dur;
      w.s.knockDur *= c.dur;
      w.s.shockDur *= c.dur;
      w.s.fieldDur *= c.dur;
    }
  },
};
