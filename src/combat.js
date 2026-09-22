// ---------------------------------------------------------------
// combat.js : 敵・弾・場・状態異常・ウェーブ進行
//
//   1ステージ = 5ウェーブ。ウェーブを1つ凌ぐごとにカードを引ける。
//   敵の強さは「通算ウェーブ番号」（ステージをまたいで増える）で決まる
// ---------------------------------------------------------------
'use strict';

// 敵の種類。**`from` は通算ウェーブ番号**（1章＝5ウェーブなので from:16 は第4章）。
//
//   **数値違いだけの3種をやめた。**（2026-09-22）
//   grunt/swift/tank は HP と速さが違うだけで、**どの武器で相手をしても同じ**だった。
//   難易度は数字でしか上がらず、「編成を変える理由」が生まれない。
//   足した4種は、**プレイヤーの道具のどれかを名指しで刺す**：
//
//     装甲 shield … 1発ごとに固定値を引く。**手数の武器（ガトリング）が通らない。**
//                   狙撃・迫撃のような1発の重い武器で抜く
//     群れ swarm  … 1回の湧きでまとめて出る。**単体攻撃が追いつかない。**
//                   爆風・炎・毒のような面で取る武器で潰す
//     再生 regen  … 放っておくと回復する。**燃やしている間は止まる。**
//                   遺物の「熾火核」やカードの炎上がここで効く
//     分裂 split  … 倒すと2体に割れる。**過剰damage が無駄になる。**
//                   削り切る前提の編成だと数が増えて崩れる
//
//   weight は出やすさ。合計で正規化される（Util.weighted）
const ENEMY_TYPES = {
  grunt:  { name: 'grunt',  hp: 1.0, spd: 1.0,  r: 10, coin: 1.0,  color: '#ff5b6e', from: 1,  weight: 58 },
  swift:  { name: 'swift',  hp: 0.5, spd: 1.9,  r: 8,  coin: 1.15, color: '#ff9cf0', from: 3,  weight: 28 },
  tank:   { name: 'tank',   hp: 3.4, spd: 0.58, r: 15, coin: 2.5,  color: '#c8a05a', from: 6,  weight: 22 },
  // 1発あたり「そのウェーブの雑魚HPの armor 割」を引く。小さい弾ほど損をする
  shield: { name: 'shield', hp: 1.6, spd: 0.80, r: 12, coin: 1.9,  color: '#7fb3ff', from: 16, weight: 16, armor: 0.06 },
  // 1回の湧きで burst 体まとめて出る。1体は小さい
  swarm:  { name: 'swarm',  hp: 0.22, spd: 1.45, r: 6, coin: 0.45, color: '#ffe08a', from: 26, weight: 14, burst: 5 },
  // 毎秒 maxHp の regen 割を回復。**燃えている間は回復しない**
  regen:  { name: 'regen',  hp: 1.3, spd: 0.85, r: 11, coin: 1.8,  color: '#7fe3a0', from: 36, weight: 14, regen: 0.055 },
  // 倒すと split 体に割れる（割れた子はもう割れない）
  split:  { name: 'split',  hp: 2.2, spd: 0.90, r: 13, coin: 2.0,  color: '#d08aff', from: 46, weight: 12, split: 2 },
};

// 敵同士の押し合い（2026-09-19 取り込み）
//
// これまで敵はすり抜けていて、ペアの98%が重なり、細い一本の線になっていた。
// **専用の格子で、近いペアだけを1回ずつ見て押し離す。**
// 既存の Grid（セル70）を使うと1体あたりの候補が多すぎて重いので、
// 敵の直径くらいの格子を別に持つ。
//   実測（PC、敵900体）: 既存Gridを使う素朴な方法 7.0ms → この方法 2.1ms
const Crowd = {
  head: null, next: null, w: 0, h: 0,

  apply(run, dt) {
    if (!BAL.crowdOn) return;
    const es = run.enemies, n = es.length;
    if (n < 2) return;
    const st = run.stage;
    const C = BAL.crowdCell;
    this.w = Math.ceil(st.w / C); this.h = Math.ceil(st.h / C);
    const cells = this.w * this.h;
    if (!this.head || this.head.length !== cells) this.head = new Int32Array(cells);
    this.head.fill(-1);
    if (!this.next || this.next.length < n) this.next = new Int32Array(Math.max(n * 2, 2048));

    for (let i = 0; i < n; i++) {
      const e = es[i];
      e.pushX = 0; e.pushY = 0;
      let cx = (e.x / C) | 0, cy = (e.y / C) | 0;
      if (cx < 0) cx = 0; if (cy < 0) cy = 0;
      if (cx >= this.w) cx = this.w - 1; if (cy >= this.h) cy = this.h - 1;
      const k = cy * this.w + cx;
      this.next[i] = this.head[k]; this.head[k] = i;
    }
    // 同じ格子＋右・下の3つ。こうすると各ペアをちょうど1回だけ見られる
    for (let cy = 0; cy < this.h; cy++) for (let cx = 0; cx < this.w; cx++) {
      for (let i = this.head[cy * this.w + cx]; i !== -1; i = this.next[i]) {
        const a = es[i];
        for (let j = this.next[i]; j !== -1; j = this.next[j]) this.pair(a, es[j]);
        if (cx + 1 < this.w) for (let j = this.head[cy * this.w + cx + 1]; j !== -1; j = this.next[j]) this.pair(a, es[j]);
        if (cy + 1 < this.h) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx; if (nx < 0 || nx >= this.w) continue;
          for (let j = this.head[(cy + 1) * this.w + nx]; j !== -1; j = this.next[j]) this.pair(a, es[j]);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const e = es[i];
      if (!e.pushX && !e.pushY) continue;
      let px = e.pushX, py = e.pushY;
      const cap = e.spd * dt * BAL.crowdCap;
      const m = Math.hypot(px, py);
      if (m > cap) { px = px / m * cap; py = py / m * cap; }
      const nx = e.x + px, ny = e.y + py;
      // 壁に押し出さない
      if (st.walkable((nx / TILE) | 0, (ny / TILE) | 0)) { e.x = nx; e.y = ny; }
    }
  },

  pair(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 < 0.01) return;
    const d = Math.sqrt(d2), f = (rr - d) * BAL.crowdPush;
    const ix = dx / d * f, iy = dy / d * f;
    a.pushX += ix; a.pushY += iy; b.pushX -= ix; b.pushY -= iy;
  },
};

// 敵をセルに分けて近傍検索を速くする（スマホで敵900体でも落ちないように）
const Grid = {
  cell: 70, map: new Map(),

  // セルの鍵は**数値**。`gx + ',' + gy` だと、引くたびに文字列を1つ作る。
  //   第10章の実測で targetAhead が全体の65%（1回 11µs・1秒あたり2,400回）を
  //   食っていて、その中身がほとんどこの文字列の生成だった。
  //   盤は 15×21タイル なので、余裕を見て ±512セルまで衝突しない形にする
  key(gx, gy) { return (gx + 512) * 4096 + (gy + 512); },

  build(enemies) {
    this.map.clear();
    const c = this.cell;
    for (const e of enemies) {
      const k = this.key((e.x / c) | 0, (e.y / c) | 0);
      let a = this.map.get(k);
      if (!a) { a = []; this.map.set(k, a); }
      a.push(e);
    }
  },
  query(x, y, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = ((x - r) / c) | 0, x1 = ((x + r) / c) | 0;
    const y0 = ((y - r) / c) | 0, y1 = ((y + r) / c) | 0;
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const a = this.map.get(this.key(gx, gy));
        if (a) for (const e of a) out.push(e);
      }
    }
    return out;
  },
};

const _q = [];
// targetAhead がセルの重複を弾くのに使う。毎フレーム使い回して確保を避ける
const _seenCells = new Set();

const Combat = {
  //   **出撃ごとに戻す。** これはモジュール側に置いてあるので、
  //   出撃をまたいで残る。前の出撃の残りが26に近いと、次の出撃で
  //   コインが飛ばなくなっていた（見た目だけの影響）
  coinFx: 0,        // 同時に飛んでいるコインの数。**多すぎると盤面が見えなくなる**


  // ================= ウェーブ =================
  gw(run) { return globalWave(run.stageIdx, run.wave); },

  // 章ごとの重み。表に無い章は 1.0。
  //   **「最前線からの距離」で拍を付ける案は、測って駄目だったので入れていない。**
  //   理由は balance.js の chapterMul の下に書いてある
  chapterWeight(run) {
    return (BAL.chapterMul && BAL.chapterMul[run.stageIdx + 1]) || 1;
  },

  // 1ウェーブに出る敵の数。
  //   **線形の項（waveCountPerWave）だけだと、章が進んでも数がほとんど増えない。**
  //   敵の指数を1本増やすため、通算ウェーブの累乗（waveCountGrowth）を足してある。
  //   1.0 にすれば以前とまったく同じ（線形のみ）に戻る
  waveCount(run) {
    const g = this.gw(run);
    const base = (BAL.waveCountBase + g * BAL.waveCountPerWave)
               * Math.pow(BAL.waveCountGrowth || 1, g - 1);
    // **道が N 方向に分かれる盤は、敵も増やす。**（2026-09-22）
    //   分けただけだと1本あたり 1/N になって、**置き場所が足りないだけの難しさ**になる。
    //   ユーザー「設置できる数的に対策出来ないだけで火力だけが過剰、
    //   みたいな状態は健全じゃない」。
    //   実測（第30章・12シード・漏れ）：増やす前は 20基274 → 40基48 で、
    //   枠を倍にするだけで楽勝になっていた
    const sh = run.stage.shape;
    const wm = sh && sh.waveMul ? sh.waveMul : 1;
    // **湧き口の数が、そのまま敵の量になる。**（ユーザー 2026-09-22・中優先）
    //   > 「バランス調整する時に、敵の数を増やしたい時は**素直に湧き口を増やして**
    //   >   ください、**一つから出る数にはかなり限度がある**事に
    //   >   すでに気がついているはずです」
    //   > 「口が1つから3つになれば**敵の一回の総量が増えます**」
    //
    //   **そうなっていなかった。**（実測 2026-09-22）
    //   `spawnPick++ % st.spawns.length` で、1ウェーブの総数を口で**割って**
    //   配っていただけ。口を増やしても総量は1体も増えず、
    //   1つあたりの流れが細くなるだけだった
    //   （第27章＝穴3で5,004体／第30章＝穴3で6,313体。深さだけで決まっていた）。
    //   **穴1つにつき1本ぶんの流れを足す。** 1 で「穴の数だけ倍」、
    //   0 にすればこれまでどおり（割って配るだけ）に戻る
    const mouths = Math.max(1, (run.stage.mouths && run.stage.mouths.length) || 1);
    const ph = BAL.waveCountPerHole === undefined ? 1 : BAL.waveCountPerHole;
    const hm = 1 + (mouths - 1) * ph;
    // **上限も穴の数で伸ばす。** 伸ばさないと、この倍率は第12章から先で
    //   まるごと上限に食われて効かない（そこから先はずっと waveCountMax のまま）
    return Math.min(Math.floor(BAL.waveCountMax * hm),
                    Math.floor(base * run.mods.spawn * wm * hm));
  },

  isLastWave(run) { return run.wave >= BAL.wavesPerStage; },

  // このウェーブにボスが出るか。**節目の章の、最後のウェーブだけ。**
  isBossWave(run) {
    return this.isLastWave(run) && BAL.bossChapters.indexOf(run.stageIdx + 1) >= 0;
  },

  // **ボスは動かない。雑魚を出す。**（ユーザー決定 2026-09-21）
  //   > 「ラスボス含め、ボスは動かない+雑魚を出す、DPSチェックタワーを出す、
  //   >   みたいなものが理想」
  //
  //   **前のボスを外した理由がここで解ける。** 以前のボスは歩いてコアへ向かい、
  //   実測で5ステージすべて撃破0、**毎回漏れてライフを5持っていくだけ**だった
  //   （コイン報酬は一度も支払われていない）。倒せない1体に必ず税金を取られる形。
  //   **動かないなら、そもそも漏れない。** 倒せなければウェーブが終わらないので、
  //   罰は「税金」ではなく「時間と、その間に湧き続ける雑魚」になる。
  //   これがDPSチェックの正しい形
  spawnBoss(run) {
    const st = run.stage;
    const g = this.gw(run);
    const si = (Math.random() * st.spawns.length) | 0;
    // **経路の途中に据える。出現口には置かない。**
    //   最初は出現口のすぐ内側に置いたが、そこは誰の射線にも入らない。
    //   動かない敵が誰にも撃たれない場所にいると、**永久に倒せない**
    //   （実測：HPを26倍から6倍まで下げても撃破0、ウェーブが終わらず時間切れ）。
    //   守りが並ぶのは道の途中なので、そこへ置く
    const route = st.routes[si] || [];
    const at = route.length ? route[Math.floor(route.length * BAL.bossAt)] : null;
    const sp = st.spawns[si];
    const p = at !== null && at !== undefined
      ? { x: (at % st.cols) * TILE + TILE / 2, y: ((at / st.cols) | 0) * TILE + TILE / 2 }
      : st.center(sp.c, sp.r);
    const t = ENEMY_TYPES.grunt;
    const chMul = this.chapterWeight(run);
    const base = BAL.enemyHpBase * Math.pow(BAL.enemyHpGrowth, g - 1)
               * Math.pow(BAL.stageHpMul, run.stageIdx) * chMul;
    const e = this.makeEnemy(run, t, g, p.x, p.y, si, base * BAL.bossHp);
    e.spd = 0;                       // **動かない**
    e.r = 26;
    e.color = '#ffb347';
    e.tname = 'boss';
    e.boss = true;
    e.addT = BAL.bossAddSec;
    e.coin = e.coin * BAL.bossCoin;
    run.enemies.push(e);
    run.hasBoss = true;
  },

  startWave(run) {
    run.phase = 'spawn';
    run.toSpawn = this.waveCount(run);
    // **湧き間隔は「そのウェーブの総数」で割る。**
    // 残り数で割ると、減るほど間隔が伸びて最後の1体に湧き秒数まるごとかかる
    run.waveTotal = run.toSpawn;
    run.spawnTimer = 0;
    run.spawnPick = 0;
    // 穴の切り替え。**ウェーブごとに違う穴から始める**ので、同じ絵にならない
    run.mouthLeft = 0;
    run.hasBoss = false;
    if (this.isBossWave(run)) this.spawnBoss(run);
  },

  // そのウェーブが湧き切るまでの秒数。
  //   **下限は spawnSeconds、そこから先は「1秒あたり spawnRateMax 体」で伸びる。**
  //   数が少ないうちは一定時間、増えてきたら出し切るのに時間がかかる、という形。
  //   測定器も同じ式を使うので、ここを直せば両方が揃う
  spawnSecFor(n) {
    const c = Math.max(1, n);
    return Math.max(BAL.spawnSeconds, c / Math.max(0.1, BAL.spawnRateMax));
  },

  spawnInterval(run) {
    const n = Math.max(1, run.waveTotal || this.waveCount(run));
    return Math.max(BAL.spawnIntervalMin, this.spawnSecFor(n) / n);
  },

  pickType(g) {
    const avail = Object.values(ENEMY_TYPES).filter(t => g >= t.from);
    if (avail.length === 1) return avail[0];
    return Util.weighted(avail, t => t.weight || 10);
  },

  // **ボスは置かない。**
  //   実測で5ステージすべて撃破0（毎回漏れてライフ5を持っていくだけで、
  //   コイン報酬は一度も支払われていなかった）。
  //   出す順番を最後に変えても 7体中1体しか倒せず、
  //   「倒せない1体に必ず税金を取られる」以上の役をしていなかったので外した
  // 1体作る。**種類の違いはここで全部乗る**（装甲・再生・分裂）
  makeEnemy(run, t, g, x, y, si, hpOverride, gen) {
    // 章ごとの重み（ストップポイント／跳ね上げポイント）
    const chMul = this.chapterWeight(run);
    const stageMul = Math.pow(BAL.stageHpMul, run.stageIdx) * chMul;
    const base = BAL.enemyHpBase * Math.pow(BAL.enemyHpGrowth, g - 1) * stageMul;
    const hp = hpOverride !== undefined ? hpOverride : base * t.hp;
    return {
      x, y, hp, maxHp: hp, si,
      spd: Math.min(BAL.enemySpdCap, BAL.enemySpdBase * Math.pow(BAL.enemySpdGrowth, g)) * t.spd,
      r: t.r,
      // **この値は誰も読んでいない**（2026-09-21 に src 全体を検索して確認）。
      //   漏れの重さは BAL.leakLives。消さずに残しているのは balance.js の注記のとおり
      dmg: BAL.enemyDpsBase * Math.pow(BAL.enemyDpsGrowth, g - 1),
      coin: BAL.enemyCoinBase * Math.pow(BAL.enemyCoinGrowth, g - 1) * t.coin,
      color: t.color,
      tname: t.name,                   // 死因の内訳に使う
      // **装甲は「そのウェーブの雑魚HPの何割か」**。固定値にすると章が進んだ瞬間に
      //   意味が消えるし、割合にすると大きい弾も同じだけ削られて意味が出ない
      armor: t.armor ? base * t.armor : 0,
      regen: t.regen ? hp * t.regen : 0,
      split: gen ? 0 : (t.split || 0),   // 割れた子はもう割れない
      gen: gen || 0,

      pushX: 0, pushY: 0,
      shock: 0, slow: 0, slowT: 0, stun: 0, chill: 0,
      burn: 0, burnT: 0, fvuln: 0, fvulnT: 0,
      grabT: 0, grabV: 0, spotT: 0, dist: 1e9, counted: false,
      hitFlash: 0, dead: false, ang: 0,
    };
  },

  spawnEnemy(run) {
    if (run.enemies.length >= BAL.enemyCap) return;
    const st = run.stage;
    const g = this.gw(run);
    const t = this.pickType(g);
    // **穴の単位で流す。**（ユーザー 2026-09-21「壁に開いた穴からゾロゾロと出てくる感じ」）
    //   前は `spawnPick % spawns.length` で全部の S タイルを1体ずつ順に使っていた。
    //   穴が2つ × 幅4なら、**左右の穴から交互に1体ずつ**出るので
    //   「点から湧いている」のと見え方が同じだった。
    //   1つの穴の幅を端から端まで2往復ぶん流してから、次の穴へ移る
    const mouths = (st.mouths && st.mouths.length) ? st.mouths : null;
    let si;
    if (mouths) {
      if (!(run.mouthLeft > 0)) {
        run.mouthI = (run.mouthI === undefined)
          ? ((Math.random() * mouths.length) | 0)
          : (run.mouthI + 1) % mouths.length;
        run.mouthLeft = mouths[run.mouthI].length * 2;
        run.mouthPick = 0;
      }
      const m = mouths[run.mouthI];
      si = m[run.mouthPick++ % m.length];
      run.mouthLeft--;
    } else {
      si = run.spawnPick++ % st.spawns.length;
    }
    const sp = st.spawns[si];
    const p = st.center(sp.c, sp.r);
    // **群れはまとめて出す。**（1体ずつだと「群れ」にならない）
    const n = t.burst || 1;
    for (let i = 0; i < n; i++) {
      if (run.enemies.length >= BAL.enemyCap) break;
      run.enemies.push(this.makeEnemy(run, t,  g,
        p.x + Util.rand(-14, 14), p.y + Util.rand(-14, 14), si));
    }
  },

  statusScale(e) { return 1; },       // ボスを外したので、今はどの敵も同じ

  // 倒した場所の「深さ」による取り分。
  //   湧き口で倒すと ×1、コアの目の前で倒すと ×(1 + coinDepth)。
  //   e.dist は流れ場が持つ「コアまでの残りタイル数」なので、
  //   マップの形が変わっても同じ意味で効く
  depthBonus(run, e) {
    if (!BAL.coinDepth) return 1;
    const far = run.maxDist || 1;
    const t = Util.clamp(1 - (e.dist || 0) / far, 0, 1);   // 0=湧き口 / 1=コア
    return 1 + BAL.coinDepth * t;
  },

  // ================= ダメージ =================
  vuln(run, e) {
    let v = 1;
    if (e.shock > 0) v += BAL.shockVuln;
    if (e.chill > 0) v += run.chillVuln + run.st.chillVuln;
    if (e.fvulnT > 0) v += e.fvuln;
    return v;
  },

  damage(run, e, amount, opts) {
    if (e.dead) return 0;
    opts = opts || {};
    let dmg = amount * this.vuln(run, e);
    // **装甲は1発ごとに引く。** 手数の武器ほど損をする。
    //   引ききっても最低 15% は通す（完全無敵にすると詰む）
    if (e.armor > 0 && !opts.dot) dmg = Math.max(dmg * 0.15, dmg - e.armor);
    const crit = opts.crit === true || (typeof opts.crit === 'number' && Util.chance(opts.crit)) ||
                 opts.forceCrit === true;
    if (crit) dmg *= opts.critMul || 2;
    e.hp -= dmg;
    e.hitFlash = 0.1;
    run.dealt += dmg;

    // ---- 状態異常。**遺物の軸がここで乗る**（relics.js の st）----
    //   opts.dot が立っているものは、燃焼・毒の雲など**すでに状態異常が
    //   起こしているダメージ**。ここへ付与を掛けると自分で自分を延長し続けて
    //   永久に切れなくなるので、付与（*Grant）は素の攻撃だけに掛ける
    const sc = this.statusScale(e);
    const st = run.st;
    if (opts.shock) e.shock = Math.max(e.shock, opts.shock * sc + st.shockDur);

    let sl = opts.slow || 0, slD = (opts.slowDur || 0) * sc, ch = !!opts.chill;
    if (st.chillGrant > 0 && !opts.dot) {           // 霜結：どの武器でも凍る
      if (st.chillGrant > sl) sl = st.chillGrant;
      if (BAL.grantChillDur > slD) slD = BAL.grantChillDur;
      ch = true;
    }
    if (sl > 0) {
      e.slow = Math.max(e.slow, Math.min(BAL.slowMax, sl + st.slowAdd));
      const d = (slD || 1) + st.chillDur;
      e.slowT = Math.max(e.slowT, d);
      if (ch) e.chill = Math.max(e.chill, d);
    }

    if (opts.stun) e.stun = Math.max(e.stun, opts.stun * sc + st.stunDur);

    let bn = opts.burn || 0, bd = opts.burnDur || 0;
    if (st.burnGrant > 0 && !opts.dot) {            // 熾火：どの武器でも燃える
      const g = amount * st.burnGrant;
      if (g > bn) { bn = g; if (BAL.grantBurnDur > bd) bd = BAL.grantBurnDur; }
    }
    if (bn > 0) {
      e.burn = Math.max(e.burn, bn * st.burnMul);
      e.burnT = Math.max(e.burnT, (bd || 3) + st.burnDur);
    }

    if (!e.dead && opts.exec && e.hp > 0 && e.hp / e.maxHp <= opts.exec) e.hp = 0;

    if (run.nums.length < 70 && dmg > 0) {
      run.nums.push({ x: e.x + Util.rand(-6, 6), y: e.y - e.r, t: 0, life: 0.6,
        txt: Util.fmt(dmg), crit: crit, color: opts.color || '#fff' });
    }

    if (e.hp <= 0 && !e.dead) this.kill(run, e, opts);
    return dmg;
  },

  kill(run, e, opts) {
    e.dead = true;
    // **倒すと割れる。** 過剰ダメージで一掃する編成が、そのぶん数を増やす
    if (e.split > 0 && run.enemies.length + e.split <= BAL.enemyCap) {
      const t = ENEMY_TYPES[e.tname] || ENEMY_TYPES.grunt;
      const g = this.gw(run);
      for (let i = 0; i < e.split; i++) {
        const c = this.makeEnemy(run, t, g, e.x + Util.rand(-12, 12), e.y + Util.rand(-12, 12),
                                 e.si, e.maxHp * BAL.splitHp, 1);
        c.r = Math.max(6, t.r * 0.7);
        c.spd = e.spd * 1.25;
        c.coin = e.coin * 0.35;
        run.enemies.push(c);
      }
    }
    run.kills++;
    Game.perm.totalKills++;
    Snd.kill();

    // **どこで倒したかで取り分が変わる。**
    //   湧き口は「敵が必ず、常に、最大密度でいる1点」なので、
    //   そこへ置くのが無条件の最適解になっていた（指定攻撃に射線が無いため）。
    //   禁止するのではなく、**奥まで通してから倒すほうが儲かる**ようにして、
    //   置き場所をプレイヤーに選ばせる。止め損ねる危険が、そのまま対価
    const coin = e.coin * run.coinMul * run.mods.coin * this.depthBonus(run, e);
    Game.meta.coins += coin;
    run.coinsEarned += coin;

    // 砕氷：凍ったまま死ぬと氷片が飛ぶ
    const cw = run.wp('cryo');
    if (cw && cw.flags.shatter && e.chill > 0 && !(opts && opts.shard)) {
      const near = Grid.query(e.x, e.y, 90, _q);
      for (const o of near) {
        if (o.dead || o === e) continue;
        if (Util.dist(e.x, e.y, o.x, o.y) > 90) continue;
        this.damage(run, o, cw.s.dmg * 1.6, { color: '#bff0ff', shard: true });
      }
      this.fx(run, { type: 'boom', x: e.x, y: e.y, r: 90, color: '#bff0ff', life: 0.25 });
    }

    if (run.fx.length < 180) {
      this.fx(run, { type: 'boom', x: e.x, y: e.y, r: e.r * 1.5, color: e.color, life: 0.22 });
      // **倒す＝儲かる、を目で見えるようにする。**
      // これまでHUDの数字が静かに増えるだけで、報酬を得た実感が無かった
      if (this.coinFx < 26) {
        this.coinFx++;
        this.fx(run, { type: 'coin', x: e.x, y: e.y, life: 0.5 });
      }
    }
  },

  // ================= 攻撃のかたち =================
  spawnBullet(w, run, angle, o) {
    Snd.shot(w.id);
    if (run.bullets.length > 1200) run.bullets.shift();
    o = o || {};
    const s = w.s;
    // 扇を広げているほど弾がばらける。狭く絞れば一点に集まる
    const g = w.group !== undefined ? w.group : 1;
    if (g < 1) angle += Util.rand(-1, 1) * (1 - g) * BAL.spreadRad;
    const speed = s.speed * (o.speedMul || 1);
    let dmg = s.dmg * (o.dmgMul || 1);
    // 散撃砲身：**扇の広さがそのまま威力になる。** 広げる側にも見返りを置く
    if (w.flags.wideDmg) dmg *= 1 + Game.arcT(w) * w.dyn.wideDmg;
    if (w.id === 'sniper' && run.resonance > 0) dmg *= (1 + run.resonance);

    run.bullets.push({
      x: w.x, y: w.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      dmg, r: o.bulletR || s.bulletR,
      pierce: o.pierce !== undefined ? o.pierce : s.pierce,
      bounce: o.bounce !== undefined ? o.bounce : s.bounce,
      hit: null,
      splash: o.splash !== undefined ? o.splash : s.splash,
      splashMul: s.splashMul,
      homing: o.homing !== undefined ? o.homing : s.homing,
      crit: s.crit, critMul: s.critMul,
      exec: s.execThr, shock: s.shockDur,
      slow: s.slow, slowDur: s.slowDur,
      stun: o.bubble ? s.stunDur : 0,
      burn: s.burn ? s.dmg * s.burn : 0, burnDur: s.burnDur,
      color: o.color || '#fff',
      long: !!o.long, spin: !!o.spin, bubble: !!o.bubble,
      life: o.life || 3.2,
      src: w, wid: w.id,
      range: s.range * 1.35,
      ox: w.x, oy: w.y,
      hits: 0,                       // 何体を貫いたか。軌跡の太さになる
      through: !!w.def.wallThrough,  // 壁を抜けるか（触手・刀・範囲もの）
      target: null,
    });
  },

  // 目標地点へ投げる（毒ガスの散布弾・迫撃砲の砲弾）
  spawnLob(w, run, tx, ty, o) {
    Snd.shot(w.id);
    if (run.bullets.length > 1200) run.bullets.shift();
    const a = Util.angle(w.x, w.y, tx, ty);
    const speed = w.s.speed;
    run.bullets.push({
      x: w.x, y: w.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      dmg: 0, r: w.s.bulletR, pierce: 0, bounce: 0, hit: null,
      splash: 0, splashMul: 1, homing: 0, crit: 0, critMul: 2,
      exec: 0, shock: 0, slow: 0, slowDur: 0, stun: 0, burn: 0, burnDur: 0,
      color: o.color || '#8fd94a', lob: true, mark: !!o.mark, rocket: !!o.rocket, through: true,
      landX: tx, landY: ty, onLand: o.onLand,
      life: 5, src: w, wid: w.id, range: w.s.range * 1.8, ox: w.x, oy: w.y, target: null,
    });
  },

  coneDamage(w, run, angle, arc, range, dmg, opts) {
    opts = opts || {};
    dmg *= (w.group !== undefined ? w.group : 1);   // 即着系は出力が散るぶん1体あたりが落ちる
    const near = Grid.query(w.x, w.y, range + 20, _q);
    let hits = 0;
    for (const e of near) {
      if (e.dead) continue;
      const d = Util.dist(w.x, w.y, e.x, e.y);
      if (d > range + e.r) continue;
      let da = Util.angle(w.x, w.y, e.x, e.y) - angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > arc) continue;
      const o = Object.assign({}, opts);
      if (w.flags.frostCrit && e.chill > 0) o.forceCrit = true;
      this.damage(run, e, dmg, o);
      hits++;
    }
    if (w.flags.mugen && hits > 0)
      w.s.range = Math.min(w.dyn.mugenBase * (w.dyn.mugenMax || 2), w.s.range * (w.dyn.mugenStep || 1.06));
    // 爆燃（syn_backdraft）：毒の雲に炎が届くと引火する。
    //
    //   **以前は引火した雲を消していた（run.fields.splice）。**
    //   火炎は毎秒12発撃つので、雲は湧いた瞬間に消し飛び、
    //   毒ガスは「雲を出す武器」であることをやめていた。
    //   雲が残っていれば稼げたはずの dps×持続（5.5秒ぶん）と、
    //   雲が持つ脆弱（+20%）と減速まで一緒に捨てていたことになる。
    //   **実測（4シード）：このカードを3枚積むと 0.94倍＝積むほど弱くなる。**
    //
    //   いまは**雲を消さない。**代わりに引火の間隔（BAL.igniteCooldown）を置く。
    //   消さずに毎発（毎秒12回）爆発させると、こんどは際限なく増えるため。
    //   実測（4シード・3枚積み）：消していた頃 0.94倍 → 1回だけ 1.02倍 → 間隔1.2秒 で下記
    if (w.flags.ignite) {
      for (const f of run.fields) {
        if (f.kind !== 'gas') continue;
        if (f.ignited !== undefined && f.t < f.ignited) continue;   // 再引火の間隔
        if (Util.dist(w.x, w.y, f.x, f.y) > range + f.r) continue;
        f.ignited = f.t + BAL.igniteCooldown;
        this.explode(run, f.x, f.y, f.r * 1.5, f.dps * 9 * (1 + run.backdraft * 0.5),
          { color: '#ff9a4a', burn: f.dps * 0.6, burnDur: 3 });
      }
    }
    return hits;
  },

  pulse(w, run, range, dmg, opts) {
    Snd.shot(w.id);
    dmg *= (w.group !== undefined ? w.group : 1);   // 即着系は出力が散るぶん1体あたりが落ちる
    const near = Grid.query(w.x, w.y, range + 20, _q);
    const thru = this.through(w);
    for (const e of near) {
      if (e.dead) continue;
      if (Util.dist(w.x, w.y, e.x, e.y) > range + e.r) continue;
      // **壁越しには届かない。**（抜けてよい武器は def.wallThrough）
      if (!thru && this.losBlocked(run.stage, w.x, w.y, e.x, e.y)) continue;
      this.damage(run, e, dmg, opts);
    }
  },

  spawnField(run, x, y, o) {
    if (run.fields.length > 70) run.fields.shift();
    run.fields.push({
      x, y, r: o.r, dur: o.dur, t: 0, tick: 0,
      dps: o.dps, slow: o.slow || 0, vuln: o.vuln || 0,
      color: o.color, kind: o.kind || 'gas',
    });
  },

  grab(w, run, first, power, dur, dmg) {
    const targets = [first];
    if (w.s.count > 1) {
      const near = Grid.query(w.x, w.y, w.s.range, _q);
      const extra = near.filter(e => !e.dead && e !== first && Util.dist(w.x, w.y, e.x, e.y) <= w.s.range)
        .sort((a, b) => a.dist - b.dist).slice(0, w.s.count - 1);
      for (const e of extra) targets.push(e);
    }
    for (const t of targets) {
      if (!t || t.dead) continue;
      t.grabT = Math.max(t.grabT, dur * this.statusScale(t));
      t.grabV = power;
      this.damage(run, t, dmg, { color: '#ffb0e8' });
      this.fx(run, { type: 'tentacle', x1: w.x, y1: w.y, e: t, color: '#c85ab0',
                     ph: Math.random() * 6.28, life: Math.min(0.6, dur) });
    }
  },

  chainLightning(w, run, first, chains, dmg) {
    let cur = first, d = dmg * (w.group !== undefined ? w.group : 1);
    const used = new Set();
    const pts = [{ x: w.x, y: w.y }];
    for (let i = 0; i <= chains; i++) {
      if (!cur || cur.dead) break;
      // 1体目は砲から。**壁越しには飛ばない。**2体目以降は敵から敵なので通す
      if (i === 0 && !this.through(w) && this.losBlocked(run.stage, w.x, w.y, cur.x, cur.y)) break;
      used.add(cur);
      pts.push({ x: cur.x, y: cur.y });
      this.damage(run, cur, d, { shock: w.s.shockDur, color: '#d8c7ff', crit: w.s.crit, critMul: w.s.critMul });
      d *= w.s.chainFalloff;
      const near = Grid.query(cur.x, cur.y, 150, _q);
      let best = null, bd = 1e9;
      for (const e of near) {
        if (e.dead || used.has(e)) continue;
        let dd = Util.dist2(cur.x, cur.y, e.x, e.y);
        if (e.stun > 0) dd *= 0.25;      // 感電泡：閉じ込めた敵を優先して通る
        if (dd < bd) { bd = dd; best = e; }
      }
      cur = best;
    }
    if (pts.length > 1) this.fx(run, { type: 'bolt', pts, life: 0.13, color: '#c9b3ff' });
  },

  explode(run, x, y, radius, dmg, opts) {
    opts = opts || {};
    const near = Grid.query(x, y, radius, _q);
    for (const e of near) {
      if (e.dead) continue;
      const d = Util.dist(x, y, e.x, e.y);
      if (d > radius + e.r) continue;
      const fall = Util.clamp(1 - (d / (radius + e.r)) * 0.55, 0.45, 1);
      let v = dmg * fall;
      // 特定の状態の敵だけ増える分（シナジー）。**狙いは変えない。**
      // 「その敵を狙う」のではなく「その敵に落ちたときに効く」
      if (opts.grabMul && e.grabT > 0) v *= opts.grabMul;
      if (opts.spotMul && e.spotT > 0) v *= opts.spotMul;
      this.damage(run, e, v, Object.assign({ color: '#ffc38a' }, opts));
    }
    this.fx(run, { type: 'boom', x, y, r: radius, color: opts.color || '#ff9a4a', life: 0.3 });
    this.shake(run, Math.min(10, radius * 0.06));
  },

  // この発射で撃つ弾数。
  // **扇を広げるのが得になるカード**（多銃身）がここに乗る。
  // 広げるとカバー範囲は増えるが集弾率が落ちる、という一方通行だったので、
  // 「広さそのものを利益に変える」道をカードで用意している
  shotCount(w) {
    let n = w.s.count;
    if (w.flags.wideCount) n += Math.round(Game.arcT(w) * w.dyn.wideCount);
    return Math.max(1, Math.round(n));
  },

  // ================= 指定攻撃（着弾円） =================
  //
  //   **この分類だけは、砲身から敵へ弾が飛ばない。**
  //   プレイヤーが盤面に円を置き、その中へ砲弾が降り注ぐ。
  //
  //   ・砲弾は **着弾するまで一切の当たり判定を持たない**（敵も壁も素通りする）。
  //     だから射線を持たず、スナイパーやガトリングが置きたい地面を食わない。
  //     好きな場所に置けるのが、この分類の強み
  //   ・**円を絞るほど強い。** 倍率は掛けていない。同じ発射数が狭い面に落ちるので
  //     同じ敵に重なるだけ。広げれば、道を外した砲弾はただの空振りになる
  bombard(w, run, color, o) {
    const p = w.aim;
    if (!p) return;
    const rocket = !!(o && o.rocket);
    const R = Game.spotR(w);
    const n = w.n || 1;
    for (let i = 0; i < n; i++) {
      // 円の中に一様に散らす（sqrt を掛けないと中心に寄る）
      const a = Util.rand(0, Math.PI * 2);
      const d = Math.sqrt(Math.random()) * R;
      this.spawnLob(w, run, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, {
        color: color || w.def.color, mark: true, rocket,
        onLand: (rr, x, y) => this.spotImpact(w, rr, x, y),
      });
    }
  },

  // 着弾。**弾が当たったときと同じことをする**ので、
  // クラスター・酸・感電・内破といったカードがそのまま効く
  spotImpact(w, run, x, y) {
    const dmg = w.s.dmg;
    const R = Math.max(18, w.s.splash);
    let shock = 0;
    if (w.flags.implode) shock = Math.max(shock, w.s.shockDur || 2.5);
    if (w.flags.staticFoam) shock = Math.max(shock, w.s.shockDur || 3);
    this.explode(run, x, y, R, dmg * (w.s.splashMul || 1), {
      color: w.def.color,
      shock,
      stun: w.s.stunDur || 0,
      slow: w.s.slow, slowDur: w.s.slowDur,
      burn: w.s.burn ? dmg * w.s.burn : 0, burnDur: w.s.burnDur,
      crit: w.s.crit, critMul: w.s.critMul, exec: w.s.execThr,
      grabMul: w.dyn.grabMul || 0,
      spotMul: w.dyn.spotMul || 0,
    });
    if (w.dyn.cluster) {
      this.cluster(run, { x, y, dmg, splash: R, splashMul: w.s.splashMul || 1, src: w, wid: w.id });
    }
    if (w.flags.acid) {
      this.spawnField(run, x, y, { kind: 'acid', r: w.s.fieldR, dur: w.s.fieldDur,
        dps: dmg * 0.35, vuln: 0.15, color: '#a8f0c0' });
    }
  },

  fx(run, o) { if (run.fx.length < 240) { o.t = 0; run.fx.push(o); } },
  // 画面の揺れ。**撃ちっぱなしにしたので、撃つたびに揺らすと一生揺れる。**
  //   日常の揺れ（発砲・爆発）は 3px までしか積めない
  //   一発ものの衝撃（ボス撃破・雷神・漏れ）だけが 16px まで上げられる
  shake(run, v, big) {
    const cap = big ? 16 : 3;
    if (run.shake >= cap) return;
    run.shake = Math.min(cap, run.shake + v * 0.35);
  },

  // ================= 照準 =================

  // 扇の中に入っているか
  inArc(w, x, y) {
    let da = Util.angle(w.x, w.y, x, y) - w.face;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    return Math.abs(da) <= w.arc;
  },

  // **武器に敵を探させない。**
  //   以前は「最も密集した点」「最も硬い敵」などを武器が自分で選んでいた。
  //   いまは、砲身が向いている線の上にいるものを拾うだけ。
  //   着弾点を持つ武器（指定攻撃・ミサイル）は、その点にいるものを拾う
  // ---------- 壁で射線が切れる ----------
  //
  //   **壁を抜ける弾を無くす。**（ユーザー 2026-09-22）
  //   > 「壁貫通消してください、的が直線で通る場所に目掛けて
  //   >   壁の中に3個くらいスナイパー埋め込むの強すぎます」
  //   > 「実質的に射程範囲のある武器は壁外側のみの設置条件に縛られるため、
  //   >   少し今より全体的に弱くなるはずです、狙いはそれです」
  //
  //   ユニットは**壁の上に建つ**（buildable ＝ '#'）ので、
  //   自分が乗っているマスまで壁として数えると、置いた瞬間に何も撃てなくなる。
  //   **撃ち口から TILE*0.9 の内側にある壁は無視する。**
  //   こうすると、壁の縁に建てた砲は通路へ撃てるが、
  //   **壁の内側へ1マス引っ込めた砲は、手前の壁で止まる**
  //
  //   抜けてよい武器（ユーザー 2026-09-22
  //   「仮に壁を貫通する武器があったとしても、触手や範囲武器、刀、迫撃砲が妥当」）
  //     ・触手 … 腕なので回り込める
  //     ・刀／火炎放射器／毒ガス散布機 … 範囲もの
  //     ・山なりに撃つもの（迫撃砲・ミサイル・泡）… 壁の上を越える
  //   sx,sy … 「足元」の中心。省くと始点そのもの。
  //     **弾は毎フレーム、進んだぶんの線分だけを渡す。**
  //     撃ち口から今の位置まで毎回まるごと見直すと、
  //     遠くまで飛ぶ弾ほど1フレームの費用が伸びる（距離に比例して増え続ける）。
  //     足元の判定だけは撃ち口 (ox,oy) を基準に保つ必要があるので、別に受け取る
  losBlocked(st, x0, y0, x1, y1, sx, sy) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1) return false;
    if (sx === undefined) { sx = x0; sy = y0; }
    const skip2 = (TILE * 0.9) * (TILE * 0.9);
    const step = TILE * 0.4;
    const n = Math.ceil(len / step);
    for (let i = 1; i <= n; i++) {
      const t = Math.min(1, (i * step) / len);
      const x = x0 + dx * t, y = y0 + dy * t;
      const ex = x - sx, ey = y - sy;
      if (ex * ex + ey * ey < skip2) continue;       // 撃ち口の足元は見ない
      if (!st.walkable((x / TILE) | 0, (y / TILE) | 0)) return true;
    }
    return false;
  },

  // その武器は壁を抜けるか
  through(w) {
    return !!(w && w.def && w.def.wallThrough);
  },

  findTarget(w, run) {
    // 指定攻撃は「どこに落とすか」だけで動く。狙う敵という概念を持たない
    if (w.ax !== undefined && w.ax !== null) return null;
    return this.targetAhead(w, run);
  },

  // 砲身の動かし方。**敵を追わない。**
  //   ふつうの武器 … 扇の端から端まで、一定の速さで往復する（首振り扇風機）
  //   指定攻撃     … プレイヤーが決めた着弾点へ向ける（そこへ撃ち込むための武器）
  aimUpdate(w, run, dt) {
    if (w.ax !== undefined && w.ax !== null) {
      // 指定攻撃。**扇は持たない。** 砲身は着弾円の中心を向くだけで、
      // 制約は射程だけ（向きのスライダーは、円を置ける方向を決めるのに使う）
      const want = Util.angle(w.x, w.y, w.ax, w.ay);
      w.angle = Util.turnToward(w.angle, want, w.s.turn * dt);
      w.aim = { x: w.ax, y: w.ay };
      return;
    }
    const sp = (w.def.sweep || BAL.sweepSpeed) * dt;
    if (w.sweepDir === undefined) { w.sweepDir = 1; w.sweepA = 0; }
    w.sweepA += sp * w.sweepDir;
    if (w.sweepA >= w.arc) { w.sweepA = w.arc; w.sweepDir = -1; }
    else if (w.sweepA <= -w.arc) { w.sweepA = -w.arc; w.sweepDir = 1; }
    w.angle = w.face + w.sweepA;
    w.aim = null;
  },

  // 砲身の線が実際に通っている敵のうち、一番近いもの
  // 砲身の線が通っている敵のうち、いちばん近いもの。
  //
  //   **射程まるごとを探すのをやめた。** 以前は Grid.query(w.x, w.y, w.s.range)
  //   で円の中の敵を全部取っていたが、走査するセル数が **射程の2乗** で増える。
  //   実測：ユニット52基・射程がインフレした状態で、
  //   **敵が1〜2体しかいないのに1フレーム 23.7ms**（60fpsの予算16.7msを超える）。
  //   弾を全部消しても 23.9ms だったので、犯人は弾ではなくここだった。
  //
  //   探すのは「砲身の線の上」だけでよいので、線に沿ってセルを辿る。
  //   セル数が射程に**比例**するだけになる（2乗ではなくなる）
  //   **いま持っている当たりより外側は見ない。** 1回 11µs → 3.26µs（3.4倍）。
  //
  //   一度これを「結果が変わるから」と却下しかけた。同じシードで1回ずつ比べて
  //   撃破数が違ったからだが、**測定器はシードを固定しても毎回わずかに違う**
  //   （原因未特定。組み込み前から同じ）。1回の差は雑音だった。
  //   4回ずつ回した平均は 5,192撃破 対 5,201撃破（差 0.2%、振れ幅 ±10%の中）、
  //   到達章は両方 8/8 で変わらず、全体は 23.0秒 → 16.0秒（1.44倍）
  //
  //   **「敵全体を囲む枠で線を切る」案は、測ったら効かなかったので入れていない。**
  //   首振りなので大半の角度は空を向いている、という読みだったが、
  //   敵は盤面のほとんどに散っていて枠がほぼ全面になる。
  //   4回ずつで 19.4秒（枠なし）対 19.8秒（枠あり）で、**むしろ遅い。**
  //   ここは「線の上に敵がいないときの走査」が本体で、枠では減らせない
  targetAhead(w, run) {
    const ca = Math.cos(w.angle), sa = Math.sin(w.angle);
    let range = w.s.range;
    // **壁の向こうの敵は狙わない。**（狙うと、当たらない方向へ撃ち続ける）
    if (!this.through(w)) {
      const st = run.stage;
      const skip2 = (TILE * 0.9) * (TILE * 0.9);
      const step = TILE * 0.4;
      for (let d = step; d <= range; d += step) {
        if (d * d < skip2) continue;
        const x = w.x + ca * d, y = w.y + sa * d;
        if (!st.walkable((x / TILE) | 0, (y / TILE) | 0)) { range = d - step; break; }
      }
      if (range <= 0) return null;
    }
    const cs = Grid.cell;
    const pad = (w.s.bulletR || 3) + 20;      // 線の太さ＋敵の半径ぶんの余裕
    let best = null, bd = Infinity;
    const seen = _seenCells;
    seen.clear();
    for (let d = 0; d <= range + cs; d += cs * 0.5) {
      if (best && d - pad - cs > bd) break;
      const x = w.x + ca * Math.min(d, range), y = w.y + sa * Math.min(d, range);
      const gx0 = ((x - pad) / cs) | 0, gx1 = ((x + pad) / cs) | 0;
      const gy0 = ((y - pad) / cs) | 0, gy1 = ((y + pad) / cs) | 0;
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gy = gy0; gy <= gy1; gy++) {
          const k = Grid.key(gx, gy);
          if (seen.has(k)) continue;
          seen.add(k);
          const arr = Grid.map.get(k);
          if (!arr) continue;
          for (const e of arr) {
            if (e.dead) continue;
            const dx = e.x - w.x, dy = e.y - w.y;
            const along = dx * ca + dy * sa;                  // 砲身方向の距離
            if (along < 0 || along > range + e.r) continue;
            if (along >= bd) continue;
            const off = Math.abs(-dx * sa + dy * ca);         // 線からの横ずれ
            if (off > e.r + (w.s.bulletR || 3) + 2) continue; // 線が体に掛かっていない
            bd = along; best = e;
          }
        }
      }
    }
    return best;
  },

  // ================= 更新 =================
  // 戻り値: null / 'dead'（コア破壊）/ 'waveclear' / 'stageclear'
  update(run, dt) {
    const st = run.stage;
    Grid.build(run.enemies);
    let signal = null;

    // --- ウェーブ進行 ---
    if (run.phase === 'spawn') {
      // **「敵がいないときだけ湧きを早める」は入れなかった。**
      // 実測で効果が誤差（1周 19.5→20.4分、待ち率 65→67%）。
      // 湧き間隔が0.16秒なので、湧いている最中に盤面が空になることがほぼ無く、
      // 早める対象そのものが存在しなかった
      run.spawnTimer -= dt;
      let guard = 0;
      while (run.spawnTimer <= 0 && run.toSpawn > 0 && guard++ < 60) {
        // **盤面が上限なら、湧かせずに待つ。**
        //   以前はここで toSpawn を減らしていたので、上限に当たったぶんの敵が
        //   黙って消えていた。ウェーブの数が嘘になるうえ、
        //   詰まっているときほど敵が減る（＝勝手に易しくなる）という逆の挙動だった。
        //   waveCountMax を 260 から開けたので、ここに当たる場面が実際に出る
        if (run.enemies.length >= BAL.enemyCap) break;
        this.spawnEnemy(run);
        run.toSpawn--;
        run.spawnTimer += this.spawnInterval(run);
      }
      if (run.toSpawn <= 0) run.phase = 'clear';
    } else if (run.phase === 'clear') {
      // このウェーブの敵を全部片づけたら突破。
      // 次のウェーブは自動で来ない。ビルドフェーズに戻して、置き直す時間を作る
      if (run.enemies.length === 0) {
        signal = this.isLastWave(run) ? 'stageclear' : 'waveclear';
        run.phase = 'build';
      }
    }

    // --- 場（毒の雲など） ---
    for (let i = run.fields.length - 1; i >= 0; i--) {
      const f = run.fields[i];
      f.t += dt;
      if (f.t >= f.dur) { run.fields.splice(i, 1); continue; }
      f.tick += dt;
      if (f.tick >= BAL.fieldTick) {
        const step = f.tick;
        f.tick = 0;
        const near = Grid.query(f.x, f.y, f.r, _q);
        for (const e of near) {
          if (e.dead) continue;
          if (Util.dist(f.x, f.y, e.x, e.y) > f.r + e.r) continue;
          if (f.vuln) { e.fvuln = f.vuln; e.fvulnT = 0.4; }
          // 場の減速にも遺物の軸を乗せる。**ここは damage() を通らないので、
          // 書き忘れると「毒の雲だけ遺物が効かない」ことになる**
          if (f.slow) {
            e.slow = Math.max(e.slow, Math.min(BAL.slowMax, f.slow + run.st.slowAdd));
            e.slowT = Math.max(e.slowT, 0.5 + run.st.chillDur);
          }
          this.damage(run, e, f.dps * step, { color: f.kind === 'gas' ? '#c6ff7a' : '#ffb066', dot: true });
        }
      }
    }

    // --- 敵 ---
    const tw = run.tower;
    run.trafficT += dt;
    const sample = run.trafficT >= BAL.trafficSample;
    if (sample) run.trafficT = 0;

    for (let i = run.enemies.length - 1; i >= 0; i--) {
      const e = run.enemies[i];
      if (e.dead) { run.enemies.splice(i, 1); continue; }
      if (e.shock > 0) e.shock -= dt;
      if (e.chill > 0) e.chill -= dt;
      if (e.stun > 0) e.stun -= dt;
      if (e.grabT > 0) e.grabT -= dt;
      if (e.spotT > 0) e.spotT -= dt;
      if (e.fvulnT > 0) e.fvulnT -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.burnT > 0) { e.burnT -= dt; this.damage(run, e, e.burn * dt, { color: '#ff8a3a', dot: true }); if (e.dead) continue; }
      // **ボスは雑魚を出し続ける。** 倒すまで手が空かない、が罰になる
      if (e.boss) {
        e.addT -= dt;
        if (e.addT <= 0) {
          e.addT = BAL.bossAddSec;
          if (run.enemies.length < BAL.enemyCap) {
            const g2 = this.gw(run);
            const t2 = this.pickType(g2);
            run.enemies.push(this.makeEnemy(run, t2, g2,
              e.x + Util.rand(-18, 18), e.y + Util.rand(-18, 18), e.si));
          }
        }
      }
      // **再生。燃えている間は止まる**（炎上を積む意味をここで作る）
      if (e.regen > 0 && e.burnT <= 0 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);

      const tc = (e.x / TILE) | 0, tr = (e.y / TILE) | 0;
      const inside = st.walkable(tc, tr);
      e.dist = inside ? st.dist[st.idx(tc, tr)] : 1e9;

      // 通行量の記録（どこに溜まるかを、次の準備フェーズで見せるため）
      if (sample && inside) run.traffic[st.idx(tc, tr)]++;

      const goal = inside ? st.flowTo(tc, tr) : { x: tw.x, y: tw.y };
      const a = Util.angle(e.x, e.y, goal.x, goal.y);

      if (e.stun <= 0) {
        if (e.grabT > 0) {
          // **来た道へ引き戻す。** 道の上にいるあいだだけ後退させる。
          //   道を外れると goal がコア直通になり、そこから後退させると
          //   「壁を無視してコアの真逆（このマップ群では画面の上）へ飛ぶ」
          //   になっていた。引っ張るのであって、弾き飛ばすのではない
          if (inside) {
            const nx = e.x - Math.cos(a) * e.grabV * dt;
            const ny = e.y - Math.sin(a) * e.grabV * dt;
            if (st.walkable((nx / TILE) | 0, (ny / TILE) | 0)) { e.x = nx; e.y = ny; }
          }
        } else {
          // **地形の仕掛け。**泥は遅く、坂は速くなる（src/mapgen.js の tagZones）。
          //   数値ではなく**地形で難易度を作る**ための口
          let zm = 1;
          if (inside && st.zone) {
            const z = st.zoneAt(tc, tr);
            if (z === 1) zm = BAL.zoneMud; else if (z === 2) zm = BAL.zoneSlope;
          }
          const slowMul = Math.max(BAL.enemySlowFloor, 1 - e.slow);
          e.x += Math.cos(a) * e.spd * slowMul * zm * dt;
          e.y += Math.sin(a) * e.spd * slowMul * zm * dt;
          e.ang = a;      // 描画で向きを出すため。挙動には使わない
        }
      }

      // コアに触れた敵は、ライフを1つ持っていって消える（＝漏れ）
      if (Util.dist(e.x, e.y, tw.x, tw.y) <= tw.r + e.r) {
        const cost = BAL.leakLives;
        run.lives -= cost;
        run.leaked++;
        run.livesLost += cost;
        Snd.leak();
        // 何に抜けられたか。死因を「どの敵に負けたか」まで残す
        const tn = e.tname || 'grunt';
        run.leakBy[tn] = (run.leakBy[tn] || 0) + 1;
        // 経路全体を塗るが、コアに近い区間ほど濃くする。
        // 「どこで止め損ねたか」が知りたいので、手前ほど強調しても意味が薄い
        const route = st.routes[e.si];
        if (route) for (let k = 0; k < route.length; k++) {
          run.leak[route[k]] += 0.15 + 0.85 * (k / Math.max(1, route.length - 1));
        }
        this.fx(run, { type: 'boom', x: e.x, y: e.y, r: 26, color: '#ff5b6e', life: 0.3 });
        this.shake(run, 3, true);
        e.dead = true;
        run.enemies.splice(i, 1);
        continue;
      }
    }

    // 敵が動き終わったあとで押し合う。**重なったまま進ませない**
    Crowd.apply(run, dt);

    if (run.lives <= 0) { run.lives = 0; return 'dead'; }

    // --- ユニット ---
    for (const w of run.units) {
      if (w.flags.heat) w.dyn.heat = Math.max(0, w.dyn.heat - dt * 0.85);
      if (w.flags.thunderGod) {
        w.dyn.godCd -= dt;
        if (w.dyn.godCd <= 0) {
          w.dyn.godCd = w.dyn.godEvery || 5;
          for (const e of run.enemies.slice(0, 150)) {
            if (e.dead) continue;
            this.damage(run, e, w.s.dmg * 3, { shock: Math.max(2, w.s.shockDur), color: '#d8c7ff' });
          }
          this.fx(run, { type: 'ring', x: run.tower.x, y: run.tower.y, r: Math.max(st.w, st.h), color: '#e2d6ff', life: 0.4 });
          this.shake(run, 14, true);
        }
      }

      if (w.muzzle > 0) w.muzzle -= dt;
      this.aimUpdate(w, run, dt);
      w.target = this.findTarget(w, run);

      // **撃ちっぱなし。** 敵がいるかどうかで撃つ／撃たないを武器に決めさせない。
      // 首を振り続ける扇風機のガトリング、というのがこの武器たちの姿
      // 加熱には**上限がある。** 撃ちっぱなしにしたので、青天井だと
      // 「撃っているだけで速くなり続ける」になってしまう（heatCap で頭打ち）
      const rate = w.s.rate *
        (w.flags.heat ? (1 + w.dyn.heat * Math.min(BAL.heatCap, w.dyn.heatMax || 0)) : 1);
      w.cd -= dt;
      if (w.cd <= 0) {
        w.cd = 1 / Math.max(0.02, rate);
        w.muzzle = 0.07;
        w.shots++;
        w.group = Game.groupingOf(w);  // 扇の広さで決まる集弾率。fire から参照する
        w.n = this.shotCount(w);       // この発射で撃つ弾数。fire から参照する
        w.def.fire(w, run);
      }
    }

    // --- 弾 ---
    for (let i = run.bullets.length - 1; i >= 0; i--) {
      const b = run.bullets[i];
      b.life -= dt;
      if (b.life <= 0) { this.bulletEnd(run, b); run.bullets.splice(i, 1); continue; }

      if (b.lob) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (Util.dist(b.x, b.y, b.landX, b.landY) < 14) {
          if (b.onLand) b.onLand(run, b.landX, b.landY);
          run.bullets.splice(i, 1);
        }
        continue;
      }

      if (b.homing > 0) {
        if (!b.target || b.target.dead) {
          const near = Grid.query(b.x, b.y, 240, _q);
          let best = null, bd = 1e9;
          for (const e of near) {
            if (e.dead) continue;
            if (b.hit && b.hit.has(e)) continue;
            const dd = Util.dist2(b.x, b.y, e.x, e.y);
            if (dd < bd) { bd = dd; best = e; }
          }
          b.target = best;
        }
        if (b.target && !b.target.dead) {
          const sp = Math.hypot(b.vx, b.vy);
          const na = Util.turnToward(Math.atan2(b.vy, b.vx),
            Util.angle(b.x, b.y, b.target.x, b.target.y), b.homing * dt);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }

      // **1フレームぶんをまとめて進めるので、通ってきた線分で当たりを見る。**
      //
      //   以前は着いた先の1点だけを見ていた。弾の当たり半径は 2.6〜9、
      //   敵の半径は 8〜15 なので、掴める幅はせいぜい 28px。
      //   スナイパーの素の弾速 1500px/s は1フレーム25pxで、かろうじて収まっていたが、
      //   **弾速を上げるものを積むと、そのまま敵をすり抜けていた。**
      //   実測：「貫通レールガン」（ダメージ×1.69・貫通+198・弾速×2.56）を2枚積んでも
      //   1ウェーブあたりの与ダメージが **1.00倍**、生存ウェーブはむしろ 5→4 に減った。
      //   1フレーム64px 進むのに掴める幅が28pxしかないので、半分以上が素通りしていた。
      //   遺物「加速核」（弾速+20%・上限×2.2）とツリーの弾速の節にも同じ穴があった。
      //
      //   **遅い弾では今までと同じ経路を通る**（線分が点に潰れるだけ）。
      //   広げた Grid.query は、すり抜けが起こりうる長さのときだけ使う
      const px = b.x, py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < -60 || b.y < -60 || b.x > st.w + 60 || b.y > st.h + 60) { run.bullets.splice(i, 1); continue; }
      if (Util.dist(b.x, b.y, b.ox, b.oy) > b.range) { this.bulletEnd(run, b); run.bullets.splice(i, 1); continue; }

      // **壁に当たったらそこで終わる。**（山なりの弾は越えるので素通り）
      if (!b.through && this.losBlocked(st, px, py, b.x, b.y, b.ox, b.oy)) {
        if (run.fx.length < 150)
          this.fx(run, { type: 'spark', x: b.x, y: b.y, color: b.color, life: 0.12 });
        run.bullets.splice(i, 1); continue;
      }

      const step = Math.hypot(b.x - px, b.y - py);
      const swept = step > b.r + 8;
      const near = swept
        ? Grid.query((px + b.x) * 0.5, (py + b.y) * 0.5, step * 0.5 + b.r + 24, _q)
        : Grid.query(b.x, b.y, b.r + 24, _q);
      let consumed = false;
      for (const e of near) {
        if (e.dead) continue;
        if (b.hit && b.hit.has(e)) continue;
        const reach = e.r + b.r;
        if (swept) { if (Util.segDist2(px, py, b.x, b.y, e.x, e.y) > reach * reach) continue; }
        else if (Util.dist(b.x, b.y, e.x, e.y) > reach) continue;

        this.damage(run, e, b.dmg, {
          crit: b.crit, critMul: b.critMul, exec: b.exec, shock: b.shock,
          slow: b.slow, slowDur: b.slowDur, stun: b.stun,
          burn: b.burn, burnDur: b.burnDur, color: b.color,
        });

        if (b.src && b.src.flags.resonance && b.wid === 'gatling')
          run.resonance = Math.min(run.resonanceMax || 4.0, run.resonance + (run.resonanceStep || 0.006));
        // 曳光指示：スナイパーが撃ち抜いた敵に印が残る。
        // **ミサイルの狙いは変えない。**印の付いた敵に落ちたときだけ効く
        if (b.src && b.src.flags.spot && b.wid === 'sniper' && !e.dead) e.spotT = 3;
        if (b.src && b.src.flags.charged && b.wid === 'gatling') {
          this.chainLightning(b.src, run, e, b.src.dyn.chargedChain || 2, b.dmg * 0.55);
        }
        if (b.src && b.src.flags.staticFoam && b.wid === 'bubble' && !e.dead) {
          e.shock = Math.max(e.shock, b.src.s.shockDur);
        }

        if (b.splash > 0) {
          this.explode(run, b.x, b.y, b.splash, b.dmg * b.splashMul,
            { shock: b.src && b.src.flags.implode ? (b.src.s.shockDur || 2.5) : 0 });
          if (b.src && b.src.dyn.cluster && !b.child) this.cluster(run, b);
          if (b.src && b.src.flags.acid) {
            this.spawnField(run, b.x, b.y, { kind: 'acid', r: b.src.s.fieldR, dur: b.src.s.fieldDur,
              dps: b.dmg * 0.35, vuln: 0.15, color: '#a8f0c0' });
          }
          consumed = true; break;
        }

        if (run.fx.length < 150) this.fx(run, { type: 'spark', x: b.x, y: b.y, color: b.color, life: 0.14 });

        if (b.bounce > 0) {
          b.bounce--;
          if (!b.hit) b.hit = new Set();
          b.hit.add(e);
          if (b.src && b.src.flags.ramp) b.dmg *= 1.12;
          const cand = Grid.query(b.x, b.y, 220, _q);
          let best = null, bd = 1e9;
          for (const o of cand) {
            if (o.dead || b.hit.has(o)) continue;
            const dd = Util.dist2(b.x, b.y, o.x, o.y);
            if (dd < bd) { bd = dd; best = o; }
          }
          if (best) {
            const sp = Math.hypot(b.vx, b.vy) || 400;
            const na = Util.angle(b.x, b.y, best.x, best.y);
            b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
            b.ox = b.x; b.oy = b.y;
            b.target = best;
          } else consumed = true;
          break;
        }

        b.hits++;
        if (b.pierce > 0) {
          b.pierce--;
          if (!b.hit) b.hit = new Set();
          b.hit.add(e);
        } else { consumed = true; break; }
      }
      if (consumed) {
        // **貫通したことを見せる。** カウンタを減らすだけでは何も伝わらない
        if (b.long && b.hits > 0 && run.fx.length < 150) {
          this.fx(run, { type: 'trail', x1: b.ox, y1: b.oy, x2: b.x, y2: b.y,
                         n: b.hits, color: b.color, life: 0.22 });
        }
        run.bullets.splice(i, 1);
      }
    }

    // --- 演出 ---
    for (let i = run.fx.length - 1; i >= 0; i--) {
      const f = run.fx[i]; f.t += dt;
      if (f.t >= f.life) {
        if (f.type === 'coin') this.coinFx = Math.max(0, this.coinFx - 1);
        run.fx.splice(i, 1);
      }
    }
    for (let i = run.nums.length - 1; i >= 0; i--) {
      const n = run.nums[i]; n.t += dt; n.y -= dt * 34;
      if (n.t >= n.life) run.nums.splice(i, 1);
    }
    if (run.shake > 0) run.shake = Math.max(0, run.shake - dt * 42);

    run.time += dt;
    return signal;
  },

  bulletEnd(run, b) {
    if (b.lob && b.onLand) { b.onLand(run, b.x, b.y); return; }
    if (b.splash > 0) {
      this.explode(run, b.x, b.y, b.splash, b.dmg * b.splashMul, {});
      if (b.src && b.src.dyn.cluster && !b.child) this.cluster(run, b);
    }
  },

  cluster(run, b) {
    const n = b.src.dyn.cluster;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random();
      run.bullets.push({
        x: b.x, y: b.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
        dmg: b.dmg * 0.4, r: 4, pierce: 0, bounce: 0, hit: null,
        splash: b.splash * 0.55, splashMul: b.splashMul,
        homing: 2.4, crit: 0, critMul: 2, exec: 0, shock: 0,
        slow: 0, slowDur: 0, stun: 0, burn: 0, burnDur: 0,
        color: '#ffb066', life: 1.4, src: b.src, wid: b.wid,
        range: 420, ox: b.x, oy: b.y, target: null, child: true,
      });
    }
  },
};
