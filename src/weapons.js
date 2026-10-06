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
  short:   { id: 'short',   name: '短射程',   icon: Icons.get('short'), color: '#ff8f6a',
             desc: '間合いは狭いが、入った敵をまとめて溶かす' },
  mid:     { id: 'mid',     name: '中射程',   icon: Icons.get('mid'), color: '#ffd24a',
             desc: '扱いやすい距離と手数。通路の脇に置く定番' },
  // ミサイルを指定攻撃へ移したので、いまここはスナイパー1本。
  // 「広い範囲を1基で見る」のは指定攻撃の仕事になったため、説明もそれに合わせた
  long:    { id: 'long',    name: '長射程',   icon: Icons.get('long'), color: '#6fe3ff',
             desc: '遠くの一線を撃ち抜く。長い直線に置くほど報われる' },
  area:    { id: 'area',    name: '範囲攻撃', icon: Icons.get('area'), color: '#ff6a2a',
             desc: '一度に広い面を焼く。密集しているほど強い' },
  target:  { id: 'target',  name: '指定攻撃', icon: Icons.get('target'), color: '#c9a0ff',
             desc: '盤面に円を置き、その中へ降らせる。射線を持たない' },
  support: { id: 'support', name: '支援',     icon: Icons.get('support'), color: '#7fe6ff',
             desc: '直接は倒さない。足を止め、他の武器の時間を作る' },
};
const CATEGORY_IDS = ['short', 'mid', 'long', 'area', 'target', 'support'];
// 触手の攻撃の種類（2026-09-30 段3）。名前は Combat.tentacleAttack
const TNT_ATTACKS = ['pull', 'stab', 'sweep', 'wall', 'ink', 'cut'];

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
    reflect: 0,     // 壁で折り返す回数（レーザーライフル）
    slow: 0,        // 減速の強さ(0-1)
    slowDur: 0,     // 減速の持続秒
    stunDur: 0,     // 拘束の持続秒
    knock: 0,       // 引き戻しの強さ(px/s)
    knockDur: 0,
    cone: 0,        // 扇の半角(rad)。0なら扇ではない
    fieldR: 0,      // 設置する場の半径
    fieldDur: 0,    // 場の持続秒
    fieldVuln: 0,   // 場の中の敵が受けるダメージの増分（0.2 = +20%）
    arc: 0.40,      // 射界の半角(rad)。**武器ごとの固定値（`WEAPONS[id].arcFix`）が下のループで入る。プレイヤーは変えられない**
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
//   2. **円の大きさは武器ごとの固定値**（2026-09-30 段1a・スライダー撤去）。`spot` が半径（px）。
//        爆風がカードで大きくなったときだけ、それに追随して広がる（`Game.spotR`）。
//        プレイヤーが決めるのは円を置く位置だけ
// ---------------------------------------------------------------


// ---------------------------------------------------------------
// **武器の大きさという概念は無い。どの武器も六角1つ。**（2026-09-23・ユーザー指示で撤去）
//   以前ここにあった `FOOT`（武器ごとに要る設置マス）は、壁の中に埋め込めた頃の名残。
//   いまは弾が壁を抜けないので、置ける場所が壁沿いに限られること自体が重みになっている。
//   設置の判定は `Game.canPlaceAt(c, r)`（state.js）
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// **設置は「コスト」で縛る。**（2026-09-30 段1b・設計書 docs/DESIGN-REBUILD-2026-09-29.md §2-4・§9）
//   ユーザー「設置可能基数の数値を定めるのではなく、コストを設定します」
//   武器ごとに `cost` を持ち、盤には「置いてあるコストの合計 ≦ コストの上限」だけで置ける
//   （上限は始め BAL.costBase、スキルツリーの units の連なりで +BAL.costPerNode ずつ・第30章ごろに約70）。
//   **以前の「武器1種の上限（stock + unitBonus + カテゴリの節）」は撤去した。**強弱の調整はコストの上下で行う。
//   **【暫定値】**下のコストは段1b の仮の値。段3で武器の作り直しと一緒に引き直す：
//     ガトリング・手裏剣 1（並べる武器）／毒ガス・触手・テスラ 2／スナイパー・刀・迫撃砲・火炎 3／ミサイル・凍結・泡 4
//   目安：第25章の定石（ミサイル7・凍結4・泡4＝コスト60）が入る幅に、第25章ごろの上限が届くこと（ユーザーの答え2）
//
//   **sys＝攻撃の系統**（2026-10-06・アセンションの上位の敵の無効の判定に使う。Combat.sysOf / SYS_INFO）：
//   phys 物理（ガトリング・手裏剣・刀・迫撃砲・ミサイル）／optic 光学（レーザーライフル＝コードの id は sniper）／
//   elem 属性（火炎・テスラ・凍結）／field 場（毒ガス・泡）／grab 掴み（触手）。
//   その武器から来たダメージ・状態異常・持続ダメージ・印・場は、すべてこの系統に引く。新しい武器を足すときは必ず sys を書く
// ---------------------------------------------------------------
const WEAPONS = {
  // ============ 初期装備 ============
  gatling: {
    id: 'gatling', sys: 'phys', cost: 1, cat: 'mid', name: 'ガトリング', short: 'GAT', icon: Icons.get('gatling'), color: '#ffd24a', src: 'start', arcFix: 0.34,
    desc: '毎秒大量の小口径弾。単発は弱いが手数で押す。',
    //   **唯一の初期武器なので、これ1種で第1〜2章を持たせる必要がある。**（2026-09-21）
    //   ユーザー決定「初期武器はガトリングでよし」で初期所持を1種に絞ったが、
    //   **設置数は武器の種類ごとの上限で縛られていた**ので、
    //   盤面が 8基 → 4基 に半減していた（いまはコスト制・段1b）。しかも測定器だけスナイパーを
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
    //
    // **【2026-10-05 コストあたりの価値を正す・段C】大きく弱めた**（ユーザー「1コストあたりの価値がガトリングがおかしいのであれば、大きくナーフした上で…」）。
    //   第25章・コスト24・単独・6本：コスト1×60基（同じ武器は15基までになる前）で漏れ 11.5（他の武器の 1/20〜1/150）だった。
    //   性格は「安く速い・近い敵を削る・装甲に弱い」へ。貫通 3→1・レート 5.5→4.0。
    //   測ると**貫通・ダメージは漏れを動かさず（貫通 0 でも 113→113.5）、効くのはレート**（5.5→4.0 で 115→314・→3.0 で 674）。
    //   貫通は他の武器の連携札（徹甲弾 +1・掃射 +2）で伸ばす側に回した（貫通は札で買うもの）
    base: baseStats({ dmg: 9, rate: 4.0, range: 195, spread: 0.07, speed: 640, bulletR: 2.6, turn: 9, pierce: 1 }),
    fire(w, run) {
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.n > 1 ? w.n * 0.7 : 1);
        Combat.spawnBullet(w, run, a, { color: w.dyn.tracerDown ? '#ff7a3c' : '#ffd24a' });   // 曳光弾（gat_barrels）は橙の光の尾
      }
      // 加熱は **当たっているあいだだけ**溜まる。
      // 撃ちっぱなしにした以上、撃った回数で溜めると空撃ちで速くなってしまう
      if (w.flags.heat && w.target) w.dyn.heat = Math.min(1, w.dyn.heat + BAL.heatGain);
    },
  },

  sniper: {
    // **【2026-09-30 段3】スナイパー → レーザーライフル。**id は 'sniper' のまま（セーブ・カード・連携の互換のため。画面の名前だけ変える）。
    //   弾を飛ばさず、壁で2回折り返す光線を引く（Combat.laser）。線の上の敵を全部貫く。太さは前の弾（当たり半径20）より少し太い 24。
    //   ユーザーの答え4（設計書 DESIGN-REBUILD §7）。下の「スナイパー」の経緯は、弾だった頃の測定として残す
    id: 'sniper', sys: 'optic', cost: 3, cat: 'long', name: 'レーザーライフル', short: 'LSR', icon: Icons.get('sniper'), color: '#6fe3ff', src: 'stage', arcFix: 0.16,
    // **貫通役。** 並んだ敵を撃ち抜くのが仕事なので、狙うのは「敵が濃いほう」。
    // 以前は最も硬い敵（＝たいてい後方のタンク）を狙っていて、
    // 1.28秒に1発しかないのに目の前の群れを素通りしていた
    desc: '光線を撃つ。壁で2回はね返り、線の上の敵をすべて貫く。まっすぐな道が無くても奥まで届く。',
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
    //   レーザー：bulletR は光線の太さの半分・reflect は壁で折り返す回数・range は最初の直線の目安（線の長さの合計は range × BAL.laserLenMul）
    //   【2026-10-05 段D・コスト対性能】レート 0.78→1.1。同じコストの予算での漏れが12種で最下位だった（第25章・D27・単独・上手な置き方・6本：コスト24で 1,494／コスト48で 526）。
    //   光線が毎秒1本未満で、通り道を覆う回数が足りない。ダメージ・貫通は漏れを動かさないので、レートだけ上げた（→ 898／195）
    base: baseStats({ dmg: 34, rate: 1.1, range: 430, spread: 0.012, speed: 1500, pierce: 20, bulletR: 24, reflect: 2, turn: 3.5 }),
    fire(w, run) {
      // 同時発射（count）が増えたら、少しずつ角度をずらして線を増やす
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + (i === 0 ? 0 : ((i % 2) ? 1 : -1) * Math.ceil(i / 2) * 0.06);
        Combat.laser(w, run, a);
      }
      Combat.shake(run, 2.2);
    },
  },

  // ============ ステージ報酬（王道TD＋化学兵器） ============
  missile: {
    id: 'missile', sys: 'phys', cost: 4, cat: 'target', name: 'ミサイル', short: 'MSL', icon: Icons.get('missile'), color: '#ff7a3c', src: 'stage',
    arcFix: 0.08, aimPoint: true, spot: 72,
    desc: '置いた円の中へ、重めの爆撃を降らせ続ける。円の大きさは決まっていて、置く場所で決まる。',
    // **【2026-09-21】12種を同じ条件で測って、床を上げた。**
    //   第10章・単独編成・3シードの dps 中央値。刀68 → 触手9 で **7.6倍の開き**があった。
    //   ユーザー方針「プレイヤーを絞る方向で考えない／疑うべきは君のデフレ思考」に従い、
    //   **一番上（刀）は触らず、下だけ中央値（約26）へ引き上げる。**
    //   ミサイルは**第5章の突破報酬**なのに、12種中11位（13）だった。
    //   ダメージ16→26・レート1.0→1.4 で 26。実測 13 → 26
    //
    // **【2026-10-05 段3・ミサイルの作り直し】1発を重く、数を減らした**（ダメージ 26→34・レート 1.4→1.0。毎秒の合計は 36.4→34）。
    //   第25章・単独・上手な円（12本）で、D27 の漏れの中央値 31.5 → 158（迫撃砲 160・泡 153 と同じ帯。**ほかの円の武器より5倍強かった**）。
    //   D27 は「床」でダメージを変えても動かず、**撃つ数（レート）だけが効いた**（レート 1.4→1.2 で 62.5・→1.0 で 158。ダメージ 18 でも 34 でも同じ 158）。
    //   重くしたのは、1発ごとに引かれる装甲（ファイアウォール）に負けにくくするため。D22 の毎秒の合計は ほぼ同じ（上手な円 2484 → 2676）
    //   【2026-10-05 段D・コスト対性能】レート 1.0→0.85。円を通り道の多い点へ置く上手な置き方で、基数を並べると最良の側だった
    //   （第25章・D27・単独・6本：コスト48・12基で漏れ 140.5。コスト24・6基は 555.5）。12種を同じ帯（最良と最悪が4倍以内）に収めるため、
    //   撃つ数だけ下げた（→ 778／228）。重い1発・範囲はそのまま
    base: baseStats({ dmg: 34, rate: 0.85, range: 330, speed: 430, splash: 72, bulletR: 5, turn: 5 }),
    // **ミサイルは噴射炎と煙を引く。**（ユーザー 2026-09-22「絵と中身の矛盾を解消して」）
    //   丸が滑っていくだけでは、名前がミサイルである理由が絵に出ない
    fire(w, run) { Combat.bombard(w, run, '#ff7a3c', { rocket: true }); },
  },

  tesla: {
    id: 'tesla', sys: 'elem', cost: 2, cat: 'short', name: 'テスラコイル', short: 'TSL', icon: Icons.get('tesla'), color: '#b58bff', src: 'stage', arcFix: 0.55,
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
    base: baseStats({ dmg: 11, rate: 1.6, range: 200, chain: 8, chainFalloff: 0.95, shockDur: 1.2 }),
    fire(w, run) {
      if (!w.target) return;
      Combat.chainLightning(w, run, w.target, w.s.chain, w.s.dmg);
      Combat.shake(run, 0.8);
    },
  },

  flame: {
    id: 'flame', sys: 'elem', wallThrough: true, /* 壁を抜ける：範囲もの */ cost: 3, cat: 'area', name: '火炎放射器', short: 'FLM', icon: Icons.get('flame'), color: '#ff6a2a', src: 'stage', arcFix: 0.45,
    desc: '短射程の扇状に炎を吹き続ける。当たった敵は燃え続ける。',
    // 火炎は 17（12種中9位）。ダメージ3.4→5・レート9→12 で 25。実測 17 → 25
    base: baseStats({ dmg: 5, rate: 12, range: 130, cone: 0.42, burn: 0.55, burnDur: 3, turn: 5 }),
    fire(w, run) {
      Combat.coneDamage(w, run, w.angle, w.s.cone, w.s.range, w.s.dmg, {
        color: '#ffb066', burn: w.s.dmg * w.s.burn, burnDur: w.s.burnDur,
        crit: w.s.crit, critMul: w.s.critMul,
        slow: w.s.slow, slowDur: w.s.slowDur,   // 粘着燃料：燃えた敵は粘って遅くなる（素の火炎は0）
        sticky: w.dyn.sticky || 0,          // 粘着燃料：燃え移りの世代
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
    id: 'gas', sys: 'field', wallThrough: true, /* 壁を抜ける：範囲もの */ cost: 2, cat: 'area', name: '毒ガス散布機', short: 'GAS', icon: Icons.get('gas'), color: '#8fd94a', src: 'stage', arcFix: 0.55,
    desc: '砲身の先へ毒の雲を撒き続ける。雲の中の敵は毒を受け続け、防御が落ちる。',
    // **【2026-09-22】狙撃たちを上げたら、今度はここが最下位になった**（第15章・12シード・中央値71）。
    //   ここでも威力は効かない（ダメージ 7→21 で 56 → **64**。上の2026-09-21 の観察どおり）。
    //   6シード・中央値で振った結果：
    //     雲を広く 76→130 … **19**
    //     レート 0.42→1.0 … 25
    //     雲を長く 5.5→11 … 47
    //   **効くのは雲の広さ。**撒く武器なので当然で、
    //   1発の毒を濃くするより、通路をどれだけ覆えるかで決まる
    base: baseStats({ dmg: 7, rate: 0.42, range: 300, speed: 260, bulletR: 5,
                      fieldR: 130, fieldDur: 5.5, fieldVuln: 0.2, slow: 0.15, slowDur: 1 }),
    fire(w, run) {
      if (!w.target) return;
      Combat.spawnLob(w, run, w.target.x, w.target.y, {
        color: '#8fd94a',
        onLand: (rr, x, y) => Combat.spawnField(rr, x, y, {
          kind: 'gas', r: w.s.fieldR, dur: w.s.fieldDur, dps: w.s.dmg,
          slow: w.s.slow, vuln: w.s.fieldVuln, color: '#8fd94a', src: w,
          flow: !!w.flags.fog, armorDown: w.dyn.armorDown || 0,     // 重い霧（流れる）・腐蝕の雲（装甲を削る）
        }),
      });
    },
  },

  cryo: {
    // **noFace：向きが攻撃に関係しない**（0930）。fire は `Combat.pulse`（全周・角度の判定なし・w.target も読まない）なので、
    //   向きも扇も効かない。盤の上は射程の円で見せ、向きの花は出さない（`Game.usesFace`）。arcFix は置く瞬間の向きの選びにだけ残る
    id: 'cryo', sys: 'elem', noFace: true, cost: 4, cat: 'support', name: '凍結装置', short: 'CRY', icon: Icons.get('cryo'), color: '#7fe6ff', src: 'stage', arcFix: 0.75,
    desc: '周囲へ冷気を放つ。敵は大きく減速し、凍った敵は受けるダメージが増える。',
    base: baseStats({ dmg: 6, rate: 0.9, range: 165, slow: 0.55, slowDur: 2.4 }),
    fire(w, run) {
      Combat.pulse(w, run, w.s.range, w.s.dmg, {
        color: '#bff0ff', slow: w.s.slow, slowDur: w.s.slowDur, chill: true, crit: w.s.crit, critMul: w.s.critMul,
      });
      // **「冷気を放つ」を、輪1本ではなく霜の波として描く。**（ユーザー 2026-09-22）
      Combat.fx(run, { type: 'frost', x: w.x, y: w.y, r: w.s.range, color: '#7fe6ff',
                       ph: Math.random() * 6.28, life: 0.45 });
    },
  },

  // ============ パック限定（なんでもあり枠） ============
  katana: {
    id: 'katana', sys: 'phys', wallThrough: true, /* 壁を抜ける：間合いの中をまとめて斬る */ cost: 3, cat: 'short', name: '刀', short: 'KTN', icon: Icons.get('katana'), color: '#f4f6fb', src: 'pack', arcFix: 0.80,
    desc: '間合いに入った敵をまとめて斬る。射程は短いが一撃が重く、会心が乗る。',
    base: baseStats({ dmg: 58, rate: 1.5, range: 100, cone: 1.5, crit: 0.2, critMul: 2.5, turn: 12 }),
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
      // 返し刃（ktn_swallow）：斬ったあと、逆の向きへもう一度斬る（威力は BAL.cardFx.recoilMul × 札の枚数ぶん）
      if (w.dyn.recoil) {
        const a2 = w.angle + Math.PI;
        Combat.coneDamage(w, run, a2, w.s.cone, w.s.range, w.s.dmg * BAL.cardFx.recoilMul * w.dyn.recoil, {
          color: '#cfe6ff', crit: w.s.crit, critMul: w.s.critMul, exec: w.s.execThr,
        });
        Combat.fx(run, { type: 'slash', x: w.x, y: w.y, a: a2, arc: w.s.cone, r: w.s.range, color: '#cfe6ff', life: 0.18 });
      }
      Combat.shake(run, 1.6);
    },
  },

  shuriken: {
    id: 'shuriken', sys: 'phys', cost: 1, cat: 'mid', name: '手裏剣', short: 'SHU', icon: Icons.get('shuriken'), color: '#cdd9e8', src: 'pack', arcFix: 0.38,
    desc: '敵から敵へ跳ね回る投擲。密集しているほど手が付けられなくなる。',
    base: baseStats({ dmg: 13, rate: 2.2, range: 230, speed: 520, bulletR: 5, bounce: 3, turn: 10 }),
    fire(w, run) {
      for (let i = 0; i < w.n; i++) {
        const a = w.angle + Util.rand(-w.s.spread, w.s.spread) * (w.n > 1 ? w.n : 1);
        Combat.spawnBullet(w, run, a, { color: '#cdd9e8', spin: true });
      }
    },
  },

  tentacle: {
    // **【2026-09-30 段3】作り直し：「支援」をやめ、毎回何が出るか分からないピーキーな武器に。**（親の設計書 DESIGN-REBUILD §12-1・ユーザー指定）
    //   > 「何が出るかさっぱりわからないから置き場所に困るものの、基本性能の高いピーキーな武器に仕上げましょう」
    //   火力・範囲は平均以上、レートは控えめ。撃つたびに6種の攻撃から1つ（BAL.tntWeights の重み）：
    //     pull 引き寄せ（掴んで来た道へ引き戻す・前の触手の形）／stab 突き刺し（長い線の高火力）／sweep 薙ぎ払い（目の前の扇）／
    //     wall 触手の壁（道に強い減速の場）／ink タコ墨（広い範囲の攻撃＋減速の場）／cut 一閃（小さい範囲の高火力）
    //   倍率・大きさは BAL.tnt*。**出た攻撃の名前を触手の上に一瞬出す**（何が出たか分かるように）。
    //   前の触手（掴むだけ・掴む数6）は第25章の単独 12種中10位・カードを全部積んでも ×0.41（measure.md）。
    //   コスト：ユーザー「コストも高め」（§12-1）。武器の設計から決める（答え8「コストで強弱の帳尻を合わせない」）
    id: 'tentacle', sys: 'grab', wallThrough: true, /* 壁を抜ける：腕なので回り込める */ cost: 3, cat: 'support', name: '触手', short: 'TNT', icon: Icons.get('tentacle'), color: '#c85ab0', src: 'pack', arcFix: 0.34,
    desc: '撃つたびに6種の攻撃のどれかが出る（引き寄せ・突き刺し・薙ぎ払い・触手の壁・タコ墨・一閃）。何が出るかは分からないが、どれも強い。',
    base: baseStats({ dmg: 40, rate: 1.0, range: 230, count: 4, knock: 105, knockDur: 1.3, turn: 9 }),
    fire(w, run) {
      const t = w.target;
      if (!t) return;
      // 二連撃・八腕（カード）：2種を同時に出す
      const n = (w.dyn.tntDouble && Util.chance(w.dyn.tntDouble)) ? 2 : 1;
      const done = {};
      for (let i = 0; i < n; i++) {
        let k = Util.weighted(TNT_ATTACKS.filter(a => !done[a]), a => BAL.tntWeights[a] || 1);
        done[k] = true;
        Combat.tentacleAttack(w, run, t, k, i);
      }
    },
  },

  bubble: {
    id: 'bubble', sys: 'field', cost: 4, cat: 'target', name: '泡', short: 'BBL', icon: Icons.get('bubble'), color: '#8ad8ff', src: 'pack',
    arcFix: 0.12, aimPoint: true, spot: 58,
    desc: '置いた円の中へ泡を降らせ、割れた場所の敵を閉じ込める。',
    // 泡は 15（12種中10位）。ダメージ10→16・レート1.1→1.5 で 26。実測 15 → 26
    //   【2026-10-05 段D・コスト対性能】レート 1.5→1.2（上手な置き方・第25章・D27・単独・6本：コスト48・12基で漏れ 96.5 と最良の側。→ 156。コスト24・6基は 544 → 735）
    base: baseStats({ dmg: 16, rate: 1.2, range: 250, speed: 300, bulletR: 9,
                      stunDur: 1.8, splash: 58, splashMul: 1.0 }),
    fire(w, run) { Combat.bombard(w, run, '#8ad8ff'); },
  },

  mortar: {
    id: 'mortar', sys: 'phys', cost: 3, cat: 'target', name: '迫撃砲', short: 'MTR', icon: Icons.get('mortar'), color: '#e0b060', src: 'stage',
    arcFix: 0.08, aimPoint: true, spot: 96,
    desc: '置いた円の中へ重い砲弾を降らせ続ける。射程は長いが発射は遅い。',
    //   【2026-10-05 段D・コスト対性能】レート 0.55→0.45（上手な置き方・第25章・D27・単独・6本：コスト48・15基で漏れ 86 と12種で最良。→ 184。コスト24・8基は 601 → 926）
    base: baseStats({ dmg: 42, rate: 0.45, range: 420, speed: 240, bulletR: 6,
                      splash: 96, splashMul: 1.0, turn: 2.4 }),
    fire(w, run) { Combat.bombard(w, run, '#e0b060'); },
  },
};

const WEAPON_IDS = Object.keys(WEAPONS);

// **射界は武器ごとの固定値。**（2026-09-30 段1a・設計書 §2-3／§7-1）
//   `arcFix` を初期の扇（`base.arc`）に入れる。プレイヤーが幅を変える手段は無い（スライダー・`Game.setArc` は撤去）。
//   決め方（実測 `docs/audit/2026-09-29-measure.md` §3・第25章・12本）：
//     火炎 0.45（可動幅の最小が3章とも最良）／ガトリング 0.34・刀 0.80（初期値が最良）／
//     ミサイル・迫撃砲・泡は円が最小（`spot`）。**この3つの `arcFix` は旧可動幅の最小（0.08／0.08／0.12）**。
//       指定攻撃は扇を持たないので arc は「置いた瞬間の向き」と測定器の自動配置の場所選びにしか効かない。
//       着弾円を最小にした実測（§3）と同じ状態にそろえるため、旧可動幅の最小のままにした／スナイパー・テスラ・毒ガス・凍結・手裏剣・触手はこれまでの初期値のまま（段3で見直す）
for (const wid of WEAPON_IDS) {
  const d = WEAPONS[wid];
  if (typeof d.arcFix !== 'number') { console.error('武器に固定の射界(arcFix)が無い:', wid); continue; }
  d.base.arc = d.arcFix;
}
