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
  { id: 'coin', name: '集金効率', icon: '◈', group: '資源',
    eff: 1.11, mode: 'mul', tmpl: '敵から得るコイン ×{e}',
    cost0: 15, costG: 1.33, max: Infinity, unlock: 0 },
  { id: 'core', name: '防衛線', icon: '▣', group: '拠点',
    eff: 3, mode: 'add', tmpl: 'ライフ +{e}（抜けられてよい敵が{e}体増える）',
    cost0: 40, costG: 1.26, max: 200, unlock: 0 },
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
    cost0: 45, costG: 1.36, max: 30, unlock: 0 },
  { id: 'short_unit', name: '前線基盤', icon: '◤', group: '短射程', cat: 'short', key: 'units',
    eff: 1, mode: 'add', tmpl: '短射程カテゴリの武器を置ける数 +{e} 基',
    cost0: 260, costG: 2.6, max: 4, unlock: 0 },

  { id: 'mid_dmg', name: '汎用弾薬', icon: '◈', group: '中射程', cat: 'mid', key: 'dmg',
    eff: 1.13, mode: 'mul', tmpl: '中射程カテゴリのダメージ ×{e}',
    cost0: 25, costG: 1.28, max: Infinity, unlock: 0 },
  { id: 'mid_rate', name: '給弾機構', icon: '◈', group: '中射程', cat: 'mid', key: 'rate',
    eff: 1.07, mode: 'mul', tmpl: '中射程カテゴリの発射レート ×{e}',
    cost0: 40, costG: 1.34, max: 40, unlock: 0 },
  { id: 'mid_unit', name: '量産設備', icon: '◈', group: '中射程', cat: 'mid', key: 'units',
    eff: 1, mode: 'add', tmpl: '中射程カテゴリの武器を置ける数 +{e} 基',
    cost0: 260, costG: 2.6, max: 4, unlock: 0 },

  { id: 'long_dmg', name: '徹甲弾頭', icon: '◎', group: '長射程', cat: 'long', key: 'dmg',
    eff: 1.18, mode: 'mul', tmpl: '長射程カテゴリのダメージ ×{e}',
    cost0: 38, costG: 1.31, max: Infinity, unlock: 0 },
  { id: 'long_crit', name: '照準計算機', icon: '◎', group: '長射程', cat: 'long', key: 'crit',
    eff: 0.04, mode: 'add', tmpl: '長射程カテゴリの会心率 +{e}（会心倍率も上がる）',
    cost0: 90, costG: 1.42, max: 20, unlock: 0 },
  { id: 'long_unit', name: '狙撃陣地', icon: '◎', group: '長射程', cat: 'long', key: 'units',
    eff: 1, mode: 'add', tmpl: '長射程カテゴリの武器を置ける数 +{e} 基',
    cost0: 260, costG: 2.6, max: 4, unlock: 0 },

  { id: 'area_dmg', name: '高熱反応', icon: '▲', group: '範囲攻撃', cat: 'area', key: 'dmg',
    eff: 1.14, mode: 'mul', tmpl: '範囲攻撃カテゴリのダメージ ×{e}',
    cost0: 34, costG: 1.30, max: Infinity, unlock: 0 },
  { id: 'area_size', name: '拡散増幅', icon: '▲', group: '範囲攻撃', cat: 'area', key: 'size',
    eff: 1.10, mode: 'mul', tmpl: '範囲攻撃カテゴリの効果範囲 ×{e}（扇・爆風・撒いた場すべて）',
    cost0: 70, costG: 1.38, max: 25, unlock: 0 },
  { id: 'area_unit', name: '散布基盤', icon: '▲', group: '範囲攻撃', cat: 'area', key: 'units',
    eff: 1, mode: 'add', tmpl: '範囲攻撃カテゴリの武器を置ける数 +{e} 基',
    cost0: 260, costG: 2.6, max: 4, unlock: 0 },

  { id: 'target_dmg', name: '成形炸薬', icon: '✛', group: '指定攻撃', cat: 'target', key: 'dmg',
    eff: 1.16, mode: 'mul', tmpl: '指定攻撃カテゴリのダメージ ×{e}',
    cost0: 36, costG: 1.31, max: Infinity, unlock: 0 },
  { id: 'target_rate', name: '装填補助', icon: '✛', group: '指定攻撃', cat: 'target', key: 'rate',
    eff: 1.08, mode: 'mul', tmpl: '指定攻撃カテゴリの発射レート ×{e}',
    cost0: 65, costG: 1.36, max: 30, unlock: 0 },
  { id: 'target_unit', name: '支持架台', icon: '✛', group: '指定攻撃', cat: 'target', key: 'units',
    eff: 1, mode: 'add', tmpl: '指定攻撃カテゴリの武器を置ける数 +{e} 基',
    cost0: 260, costG: 2.6, max: 4, unlock: 0 },

  { id: 'sup_pow', name: '制圧出力', icon: '❉', group: '支援', cat: 'support', key: 'dur',
    eff: 1.12, mode: 'mul', tmpl: '支援カテゴリの 減速・拘束・感電の持続 ×{e}',
    cost0: 55, costG: 1.34, max: 25, unlock: 0 },
  { id: 'sup_rng', name: '照射範囲', icon: '❉', group: '支援', cat: 'support', key: 'range',
    eff: 1.10, mode: 'mul', tmpl: '支援カテゴリの射程・効果範囲 ×{e}',
    cost0: 55, costG: 1.34, max: 25, unlock: 0 },
  { id: 'support_unit', name: '支援拠点', icon: '❉', group: '支援', cat: 'support', key: 'units',
    eff: 1, mode: 'add', tmpl: '支援カテゴリの武器を置ける数 +{e} 基',
    cost0: 260, costG: 2.6, max: 4, unlock: 0 },

  // ============ カード側の枠を増やす ============
  { id: 'picks', name: '増設スロット', icon: '★', group: 'カード',
    eff: 1, mode: 'add', tmpl: 'ウェーブ突破ごとに取れるカードが +{e} 枚',
    cost0: 900, costG: 6.0, max: 3, unlock: 2 },
  { id: 'choices', name: '選択肢拡張', icon: '✧', group: 'カード',
    eff: 1, mode: 'add', tmpl: 'カード選択の提示枚数 +{e}（3択 → 4択 …）',
    cost0: 500, costG: 4.2, max: 3, unlock: 2 },
  { id: 'luck', name: '幸運回路', icon: '✧', group: 'カード',
    eff: 1, mode: 'add', tmpl: 'カード選択で高レアリティが出やすくなる',
    cost0: 120, costG: 1.55, max: 25, unlock: 1 },
  { id: 'pack', name: '解析装置', icon: '⬢', group: 'カード',
    eff: 1, mode: 'add', tmpl: '転生で得るカードパックの等級が上がりやすくなる',
    cost0: 300, costG: 1.80, max: 12, unlock: 3 },

  // ============ 危険と引き換え ============
  { id: 'lure', name: '敵誘引', icon: '☠', group: '危険',
    eff: 0.12, mode: 'add', tmpl: '敵の出現数 +{e}倍 / コイン獲得 +6%（危険だが儲かる）',
    cost0: 40, costG: 1.45, max: 60, unlock: 1 },
];

const SKILL_BY_ID = {};
for (const s of SKILLS) SKILL_BY_ID[s.id] = s;

// ============ 換装（パックの3択で出る、既存ノードの差し替え） ============
//
//   **差し替わるのは「効き方」だけ。** 値段・上限・解放条件・カテゴリ・
//   買ったレベルは元のまま引き継ぐ。強くなるのではなく、伸ばす方向が変わる。
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
  { id: 'sw_target_rng', base: 'target_rate', name: '遠隔誘導', icon: '✛', key: 'range',
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
    const base = (p && typeof Relic !== 'undefined') ? Relic.mods(p).startLv : 0;
    const s = SKILL_BY_ID[id];
    const lv = (meta.skills[id] || 0) + base;
    return s ? Math.min(lv, s.max) : lv;
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

  cost(meta, id) {
    const s = SKILL_BY_ID[id];
    return Math.ceil(s.cost0 * Math.pow(s.costG, Skill.lv(meta, id)));
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

  canBuy(meta, perm, id) {
    const s = SKILL_BY_ID[id];
    if (!Skill.isUnlocked(perm, id)) return false;
    if (Skill.lv(meta, id) >= s.max) return false;
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

  // 換装できる候補。**買っていないノードは換えられない**（換える意味が無い）
  swapChoices(meta, perm, n) {
    const pool = SWAPS.filter(sw =>
      Skill.isUnlocked(perm, sw.base) &&
      Skill.lv(meta, sw.base) > 0 &&
      (!perm.swaps || perm.swaps[sw.base] !== sw.id));
    Util.shuffle(pool);
    return pool.slice(0, n || 3);
  },

  applySwap(perm, swapId) {
    const sw = SWAP_BY_ID[swapId];
    if (!sw) return false;
    if (!perm.swaps) perm.swaps = {};
    perm.swaps[sw.base] = sw.id;
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
      coin:   A('coin') * (1 + 0.06 * Skill.lv(meta, 'lure')) * R.coin,
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
