// ---------------------------------------------------------------
// skilltree.js : インクリメンタル側。ここは「数字を大きくする」だけ
//   武器の挙動は一切変えない（それはカードの担当）
// ---------------------------------------------------------------
'use strict';

const SKILLS = [
  { id: 'dmg', name: '火力増幅', icon: '⚔', group: '火力',
    desc: '全武器の基礎ダメージ ×1.10', cost0: 12, costG: 1.30, max: Infinity, unlock: 0 },
  { id: 'rate', name: '装填機構', icon: '⟳', group: '火力',
    desc: '全武器の発射レート ×1.055', cost0: 20, costG: 1.34, max: Infinity, unlock: 0 },
  { id: 'range', name: '照準精度', icon: '◎', group: '火力',
    desc: '全武器の射程 ×1.05', cost0: 18, costG: 1.34, max: 40, unlock: 0 },

  { id: 'coin', name: '集金効率', icon: '◈', group: '資源',
    desc: '敵から得るコイン ×1.13', cost0: 15, costG: 1.30, max: Infinity, unlock: 0 },
  { id: 'xp', name: '戦闘記録', icon: '✦', group: '資源',
    desc: '獲得経験値 ×1.12', cost0: 25, costG: 1.34, max: Infinity, unlock: 0 },

  { id: 'hp', name: '装甲板', icon: '▣', group: '拠点',
    desc: 'コアの最大HP ×1.18', cost0: 22, costG: 1.32, max: Infinity, unlock: 0 },
  { id: 'regen', name: '自動修復', icon: '✚', group: '拠点',
    desc: 'コアHPを毎秒 +0.6 回復', cost0: 60, costG: 1.45, max: Infinity, unlock: 5 },

  { id: 'spawn', name: '敵誘引', icon: '☠', group: '危険',
    desc: '敵の出現数 +12% / コイン獲得 +5%（危険だが儲かる）', cost0: 40, costG: 1.45, max: 60, unlock: 8 },
  { id: 'wave', name: '進軍速度', icon: '»', group: '危険',
    desc: '敵の湧く間隔 -7%（ウェーブが速く進む）', cost0: 35, costG: 1.42, max: 30, unlock: 12 },

  { id: 'luck', name: '幸運回路', icon: '✧', group: 'メタ',
    desc: '3択カードの高レアリティ出現率が上がる', cost0: 120, costG: 1.90, max: 25, unlock: 15 },
  { id: 'pack', name: '解析装置', icon: '⬢', group: 'メタ',
    desc: '転生で得るカードパックの等級が上がりやすくなる', cost0: 300, costG: 2.10, max: 12, unlock: 20 },
  { id: 'head', name: '初期投資', icon: '★', group: 'メタ',
    desc: 'ラン開始時にレベル +1（＝開幕から3択カードを引ける）', cost0: 500, costG: 2.60, max: 6, unlock: 25 },
];

const SKILL_BY_ID = {};
for (const s of SKILLS) SKILL_BY_ID[s.id] = s;

const Skill = {
  lv(meta, id) { return meta.skills[id] || 0; },

  cost(meta, id) {
    const s = SKILL_BY_ID[id];
    return Math.ceil(s.cost0 * Math.pow(s.costG, Skill.lv(meta, id)));
  },

  isUnlocked(perm, id) {
    return perm.bestWave >= SKILL_BY_ID[id].unlock;
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
    Game.refreshMods();   // 走行中のランにも即反映する
    return true;
  },

  // スキルツリー＋転生ボーナスを、ラン開始時の倍率一式にまとめる
  mods(meta, perm) {
    const L = (id) => Skill.lv(meta, id);
    // 転生は乗算。1周期ぶんの頭打ちを越えるための唯一の手段なので、加算では足りない
    const pw = Math.pow(BAL.prestigePower, perm.prestiges);
    return {
      dmg:    Math.pow(1.10,  L('dmg')) * pw,
      rate:   Math.pow(1.055, L('rate')),
      range:  Math.pow(1.05,  L('range')),
      coin:   Math.pow(1.13,  L('coin')) * Math.pow(1.05, L('spawn')) * pw,
      xp:     Math.pow(1.12,  L('xp')),
      hp:     Math.pow(1.18,  L('hp')),
      regen:  L('regen') * BAL.coreRegenPerLv,
      spawn:  1 + 0.12 * L('spawn'),
      waveSpd: Math.pow(0.93, L('wave')),
      luck:   L('luck'),
      packLuck: L('pack'),
      headStart: L('head'),
    };
  },
};
