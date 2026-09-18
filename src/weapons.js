// ---------------------------------------------------------------
// weapons.js : 武器の定義。基礎性能はスキルツリーが、挙動はカードが変える
//
//   入手経路が3系統に分かれている
//     初期装備   … ガトリング / スナイパー
//     ステージ報酬… ミサイル / テスラコイル / 火炎放射器 / 毒ガス / 凍結装置
//                   （タワーディフェンスの王道＋化学兵器）
//     パック     … 刀 / 手裏剣 / 触手 / 泡（なんでもあり枠）
// ---------------------------------------------------------------
'use strict';

// 武器カテゴリ。スキルツリーはこのカテゴリ単位でバフを入れる
const CATEGORIES = {
  short:   { id: 'short',   name: '短射程',   icon: '◤', color: '#ff8f6a',
             desc: '間合いは狭いが、入った敵をまとめて溶かす' },
  mid:     { id: 'mid',     name: '中射程',   icon: '◈', color: '#ffd24a',
             desc: '扱いやすい距離と手数。通路の脇に置く定番' },
  long:    { id: 'long',    name: '長射程',   icon: '◎', color: '#6fe3ff',
             desc: '盤面の広い範囲を1基で見られる。単発が重い' },
  area:    { id: 'area',    name: '範囲攻撃', icon: '▲', color: '#ff6a2a',
             desc: '一度に広い面を焼く。密集しているほど強い' },
  target:  { id: 'target',  name: '指定攻撃', icon: '✛', color: '#c9a0ff',
             desc: '狙う一点を自分で選ぶ。溜まり場に撃ち込む' },
  support: { id: 'support', name: '支援',     icon: '❉', color: '#7fe6ff',
             desc: '直接は倒さない。足を止め、他の武器の時間を作る' },
};
const CATEGORY_IDS = ['short', 'mid', 'long', 'area', 'target', 'support'];

function baseStats(o) {
  return Object.assign({
    dmg: 10,        // 1発（1ヒット）の基礎ダメージ
    rate: 1,        // 毎秒発射回数
    range: 200,     // 射程
    count: 1,       // 同時発射数
    spread: 0.05,   // 散布(rad)
    speed: 600,     // 弾速
    pierce: 0,      // 貫通回数
    bulletR: 3,     // 弾の当たり半径
    splash: 0,      // 爆風半径
    splashMul: 0.75,// 爆風ダメージ倍率
    chain: 0,       // 連鎖数
    chainFalloff: 0.8,
    homing: 0,      // 誘導強度
    crit: 0,        // 会心率
    critMul: 2,     // 会心倍率
    burn: 0,        // 燃焼DPS（この値×dmg が毎秒入る）
    burnDur: 0,     // 燃焼の持続秒
    shockDur: 0,    // 感電付与秒
    execThr: 0,     // 処刑閾値(残HP割合)
    bounce: 0,      // 跳弾回数
    slow: 0,        // 減速の強さ(0-1)
    slowDur: 0,     // 減速の持続秒
    stunDur: 0,     // 拘束の持続秒
    knock: 0,       // 引き戻しの強さ(px/s)
    knockDur: 0,
    cone: 0,        // 扇の半角(rad)。0なら扇ではない
    fieldR: 0,      // 設置する場の半径
    fieldDur: 0,    // 場の持続秒
    arc: 0.40,      // 射界の半角(rad)。プレイヤーが広げ狭めできる初期値
    turn: 7,        // 砲身が扇の中で振れる速さ(rad/s)。向きそのものは動かない
  }, o);
}

const WEAPONS = {
  // ============ 初期装備 ============
  gatling: {
    id: 'gatling', stock: 6, cat: 'mid', name: 'ガトリング', short: 'GAT', color: '#ffd24a', src: 'start',
    desc: '毎秒大量の小口径弾。単発は弱いが手数で押す。',
    target: 'closest',
    base: baseStats({ arc: 0.34, dmg: 3.2, rate: 5.5, range: 195, spread: 0.07, speed: 640, bulletR: 2.6, turn: 9 }),
    fire(w, run) {
      for (let i = 0; i < w.s.count; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.s.count > 1 ? w.s.count * 0.7 : 1);
        Combat.spawnBullet(w, run, a, { color: '#ffd24a' });
      }
      if (w.flags.heat) w.dyn.heat = Math.min(1, w.dyn.heat + 0.035);
      if (w.flags.tracerBarrage) {
        w.dyn.tracer = (w.dyn.tracer || 0) + w.s.count;
        if (w.dyn.tracer >= 10) {
          w.dyn.tracer = 0;
          Combat.spawnBullet(w, run, w.angle, { color: '#ff7a3c', speedMul: 0.5, dmgMul: 2.2, splash: 55, bulletR: 5, homing: 3 });
        }
      }
    },
  },

  sniper: {
    id: 'sniper', stock: 4, cat: 'long', name: 'スナイパー', short: 'SNP', color: '#6fe3ff', src: 'start',
    desc: '長射程・高威力の単発。最も硬い敵を撃ち抜く。',
    target: 'strongest',
    base: baseStats({ arc: 0.16, dmg: 34, rate: 0.78, range: 430, spread: 0.012, speed: 1500, pierce: 1, bulletR: 4, turn: 3.5 }),
    fire(w, run) {
      for (let i = 0; i < w.s.count; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (i === 0 ? 1 : w.s.count);
        Combat.spawnBullet(w, run, a, { color: '#6fe3ff', long: true });
      }
      Combat.shake(run, 2.2);
    },
  },

  // ============ ステージ報酬（王道TD＋化学兵器） ============
  missile: {
    id: 'missile', stock: 3, cat: 'long', name: 'ミサイル', short: 'MSL', color: '#ff7a3c', src: 'stage',
    desc: '誘導して着弾時に爆発。群れをまとめて吹き飛ばす。',
    target: 'lead',
    base: baseStats({ arc: 0.30, dmg: 16, rate: 1.0, range: 330, spread: 0.18, speed: 310, splash: 72, bulletR: 5, homing: 3.4, turn: 5 }),
    fire(w, run) {
      for (let i = 0; i < w.s.count; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.s.count > 1 ? w.s.count : 1);
        Combat.spawnBullet(w, run, a, { color: '#ff7a3c' });
      }
      Combat.shake(run, 1.4);
    },
  },

  tesla: {
    id: 'tesla', stock: 3, cat: 'short', name: 'テスラコイル', short: 'TSL', color: '#b58bff', src: 'stage',
    desc: '射程内の敵へ即着の電撃。連鎖して何体も巻き込む。',
    target: 'closest',
    base: baseStats({ arc: 0.55, dmg: 11, rate: 1.6, range: 170, chain: 2, chainFalloff: 0.82 }),
    fire(w, run) {
      if (!w.target) return;
      Combat.chainLightning(w, run, w.target, w.s.chain, w.s.dmg);
      Combat.shake(run, 0.8);
    },
  },

  flame: {
    id: 'flame', stock: 4, cat: 'area', name: '火炎放射器', short: 'FLM', color: '#ff6a2a', src: 'stage',
    desc: '短射程の扇状に炎を吹き続ける。当たった敵は燃え続ける。',
    target: 'closest',
    base: baseStats({ arc: 0.50, dmg: 3.4, rate: 9, range: 130, cone: 0.42, burn: 0.55, burnDur: 3, turn: 5 }),
    fire(w, run) {
      Combat.coneDamage(w, run, w.angle, w.s.cone, w.s.range, w.s.dmg, {
        color: '#ffb066', burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur,
      });
      Combat.fx(run, { type: 'cone', x: w.x, y: w.y, a: w.angle, arc: w.s.cone,
        r: w.s.range, color: '#ff8a3a', life: 0.13 });
      // ナパーム：炎の届く先に火の海を残す（毎発だと増えすぎるので間引く）
      if (w.flags.napalm && Util.chance(0.12)) {
        Combat.spawnField(run, w.x + Math.cos(w.angle) * w.s.range * 0.75,
                               w.y + Math.sin(w.angle) * w.s.range * 0.75,
          { kind: 'fire', r: 52, dur: 3, dps: w.s.dmg * w.s.burn * 1.6, color: '#ff8a3a' });
      }
    },
  },

  gas: {
    id: 'gas', stock: 2, cat: 'area', name: '毒ガス散布機', short: 'GAS', color: '#8fd94a', src: 'stage',
    desc: '毒の雲を通路に撒く。雲の中の敵は毒を受け続け、防御が落ちる。',
    target: 'lead',
    base: baseStats({ arc: 0.30, dmg: 7, rate: 0.42, range: 300, speed: 260, bulletR: 5,
                      fieldR: 76, fieldDur: 5.5, slow: 0.15, slowDur: 1 }),
    fire(w, run) {
      if (!w.target) return;
      Combat.spawnLob(w, run, w.target.x, w.target.y, {
        color: '#8fd94a',
        onLand: (rr, x, y) => Combat.spawnField(rr, x, y, {
          kind: 'gas', r: w.s.fieldR, dur: w.s.fieldDur, dps: w.s.dmg,
          slow: w.s.slow, vuln: 0.2, color: '#8fd94a', src: w,
        }),
      });
    },
  },

  cryo: {
    id: 'cryo', stock: 2, cat: 'support', name: '凍結装置', short: 'CRY', color: '#7fe6ff', src: 'stage',
    desc: '周囲へ冷気を放つ。敵は大きく減速し、凍った敵は受けるダメージが増える。',
    target: 'closest',
    base: baseStats({ arc: 0.75, dmg: 6, rate: 0.9, range: 165, slow: 0.55, slowDur: 2.4 }),
    fire(w, run) {
      Combat.pulse(w, run, w.s.range, w.s.dmg, {
        color: '#bff0ff', slow: w.s.slow, slowDur: w.s.slowDur, chill: true,
      });
      Combat.fx(run, { type: 'ring', x: w.x, y: w.y, r: w.s.range, color: '#7fe6ff', life: 0.35 });
    },
  },

  // ============ パック限定（なんでもあり枠） ============
  katana: {
    id: 'katana', stock: 5, cat: 'short', name: '刀', short: 'KTN', color: '#f4f6fb', src: 'pack',
    desc: '間合いに入った敵をまとめて斬る。射程は短いが一撃が重く、会心が乗る。',
    target: 'closest',
    base: baseStats({ arc: 0.80, dmg: 58, rate: 1.5, range: 100, cone: 1.5, crit: 0.2, critMul: 2.5, turn: 12 }),
    fire(w, run) {
      Combat.coneDamage(w, run, w.angle, w.s.cone, w.s.range, w.s.dmg, {
        color: '#ffffff', crit: w.s.crit, critMul: w.s.critMul, exec: w.s.execThr,
      });
      Combat.fx(run, { type: 'slash', x: w.x, y: w.y, a: w.angle, arc: w.s.cone,
        r: w.s.range, color: '#ffffff', life: 0.18 });
      Combat.shake(run, 1.6);
    },
  },

  shuriken: {
    id: 'shuriken', stock: 5, cat: 'mid', name: '手裏剣', short: 'SHU', color: '#cdd9e8', src: 'pack',
    desc: '敵から敵へ跳ね回る投擲。密集しているほど手が付けられなくなる。',
    target: 'closest',
    base: baseStats({ arc: 0.38, dmg: 13, rate: 2.2, range: 230, speed: 520, bulletR: 5, bounce: 3, turn: 10 }),
    fire(w, run) {
      for (let i = 0; i < w.s.count; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.s.count > 1 ? w.s.count : 1);
        Combat.spawnBullet(w, run, a, { color: '#cdd9e8', spin: true });
      }
    },
  },

  tentacle: {
    id: 'tentacle', stock: 2, cat: 'support', name: '触手', short: 'TNT', color: '#c85ab0', src: 'pack',
    desc: 'コアに一番近い敵を掴んで来た道へ引き戻す。掴まれている間は削られ続ける。',
    target: 'lead',
    base: baseStats({ arc: 0.34, dmg: 16, rate: 0.85, range: 210, knock: 105, knockDur: 1.3, turn: 9 }),
    fire(w, run) {
      const t = w.target;
      if (!t) return;
      Combat.grab(w, run, t, w.s.knock, w.s.knockDur, w.s.dmg);
    },
  },

  bubble: {
    id: 'bubble', stock: 3, cat: 'target', name: '泡', short: 'BBL', color: '#8ad8ff', src: 'pack',
    desc: '敵を泡に閉じ込めて足を止める。泡が割れるとまとめてダメージ。',
    target: 'lead',
    base: baseStats({ arc: 0.34, dmg: 10, rate: 1.1, range: 250, speed: 220, bulletR: 9,
                      stunDur: 1.8, splash: 58, splashMul: 1.0, homing: 2.2 }),
    fire(w, run) {
      for (let i = 0; i < w.s.count; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.s.count > 1 ? w.s.count : 1);
        Combat.spawnBullet(w, run, a, { color: '#8ad8ff', bubble: true });
      }
    },
  },

  mortar: {
    id: 'mortar', stock: 2, cat: 'target', name: '迫撃砲', short: 'MTR', color: '#e0b060', src: 'stage',
    desc: '敵が最も密集している一点へ砲弾を撃ち込む。射程は長いが発射は遅い。',
    target: 'dense',
    base: baseStats({ arc: 0.26, dmg: 42, rate: 0.55, range: 420, speed: 240, bulletR: 6,
                      splash: 96, splashMul: 1.0, turn: 2.4 }),
    fire(w, run) {
      const p = w.aim;                      // findTarget が決めた「撃ち込む一点」
      if (!p) return;
      for (let i = 0; i < w.s.count; i++) {
        const jx = i === 0 ? 0 : Util.rand(-w.s.splash * 0.5, w.s.splash * 0.5);
        const jy = i === 0 ? 0 : Util.rand(-w.s.splash * 0.5, w.s.splash * 0.5);
        Combat.spawnLob(w, run, p.x + jx, p.y + jy, {
          color: '#e0b060', mark: true,
          onLand: (rr, x, y) => Combat.explode(rr, x, y, w.s.splash, w.s.dmg * w.s.splashMul,
            { color: '#ffc38a', shock: w.s.shockDur, burn: w.s.burn ? w.s.dmg * w.s.burn : 0, burnDur: w.s.burnDur }),
        });
      }
      Combat.shake(run, 2.6);
    },
  },
};

const WEAPON_IDS = Object.keys(WEAPONS);
