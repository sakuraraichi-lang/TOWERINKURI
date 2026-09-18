// ---------------------------------------------------------------
// weapons.js : 武器4種の定義。基礎性能はスキルツリーが、挙動はカードが変える
// ---------------------------------------------------------------
'use strict';

// 1つの武器がラン中に持つ全ステータスの初期値
function baseStats(o) {
  return Object.assign({
    dmg: 10,        // 1発の基礎ダメージ
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
    burn: 0,        // 燃焼DPS倍率
    shockDur: 0,    // 感電付与秒
    execThr: 0,     // 処刑閾値(残HP割合)
    bounce: 0,      // 跳弾
    slow: 0,        // 命中時の減速率
    turn: 7,        // 旋回速度(rad/s)
  }, o);
}

const WEAPONS = {
  gatling: {
    id: 'gatling', name: 'ガトリング', short: 'GAT', color: '#ffd24a',
    desc: '毎秒大量の小口径弾をばら撒く。単発は弱いが手数で押す。',
    target: 'closest',
    base: baseStats({ dmg: 3.2, rate: 5.5, range: 195, spread: 0.07, speed: 640, bulletR: 2.6, turn: 9 }),
    fire(w, run) {
      for (let i = 0; i < w.s.count; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.s.count > 1 ? w.s.count * 0.7 : 1);
        Combat.spawnBullet(w, run, a, { color: '#ffd24a', trail: 0.45 });
      }
      // カード「加熱暴走」: 撃つほどレートが上がる
      if (w.flags.heat) w.dyn.heat = Math.min(1, w.dyn.heat + 0.035);
      // カード「曳光弾幕」: n発ごとにミニミサイル
      if (w.flags.tracerBarrage) {
        w.dyn.tracer = (w.dyn.tracer || 0) + w.s.count;
        if (w.dyn.tracer >= 10) {
          w.dyn.tracer = 0;
          Combat.spawnBullet(w, run, w.angle, {
            color: '#ff7a3c', speedMul: 0.5, dmgMul: 2.2, splash: 55, bulletR: 5, homing: 3, trail: 0.9,
          });
        }
      }
    },
  },

  sniper: {
    id: 'sniper', name: 'スナイパー', short: 'SNP', color: '#6fe3ff',
    desc: '長射程・高威力の単発。最も硬い敵を撃ち抜く。',
    target: 'strongest',
    base: baseStats({ dmg: 34, rate: 0.78, range: 430, spread: 0.012, speed: 1500, pierce: 1, bulletR: 4, turn: 3.5 }),
    fire(w, run) {
      for (let i = 0; i < w.s.count; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (i === 0 ? 1 : w.s.count);
        Combat.spawnBullet(w, run, a, { color: '#6fe3ff', trail: 1.4, long: true });
      }
      Combat.shake(run, 2.2);
    },
  },

  missile: {
    id: 'missile', name: 'ミサイル', short: 'MSL', color: '#ff7a3c',
    desc: '誘導して着弾時に爆発。群れをまとめて吹き飛ばす。',
    target: 'nearest',
    base: baseStats({ dmg: 16, rate: 1.0, range: 330, spread: 0.18, speed: 310, splash: 72, bulletR: 5, homing: 3.4, turn: 5 }),
    fire(w, run) {
      for (let i = 0; i < w.s.count; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.s.count > 1 ? w.s.count : 1);
        Combat.spawnBullet(w, run, a, { color: '#ff7a3c', trail: 1.0, smoke: true });
      }
      Combat.shake(run, 1.4);
    },
  },

  tesla: {
    id: 'tesla', name: 'テスラ', short: 'TSL', color: '#b58bff',
    desc: '射程内の敵へ即着の電撃。連鎖して何体も巻き込む。',
    target: 'closest',
    base: baseStats({ dmg: 11, rate: 1.6, range: 170, chain: 2, chainFalloff: 0.82, shockDur: 0 }),
    fire(w, run) {
      const t = w.target;
      if (!t) return;
      Combat.chainLightning(w, run, t, w.s.chain, w.s.dmg);
      Combat.shake(run, 0.8);
    },
  },
};

const WEAPON_IDS = ['gatling', 'sniper', 'missile', 'tesla'];
