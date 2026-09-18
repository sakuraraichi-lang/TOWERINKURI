// ---------------------------------------------------------------
// skilltree.js : インクリメンタル側。ここは「数字を大きくする」だけ
//   武器の挙動は一切変えない（それはカードの担当）
//
//   火力系は武器カテゴリ単位で上げる。武器が増えても
//   「短射程を伸ばすビルド」「支援を伸ばすビルド」という選択が残るようにするため
// ---------------------------------------------------------------
'use strict';

const SKILLS = [
  // ============ 資源・拠点 ============
  { id: 'coin', name: '集金効率', icon: '◈', group: '資源',
    desc: '敵から得るコイン ×1.13', cost0: 15, costG: 1.30, max: Infinity, unlock: 0 },
  { id: 'core', name: '装甲板', icon: '▣', group: '拠点',
    desc: 'コアの最大HP ×1.18', cost0: 22, costG: 1.32, max: Infinity, unlock: 0 },
  { id: 'regen', name: '応急修理班', icon: '✚', group: '拠点',
    desc: 'ウェーブを1つ突破するごとに、コアHPを最大値の6%回復', cost0: 60, costG: 1.45, max: 12, unlock: 1 },

  // ============ カテゴリ別（その分類の武器を1つでも持つと解放） ============
  { id: 'short_dmg', name: '近接兵装', icon: '◤', group: '短射程', cat: 'short',
    desc: '短射程カテゴリのダメージ ×1.15', cost0: 30, costG: 1.30, max: Infinity, unlock: 0 },
  { id: 'short_rng', name: '間合い拡張', icon: '◤', group: '短射程', cat: 'short',
    desc: '短射程カテゴリの射程 ×1.09', cost0: 45, costG: 1.36, max: 30, unlock: 0 },

  { id: 'mid_dmg', name: '汎用弾薬', icon: '◈', group: '中射程', cat: 'mid',
    desc: '中射程カテゴリのダメージ ×1.13', cost0: 25, costG: 1.28, max: Infinity, unlock: 0 },
  { id: 'mid_rate', name: '給弾機構', icon: '◈', group: '中射程', cat: 'mid',
    desc: '中射程カテゴリの発射レート ×1.07', cost0: 40, costG: 1.34, max: 40, unlock: 0 },

  { id: 'long_dmg', name: '徹甲弾頭', icon: '◎', group: '長射程', cat: 'long',
    desc: '長射程カテゴリのダメージ ×1.18', cost0: 38, costG: 1.31, max: Infinity, unlock: 0 },
  { id: 'long_crit', name: '照準計算機', icon: '◎', group: '長射程', cat: 'long',
    desc: '長射程カテゴリの 会心率 +4% / 会心倍率 +0.15', cost0: 90, costG: 1.42, max: 20, unlock: 0 },

  { id: 'area_dmg', name: '高熱反応', icon: '▲', group: '範囲攻撃', cat: 'area',
    desc: '範囲攻撃カテゴリのダメージ ×1.14', cost0: 34, costG: 1.30, max: Infinity, unlock: 0 },
  { id: 'area_size', name: '拡散増幅', icon: '▲', group: '範囲攻撃', cat: 'area',
    desc: '範囲攻撃カテゴリの効果範囲 ×1.10（扇・爆風・撒いた場すべて）', cost0: 70, costG: 1.38, max: 25, unlock: 0 },

  { id: 'target_dmg', name: '成形炸薬', icon: '✛', group: '指定攻撃', cat: 'target',
    desc: '指定攻撃カテゴリのダメージ ×1.16', cost0: 36, costG: 1.31, max: Infinity, unlock: 0 },
  { id: 'target_rate', name: '装填補助', icon: '✛', group: '指定攻撃', cat: 'target',
    desc: '指定攻撃カテゴリの発射レート ×1.08', cost0: 65, costG: 1.36, max: 30, unlock: 0 },

  { id: 'sup_pow', name: '制圧出力', icon: '❉', group: '支援', cat: 'support',
    desc: '支援カテゴリの 減速・拘束・感電の持続 ×1.12', cost0: 55, costG: 1.34, max: 25, unlock: 0 },
  { id: 'sup_rng', name: '照射範囲', icon: '❉', group: '支援', cat: 'support',
    desc: '支援カテゴリの射程・効果範囲 ×1.10', cost0: 55, costG: 1.34, max: 25, unlock: 0 },

  // ============ カード側の枠を増やす ============
  { id: 'picks', name: '増設スロット', icon: '★', group: 'カード',
    desc: 'ウェーブ突破ごとに取れるカードが +1 枚', cost0: 900, costG: 6.0, max: 3, unlock: 2 },
  { id: 'choices', name: '選択肢拡張', icon: '✧', group: 'カード',
    desc: 'カード選択の提示枚数 +1（3択 → 4択 …）', cost0: 500, costG: 4.2, max: 3, unlock: 2 },
  { id: 'luck', name: '幸運回路', icon: '✧', group: 'カード',
    desc: 'カード選択で高レアリティが出やすくなる', cost0: 120, costG: 1.55, max: 25, unlock: 1 },
  { id: 'pack', name: '解析装置', icon: '⬢', group: 'カード',
    desc: '転生で得るカードパックの等級が上がりやすくなる', cost0: 300, costG: 1.80, max: 12, unlock: 3 },

  // ============ 危険と引き換え ============
  { id: 'lure', name: '敵誘引', icon: '☠', group: '危険',
    desc: '敵の出現数 +12% / コイン獲得 +6%（危険だが儲かる）', cost0: 40, costG: 1.45, max: 60, unlock: 1 },
];

const SKILL_BY_ID = {};
for (const s of SKILLS) SKILL_BY_ID[s.id] = s;

const Skill = {
  lv(meta, id) { return meta.skills[id] || 0; },

  cost(meta, id) {
    const s = SKILL_BY_ID[id];
    return Math.ceil(s.cost0 * Math.pow(s.costG, Skill.lv(meta, id)));
  },

  // カテゴリのノードは、そのカテゴリの武器を1つでも持っていれば解放される
  isUnlocked(perm, id) {
    const s = SKILL_BY_ID[id];
    if (s.cat) {
      return WEAPON_IDS.some(wid => WEAPONS[wid].cat === s.cat && (perm.collection['wc_' + wid] || 0) > 0);
    }
    const cleared = STAGES.filter(x => (perm.stages[x.id] || {}).cleared).length;
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
    meta.skills[id] = Skill.lv(meta, id) + 1;
    return true;
  },

  // スキルツリー＋転生ボーナスを、出撃時の倍率一式にまとめる
  mods(meta, perm) {
    const L = (id) => Skill.lv(meta, id);
    // 転生は乗算。1周期ぶんの頭打ちを越えるための唯一の手段なので、加算では足りない
    const pw = Math.pow(BAL.prestigePower, perm.prestiges);
    return {
      coin:   Math.pow(1.13, L('coin')) * Math.pow(1.06, L('lure')) * pw,
      hp:     Math.pow(1.18, L('core')),
      regen:  L('regen') * 0.06,          // ウェーブ突破ごとに最大HPのこの割合を回復
      spawn:  1 + 0.12 * L('lure'),
      luck:   L('luck'),
      packLuck: L('pack'),
      picks:   1 + L('picks'),            // ウェーブ突破ごとに取れる枚数
      choices: BAL.draftSize + L('choices'),
      prestige: pw,
      cat: {
        short:   { dmg: Math.pow(1.15, L('short_dmg')) * pw,  range: Math.pow(1.09, L('short_rng')) },
        mid:     { dmg: Math.pow(1.13, L('mid_dmg')) * pw,    rate:  Math.pow(1.07, L('mid_rate')) },
        long:    { dmg: Math.pow(1.18, L('long_dmg')) * pw,   crit:  0.04 * L('long_crit'),
                   critMul: 0.15 * L('long_crit') },
        area:    { dmg: Math.pow(1.14, L('area_dmg')) * pw,   size:  Math.pow(1.10, L('area_size')) },
        target:  { dmg: Math.pow(1.16, L('target_dmg')) * pw, rate:  Math.pow(1.08, L('target_rate')) },
        support: { dur: Math.pow(1.12, L('sup_pow')),         range: Math.pow(1.10, L('sup_rng')) },
      },
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
