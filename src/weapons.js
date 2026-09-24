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
  // ミサイルを指定攻撃へ移したので、いまここはスナイパー1本。
  // 「広い範囲を1基で見る」のは指定攻撃の仕事になったため、説明もそれに合わせた
  long:    { id: 'long',    name: '長射程',   icon: '◎', color: '#6fe3ff',
             desc: '遠くの一線を撃ち抜く。狙いを絞るほど報われる' },
  area:    { id: 'area',    name: '範囲攻撃', icon: '▲', color: '#ff6a2a',
             desc: '一度に広い面を焼く。密集しているほど強い' },
  target:  { id: 'target',  name: '指定攻撃', icon: '✛', color: '#c9a0ff',
             desc: '盤面に円を置き、その中へ降らせる。射線を持たない' },
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
    fieldVuln: 0,   // 場の中の敵が受けるダメージの増分（0.2 = +20%）
    arc: 0.40,      // 射界の半角(rad)。プレイヤーが広げ狭めできる初期値
                    // **指定攻撃ではこれが「着弾円の大きさ」のつまみになる**
    turn: 7,        // 砲身が扇の中で振れる速さ(rad/s)。向きそのものは動かない
  }, o);
}

// ---------------------------------------------------------------
// 指定攻撃（cat:'target' / aimPoint:true）の決まりごと
//
//   **この分類だけは、砲身から敵へ弾が飛ばない。**
//   プレイヤーが盤面に円を置き、砲弾がその中のランダムな点へ降る。
//
//   1. 砲弾は着弾するまで当たり判定を持たない。敵も壁も素通りする
//      → 射線を持たないので、スナイパーやガトリングが欲しい地面を食わない。
//        **好きな場所に置ける**のが、この分類の対価
//   2. 円を絞るほど強い。**倍率は掛けていない。**
//        絞る → 同じ発射数が狭い面に落ちる → 同じ敵に重なる
//        広げる → 道を外した砲弾はただの空振りになる
//   3. spot:[最小半径, 最大半径] が、そのつまみの効く幅（px）
// ---------------------------------------------------------------


// ---------------------------------------------------------------
// **武器の大きさという概念は無い。どの武器も六角1つ。**（2026-09-23・ユーザー指示で撤去）
//   以前ここにあった `FOOT`（武器ごとに要る設置マス）は、壁の中に埋め込めた頃の名残。
//   いまは弾が壁を抜けないので、置ける場所が壁沿いに限られること自体が重みになっている。
//   設置の判定は `Game.canPlaceAt(c, r)`（state.js）
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// **置ける数（stock）で強さの釣り合いを取る。**（ユーザー 2026-09-24）
//   > 「同じダメージ目標にせず、単純に強い奴は設置上限数が低く、ガトリングのような
//   >   弱い手数武器は多く置ける分取り回しやすい、という方向に」
//   上限 ＝ stock ＋ BAL.unitBonus(1) ＋ カテゴリの置ける数の節（2段）。
//   **上限は「半分の回数で持ちこたえるのに要る基数」に比例させた**（ガトリング8基が基準）。
//   実測（第15章・武器1種だけ・測定ごとに新しいセーブ・各12本。漏れ50以下を「持ちこたえた」）：
//     凍結3.5 火炎3.7 泡4 ミサイル6.8 手裏剣6.8 ガトリング8 刀8.4 テスラ9 迫撃10 スナイパー/毒ガス/触手10超
//   全部取ったときの上限：凍結4 火炎4 泡4 ミサイル7 手裏剣7 ガトリング8 刀8 テスラ9 迫撃10 スナイパー11 毒ガス11 触手11
//   **カテゴリ単位では差を付けていない。**同じカテゴリの中で強弱が大きく割れているため
//   （支援：凍結3.5／触手10超、範囲：火炎3.7／毒ガス10超、指定：泡4／迫撃10）
// ---------------------------------------------------------------
const WEAPONS = {
  // ============ 初期装備 ============
  gatling: {
    id: 'gatling', stock: 5, cat: 'mid', name: 'ガトリング', short: 'GAT', icon: '🔫', color: '#ffd24a', src: 'start', arcMin: 0.1, arcMax: 0.8,
    desc: '毎秒大量の小口径弾。単発は弱いが手数で押す。',
    //   **唯一の初期武器なので、これ1種で第1〜2章を持たせる必要がある。**（2026-09-21）
    //   ユーザー決定「初期武器はガトリングでよし」で初期所持を1種に絞ったが、
    //   **設置上限は武器の種類ごと**（`Game.unitCap`）なので、
    //   盤面が 8基 → 4基 に半減していた。しかも測定器だけスナイパーを
    //   最初から持っていたため、この状態が一度も測られていなかった。
    //
    //   実測（3シード・突破に何回挑戦したか）：
    //     dmg 3.2 貫通0 … 第1章 9,8,10回  第2章 6,12回超,8回
    //     dmg 6   貫通0 … 第1章 2,2,2回   第2章 7,8,6回
    //     dmg 6   貫通1 … 第1章 2,2,2回   第2章 2,2,2回   ← これ
    //     dmg 9   貫通2 … 第1章 2,2,2回   第2章 1,1,1回   （第2章が素通りになる）
    //
    //   **貫通1が効くのは、砲身が敵を追わないから。**
    //   首振りが通路を撫でる一瞬に、列になった敵へ2体ぶん入る。
    //   ダメージだけ上げても第2章の密度に追いつかなかった（上の2行目）
    //
    // **【2026-09-22】設置マスと壁で序盤が持たなくなったので上げ直した。**
    //   上の実測は**壁で射線を切る前**のもの。いま同じ設定で本物の周回を10シード回すと、
    //   第1章は2回で抜けるが**第2章で3〜6回かかり、3シードが打ち切り**になっていた
    //   （記録では両方2回だった）。
    //   周1で到達した章（10シード）：
    //     dmg6 貫通1 … 3,3,1,3,3,3,3,3,2,1（**1章止まりが2本**）
    //     dmg9 貫通2 … 3,3,2,3,3,3,3,2,3,0（0が1本）
    //     **dmg9 貫通3 … 3,3,3,2,3,3,2,3,2,3（どのシードも2章以上）**
    //   ユーザー方針「プレイヤーを絞る方向で考えない」に従い、
    //   序盤を絞るのではなく**初期武器を上げて**合わせる
    base: baseStats({ arc: 0.34, dmg: 9, rate: 5.5, range: 195, spread: 0.07, speed: 640, bulletR: 2.6, turn: 9, pierce: 3 }),
    fire(w, run) {
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.n > 1 ? w.n * 0.7 : 1);
        Combat.spawnBullet(w, run, a, { color: '#ffd24a' });
      }
      // 加熱は **当たっているあいだだけ**溜まる。
      // 撃ちっぱなしにした以上、撃った回数で溜めると空撃ちで速くなってしまう
      if (w.flags.heat && w.target) w.dyn.heat = Math.min(1, w.dyn.heat + 0.05);
      if (w.flags.tracerBarrage) {
        w.dyn.tracer = (w.dyn.tracer || 0) + w.n;
        if (w.dyn.tracer >= 10) {
          w.dyn.tracer = 0;
          Combat.spawnBullet(w, run, w.angle, { color: '#ff7a3c', speedMul: 0.5, dmgMul: 2.2, splash: 55, bulletR: 5, homing: 3 });
        }
      }
    },
  },

  sniper: {
    id: 'sniper', stock: 8, cat: 'long', name: 'スナイパー', short: 'SNP', icon: '🎯', color: '#6fe3ff', src: 'stage', arcMin: 0.03, arcMax: 0.3,
    // **貫通役。** 並んだ敵を撃ち抜くのが仕事なので、狙うのは「敵が濃いほう」。
    // 以前は最も硬い敵（＝たいてい後方のタンク）を狙っていて、
    // 1.28秒に1発しかないのに目の前の群れを素通りしていた
    desc: '長射程・高威力の単発。太い一撃で、並んだ敵をまとめて撃ち抜く。',
    // **【2026-09-22】12種で断トツの最下位だった。**
    //   第15章・単独・12シード・ライフを厚くして5ウェーブ回した漏れの中央値：
    //   スナイパー **439**（次に悪い触手が231、真ん中は44、一番良い火炎は0）。
    //   壁で射線を切った影響もあるが、**主因ではない**
    //   （壁を無視させても313。壁ぶんは 313→439 の +40% だけ）。
    //
    //   **何が効くかを振って確かめた（6シード・中央値）。**
    //     ダメージ×3 … 442（無反応）
    //     扇×2.5     … 439（むしろ悪い）
    //     貫通+6     … 435（無反応）
    //     首振りを遅く（1.15→0.06）… 424〜439（無関係）
    //     **レート×3 … 66 ／ ×6 … 2**
    //   **1発の威力ではなく、1秒あたり何体に当たるかで決まっていた。**
    //   ダメージを上げても無反応なのは、当たった敵には既に過剰だから。
    //   貫通だけ上げても無反応なのは、細い線の上に敵がそう並んでいないから。
    //
    //   **レートを上げると機関銃になって正体が消える**ので、上げない。
    //   代わりに**弾を太く（4→20）して貫通を伸ばした（3→20）。**
    //   通路の幅ぶんを一撃で薙ぐ形になり、**レート据置のまま 439 → 31**。
    //   弾28・貫通30 まで広げても 33 で頭打ちなので、20/20 が折れ点
    base: baseStats({ arc: 0.16, dmg: 34, rate: 0.78, range: 430, spread: 0.012, speed: 1500, pierce: 20, bulletR: 20, turn: 3.5 }),
    fire(w, run) {
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (i === 0 ? 1 : w.n);
        Combat.spawnBullet(w, run, a, { color: '#6fe3ff', long: true });
      }
      Combat.shake(run, 2.2);
    },
  },

  // ============ ステージ報酬（王道TD＋化学兵器） ============
  missile: {
    id: 'missile', stock: 4, cat: 'target', name: 'ミサイル', short: 'MSL', icon: '🚀', color: '#ff7a3c', src: 'stage',
    arcMin: 0.08, arcMax: 0.42, aimPoint: true, spot: [72, 150],
    desc: '置いた円の中へ爆撃を降らせ続ける。円を絞るほど一点に集まる。',
    // **【2026-09-21】12種を同じ条件で測って、床を上げた。**
    //   第10章・単独編成・3シードの dps 中央値。刀68 → 触手9 で **7.6倍の開き**があった。
    //   ユーザー方針「プレイヤーを絞る方向で考えない／疑うべきは君のデフレ思考」に従い、
    //   **一番上（刀）は触らず、下だけ中央値（約26）へ引き上げる。**
    //   ミサイルは**第5章の突破報酬**なのに、12種中11位（13）だった。
    //   ダメージ16→26・レート1.0→1.4 で 26。実測 13 → 26
    base: baseStats({ arc: 0.30, dmg: 26, rate: 1.4, range: 330, speed: 430, splash: 72, bulletR: 5, turn: 5 }),
    // **ミサイルは噴射炎と煙を引く。**（ユーザー 2026-09-22「絵と中身の矛盾を解消して」）
    //   丸が滑っていくだけでは、名前がミサイルである理由が絵に出ない
    fire(w, run) { Combat.bombard(w, run, '#ff7a3c', { rocket: true }); },
  },

  tesla: {
    id: 'tesla', stock: 6, cat: 'short', name: 'テスラコイル', short: 'TSL', icon: '⚡', color: '#b58bff', src: 'stage', arcMin: 0.3, arcMax: 1.1,
    desc: '砲身の先へ即着の電撃。当たると次々に連鎖して、群れをまとめて焼く。',
    // **【2026-09-22】下から2番目だった**（第15章・単独・12シード・漏れの中央値 264）。
    //   振って確かめた（6シード・中央値）：
    //     ダメージ11→33 … 403（**無反応**。当たった敵には既に過剰）
    //     連鎖2→8       … 92
    //     連鎖8＋減衰0.95 … 75〜104（2回測って振れた）
    //     射程170→300   … 110
    //     連鎖8＋減衰0.95＋射程220 … 15
    //   **威力ではなく「1発が何体に届くか」で決まる。**
    //   連鎖を伸ばして減衰を緩め、射程を 170→200 に寄せた。
    //   200 でも12種で2番目に短く、`cat:'short'` の立ち位置は変わらない
    // **感電を素で起こす。**（2026-09-23）
    //   ユーザー判断「凍結にスリップダメージは不要、**感電と拘束につける**」を受けて
    //   スリップを実装したが、測ったら**感電を起こす武器が1つも無かった**
    //   （`shockDur` が0で、カード3枚と遺物1個でしか付かない）。
    //   電気の武器が感電させないのは、テーマと実装の食い違い。素で起こすようにする
    base: baseStats({ arc: 0.55, dmg: 11, rate: 1.6, range: 200, chain: 8, chainFalloff: 0.95, shockDur: 1.2 }),
    fire(w, run) {
      if (!w.target) return;
      Combat.chainLightning(w, run, w.target, w.s.chain, w.s.dmg);
      Combat.shake(run, 0.8);
    },
  },

  flame: {
    id: 'flame', wallThrough: true, /* 壁を抜ける：範囲もの */ stock: 1, cat: 'area', name: '火炎放射器', short: 'FLM', icon: '🔥', color: '#ff6a2a', src: 'stage', arcMin: 0.45, arcMax: 1.4,
    desc: '短射程の扇状に炎を吹き続ける。当たった敵は燃え続ける。',
    // 火炎は 17（12種中9位）。ダメージ3.4→5・レート9→12 で 25。実測 17 → 25
    base: baseStats({ arc: 0.50, dmg: 5, rate: 12, range: 130, cone: 0.42, burn: 0.55, burnDur: 3, turn: 5 }),
    fire(w, run) {
      Combat.coneDamage(w, run, w.angle, w.s.cone, w.s.range, w.s.dmg, {
        color: '#ffb066', burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur,
      });
      // **炎は「舌」を何本か描く。**種を持たせて、毎フレーム形が暴れないようにする
      Combat.fx(run, { type: 'cone', x: w.x, y: w.y, a: w.angle, arc: w.s.cone,
        r: w.s.range, color: '#ff8a3a', life: 0.20, seed: (w.shots * 2654435761) % 1000 });
      // ナパーム：炎の届く先に火の海を残す（毎発だと増えすぎるので間引く）
      if (w.flags.napalm && Util.chance(0.12)) {
        Combat.spawnField(run, w.x + Math.cos(w.angle) * w.s.range * 0.75,
                               w.y + Math.sin(w.angle) * w.s.range * 0.75,
          { kind: 'fire', r: 52, dur: 3, dps: w.s.dmg * w.s.burn * 1.6, color: '#ff8a3a' });
      }
    },
  },

  gas: {
    // **数字では動かない。**（実測 2026-09-21・第10章単独・3シード）
    //   dmg 7 → 9.5 → 11（+57%）に上げても dps は 21 → 22 → 22 のまま。
    //   雲を撒く武器なので、効いているのは雲の重なりと持続であって1発の威力ではない。
    //   凍結装置（35で単独突破する）・触手（16→26でも17止まり）と同じで、
    //   **この3種は「1秒あたりのダメージ」では測りきれない。**上げても無駄になる
    id: 'gas', wallThrough: true, /* 壁を抜ける：範囲もの */ stock: 8, cat: 'area', name: '毒ガス散布機', short: 'GAS', icon: '☣', color: '#8fd94a', src: 'stage', arcMin: 0.38, arcMax: 1.25,
    desc: '砲身の先へ毒の雲を撒き続ける。雲の中の敵は毒を受け続け、防御が落ちる。',
    // **【2026-09-22】狙撃たちを上げたら、今度はここが最下位になった**（第15章・12シード・中央値71）。
    //   ここでも威力は効かない（ダメージ 7→21 で 56 → **64**。上の2026-09-21 の観察どおり）。
    //   6シード・中央値で振った結果：
    //     雲を広く 76→130 … **19**
    //     レート 0.42→1.0 … 25
    //     雲を長く 5.5→11 … 47
    //   **効くのは雲の広さ。**撒く武器なので当然で、
    //   1発の毒を濃くするより、通路をどれだけ覆えるかで決まる
    base: baseStats({ arc: 0.55, dmg: 7, rate: 0.42, range: 300, speed: 260, bulletR: 5,
                      fieldR: 130, fieldDur: 5.5, fieldVuln: 0.2, slow: 0.15, slowDur: 1 }),
    fire(w, run) {
      if (!w.target) return;
      Combat.spawnLob(w, run, w.target.x, w.target.y, {
        color: '#8fd94a',
        onLand: (rr, x, y) => Combat.spawnField(rr, x, y, {
          kind: 'gas', r: w.s.fieldR, dur: w.s.fieldDur, dps: w.s.dmg,
          slow: w.s.slow, vuln: w.s.fieldVuln, color: '#8fd94a', src: w,
        }),
      });
    },
  },

  cryo: {
    id: 'cryo', stock: 1, cat: 'support', name: '凍結装置', short: 'CRY', icon: '❄', color: '#7fe6ff', src: 'stage', arcMin: 0.4, arcMax: 1.2,
    desc: '周囲へ冷気を放つ。敵は大きく減速し、凍った敵は受けるダメージが増える。',
    base: baseStats({ arc: 0.75, dmg: 6, rate: 0.9, range: 165, slow: 0.55, slowDur: 2.4 }),
    fire(w, run) {
      Combat.pulse(w, run, w.s.range, w.s.dmg, {
        color: '#bff0ff', slow: w.s.slow, slowDur: w.s.slowDur, chill: true,
      });
      // **「冷気を放つ」を、輪1本ではなく霜の波として描く。**（ユーザー 2026-09-22）
      Combat.fx(run, { type: 'frost', x: w.x, y: w.y, r: w.s.range, color: '#7fe6ff',
                       ph: Math.random() * 6.28, life: 0.45 });
    },
  },

  // ============ パック限定（なんでもあり枠） ============
  katana: {
    id: 'katana', wallThrough: true, /* 壁を抜ける：間合いの中をまとめて斬る */ stock: 5, cat: 'short', name: '刀', short: 'KTN', icon: '🗡', color: '#f4f6fb', src: 'pack', arcMin: 0.35, arcMax: 1.25,
    desc: '間合いに入った敵をまとめて斬る。射程は短いが一撃が重く、会心が乗る。',
    base: baseStats({ arc: 0.80, dmg: 58, rate: 1.5, range: 100, cone: 1.5, crit: 0.2, critMul: 2.5, turn: 12 }),
    fire(w, run) {
      // 二刀（ktn_twin）：1回の斬撃で斬る回数（count）
      const n = Math.max(1, w.n || 1);
      for (let i = 0; i < n; i++) {
        Combat.coneDamage(w, run, w.angle, w.s.cone, w.s.range, w.s.dmg, {
          color: '#ffffff', crit: w.s.crit, critMul: w.s.critMul, exec: w.s.execThr,
        });
      }
      Combat.fx(run, { type: 'slash', x: w.x, y: w.y, a: w.angle, arc: w.s.cone,
        r: w.s.range, color: '#ffffff', life: 0.18 });
      Combat.shake(run, 1.6);
    },
  },

  shuriken: {
    id: 'shuriken', stock: 4, cat: 'mid', name: '手裏剣', short: 'SHU', icon: '✳', color: '#cdd9e8', src: 'pack', arcMin: 0.15, arcMax: 0.7,
    desc: '敵から敵へ跳ね回る投擲。密集しているほど手が付けられなくなる。',
    base: baseStats({ arc: 0.38, dmg: 13, rate: 2.2, range: 230, speed: 520, bulletR: 5, bounce: 3, turn: 10 }),
    fire(w, run) {
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.n > 1 ? w.n : 1);
        Combat.spawnBullet(w, run, a, { color: '#cdd9e8', spin: true });
      }
    },
  },

  tentacle: {
    id: 'tentacle', wallThrough: true, /* 壁を抜ける：腕なので回り込める */ stock: 8, cat: 'support', name: '触手', short: 'TNT', icon: '🐙', color: '#c85ab0', src: 'pack', arcMin: 0.2, arcMax: 0.8,
    desc: '砲身の先にいる敵を掴んで来た道へ引き戻す。掴まれている間は削られ続ける。',
    // **【2026-09-22】同時に2体まで掴めなかったのが、そのまま弱さだった。**
    //   前は「1体ずつ掴む武器だから数字を上げても頭打ち」と書いて諦めていたが、
    //   **上げる場所が違った。**掴める数（count）がそれ。
    //
    //   測り方も変えた。dps ではなく**漏らした数**で見る（武器の仕事はこれ）。
    //   第10章・単独・4シード・ライフを厚くして必ず5ウェーブ回した合計：
    //     掴む数1 → 1,710  ／ 2 → 291  ／ **3 → 35**  ／ 4 → 13
    //   1のままだと12種で断トツの最下位（次に悪いガトリングが581）。
    //   3で手裏剣（33）と並ぶ。4だと上位に行きすぎる
    //
    // **【2026-09-22・上の調整は章が浅すぎた】**
    //   第10章は12種のうち半分が漏れ0になる＝**飽和していて差が出ない**。
    //   第15章で測り直すと、掴む3のままでは中央値 231（12種で下から2番目）。
    //   ここでも**ダメージ26→78 は無反応（424→424）**で、効くのは掴む数だけ：
    //     3 → 424 ／ 4 → 73 ／ 5 → 50 ／ **6 → 24** ／ 7 → 13 ／ 8 → 23
    //   6 を採る（12種の真ん中は約37）
    base: baseStats({ arc: 0.34, dmg: 26, rate: 1.2, range: 210, count: 6, knock: 105, knockDur: 1.3, turn: 9 }),
    fire(w, run) {
      const t = w.target;
      if (!t) return;
      Combat.grab(w, run, t, w.s.knock, w.s.knockDur, w.s.dmg);
    },
  },

  bubble: {
    id: 'bubble', stock: 1, cat: 'target', name: '泡', short: 'BBL', icon: '🫧', color: '#8ad8ff', src: 'pack',
    arcMin: 0.12, arcMax: 0.55, aimPoint: true, spot: [58, 120],
    desc: '置いた円の中へ泡を降らせ、割れた場所の敵を閉じ込める。',
    // 泡は 15（12種中10位）。ダメージ10→16・レート1.1→1.5 で 26。実測 15 → 26
    base: baseStats({ arc: 0.34, dmg: 16, rate: 1.5, range: 250, speed: 300, bulletR: 9,
                      stunDur: 1.8, splash: 58, splashMul: 1.0 }),
    fire(w, run) { Combat.bombard(w, run, '#8ad8ff'); },
  },

  mortar: {
    id: 'mortar', stock: 7, cat: 'target', name: '迫撃砲', short: 'MTR', icon: '💥', color: '#e0b060', src: 'stage',
    arcMin: 0.08, arcMax: 0.45, aimPoint: true, spot: [96, 170],
    desc: '置いた円の中へ重い砲弾を降らせ続ける。射程は長いが発射は遅い。',
    base: baseStats({ arc: 0.26, dmg: 42, rate: 0.55, range: 420, speed: 240, bulletR: 6,
                      splash: 96, splashMul: 1.0, turn: 2.4 }),
    fire(w, run) { Combat.bombard(w, run, '#e0b060'); },
  },
};

const WEAPON_IDS = Object.keys(WEAPONS);

// 初期の扇が、その武器の絞れる幅からはみ出していないか。
// **はみ出していると、置いた瞬間だけ範囲外の値になる**ので起動時に潰す
for (const wid of WEAPON_IDS) {
  const d = WEAPONS[wid];
  const lo = d.arcMin !== undefined ? d.arcMin : BAL.arcMin;
  const hi = d.arcMax !== undefined ? d.arcMax : BAL.arcMax;
  if (d.base.arc < lo || d.base.arc > hi) {
    console.error('武器の初期の扇が絞れる幅の外にある:', wid, d.base.arc, lo, hi);
    d.base.arc = Math.min(hi, Math.max(lo, d.base.arc));
  }
}
