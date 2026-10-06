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
//     装甲 shield … 1発のダメージを割合（BAL.armorCut）で減らす。
//                   削る札・無視する札（曳光弾・腐蝕の雲・徹甲榴弾・装甲貫通）で通す
//     群れ swarm  … 1回の湧きでまとめて出る。**単体攻撃が追いつかない。**
//                   爆風・炎・毒のような面で取る武器で潰す
//     再生 regen  … 放っておくと回復する。**燃やしている間は止まる。**
//                   遺物の「熾火核」やカードの炎上がここで効く
//     分裂 split  … 倒すと2体に割れる。**過剰damage が無駄になる。**
//                   削り切る前提の編成だと数が増えて崩れる
//     入れ子 nest … 倒すと、同じ場所から一回り小さい中身が1体出てくる（nest 層まで）。**1発では剥がしきれない。**
//                   中身は倒した弾の貫通では抜けない（弾が当たる相手を決めたあとに出てくる）。手数と射界の長さで剥がす
//                   （2026-09-28・ユーザー「マトリョーシカのような敵種は面白いのでこれの採用はありかも」）
//
//   weight は出やすさ。合計で正規化される（Util.weighted）
const ENEMY_TYPES = {
  // **【2026-09-30 段3】耐性（res）と、図鑑に出す名前（jp・en）と説明（desc）を足した。**（設計書 DESIGN-STAGE3 §8・§12）
  //   ユーザー「今の敵はどいつがどんな能力なのかわからないので、今のやつにつけて図鑑などに載せたって良いですね」
  //   「武器を貰った直後2章は気持ちよく使わせるべきです」
  //   res の値は**その耐性が付き始める章**。その武器が使えるようになった章から2章たってから付く
  //   （火炎は第11章の報酬＝第12章から使える → 耐火は第14章から／テスラ 第9章から → 耐電 第11章／凍結 第18章から → 耐寒 第20章）。
  //   効き方は「効きにくい」まで（BAL.resMul 倍）。無効は作らない。名前は世界観（侵入プログラムに昔のゲームの敵の皮・企画書 §13）に合わせた
  grunt:  { name: 'grunt',  hp: 1.0, spd: 1.0,  r: 10, coin: 1.0,  color: '#ff5b6e', from: 1,  weight: 58,
    jp: 'パケット', en: 'PACKET', desc: 'ふつうの敵。' },
  swift:  { name: 'swift',  hp: 0.5, spd: 1.9,  r: 8,  coin: 1.15, color: '#ff9cf0', from: 3,  weight: 28,
    jp: 'スクリプト', en: 'SCRIPT', desc: '速い。HPは低い。' },
  tank:   { name: 'tank',   hp: 3.4, spd: 0.58, r: 15, coin: 2.5,  color: '#c8a05a', from: 6,  weight: 22,
    jp: 'ブロック', en: 'BLOCK', desc: '硬くて遅い。', res: { heavy: 8 } },
  // 装甲：1発のダメージを BAL.armorCut（割合）減らす（2026-10-05 割合カット。固定値の差し引きは1発が雑魚HPの8倍ある武器に効かなかった）。armor は BAL.armorCut に掛ける倍
  shield: { name: 'shield', hp: 1.6, spd: 0.80, r: 12, coin: 1.9,  color: '#7fb3ff', from: 16, weight: 16, armor: 1,
    jp: 'ファイアウォール', en: 'FIREWALL', desc: '装甲：1発のダメージを半分に減らす。装甲を削る札（曳光弾・腐蝕の雲）で軽くなり、装甲を無視する札（徹甲榴弾・装甲貫通・貫通弾頭）で通る。持続ダメージは減らない。' },
  // 1回の湧きで burst 体まとめて出る。1体は小さい
  swarm:  { name: 'swarm',  hp: 0.22, spd: 1.45, r: 6, coin: 0.45, color: '#ffe08a', from: 26, weight: 14, burst: 5,
    jp: 'ボット群', en: 'BOTNET', desc: '小さいのがまとめて出る。', res: { fire: 14 } },
  // 毎秒 maxHp の regen 割を回復。**燃えている間は回復しない**
  regen:  { name: 'regen',  hp: 1.3, spd: 0.85, r: 11, coin: 1.8,  color: '#7fe3a0', from: 36, weight: 14, regen: 0.055,
    jp: 'リカバリ', en: 'RECOVERY', desc: 'HPが戻る。燃えている間は戻らない。', res: { elec: 11 } },
  // 倒すと split 体に割れる（割れた子はもう割れない）
  split:  { name: 'split',  hp: 2.2, spd: 0.90, r: 13, coin: 2.0,  color: '#d08aff', from: 46, weight: 12, split: 2,
    jp: 'フォーク', en: 'FORK', desc: '倒すと2つに割れる。', res: { cold: 20 } },
  // 倒すと中身が1体出てくる（nest 層まで。中身は BAL.nestHp 倍のHPで、少し小さく少し速い）
  nest:   { name: 'nest',   hp: 1.6, spd: 0.75, r: 17, coin: 1.2,  color: '#ff9a5c', from: 61, weight: 12, nest: 3,
    jp: 'アーカイブ', en: 'ARCHIVE', desc: '倒すと中から次の層が出てくる（3層）。', res: { heavy: 13 } },
};
// 耐性の名前と中身（図鑑・Render の縁の色）
const RESIST_INFO = {
  fire:  { jp: '耐火', desc: '火炎のダメージと燃えている間のダメージが半分', color: '#6fb8ff' },
  elec:  { jp: '耐電', desc: 'テスラのダメージと感電が半分。連鎖がそこで止まる', color: '#ffe24a' },
  cold:  { jp: '耐寒', desc: '凍らない。減速が半分', color: '#e8f6ff' },
  heavy: { jp: '重量', desc: '掴む・引き戻す・閉じ込めるが半分', color: '#9aa0a8' },
};

// ================= アセンションの上位の敵（2026-10-06・ユーザー決定） =================
//   設計：docs/DESIGN-ASCENSION-V2-2026-10-06.md §8・§8-2。指示書「100を1に圧縮する」（docs/ASCENSION-ORDER-2026-10-06.md）
//   第31章（アセンション）から、ウェーブのHPの総量の一部が上位の敵に置き換わる（BAL.ascUpper*・Asc.upperShare）。
//   上位1体＝雑魚 k 体ぶん（hp が k）。**無効（ダメージも状態異常も0）を持てるのは、この上位の敵だけ**（第30章までの敵の耐性は半分まで・RESIST_INFO）
//   武器は系統（WEAPONS[id].sys）を持ち、無効の判定は「その系統から来たもの」で決まる：直接のダメージ・状態異常・持続ダメージ・凍結の印・掴み・場の効果、すべて武器の id（by）から系統に引く
const SYS_INFO = {
  phys:  { jp: '物理', color: '#ffb347', desc: 'ガトリング・手裏剣・刀・迫撃砲・ミサイル' },
  optic: { jp: '光学', color: '#6fe3ff', desc: 'レーザーライフル' },
  elem:  { jp: '属性', color: '#c58bff', desc: '火炎放射器・テスラコイル・凍結装置' },
  field: { jp: '場',   color: '#8fd94a', desc: '毒ガス散布機・泡' },
  grab:  { jp: '掴み', color: '#c85ab0', desc: '触手' },
};
// ポリモーフが切り替わる順・ゼロデイの弱点に選ばれる系統（掴みは入れない：触手だけが効かない敵・だけが効く敵は作らない）
const SYS_ORDER = ['phys', 'optic', 'elem', 'field'];
const UPPER_TYPES = {
  trojan:    { name: 'trojan', up: true, hp: 100, spd: 0.55, r: 17, coin: 100, color: '#e0a640', jp: 'トロイ', en: 'TROJAN',
    desc: '硬くて遅い。倒すと中からパケットを数体こぼす。', want: '1体に強い武器と、こぼれた雑魚を拾う武器の両方' },
  ransom:    { name: 'ransom', up: true, hp: 100, spd: 0.80, r: 14, coin: 100, color: '#ff6a5c', jp: 'ランサムウェア', en: 'RANSOMWARE',
    desc: '近くの敵が受けるダメージを大きく減らす気配をまとう（本体は対象外）。', want: '先に狙って倒す・遠くから届かせる' },
  ghost:     { name: 'ghost', up: true, hp: 100, spd: 1.00, r: 13, coin: 100, color: '#cfe4ff', jp: 'ゴースト', en: 'GHOST', imm: ['phys'],
    desc: '実体がない。弾も刃もすり抜ける。', want: '属性・光学・場・掴みを混ぜる' },
  faraday:   { name: 'faraday', up: true, hp: 100, spd: 0.70, r: 14, coin: 100, color: '#8fb0c8', jp: 'ファラデー', en: 'FARADAY', imm: ['elem'],
    desc: '遮蔽された殻。熱も電気も冷気も通さない。', want: '物理・光学・場・掴みを混ぜる' },
  sandbox:   { name: 'sandbox', up: true, hp: 100, spd: 0.80, r: 14, coin: 100, color: '#7fd9a0', jp: 'サンドボックス', en: 'SANDBOX', imm: ['field'],
    desc: '隔離された箱。ガスも泡も受けつけない。', want: '直接当てる武器を混ぜる' },
  polymorph: { name: 'polymorph', up: true, hp: 300, spd: 0.70, r: 18, coin: 300, color: '#ff8ad8', jp: 'ポリモーフ', en: 'POLYMORPH', poly: true,
    desc: '姿を変え続ける。数秒ごとに、無効になる系統が 物理→光学→属性→場 の順で切り替わる（体の色と輪で分かる）。', want: '系統を散らした混成' },
  zeroday:   { name: 'zeroday', up: true, hp: 1000, spd: 0.45, r: 24, coin: 1000, color: '#ff3d5a', jp: 'ゼロデイ', en: 'ZERO-DAY', zd: true,
    desc: 'とても硬く遅い。弱点の系統（章ごとに固定・頭の上の印）のほかは、ダメージが半分しか通らない。', want: '弱点の系統をそろえる' },
};
for (const k in UPPER_TYPES) UPPER_TYPES[k].k = UPPER_TYPES[k].hp;
// 自己点検：系統（sys）の書き忘れ・知らない系統は、無効の判定から黙って漏れるので、読み込みのときに出す
for (const id in WEAPONS) if (!SYS_INFO[WEAPONS[id].sys]) console.warn('[weapons] 系統（sys）が無い・不明：' + id);

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
      if (st.step((e.x / TILE) | 0, (e.y / TILE) | 0, (nx / TILE) | 0, (ny / TILE) | 0)) { e.x = nx; e.y = ny; }
    }
  },

  pair(a, b) {
    if (a.noPush || b.noPush) return;           // ラスボスの頭と節は押し合わない（節は頭の跡に並ぶ）
    if (a.ghostT > 0 || b.ghostT > 0) return;   // 詰まりから抜け出している最中は押し合わない（combat.js の詰まりの検知）
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
    const ch = run.stageIdx + 1;
    let w = (BAL.chapterMul && BAL.chapterMul[ch]) || 1;
    // **深い章ほど敵を重くする。**（2026-09-23・ユーザー承認済み）
    //   **ただし g=1.10 は暫定値。**ユーザー「プレイヤーのフィードバック次第で
    //   再度バランス調整が入ることは織り込んでくれ」
    //   > 「基数の天井を上げて、**ちゃんと適切に火力を上げてようやくクリアできるので
    //   >   あれば**、基数の天井は上げるべきです、ただし最初の頃のように、
    //   >   **雑多に基数を配り雑多に置きまくってクリアは避けて**ください」
    //
    //   **ここは Legacy（恒久の土台）の式に入っていない。**
    //   Legacy は `enemyHpGrowth^5` だけで伸びるので、ここを上げても
    //   **プレイヤーの土台は1ミリも動かない**（確定方針「プレイヤーの指数は減らさない、
    //   足りないのは敵側」に沿う唯一の入口）。
    //
    //   これが無いと、砲が過剰に強くて**火力を1000倍振っても漏れが動かない**
    //   （実測 2026-09-23：×0.1〜×100 で 180/172/178/198）。
    //   ＝ 置ける数だけで決まる「偽の難易度」になる
    const le = BAL.lateEnemyMul;
    if (le && le.g > 1 && ch > le.from) w *= Math.pow(le.g, ch - le.from);
    // 第31章から先（アセンション）だけの上乗せ（BAL.ascEnemyG）
    if (ch > MAIN_CHAPTERS && BAL.ascEnemyG > 1) w *= Math.pow(BAL.ascEnemyG, ch - MAIN_CHAPTERS);
    // 節目の章の壁（BAL.ascWallMul）。その章だけ
    if (ch > MAIN_CHAPTERS && BAL.ascWallEvery > 0 && ch % BAL.ascWallEvery === 0) w *= BAL.ascWallMul;
    return w;
  },

  // 1ウェーブに出る敵の数。
  //   **線形の項（waveCountPerWave）だけだと、章が進んでも数がほとんど増えない。**
  //   敵の指数を1本増やすため、通算ウェーブの累乗（waveCountGrowth）を足してある。
  //   1.0 にすれば以前とまったく同じ（線形のみ）に戻る
  waveCount(run) {
    // **ボスのウェーブは雑魚を出さない**（2026-09-28・ユーザー「雑魚は出ずに、それぞれの出現口からいよいよヤバそうな奴が出てきます」）
    if (this.isBossWave(run)) return 0;
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
    // **第31章から先（アセンション）は、敵側のアセンション（誘引）で量を増やし、上限で切らない。**
    //   第31章で1ウェーブ約1,790体と、上限（900 × 口の倍率 2.0 = 1,800）に届いてしまい、
    //   誘引を足しても上限に食われて効かないため（方針「上限は壊れるから置くもの」）。
    //   同時に盤にいる数は enemyCap で別に抑えている（処理の重さ）
    if (run.stageIdx >= MAIN_CHAPTERS) {
      return Math.max(1, Math.floor(base * run.mods.spawn * wm * hm * Asc.spawnMul(Game.perm, run.stageIdx)
        * Asc.upperCountMul(Game.perm, run.stageIdx)));    // 上位の敵に置き換えた分だけ数が減る（HPの総量は同じ）
    }
    return Math.min(Math.floor(BAL.waveCountMax * hm),
                    Math.floor(base * run.mods.spawn * wm * hm));
  },

  isLastWave(run) { return run.wave >= BAL.wavesPerStage; },

  // 第30章（ゲームの区切り）はラスボス専用。BAL.finalOn を切ると、ほかの節目の章と同じボス（口ごとに1体）に戻る
  isFinalChapter(run) { return !!BAL.finalOn && run.stageIdx + 1 === MAIN_CHAPTERS; },

  // このウェーブにボスが出るか。**節目の章（BAL.bossChapters と、第31章から先の5章ごと）の、最後のウェーブだけ。**
  isBossWave(run) {
    if (this.isFinalChapter(run)) return true;       // 第30章はラスボス（全ウェーブ・雑魚なし）
    if (!this.isLastWave(run)) return false;
    const ch = run.stageIdx + 1;
    return BAL.bossChapters.indexOf(ch) >= 0 || (ch > MAIN_CHAPTERS && ch % 5 === 0);
  },

  // **ボスの作り直し。**（2026-09-28・ユーザー）
  //   > 「ボスの存在が意味不明・適切な場所に武器を置いてないと詰む・なんかどっかにぼったちしてて驚異ですらない」
  //   > 「ボスウェーブでは実質時間制限付きのDPSチェックに・雑魚は出ずに、それぞれの出現口からいよいよヤバそうな奴が出てきます・
  //   >   コアにゆっくりとゆっくりと近づいてきます・倒せなかった場合強制的に敗北します」
  //   > 「今のボスよりも硬く、時間がかからなければいけない分、歩行速度はかなり遅めにして、ギリギリ倒せた！も演出できると良い」
  //   > 「正しくやれば突破出来る程度の存在…定位置にいるからなんか置いとけばそのうち倒せてるボスとすら認識出来ないやつは卒業すべき」
  //
  //   いまの形：ボスのウェーブは雑魚を出さない（waveCount が 0）。**口ごとに1体**、口のレーンに沿って BAL.bossSpeed でコアへ歩く。
  //   **コアに着いたら、その場で負け**（残りのライフを全部持っていく）。止める効果（足止め・掴み・減速）は効かない
  //   ＝ 道の長さ ÷ 歩く速さ が制限時間。その間に削り切れるかを問う。
  //   前の形（2026-09-21〜）：動かない1体を経路の途中に据え、2.2秒ごとに雑魚を出す。置き場所が射線から外れると永久に倒せず、
  //   入っていれば「何か置いとけば倒せる」だけだった
  spawnBoss(run) {
    const st = run.stage;
    const g = this.gw(run);
    const t = ENEMY_TYPES.grunt;
    const chMul = this.chapterWeight(run);
    const base = BAL.enemyHpBase * Math.pow(BAL.enemyHpGrowth, g - 1)
               * Math.pow(BAL.stageHpMul, run.stageIdx) * chMul;
    const mouths = (st.mouths && st.mouths.length) ? st.mouths : st.spawns.map((s, i) => [i]);
    const ch = run.stageIdx + 1;
    for (let mi = 0; mi < mouths.length; mi++) {
      const m = mouths[mi];
      const si = m[(m.length / 2) | 0];          // 穴の真ん中から
      const bk = this.bossKindFor(ch, mi);
      const sp = st.spawns[si];
      const p = st.center(sp.c, sp.r);
      const e = this.makeEnemy(run, t, g, p.x, p.y, si, base * BAL.bossHp * ((BAL.bossHpBy || {})[run.stageIdx + 1] || 1) * (BAL.bossHpKind[bk] || 1));
      e.lane = this.pickLane(run, si);
      e.spd = BAL.bossSpeed;
      e.r = BAL.bossRKind[bk] || BAL.bossR;
      e.color = this.BOSS_KIND[bk].col;
      e.tname = 'boss';
      e.boss = true;
      e.bk = bk;                                 // 個体：worm | rootkit | jammer（強みと弱点が1つずつ）
      // 足止め・掴みが強く効くのはワーム（弱点）。ルートキットには微弱に効く（BAL.rootCcK 倍・減速・足止め・引き寄せ）。ジャマーは効かない。
      //   どれも BAL.ccMaxSec の上限は守る（効かない個体は使い切った扱い）
      if (bk === 'jammer') e.ccUsed = Infinity;
      if (bk === 'worm') e.trail = [{ x: p.x, y: p.y }];   // 体の節（頭のあとを追う点・新しい順）
      e.coin = e.coin * BAL.bossCoin;
      e.ph = 0;                                  // 次に使う仕掛けの番号（0〜2）。HP が BAL.bossPhaseAt を割るたびに1つ進む
      e.tele = null;                             // 予告中：{ kind, t, by }
      e.wallT = 0; e.wallBy = null;              // 防壁：残り秒・半分になる武器の id
      e.rec = {};                                // 直近にいちばん削った武器を見るための、時間で薄れる合計
      run.enemies.push(e);
    }
    run.hasBoss = true;
  },

  // ===== ラスボス「フォーマッタ」（第30章専用・BAL.final*） =====
  //   頭1体（e.bk 'final'）＋胴の節 BAL.finalSegs 個。節は盤の上の本物の敵（e.seg が頭を指す）で、どの武器の当たりにも掛かる。
  //   節に入ったダメージは damage() が頭へ BAL.finalBodyMul 倍で回す＝頭が弱点。節は頭の通った跡（e.trail）に並ぶだけで、自分では動かない。
  //   ウェーブごとに1体だけ、口を順に替えて出す。HP はウェーブをまたいで持ち越す（run.finalHp・最大HPに対する割合）
  spawnFinal(run) {
    const st = run.stage;
    const gEnd = globalWave(run.stageIdx, BAL.wavesPerStage);       // 最大HPはウェーブで変えない（最後のウェーブの基準で固定）
    const chMul = this.chapterWeight(run);
    const base = BAL.enemyHpBase * Math.pow(BAL.enemyHpGrowth, gEnd - 1) * Math.pow(BAL.stageHpMul, run.stageIdx) * chMul;
    const maxHp = base * BAL.bossHp * ((BAL.bossHpBy || {})[run.stageIdx + 1] || 1) * BAL.finalHpMul;
    if (run.finalHp === undefined || run.wave <= 1) { run.finalHp = 1; run.finalPh = 0; }
    const mouths = (st.mouths && st.mouths.length) ? st.mouths : st.spawns.map((s, i) => [i]);
    const m = mouths[(run.wave - 1) % mouths.length];
    const si = m[(m.length / 2) | 0];
    const sp = st.spawns[si], p = st.center(sp.c, sp.r);
    const e = this.makeEnemy(run, ENEMY_TYPES.grunt, this.gw(run), p.x, p.y, si, maxHp);
    e.hp = maxHp * run.finalHp;
    e.lane = this.pickLane(run, si);
    e.spd = BAL.finalSpeed;
    e.r = BAL.finalR;
    e.color = this.BOSS_KIND.final.col;
    e.tname = 'boss'; e.boss = true; e.bk = 'final';
    e.noStatus = true; e.noPush = true; e.ccUsed = Infinity;       // 状態異常・足止め・押し合いは効かない
    e.coin = e.coin * BAL.finalCoin;
    e.gap = BAL.finalGap; e.segN = BAL.finalSegs;
    e.trail = [{ x: p.x, y: p.y }];
    e.ph = run.finalPh;                         // 次に使う仕掛けの番号（HP の割合で進む・ウェーブをまたいで持ち越す）
    e.tele = null; e.rec = {};
    e.beamT = 0; e.beamTg = null;
    // 胴の節：尾から先に積む（描く順＝尾が下・頭が最後に上）
    const segs = [];
    for (let k = BAL.finalSegs - 1; k >= 0; k--) {
      const g = this.makeEnemy(run, ENEMY_TYPES.grunt, this.gw(run), p.x, p.y, si, maxHp);
      g.seg = e; g.k = k; g.hidden = true; g.noStatus = true; g.noPush = true; g.ccUsed = Infinity;
      g.spd = 0; g.lane = null; g.tname = 'bossSeg';
      g.r = BAL.finalSegR * (1 - 0.35 * k / Math.max(1, BAL.finalSegs - 1));
      g.color = this.BOSS_KIND.final.col;
      g.coin = 0;
      segs.push(g);
    }
    for (const g of segs) run.enemies.push(g);
    run.enemies.push(e);
    run.segN = segs.length;
    run.finalHead = e;
    run.hasBoss = true;
  },
  // 第30章で負けたとき、頭を削った割合ぶんのコインを出す（BAL.finalLossCoinK・撃退と負けの両方を累計の割合で数える。1出撃1回だけ）。
  //   雑魚が出ない第30章は、負けるとコインが入らず、コインが無いとスキルツリーが買えず抜け出せなかった
  finalLossCoin(run) {
    const h = run.finalHead;
    if (!h || run.finalLossPaid) return 0;
    run.finalLossPaid = true;
    //   頭がコアに着いて負けたときも h.dead は立つ（HP は削れたまま）ので、dead では分けない。退いた頭だけ持ち越しの割合を見る
    const left = (!h.retreat && h.maxHp > 0) ? h.hp / h.maxHp : (run.finalHp === undefined ? 1 : run.finalHp);
    const cut = Util.clamp(1 - left, 0, 1);
    const coin = h.coin * run.coinMul * run.mods.coin * cut * BAL.finalLossCoinK;
    if (!(coin > 0)) return 0;
    Game.meta.coins += coin;
    run.coinsEarned += coin;
    run.finalLossGot = coin;
    return coin;
  },
  // 頭の節目の仕掛け：HP が BAL.finalPhaseAt を割るたびに1つ。使う前に BAL.finalTele 秒の予告。退く条件もここで見る
  finalUpdate(run, e, dt) {
    const k = Math.exp(-dt / BAL.bossRecTau);
    for (const id in e.rec) e.rec[id] *= k;                 // 「直近に頭を削った武器」：時間で薄れる合計
    if (e.beamT > 0 && (e.beamT -= dt) <= 0) e.beamTg = null;
    if (e.tele) {
      if (e.tele.kind !== 'resist') e.tele.targets = e.tele.kind === 'bite' ? this.biteTargets(run, e) : this.laserTargets(run, e);
      if ((e.tele.t -= dt) <= 0) this.finalPhaseDo(run, e, e.tele);
      return;
    }
    // 撃退：ウェーブ1〜4は、HP が決まった割合まで減ったら退く（次のウェーブへ・HP は持ち越す）
    const ra = BAL.finalRetreatAt[run.wave - 1];
    if (!this.isLastWave(run) && ra !== undefined && e.hp <= e.maxHp * ra) {
      e.dead = true; e.retreat = true;
      run.finalHp = Math.max(0.001, e.hp / e.maxHp); run.finalPh = e.ph;
      run.retreatCut = { n: (run.retreatCut ? run.retreatCut.n : 0) + 1, wave: run.wave, left: run.finalHp };
      this.fx(run, { type: 'ring', x: e.x, y: e.y, r: e.r * 5, color: this.BOSS_KIND.final.col, life: 0.7 });
      this.fx(run, { type: 'boom', x: e.x, y: e.y, r: e.r * 2.5, color: '#fff3c8', life: 0.4 });
      this.shake(run, 10, true);
      return;
    }
    const at = BAL.finalPhaseAt[e.ph];
    if (at !== undefined && e.hp <= e.maxHp * at) {
      const kind = BAL.finalPhaseKinds[e.ph];
      e.tele = { kind, t: BAL.finalTele, targets: kind === 'resist' ? null : (kind === 'bite' ? this.biteTargets(run, e) : this.laserTargets(run, e)),
                 by: kind === 'resist' ? this.topRec(e) : null };
      e.ph++;
      run.finalPh = e.ph;
      const col = this.BOSS_COL[kind];
      this.fx(run, { type: 'ring', x: e.x, y: e.y, r: e.r * 4, color: col, life: BAL.finalTele });
      run.phaseCut = { n: (run.phaseCut ? run.phaseCut.n : 0) + 1, no: e.ph, kind, by: e.tele.by, bk: 'final' };
    }
  },
  topRec(e) {
    let best = 0, by = null;
    for (const id in e.rec) if (WEAPONS[id] && e.rec[id] > best) { best = e.rec[id]; by = id; }
    return by;
  },
  // 壊れていない武器のうち、頭に近い順
  nearUnits(run, e) {
    return run.units.filter(w => !w.broken).map(w => ({ w, d: Util.dist(e.x, e.y, w.x, w.y) })).sort((p, q) => p.d - q.d).map(o => o.w);
  },
  biteTargets(run, e) { return this.nearUnits(run, e).slice(0, 1); },
  laserTargets(run, e) { return this.nearUnits(run, e).slice(0, BAL.finalLaserN); },
  finalPhaseDo(run, e, tele) {
    e.tele = null;
    const col = this.BOSS_COL[tele.kind];
    if (tele.kind === 'bite') {
      // 噛みつき：予告の間に狙った武器を、その出撃の間なくす（盤には残骸が残り、置き直せず、コストも戻らない）
      const tg = this.biteTargets(run, e);
      for (const w of tg) {
        w.broken = true; w.jamT = 0; w.target = null;
        run.broken = (run.broken || 0) + 1;
        this.fx(run, { type: 'boom', x: w.x, y: w.y, r: 46, color: col, life: 0.45 });
        this.fx(run, { type: 'ring', x: w.x, y: w.y, r: 60, color: '#fff3c8', life: 0.5 });
      }
      this.shake(run, 8, true);
    } else if (tele.kind === 'laser') {
      const tg = this.laserTargets(run, e);
      for (const w of tg) { w.jamT = BAL.finalLaserSec; this.fx(run, { type: 'ring', x: w.x, y: w.y, r: 34, color: col, life: 0.4 }); }
      e.beamTg = tg; e.beamT = 0.6;
      this.fx(run, { type: 'ring', x: e.x, y: e.y, r: e.r * 3, color: col, life: 0.6 });
      this.shake(run, 5, true);
    } else {
      // 耐性：直近に頭を削った武器の種類。そのウェーブの終わりまで半減（startWave で消える）
      if (tele.by) run.finalRes[tele.by] = true;
      this.fx(run, { type: 'ring', x: e.x, y: e.y, r: e.r * 4, color: col, life: 0.5 });
    }
  },

  // ===== ボス3体と、それぞれの節目の仕掛け（docs/DESIGN-IDEAS-2026-10-05.md §1・1-2・BAL.boss*） =====
  //   ワーム＝跳躍（弱点：拘束・足止め／貫通が節をまとめて抜く）／ルートキット＝硬い・防壁は控えめ（弱点：拘束が微弱に効くだけ）／
  //   ジャマー＝沈黙（ジャマーから最も近い BAL.bossJamMax 基へ腕を伸ばして止める。弱点：遠くから撃つ武器・射程の長い武器）。HP が 75・50・25% を割るたびに1回（同じ仕掛けを3回）。使う前に約1秒の予告
  BOSS_KIND: {
    worm:    { jp: 'ワーム',       en: 'WORM',    ph: 'jump', col: '#58e0a0', strong: '跳躍', weak: '拘束・足止めが効く／貫通が節をまとめて抜く' },
    rootkit: { jp: 'ルートキット', en: 'ROOTKIT', ph: 'wall', col: '#ff4d6a', strong: '硬い体（防壁は控えめ）', weak: '拘束が微弱に効く（弱点は少ない）' },
    jammer:  { jp: 'ジャマー',     en: 'JAMMER',  ph: 'jam',  col: '#9fb4c8', strong: '沈黙（近い4基を腕で止める）', weak: '遠くから撃つ武器・射程の長い武器' },
    // ラスボス（第30章専用・BAL.bossKinds には入れない）。仕掛けは3つ：噛みつき・レーザー・耐性
    final:   { jp: 'フォーマッタ', en: 'FORMATTER', ph: 'final', col: '#ff7a1a', strong: '噛みつき・レーザー・耐性', weak: '頭（胴は通りにくい）' },
  },
  BOSS_COL: { jump: '#4ee0ff', wall: '#ffd24a', jam: '#d36bff', bite: '#ff7a1a', laser: '#ff3d7a', resist: '#fff35a' },
  // どの章のどの口に、どの個体か（固定・乱数にしない）。序盤（第 BAL.bossMixFrom 章より前）は1章1種：第5章ワーム・第10章ルートキット・第15章ジャマー。
  //   それ以降は口ごとに違う個体を混ぜる
  bossKindFor(ch, mi) {
    const K = BAL.bossKinds;
    const base = Math.floor(ch / 5) - 1;
    return K[((base + (ch >= BAL.bossMixFrom ? mi : 0)) % K.length + K.length) % K.length];
  },
  // ワームの体の節：頭が BAL.wormGap 進むごとに点を足し、節の数だけ残す
  wormFollow(e) {
    const T = e.trail, gap = e.gap || BAL.wormGap;
    let l = T[0], d = Util.dist(e.x, e.y, l.x, l.y);
    while (d >= gap) {
      const a = Util.angle(l.x, l.y, e.x, e.y);
      l = { x: l.x + Math.cos(a) * gap, y: l.y + Math.sin(a) * gap };
      T.unshift(l); d -= gap;
    }
    if (T.length > (e.segN || BAL.wormSegs)) T.length = e.segN || BAL.wormSegs;
  },
  bossPhaseUpdate(run, e, dt) {
    // 防壁の対象を決めるための「直近にいちばん削った武器」：時間で薄れる合計（BAL.bossRecTau 秒で 1/e）
    const k = Math.exp(-dt / BAL.bossRecTau);
    for (const id in e.rec) e.rec[id] *= k;
    if (e.wallT > 0 && (e.wallT -= dt) <= 0) e.wallBy = null;
    if (e.jamArmT > 0 && (e.jamArmT -= dt) <= 0) e.jamArms = null;
    if (e.tele) {
      if (e.tele.kind === 'jam') e.tele.targets = this.jamTargets(run, e);
      if ((e.tele.t -= dt) <= 0) this.bossPhaseDo(run, e, e.tele);
      return;
    }
    if (e.ph < 3 && e.hp <= e.maxHp * BAL.bossPhaseAt[e.ph]) {
      const kind = this.BOSS_KIND[e.bk].ph;
      let by = null;
      if (kind === 'wall') {
        let best = 0;
        for (const id in e.rec) if (WEAPONS[id] && e.rec[id] > best) { best = e.rec[id]; by = id; }
      }
      e.tele = { kind, t: BAL.bossPhaseTele, by, targets: kind === 'jam' ? this.jamTargets(run, e) : null };
      e.ph++;
      this.fx(run, { type: 'ring', x: e.x, y: e.y, r: e.r * 4, color: this.BOSS_COL[kind], life: BAL.bossPhaseTele });
      // 画面側（UI.renderHud）が見て帯を出す。新しい予告は新しいオブジェクト
      run.phaseCut = { n: (run.phaseCut ? run.phaseCut.n : 0) + 1, no: e.ph, kind, by, bk: e.bk };
    }
  },
  // ジャマーの腕の行き先：ジャマーから最も近い BAL.bossJamMax 基（距離は問わない・盤の上の全部の武器から近い順）
  jamTargets(run, e) {
    return run.units.map(w => ({ w, d: Util.dist(e.x, e.y, w.x, w.y) })).sort((p, q) => p.d - q.d)
      .slice(0, BAL.bossJamMax).map(o => o.w);
  },
  bossPhaseDo(run, e, tele) {
    e.tele = null;
    const col = this.BOSS_COL[tele.kind];
    if (tele.kind === 'jump') {
      const st = run.stage;
      // コアの手前 bossJumpKeep タイルは残す（跳んだ先がそのまま負けにならないように）
      let left = Math.min(BAL.bossJumpTiles, Math.max(0, e.dist - BAL.bossJumpKeep)) * TILE;
      this.fx(run, { type: 'boom', x: e.x, y: e.y, r: e.r * 2.2, color: col, life: 0.35 });
      while (left > 0) {
        const tc = (e.x / TILE) | 0, tr = (e.y / TILE) | 0;
        if (!st.walkable(tc, tr)) break;
        const g = st.flowTo(tc, tr, e.lane);
        if (!g) break;
        const a = Util.angle(e.x, e.y, g.x, g.y), s = Math.min(8, left);
        const nx = e.x + Math.cos(a) * s, ny = e.y + Math.sin(a) * s;
        if (!st.step(tc, tr, (nx / TILE) | 0, (ny / TILE) | 0)) break;
        e.x = nx; e.y = ny; left -= s;
        if (e.trail) this.wormFollow(e);
      }
      this.fx(run, { type: 'ring', x: e.x, y: e.y, r: e.r * 4, color: col, life: 0.5 });
      this.shake(run, 6, true);
    } else if (tele.kind === 'wall') {
      if (tele.by) { e.wallT = BAL.bossWallSec; e.wallBy = tele.by; }
      this.fx(run, { type: 'ring', x: e.x, y: e.y, r: e.r * 4, color: col, life: 0.5 });
    } else {
      // 沈黙：ジャマーから最も近い BAL.bossJamMax 基へ腕を伸ばして止める（距離は問わない）。近くに置いた武器から止まる＝遠くから撃つ武器が強い
      const tg = this.jamTargets(run, e);
      for (const w of tg) {
        w.jamT = BAL.bossJamSec; this.fx(run, { type: 'ring', x: w.x, y: w.y, r: 34, color: col, life: 0.4 });
      }
      e.jamArms = tg; e.jamArmT = BAL.bossJamSec;       // 止めている間は腕がつながったまま（render.js の bossPhaseMark）
      this.fx(run, { type: 'ring', x: e.x, y: e.y, r: e.r * 3, color: col, life: 0.6 });
    }
  },

  startWave(run) {
    for (const w of run.units) w.jamT = 0;     // 沈黙は次のウェーブへ持ち越さない
    run.finalRes = {};                         // ラスボスの耐性は、そのウェーブの終わりで消える
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
    if (this.isFinalChapter(run)) this.spawnFinal(run);
    else if (this.isBossWave(run)) this.spawnBoss(run);
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
  // **出てきた敵を、その口のレーンへ順番に振り分ける。**（2026-09-25）
  //   同じ口から出た群れが、分かれ道で左右に分かれて進む。レーンが1本なら今までどおり
  pickLane(run, si) {
    const st = run.stage;
    const mi = st.mouthOf ? st.mouthOf[si] : 0;
    const L = st.mouthLanes && st.mouthLanes[mi];
    if (!L || !L.length) return null;
    run.laneRot = run.laneRot || {};
    const k = run.laneRot[mi] = (run.laneRot[mi] || 0) + 1;
    return L[k % L.length];
  },

  makeEnemy(run, t, g, x, y, si, hpOverride, gen) {
    // 章ごとの重み（ストップポイント／跳ね上げポイント）
    const chMul = this.chapterWeight(run);
    const stageMul = Math.pow(BAL.stageHpMul, run.stageIdx) * chMul;
    const base = BAL.enemyHpBase * Math.pow(BAL.enemyHpGrowth, g - 1) * stageMul;
    let hp = hpOverride !== undefined ? hpOverride : base * t.hp;
    // 2026-10-07 ユーザー：第31章から（アセンション）、全ての敵の HP ×BAL.ascHpMul（3）
    if (run.stageIdx >= 30) hp *= BAL.ascHpMul;
    const en = {
      x, y, hp, maxHp: hp, si,
      lane: this.pickLane(run, si),    // その口のレーンに順番に振る（stages.js の lanes）
      spd: Math.min(BAL.enemySpdCap, BAL.enemySpdBase * Math.pow(BAL.enemySpdGrowth, g)) * t.spd,
      r: t.r,
      coin: BAL.enemyCoinBase * Math.pow(BAL.enemyCoinGrowth, g - 1) * t.coin,
      color: t.color,
      tname: t.name,                   // 死因の内訳に使う
      // **装甲は「1発のダメージを何割減らすか」**（割合。2026-10-05）。章が進んでも意味が消えない
      armor: t.armor ? Math.min(BAL.armorCutMax, BAL.armorCut * t.armor) : 0,
      res: this.resOf(run, t),         // 耐性（その章で付いているものだけ）
      regen: t.regen ? hp * t.regen : 0,
      split: gen ? 0 : (t.split || 0),   // 割れた子はもう割れない
      nest: t.nest || 0,                 // 入れ子の残りの層（中身は1つ少ない・kill で出す）
      gen: gen || 0,

      pushX: 0, pushY: 0,
      shock: 0, slow: 0, slowT: 0, stun: 0, chill: 0,
      burn: 0, burnT: 0, poison: 0, poisonT: 0, fvuln: 0, fvulnT: 0, nukeV: 0, nukeT: 0,
      armorDown: 0, armorT: 0, sticky: 0, stickyCd: 0, burnBlue: false,   // 装甲を削られている（曳光弾・腐蝕の雲）・燃え移り（粘着燃料）・青い炎
      grabT: 0, grabV: 0, spotT: 0, tntT: 0, dist: 1e9, counted: false,
      hitFlash: 0, dead: false, ang: 0,
    };
    if (t.up) this.upperInit(run, t, en);
    return en;
  },

  // 上位の敵の中身（無効の系統・ポリモーフの切り替え・ゼロデイの弱点・ランサムウェアの気配）
  upperInit(run, t, e) {
    e.upper = t.name; e.k = t.k; e.tname = t.name;
    if (t.imm) { e.imm = {}; for (const s of t.imm) e.imm[s] = true; }
    if (t.poly) { e.poly = true; e.polyI = (run.polySeq = (run.polySeq || 0) + 1) % SYS_ORDER.length; e.polyT = BAL.ascPolySec * (0.5 + 0.5 * Math.random()); }
    if (t.zd) e.weak = Asc.weakOf(run.stageIdx);
    if (t.name === 'ransom') { e.aura = true; e.auraCd = 0; }
    e.auraT = 0; e.immT = 0;
  },

  // 武器 by（id）の系統。武器でないもの（遺物・見本）は null＝無効の対象にならない
  sysOf(by) { const d = by && WEAPONS[by]; return d ? d.sys || null : null; },
  // 敵 e が系統 sys から来たものを受けつけないか（ダメージも状態異常も）。上位の敵だけが無効を持つ
  immune(e, sys) {
    if (!e.upper || !sys) return false;
    if (e.imm && e.imm[sys]) return true;
    return !!(e.poly && SYS_ORDER[e.polyI] === sys);
  },
  // いま無効になっている系統（絵と図鑑が読む）。無ければ null
  immSys(e) {
    if (!e.upper) return null;
    if (e.poly) return SYS_ORDER[e.polyI];
    if (e.imm) for (const k in e.imm) return k;
    return null;
  },
  // 上位の敵が系統 sys から受けるダメージの倍率（無効は BAL.ascImmuneMul・ゼロデイは弱点以外 BAL.ascZdOther）
  upperMul(e, sys, run) {
    if (this.immune(e, sys)) return BAL.ascImmuneMul;
    //   弱点以外の半減は、アセンション専用の札（ua_weak・連携の上位パック）で、半分から run.zdOther まで緩む
    if (e.weak && sys && sys !== e.weak) return (run && run.zdOther) ? Math.max(BAL.ascZdOther, run.zdOther) : BAL.ascZdOther;
    return 1;
  },

  // 湧く敵を上位に置き換えるときの種類（アセンションのレベルで増える）。置き換えないなら null
  pickUpper(run) {
    if (!BAL.ascUpperOn || run.stageIdx < MAIN_CHAPTERS) return null;
    const q = Asc.upperQ(Game.perm, run.stageIdx);
    if (!(q > 0) || Math.random() >= q) return null;
    const lv = Asc.lv(Game.perm), list = [];
    for (const k in UPPER_TYPES) { const c = BAL.ascUpper[k]; if (c && lv >= c.lv) list.push(UPPER_TYPES[k]); }
    return list.length ? Util.weighted(list, t => BAL.ascUpper[t.name].weight) : null;
  },

  // その章で付いている耐性。**ボスは付かない**（ボスは grunt の形で作る・足止めが効かないのは別の決まり）
  resOf(run, t) {
    const out = {};
    if (!t.res) return out;
    const ch = run.stageIdx + 1;
    for (const k in t.res) if (ch >= t.res[k]) out[k] = true;
    return out;
  },

  spawnEnemy(run) {
    if (run.enemies.length >= BAL.enemyCap) return;
    const st = run.stage;
    const g = this.gw(run);
    const up = this.pickUpper(run);               // 第31章から：HPの一部を上位の敵に置き換える（無ければ null）
    const t = up || this.pickType(g);
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
    const n = up ? 1 : (t.burst || 1);
    for (let i = 0; i < n; i++) {
      if (run.enemies.length >= BAL.enemyCap) break;
      run.enemies.push(this.makeEnemy(run, t,  g,
        p.x + Util.rand(-14, 14), p.y + Util.rand(-14, 14), si));
    }
  },

  statusScale(e) { return 1; },
  // 拘束（減速・足止め・引き寄せ）の効き目と持続の倍率。ルートキットだけ微弱（BAL.rootCcK）。ほかは1
  ccK(e) { return (e.boss && e.bk === 'rootkit') ? BAL.rootCcK : 1; },       // ボスを外したので、今はどの敵も同じ

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
    if (e.shock > 0) v += BAL.shockVuln + (run.shockVuln || 0);       // 感電の札（tsl_shock）が重ねた分も乗る
    if (e.chill > 0) v += run.chillVuln + run.st.chillVuln;
    if (e.fvulnT > 0) v += e.fvuln;
    if (e.nukeT > 0) v += e.nukeV;           // 戦術核の被爆
    if (e.stun > 0 && run.cageVuln) v += run.cageVuln;       // 泡の檻：閉じ込めた敵が受けるダメージ
    return v;
  },

  // **湧き口のバリアの中にいるか。**（2026-09-26・stages.js の shield）
  //   バリアの中の敵は、ダメージも状態異常も受けない。**damage() を通らずに状態を掛ける所も、全部これを見る**
  //   （触手の掴み・場の減速と毒・感電泡。見ていなかった掴みが、敵をバリアの中へ引き戻し続けて
  //    ウェーブが終わらなくなっていた。src/combat.js の grab）
  inShield(run, e) {
    const sh = run.stage && run.stage.shield;
    if (!sh) return false;
    const tc = (e.x / TILE) | 0, tr = (e.y / TILE) | 0;
    return tc >= 0 && tr >= 0 && tc < run.stage.cols && tr < run.stage.rows && !!sh[tr * run.stage.cols + tc];
  },

  damage(run, e, amount, opts) {
    if (e.dead) return 0;
    // **湧き口のバリアの中の敵は、ダメージも状態異常も受けない。**（2026-09-26・stages.js の shield）
    //   穴の隣に砲を固めて出た瞬間に倒す置き方を止めるため
    if (this.inShield(run, e)) {
      e.shieldT = 0.15;              // 弾かれた光（render.js）
      return 0;
    }
    opts = opts || {};
    // 2026-10-07 ユーザー：第31章から、全ての敵に99%のダメージカットのバリア。1発当たるごとに1%ずつ下がる（初見の攻撃はほぼ通らず、当てるほど通る）
    if (run.stageIdx >= 30 && !e.seg && amount > 0) {
      if (e.barrier === undefined) e.barrier = BAL.ascBarrier;
      amount *= 1 - e.barrier;
      e.barrier = Math.max(0, e.barrier - BAL.ascBarrierStep);
    }
    // **ラスボスの胴の節**：入ったダメージは頭へ、BAL.finalBodyMul 倍で回す（弱点は頭）。節の見た目の位置で当たりを判定する
    if (e.seg) {
      const h = e.seg;
      if (h.dead || e.hidden) return 0;
      e.hitFlash = 0.1;
      return this.damage(run, h, amount * BAL.finalBodyMul, Object.assign({}, opts, { body: true }));
    }
    // **上位の敵の無効**（アセンション・BAL.ascImmuneMul）。damage() の入口で止めるので、状態異常（燃焼・感電・減速・凍結・閉じ込め・印）も付かない
    //   ゼロデイの弱点以外は半分（ascZdOther）。ランサムウェアの気配の中は ascRansomMul
    const by0 = opts.by || this._by;
    let upMul = 1;
    if (e.upper) {
      upMul = this.upperMul(e, this.sysOf(by0), run);
      if (upMul <= 0) { e.immT = 0.2; return 0; }
      //   アセンション専用の札（上位パック）と常駐：上位の敵が受けるダメージの倍率（run.upDmg＝出撃中の札・mods.relic.upDmg＝常駐）
      upMul *= (run.upDmg || 1) * ((run.mods && run.mods.relic && run.mods.relic.upDmg) || 1);
    }
    if (e.auraT > 0) upMul *= 1 - (1 - BAL.ascRansomMul) * (1 - (run.auraCut || 0));   // run.auraCut＝検疫ゲート（ua_gate）：減りの割合を軽くする
    // 触手の印（連携3枚：syn_hangman・syn_fixfire・syn_searbind）：触手が当てた敵に BAL.cardFx.tntMarkDur 秒の印。
    //   6種の攻撃のどれでも付く（掴み・突き・薙ぎ払い・一閃・墨の爆風・壁と墨の場の持続ダメージ）。印のある敵を相手の武器が強く打てる
    if (run.tntMark && (opts.by || this._by) === 'tentacle') {
      if (!(e.tntT > 0)) run.tntMarkN = (run.tntMarkN || 0) + 1;
      e.tntT = BAL.cardFx.tntMarkDur;
    }
    const src = opts.src || this._src;       // いま撃っている武器の1基（装甲貫通・青い炎が読む）
    let dmg = amount * this.vuln(run, e) * upMul;
    // ワームの体は数節の連なり：貫通する弾・光線は節をまとめて抜く（当たった節の数ぶんダメージが入る）
    if (opts.hits > 1 && e.bk === 'worm') dmg *= opts.hits;
    // **耐性**（2026-09-30 段3）。効きにくいだけで、無効にはしない（BAL.resMul）
    const res = e.res;
    if (res) {
      // 青い炎（flm_inferno）：炎の直撃も、その炎が付けた燃焼も、耐火で半分にならない
      const blue = opts.blue || (by0 === 'flame' && src && src.flags && src.flags.blue);
      if (res.fire && (by0 === 'flame' || opts.burnTick) && !blue) dmg *= BAL.resMul;
      if (res.elec && (by0 === 'tesla' || opts.shockTick)) dmg *= BAL.resMul;
    }
    // **装甲は1発のダメージを割合で減らす**（e.armor＝減らす割合・BAL.armorCut）。
    //   減らす割合の上限は BAL.armorCutMax（完全無敵にすると詰む）
    //   **装甲を削る手が3つある（2026-09-30 段3b）**：敵に付く「装甲ダウン」（曳光弾・腐蝕の雲）・全武器の装甲貫通（run.apen・汎用の札）・
    //   その武器だけの装甲貫通（dyn.apen・徹甲榴弾）。合計で装甲を割り引く（最低15%は通すのは同じ）
    if (e.armor > 0 && !opts.dot) {
      let cut = (run.apen || 0) + ((src && src.dyn && src.dyn.apen) || 0);
      if (e.armorT > 0) cut += e.armorDown;
      dmg *= 1 - e.armor * Math.min(1, Math.max(0, 1 - cut));   // 削る札・無視する札は、減らす割合そのものを小さくする
    }
    const crit = opts.crit === true || (typeof opts.crit === 'number' && Util.chance(opts.crit)) ||
                 opts.forceCrit === true;
    if (crit) dmg *= opts.critMul || 2;
    // **武器ごとの記録。**（ユーザー 2026-09-25「武器ごとのダメージランキングの表示と、リザルトで何が一番ダメージを出していたかを残して」）
    //   数えるのは**有効ダメージ**（敵の残りHPまで）。倒しきった敵へのやり過ぎ分まで数えると、
    //   効率の良い武器ほど小さく出る（CLAUDE.md「武器とカードは漏らした数で測る」）
    const by = opts.by || this._by || 'other';
    // ボスの防壁：直前にいちばん削った武器の種類からのダメージは半分（無効にはしない）。直近の削り合計もここで付ける
    if (e.boss && e.rec) {
      if (e.bk === 'final') {
        // ラスボスの耐性：直近に頭を削った武器の種類（そのウェーブの終わりまで・頭にも胴にも効く）。直近の削りには頭に当たった分だけ数える
        if (run.finalRes && run.finalRes[by]) dmg *= BAL.finalResMul;
        if (!opts.body) e.rec[by] = (e.rec[by] || 0) + dmg;
      } else {
        if (e.wallT > 0 && by === e.wallBy) dmg *= BAL.bossWallMul;
        e.rec[by] = (e.rec[by] || 0) + dmg;
      }
    }
    const hp0 = e.hp;
    e.hp -= dmg;
    e.hitFlash = 0.1;
    run.dealt += dmg;
    if (run.dmgBy && hp0 > 0) {
      run.dmgBy[by] = (run.dmgBy[by] || 0) + Math.min(dmg, hp0);
      if (e.hp <= 0) run.killBy[by] = (run.killBy[by] || 0) + 1;
    }

    // ---- 状態異常。**遺物の軸がここで乗る**（relics.js の st）----
    //   opts.dot が立っているものは、燃焼・毒の雲など**すでに状態異常が
    //   起こしているダメージ**。ここへ付与を掛けると自分で自分を延長し続けて
    //   永久に切れなくなるので、付与（*Grant）は素の攻撃だけに掛ける
    if (e.noStatus) {
      // ラスボス：状態異常（感電・凍結・閉じ込め・燃焼・即死）は付かない
      if (run.nums.length < 40 && dmg > 0) run.nums.push({ x: e.x + Util.rand(-6, 6), y: e.y - e.r, t: 0, life: 0.6, txt: Util.fmt(dmg), crit: crit, color: opts.color || '#fff' });
      if (e.hp <= 0 && !e.dead) this.kill(run, e, opts);
      return dmg;
    }
    const sc = this.statusScale(e);
    const cck = this.ccK(e);
    const st = run.st;
    if (opts.shock) { e.shock = Math.max(e.shock, (opts.shock * sc + st.shockDur) * (res && res.elec ? BAL.resMul : 1)); e.shockBy = by; }

    let sl = opts.slow || 0, slD = (opts.slowDur || 0) * sc, ch = !!opts.chill;
    if (st.chillGrant > 0 && !opts.dot) {           // 霜結：どの武器でも凍る
      if (st.chillGrant > sl) sl = st.chillGrant;
      if (BAL.grantChillDur > slD) slD = BAL.grantChillDur;
      ch = true;
    }
    if (sl > 0) {
      // 耐寒（2026-09-30 段3）：凍らない・冷気の減速は強さも時間も半分（凍結装置・霜結の遺物・凍らせる札）
      const coldRes = res && res.cold && (ch || by === 'cryo');
      const cm = coldRes ? BAL.resMul : 1;
      // ボスは遅くならない（凍った印・被ダメージの増えは乗る）。遅くできると制限時間が伸びて DPS チェックでなくなる。例外はルートキットの微弱な効き
      //   ルートキットだけ微弱に遅くなる（強さも時間も BAL.rootCcK 倍）
      if (!e.boss || e.bk === 'rootkit') e.slow = Math.max(e.slow, Math.min(BAL.slowMax, (sl + st.slowAdd) * cm * cck));
      const d = ((slD || 1) + st.chillDur) * cm * cck;
      e.slowT = Math.max(e.slowT, d);
      if (ch && !coldRes) e.chill = Math.max(e.chill, d);
    }

    // 重量（2026-09-30 段3）：閉じ込めは半分
    if (opts.stun && (e.ccUsed || 0) < BAL.ccMaxSec) { e.stun = Math.max(e.stun, (opts.stun * sc + st.stunDur) * (res && res.heavy ? BAL.resMul : 1) * cck); e.stunBy = by; }

    let bn = opts.burn || 0, bd = opts.burnDur || 0;
    if (st.burnGrant > 0 && !opts.dot) {            // 熾火：どの武器でも燃える
      const g = amount * st.burnGrant;
      if (g > bn) { bn = g; if (BAL.grantBurnDur > bd) bd = BAL.grantBurnDur; }
    }
    if (bn > 0) {
      e.burn = Math.max(e.burn, bn * st.burnMul);
      e.burnBy = by;
      e.burnBlue = !!(opts.blue || (by === 'flame' && src && src.flags && src.flags.blue));
      if (opts.sticky) e.sticky = Math.max(e.sticky || 0, opts.sticky);   // 粘着燃料：この燃焼は隣へ燃え移る
      e.burnT = Math.max(e.burnT, (bd || 3) + st.burnDur);
    }

    if (!e.dead && opts.exec && e.hp > 0 && e.hp / e.maxHp <= opts.exec) e.hp = 0;

    // 同時に出す数字は40まで（2026-09-26：数字を画面で12pxに大きくしたので、70だと密集した所で埋まる）
    if (run.nums.length < 40 && dmg > 0) {
      run.nums.push({ x: e.x + Util.rand(-6, 6), y: e.y - e.r, t: 0, life: 0.6,
        txt: Util.fmt(dmg), crit: crit, color: opts.color || '#fff' });
    }

    if (e.hp <= 0 && !e.dead) this.kill(run, e, opts);
    return dmg;
  },

  // 上位の敵が毎フレームすること：ポリモーフの切り替え・ランサムウェアの気配
  upperTick(run, e, dt) {
    if (e.poly) {
      e.polyT -= dt;
      if (e.polyT <= 0) {
        e.polyT += BAL.ascPolySec; e.polyI = (e.polyI + 1) % SYS_ORDER.length;
        if (run.fx.length < 150) this.fx(run, { type: 'ring', x: e.x, y: e.y, r: e.r * 2.4, color: SYS_INFO[SYS_ORDER[e.polyI]].color, life: 0.35 });
      }
    }
    if (e.aura) {
      e.auraCd -= dt;
      if (e.auraCd <= 0) {
        e.auraCd = 0.25;
        const R = BAL.ascRansomR, near = Grid.query(e.x, e.y, R, _q);
        for (const o of near) {
          if (o === e || o.dead || Util.dist(e.x, e.y, o.x, o.y) > R + o.r) continue;
          o.auraT = 0.4;
        }
      }
    }
  },

  // 粘着燃料：e の燃焼を、近くの燃えていない敵へ移す
  spreadFlame(run, e, dt) {
    const F = BAL.cardFx;
    e.stickyCd -= dt;
    if (e.stickyCd > 0) return;
    e.stickyCd = F.stickyEvery;
    const near = Grid.query(e.x, e.y, F.stickyR, _q);
    let n = 0;
    for (const o of near) {
      if (n >= F.stickyMax) break;
      if (o === e || o.dead || o.burnT > 0.2 || this.inShield(run, o) || (o.upper && this.immune(o, 'elem'))) continue;
      if (Util.dist(e.x, e.y, o.x, o.y) > F.stickyR + o.r) continue;
      o.burn = e.burn * F.stickyMul; o.burnT = Math.min(e.burnT, F.stickyDur);
      o.burnBy = e.burnBy; o.burnBlue = e.burnBlue; o.sticky = e.sticky - 1;
      n++;
      if (run.fx.length < 150) this.fx(run, { type: 'spark', x: o.x, y: o.y, color: '#ff8a3a', life: 0.16 });
    }
  },

  kill(run, e, opts) {
    e.dead = true;
    // **ボスを倒した。**大きく弾けて揺れる。数は画面側（UI.renderHud）が見てカットインを出す
    if (e.boss) {
      run.bossKills = (run.bossKills || 0) + 1;
      this.fx(run, { type: 'boom', x: e.x, y: e.y, r: e.r * 5, color: '#ff4d6a', life: 0.6 });
      this.fx(run, { type: 'boom', x: e.x, y: e.y, r: e.r * 3, color: '#fff3c8', life: 0.4 });
      this.shake(run, 16, true);
      // 倒した**その場所**の演出（0929p）：金の六角の輪が3重に広がり、データ片が弾ける（render.js の 'bossdown'）。
      //   一度きり・粒は16。fx の上限（240）に阻まれないよう直接積む。コアに着いて負けたとき（漏れ）はここを通らない
      run.fx.push({ type: 'bossdown', x: e.x, y: e.y, r: e.r, life: 1.1, t: 0 });
      if (e.bk === 'final') {
        run.finalKill = true;
        for (const k of [1.4, 2.2]) this.fx(run, { type: 'ring', x: e.x, y: e.y, r: e.r * 6 * k, color: '#ff7a1a', life: 0.9 });
        run.fx.push({ type: 'bossdown', x: e.x, y: e.y, r: e.r * 1.6, life: 1.4, t: 0 });
        this.shake(run, 22, true);
      }
    }
    // **入れ子：倒すと、同じ場所から中身が1体出てくる。**（2026-09-28）最後の層（nest 1）は何も出さない
    if (e.nest > 1 && run.enemies.length < BAL.enemyCap) {
      const t = ENEMY_TYPES.nest;
      const c = this.makeEnemy(run, t, this.gw(run), e.x, e.y, e.si, e.maxHp * BAL.nestHp, (e.gen || 0) + 1);
      c.nest = e.nest - 1;
      c.lane = e.lane;
      c.r = Math.max(8, e.r * 0.8);
      c.spd = e.spd * 1.15;
      c.coin = e.coin * 0.7;
      c.dist = e.dist;
      run.enemies.push(c);
      this.fx(run, { type: 'boom', x: e.x, y: e.y, r: e.r * 1.8, color: '#ffd2a8', life: 0.25 });
    }
    // **トロイ：倒すと、中からパケットを数体こぼす**（BAL.ascTrojanKids・1体のHPは雑魚1体ぶんの ascTrojanKidHp 倍）
    if (e.upper === 'trojan') {
      const g = this.gw(run);
      for (let i = 0; i < BAL.ascTrojanKids && run.enemies.length < BAL.enemyCap; i++) {
        const c = this.makeEnemy(run, ENEMY_TYPES.grunt, g, e.x + Util.rand(-14, 14), e.y + Util.rand(-14, 14), e.si, e.maxHp / e.k * BAL.ascTrojanKidHp, 1);
        c.lane = e.lane; c.dist = e.dist; c.coin = e.coin / e.k * 0.5;
        run.enemies.push(c);
      }
      this.fx(run, { type: 'boom', x: e.x, y: e.y, r: e.r * 2, color: '#ffd27a', life: 0.3 });
    }
    // **倒すと割れる。** 過剰ダメージで一掃する編成が、そのぶん数を増やす
    if (e.split > 0 && run.enemies.length + e.split <= BAL.enemyCap) {
      const t = ENEMY_TYPES[e.tname] || ENEMY_TYPES.grunt;
      const g = this.gw(run);
      for (let i = 0; i < e.split; i++) {
        const c = this.makeEnemy(run, t, g, e.x + Util.rand(-12, 12), e.y + Util.rand(-12, 12),
                                 e.si, e.maxHp * BAL.splitHp, 1);
        c.lane = e.lane;                 // 分かれた子は親と同じ道を行く
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

    // 氷の棺（cry_permafrost）：凍ったまま倒れると、周りの敵を凍らせる（ダメージは無い）
    if (cw && cw.flags.coffin && e.chill > 0) {
      const R = BAL.cardFx.coffinR;
      const near = Grid.query(e.x, e.y, R, _q);
      for (const o of near) {
        if (o.dead || o === e || Util.dist(e.x, e.y, o.x, o.y) > R + o.r) continue;
        this.damage(run, o, 0, { slow: cw.s.slow, slowDur: cw.s.slowDur, chill: true, by: 'cryo', src: cw });
      }
      this.fx(run, { type: 'frost', x: e.x, y: e.y, r: R, color: '#bff0ff', ph: Math.random() * 6.28, life: 0.4 });
    }

    if (run.fx.length < 180) {
      this.fx(run, { type: 'boom', x: e.x, y: e.y, r: e.r * 1.5, color: e.color, life: 0.22 });
      // **血飛沫。**（ユーザー 2026-09-22 の要望1）
      //   > 「敵を撃破すると**侵攻方向と逆に**、血飛沫に見えるようなものが弾け飛ぶ
      //   >   エフェクト、赤でなくていい、**敵の色遵守**で」
      //   `e.ang` は進んでいた向き（`combat.js` の移動で入る）。その逆へ散らす。
      //   **1体につき破片は1つの fx にまとめる**（敵は同時に100体を超えるので、
      //   1体あたりの fx を増やすと数が跳ねる）
      this.fx(run, {
        type: 'splat', x: e.x, y: e.y, color: e.color, life: 0.42,
        a: (e.ang || 0) + Math.PI, n: 5 + ((Math.random() * 4) | 0), sp: e.r * 3.2 + 26,
      });
      // **倒す＝儲かる、を目で見えるようにする。**
      // これまでHUDの数字が静かに増えるだけで、報酬を得た実感が無かった
      if (this.coinFx < 26) {
        this.coinFx++;
        this.fx(run, { type: 'coin', x: e.x, y: e.y, life: 0.72, seed: (Math.random() * 100) | 0 });
      }
    }
  },

  // ================= 攻撃のかたち =================
  spawnBullet(w, run, angle, o) {
    Snd.shot(w.id);
    if (run.bullets.length > 1200) run.bullets.shift();
    o = o || {};
    const s = w.s;
    // 集弾率が1未満のときだけ弾がばらける。**射界は固定になった（2026-09-30 段1a）ので、幅に比例する罰は無い**（いまは常に1）
    const g = w.group !== undefined ? w.group : 1;
    if (g < 1) angle += Util.rand(-1, 1) * (1 - g) * BAL.spreadRad;
    const speed = s.speed * (o.speedMul || 1);
    let dmg = s.dmg * (o.dmgMul || 1);
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
      tracer: w.dyn.tracerDown || 0,      // 曳光弾：当たった敵の装甲を削る割合
      child: !!o.child,
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
    const sx = o.fromX !== undefined ? o.fromX : w.x, sy = o.fromY !== undefined ? o.fromY : w.y;   // 弾む泡は、割れた所から出る
    const a = Util.angle(sx, sy, tx, ty);
    const speed = w.s.speed;
    run.bullets.push({
      x: sx, y: sy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      dmg: 0, r: w.s.bulletR, pierce: 0, bounce: 0, hit: null,
      splash: 0, splashMul: 1, homing: 0, crit: 0, critMul: 2,
      exec: 0, shock: 0, slow: 0, slowDur: 0, stun: 0, burn: 0, burnDur: 0,
      color: o.color || '#8fd94a', lob: true, mark: !!o.mark, rocket: !!o.rocket, through: true,
      landX: tx, landY: ty, onLand: o.onLand,
      life: 5, src: w, wid: w.id, range: w.s.range * 1.8, ox: sx, oy: sy, target: null,
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
      // 狙撃指示（syn_spotblade）：スナイパーが撃ち抜いた敵（印）への斬撃に倍率
      let dd = (w.dyn.spotMul && e.spotT > 0) ? dmg * w.dyn.spotMul : dmg;
      // 焼き印（syn_searbind）：触手の印のある敵への直撃にも倍率（炎上ダメージのほうは敵の更新で tntBurn を掛ける）
      if (w.dyn.tntMul && e.tntT > 0) { dd *= w.dyn.tntMul; run.tntBoostN = (run.tntBoostN || 0) + 1; }
      this.damage(run, e, dd, o);
      hits++;
    }
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
      color: o.color, kind: o.kind || 'gas', by: this._by, src: o.src || this._src,
      a: o.a,                       // 触手の壁の向き（絵だけが読む）
      flow: !!o.flow, armorDown: o.armorDown || 0,       // 重い霧（通路に沿って流れる）・腐蝕の雲（雲の中の敵の装甲を削る）
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
      // バリアの中の敵は掴めない（掴んで引き戻すとバリアの中へ戻し続け、ウェーブが終わらなくなった）
      if (this.inShield(run, t)) { t.shieldT = 0.15; continue; }
      if (t.upper && this.immune(t, 'grab')) { t.immT = 0.2; continue; }   // 上位の敵の無効（掴み）
      // 止めておける合計の秒数を使い切った敵は、もう掴めない（BAL.ccMaxSec）。削りだけ入る
      // 重量（2026-09-30 段3）：掴む時間も引き戻す力も半分
      const hv = ((t.res && t.res.heavy) ? BAL.resMul : 1) * this.ccK(t);
      if ((t.ccUsed || 0) < BAL.ccMaxSec) t.grabT = Math.max(t.grabT, dur * this.statusScale(t) * hv);
      t.grabV = power * hv;
      this.damage(run, t, dmg, { color: '#ffb0e8', crit: w.s.crit, critMul: w.s.critMul });
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
      if (cur.upper && this.immune(cur, 'elem')) break;   // ファラデーなど：電気は殻の中へ入らず、連鎖はそこで止まる
      if (cur.res && cur.res.elec) break;   // 耐電（2026-09-30 段3）：連鎖はそこで止まる
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
      if (opts.tntMul && e.tntT > 0) { v *= opts.tntMul; run.tntBoostN = (run.tntBoostN || 0) + 1; }
      if (opts.spotMul && e.spotT > 0) v *= opts.spotMul;
      this.damage(run, e, v, Object.assign({ color: '#ffc38a' }, opts));
      if (opts.irr > 0 && !e.dead && !this.inShield(run, e) && !(e.upper && this.immune(e, this.sysOf(this._by)))) { e.nukeV = opts.irr; e.nukeT = BAL.cardFx.nukeDur; }   // 戦術核：被爆
    }
    this.fx(run, { type: 'boom', x, y, r: radius, color: opts.color || '#ff9a4a', life: 0.3 });
    this.shake(run, Math.min(10, radius * 0.06));
  },

  // ================= レーザーライフル（旧スナイパー・2026-09-30 段3） =================
  //
  //   ユーザー（2026-09-29）「スナイパー → レーザーライフル（壁で反射する）。『直線が無いから使えない』を無くす」
  //   答え4（2026-09-30）：壁で2回反射（カードで増やせる）・線の上を全部貫く・いまの弾より少し太い・コアと味方の武器には当たらない
  //
  //   **弾を飛ばさず、その場で線を引く。**線は撃ち口から砲身の向きへ進み、壁に入ったら折り返す。
  //   折り返しは `w.s.reflect` 回まで。最後の折り返しのあとは、次の壁で止まる。線の長さの合計は射程 × BAL.laserLenMul まで。
  //   **壁は六角（絵と同じ）で見る。**通路の六角（`stage.vec.hexes`）から出たら、出ていった六角の辺で折り返す
  //   （隣の六角の中心どうしを結ぶ向きが、その辺の法線）。最初はタイル（経路探索の層）で折り返していて、
  //   光線が絵の上では壁の中を通っていた（確認室で見て直した・CLAUDE.md「盤の縁で絵と規則を食い違わせない」）。
  //   六角の一覧が無い盤では、タイルの判定に戻る
  _roadHex(st) {
    if (st._roadHex !== undefined) return st._roadHex;
    const hx = st.vec && st.vec.hexes;
    if (!hx || !hx.length) return (st._roadHex = null);
    const set = new Set();
    for (const h of hx) set.add(h.c + ',' + h.r);
    return (st._roadHex = set);
  },
  laserPath(w, run, angle) {
    const st = run.stage;
    const road = this._roadHex(st);
    const pts = [{ x: w.x, y: w.y }];
    let x = w.x, y = w.y;
    let vx = Math.cos(angle), vy = Math.sin(angle);
    let left = w.s.range * (BAL.laserLenMul || 1.8);
    let refl = Math.max(0, Math.round(w.s.reflect || 0));
    const step = TILE * 0.2;
    const cellOf = (px, py) => road ? MapGen.hexPick(px, py) : { c: (px / TILE) | 0, r: (py / TILE) | 0 };
    const isOpen = (c) => road ? road.has(c.c + ',' + c.r) : st.walkable(c.c, c.r);
    const center = (c) => road ? MapGen.hexAt(c.c, c.r) : { x: (c.c + 0.5) * TILE, y: (c.r + 0.5) * TILE };
    // **撃ち口の足元は壁**（武器は通路でない六角の上に立つ）。通路に一度出るまでは壁で止めない（最大 2.5タイル）
    let out = false;
    for (let d = 0; d < TILE * 2.5 && left > 0; d += step) {
      x += vx * step; y += vy * step; left -= step;
      if (isOpen(cellOf(x, y))) { out = true; break; }
    }
    if (!out) return null;
    let cur = cellOf(x, y);
    while (left > 0) {
      const nx = x + vx * step, ny = y + vy * step;
      const nc = cellOf(nx, ny);
      if (isOpen(nc)) { x = nx; y = ny; cur = nc; left -= step; continue; }
      // 壁に入る。出ていく六角の中心から、入ろうとした六角の中心への向きが、その辺の法線
      pts.push({ x, y });
      if (refl <= 0) return pts;
      refl--;
      const a = center(cur), b = center(nc);
      let ex = b.x - a.x, ey = b.y - a.y;
      const el = Math.hypot(ex, ey) || 1;
      ex /= el; ey /= el;
      const dot = vx * ex + vy * ey;
      vx -= 2 * dot * ex; vy -= 2 * dot * ey;
      // 折り返した直後にまた同じ壁へ入る（角をかすめた）ときは、来た向きへそのまま戻す
      if (!isOpen(cellOf(x + vx * step, y + vy * step))) { vx = -(vx + 2 * dot * ex); vy = -(vy + 2 * dot * ey); }
    }
    pts.push({ x, y });
    return pts;
  },

  laser(w, run, angle) {
    Snd.shot(w.id);
    const pts = this.laserPath(w, run, angle);
    if (!pts || pts.length < 2) return;
    const s = w.s;
    let dmg = s.dmg;
    if (run.resonance > 0) dmg *= (1 + run.resonance);      // 弾道共鳴（ガトリング＋レーザー）
    const half = s.bulletR;                                   // 線の太さの半分
    const hit = new Set();
    let hits = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const near = Grid.query((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, len * 0.5 + half + 24, _q);
      for (const e of near) {
        if (e.dead || hit.has(e)) continue;
        const reach = e.r + half;
        if (Util.segDist2(a.x, a.y, b.x, b.y, e.x, e.y) > reach * reach) continue;
        hit.add(e);
        hits++;
        this.damage(run, e, dmg, {
          hits: BAL.wormLaserHits,
          crit: s.crit, critMul: s.critMul, exec: s.execThr, shock: s.shockDur,
          slow: s.slow, slowDur: s.slowDur,
          burn: s.burn ? s.dmg * s.burn : 0, burnDur: s.burnDur, color: w.def.color,
          forceCrit: !!(w.flags.frostCrit && e.chill > 0),
        });
        // 曳光指示・狙撃指示：レーザーが通った敵に印が残る
        if (w.flags.spot && !e.dead) e.spotT = 3;
      }
    }
    this.fx(run, { type: 'laser', pts, w: half, n: hits, color: w.def.color, life: 0.26 });
  },

  // ================= 触手の6種の攻撃（2026-09-30 段3・weapons.js の tentacle） =================
  //   t … 砲身の線の上の敵（狙いの基準）。k … 攻撃の種類（TNT_ATTACKS）。i … 同時に出したときの何番目か（名前の表示をずらす）
  //   大きさは BAL.tnt*。締め上げ（カード）は突き刺しと一閃の倍率（w.dyn.tntStabMul）、剛腕は壁の持続にも効く（knockDur の比）
  TNT_NAMES: { pull: '引き寄せ', stab: '突き刺し', sweep: '薙ぎ払い', wall: '触手の壁', ink: 'タコ墨', cut: '一閃' },
  //   名札（render.js の tntTag）の英字と、6種を見分ける印の色（見た目だけ。数値は BAL.tnt*）
  TNT_EN: { pull: 'PULL', stab: 'STAB', sweep: 'SWEEP', wall: 'WALL', ink: 'INK', cut: 'SLASH' },
  TNT_COL: { pull: '#ff8ae0', stab: '#ff4a66', sweep: '#ffc24a', wall: '#7ee3a0', ink: '#9a7cff', cut: '#7ae8ff' },
  tentacleAttack(w, run, t, k, i) {
    const s = w.s, col = w.def.color;
    const sharp = w.dyn.tntStabMul || 1;
    if (k === 'pull') {
      this.grab(w, run, t, s.knock, s.knockDur, s.dmg);
    } else if (k === 'stab') {
      const o = BAL.tntStab, L = s.range * o.len;
      const x2 = w.x + Math.cos(w.angle) * L, y2 = w.y + Math.sin(w.angle) * L;
      this.lineHit(run, w.x, w.y, x2, y2, o.half, s.dmg * o.dmg * sharp, { color: col, crit: s.crit, critMul: s.critMul });
      this.fx(run, { type: 'tntStab', x1: w.x, y1: w.y, x2, y2, half: o.half, color: col, acc: this.TNT_COL.stab, life: 0.5 });
    } else if (k === 'sweep') {
      const o = BAL.tntSweep;
      this.coneDamage(w, run, w.angle, o.arc, s.range * o.len, s.dmg * o.dmg, { color: col, crit: s.crit, critMul: s.critMul });
      this.fx(run, { type: 'tntSweep', x: w.x, y: w.y, a: w.angle, arc: o.arc, r: s.range * o.len, color: col, acc: this.TNT_COL.sweep, life: 0.5 });
    } else if (k === 'wall') {
      const o = BAL.tntWall, dur = o.dur * (s.knockDur / (w.def.base.knockDur || 1));
      this.spawnField(run, t.x, t.y, { kind: 'tentwall', r: o.r, dur, dps: s.dmg * o.dps, slow: BAL.slowMax, color: col, a: t.ang });
    } else if (k === 'ink') {
      const o = BAL.tntInk;
      this.explode(run, t.x, t.y, o.r, s.dmg * o.dmg, { color: '#8a6cff' });
      this.spawnField(run, t.x, t.y, { kind: 'ink', r: o.r, dur: o.dur, dps: s.dmg * o.dps, slow: o.slow, color: '#8a6cff' });
    } else if (k === 'cut') {
      const o = BAL.tntCut;
      this.explode(run, t.x, t.y, o.r, s.dmg * o.dmg * sharp, { color: '#ffffff', crit: s.crit, critMul: s.critMul });
      this.fx(run, { type: 'tntCut', x: t.x, y: t.y, a: w.angle + 0.62, r: o.r, acc: this.TNT_COL.cut, life: 0.34 });
    }
    // 出た攻撃の名前の札（何が出たか分かるように）。触手の上に斜めの小さな札を一瞬（render.js の tntTag）。同時に出ている札は6枚まで
    let tags = 0;
    for (const f of run.fx) if (f.type === 'tntTag') tags++;
    if (tags < 6) this.fx(run, { type: 'tntTag', x: w.x, y: w.y, slot: i, en: this.TNT_EN[k], jp: this.TNT_NAMES[k] || k, acc: this.TNT_COL[k], life: 1.0 });
  },

  // 線の上の敵に1回ずつ当てる（触手の突き刺し）。壁は見ない（腕なので回り込める）
  lineHit(run, x1, y1, x2, y2, half, dmg, opts) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const near = Grid.query((x1 + x2) * 0.5, (y1 + y2) * 0.5, len * 0.5 + half + 24, _q);
    let hits = 0;
    for (const e of near) {
      if (e.dead) continue;
      const reach = e.r + half;
      if (Util.segDist2(x1, y1, x2, y2, e.x, e.y) > reach * reach) continue;
      this.damage(run, e, dmg, opts);
      hits++;
    }
    return hits;
  },

  // この発射で撃つ弾数
  shotCount(w) {
    return Math.max(1, Math.round(w.s.count));
  },

  // ================= 指定攻撃（着弾円） =================
  //
  //   **この分類だけは、砲身から敵へ弾が飛ばない。**
  //   プレイヤーが盤面に円を置き、その中へ砲弾が降り注ぐ。
  //
  //   ・砲弾は **着弾するまで一切の当たり判定を持たない**（敵も壁も素通りする）。
  //     だから射線を持たず、スナイパーやガトリングが置きたい地面を食わない。
  //     好きな場所に置けるのが、この分類の強み
  //   ・**円の大きさは武器ごとの固定値**（Game.spotR）。倍率は掛けていない。
  //     円を道の多い所へ置くほど、同じ発射数が同じ敵に重なる。道を外した砲弾はただの空振りになる
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
        onLand: (rr, x, y) => this.spotImpact(w, rr, x, y, w.dyn.hop || 0, 1),
      });
    }
  },

  // 着弾。**弾が当たったときと同じことをする**ので、
  // クラスター・酸・感電・内破といったカードがそのまま効く
  //   hops … 弾む泡：あと何回、近くの敵の上へ跳ねるか ／ mul … 跳ねた泡のダメージ倍率
  spotImpact(w, run, x, y, hops, mul) {
    mul = mul || 1;
    const dmg = w.s.dmg * mul;
    const R = Math.max(18, w.s.splash);
    let shock = 0;
    if (w.flags.implode) shock = Math.max(shock, w.s.shockDur || 2.5);
    if (w.flags.staticFoam) shock = Math.max(shock, w.s.shockDur || 3);
    this.explode(run, x, y, R, dmg * (w.s.splashMul || 1), {
      color: w.def.color,
      shock,
      stun: (w.s.stunDur || 0) * (mul < 1 ? BAL.cardFx.hopStun * mul : 1),   // 跳ねた泡（弾む泡）は、閉じ込める時間が短い（hopStun 倍。0 なら閉じ込めない）
      slow: w.s.slow, slowDur: w.s.slowDur,
      burn: w.s.burn ? dmg * w.s.burn : 0, burnDur: w.s.burnDur,
      crit: w.s.crit, critMul: w.s.critMul, exec: w.s.execThr,
      tntMul: w.dyn.tntMul || 0,   // 触手の印のある敵への倍率（吊るし上げ・照準固定）
      spotMul: w.dyn.spotMul || 0,
      irr: w.dyn.irr || 0,        // 戦術核：被爆（あらゆる武器から受けるダメージの増え）
    });
    // クラスター弾：**BAL.cardFx.clusterEvery 発に1発**だけ子を撒く（1基ごとに数える。同時発射の数や札の枚数で子の総数が積にならない）
    if (w.dyn.cluster && (w.dyn.clusterCnt = (w.dyn.clusterCnt || 0) + 1) >= BAL.cardFx.clusterEvery) {
      w.dyn.clusterCnt = 0;
      this.cluster(run, { x, y, dmg, splash: R, splashMul: w.s.splashMul || 1, src: w, wid: w.id });
    }
    if (w.flags.acid) {
      this.spawnField(run, x, y, { kind: 'acid', r: w.s.fieldR, dur: w.s.fieldDur,
        dps: dmg * 0.35, vuln: 0.15, color: '#a8f0c0' });
    }
    // 毒泡（syn_toxfoam）：泡が割れた所に毒の雲が残る
    if (w.flags.toxFoam) {
      this.spawnField(run, x, y, { kind: 'gas', r: Math.max(40, R * 0.8), dur: w.dyn.toxDur || 3,
        dps: dmg * 0.5, vuln: 0.1, color: '#8fd94a' });
    }
    // 焼夷弾（mtr_barrage）：着弾した所が燃える。爆風が敵を燃やし（w.s.burn）、地面に火の海が残る
    if (w.flags.incend) {
      this.spawnField(run, x, y, { kind: 'fire', r: R * BAL.cardFx.incendR, dur: BAL.cardFx.incendDur,
        dps: dmg * w.s.burn, color: '#ff8a3a' });
    }
    // 弾む泡（bbl_bounce）：割れた泡が、近くの敵の上へもう1回跳ねる
    if (hops > 0) {
      const HR = BAL.cardFx.hopR;
      const near = Grid.query(x, y, HR, _q);
      const far = [], any = [];
      for (const o of near) {
        if (o.dead || Util.dist(x, y, o.x, o.y) > HR) continue;
        any.push(o);
        if (Util.dist(x, y, o.x, o.y) > R * 0.6) far.push(o);     // 同じ所に落ち直さない
      }
      const pool = far.length ? far : any;
      if (pool.length) {
        const t = pool[(Math.random() * pool.length) | 0];
        this.spawnLob(w, run, t.x, t.y, { color: w.def.color, fromX: x, fromY: y,
          onLand: (rr, x2, y2) => this.spotImpact(w, rr, x2, y2, hops - 1, mul * BAL.cardFx.hopMul) });
      }
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
  //   ユニットは**壁の上に建つ**（壁の六角セル・stage.hexBuildable）ので、
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
    const sp = (w.def.sweep || BAL.sweepSpeed) * (w.dyn.sweepMul || 1) * dt;
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
            if (e.upper && this.immune(e, w.def.sys)) continue;     // 無効の相手は狙わない（見えているのに撃たれないのではなく、ほかの敵を撃つ）
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
      // 重い霧：雲が通路に沿ってコアの方へ流れる（壁の上へは出ない）
      if (f.flow) {
        const fc = (f.x / TILE) | 0, fr = (f.y / TILE) | 0;
        if (st.walkable(fc, fr) && st.dist[st.idx(fc, fr)] > 3) {
          const g = st.flowTo(fc, fr);
          if (g) {
            const ga = Util.angle(f.x, f.y, g.x, g.y), sp = BAL.cardFx.fogSpeed * dt;
            const nx = f.x + Math.cos(ga) * sp, ny = f.y + Math.sin(ga) * sp;
            if (st.walkable((nx / TILE) | 0, (ny / TILE) | 0)) { f.x = nx; f.y = ny; }
          }
        }
      }
      f.tick += dt;
      if (f.tick >= BAL.fieldTick) {
        const step = f.tick;
        f.tick = 0;
        const near = Grid.query(f.x, f.y, f.r, _q);
        for (const e of near) {
          if (e.dead) continue;
          if (Util.dist(f.x, f.y, e.x, e.y) > f.r + e.r) continue;
          if (this.inShield(run, e)) continue;   // バリアの中は状態異常も受けない
          if (e.upper && this.immune(e, this.sysOf(f.by))) { e.immT = 0.2; continue; }   // 上位の敵の無効（ガス・泡の場は、その場の効果を丸ごと受けつけない）
          if (f.vuln) { e.fvuln = f.vuln; e.fvulnT = 0.4; }
          if (f.armorDown) { e.armorDown = (e.armorT > 0) ? Math.max(e.armorDown, f.armorDown) : f.armorDown; e.armorT = 0.6; }   // 腐蝕の雲
          // 場の減速にも遺物の軸を乗せる。**ここは damage() を通らないので、
          // 書き忘れると「毒の雲だけ遺物が効かない」ことになる**
          if (f.slow && !e.noStatus && (!e.boss || e.bk === 'rootkit')) {
            const ck = this.ccK(e);
            e.slow = Math.max(e.slow, Math.min(BAL.slowMax, (f.slow + run.st.slowAdd) * ck));
            e.slowT = Math.max(e.slowT, (0.5 + run.st.chillDur) * ck);
          }
          // **毒は敵に乗る。**（ユーザー要望6・8・2026-09-22）
          //   > 「毒、氷も同じく（燃えてるエフェクト）」
          //   > 「各武器にそういったエフェクトに合う効果や**スリップダメージ**が
          //   >   搭載されてなければつけて」
          //   前は**雲の上にいる間だけ**削れていたので、
          //   「毒を受けた敵」という状態が存在せず、絵を足しようがなかった。
          //   炎上（`burnT`）と同じ形にして、雲を出たあとも少し続くようにする
          if (f.kind === 'gas' && !e.noStatus) {
            e.poison = Math.max(e.poison || 0, f.dps * BAL.poisonKeep);
            e.poisonBy = f.by;
            e.poisonT = Math.max(e.poisonT || 0, BAL.poisonDur + run.st.burnDur);
          }
          this.damage(run, e, f.dps * step, { color: f.kind === 'gas' ? '#c6ff7a' : (f.kind === 'ink' || f.kind === 'tentwall') ? f.color : '#ffb066', dot: true, by: f.by, src: f.src });
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
      // ラスボスの胴の節：頭の通った跡に並ぶだけ（頭が倒れた・退いたら一緒に消える）
      if (e.seg) {
        const h = e.seg;
        if (h.dead) { e.dead = true; run.enemies.splice(i, 1); run.segN = Math.max(0, (run.segN || 0) - 1); continue; }
        const T = h.trail, ok = e.k < T.length, q = ok ? T[e.k] : T[T.length - 1];
        e.hidden = !ok; e.x = q.x; e.y = q.y; e.hp = h.hp; e.dist = h.dist;
        if (e.hitFlash > 0) e.hitFlash -= dt;
        if (e.shieldT > 0) e.shieldT -= dt;
        continue;
      }
      if (e.shock > 0) e.shock -= dt;
      if (e.chill > 0) e.chill -= dt;
      // 掴み・足止めで止められていた時間を数える（BAL.ccMaxSec で打ち止め）
      if (e.stun > 0 || e.grabT > 0) e.ccUsed = (e.ccUsed || 0) + dt;
      if (e.stun > 0) e.stun -= dt;
      if (e.grabT > 0) e.grabT -= dt;
      if (e.spotT > 0) e.spotT -= dt;
      if (e.tntT > 0) e.tntT -= dt;
      if (e.fvulnT > 0) e.fvulnT -= dt;
      if (e.nukeT > 0) e.nukeT -= dt;
      if (e.armorT > 0) e.armorT -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.shieldT > 0) e.shieldT -= dt;
      if (e.immT > 0) e.immT -= dt;
      if (e.auraT > 0) e.auraT -= dt;
      if (e.upper) this.upperTick(run, e, dt);
      if (e.burnT > 0) {
        e.burnT -= dt;
        // 焼き印（syn_searbind）：触手の印のある敵は炎上ダメージに倍率
        const gb = (run.tntBurn && e.tntT > 0) ? run.tntBurn : 1;
        if (gb > 1) run.tntBoostN = (run.tntBoostN || 0) + 1;
        this.damage(run, e, e.burn * dt * gb, { color: '#ff8a3a', dot: true, by: e.burnBy, burnTick: true, blue: e.burnBlue });
        if (e.dead) continue;
        // 粘着燃料：燃えている敵が、隣の敵へ燃え移る（移った先は世代を1つ減らして、無限に広がらない）
        if (e.sticky > 0) this.spreadFlame(run, e, dt);
      }
      // **毒のスリップダメージ。**（ユーザー要望8・2026-09-22）
      //   雲を出たあとも続く。炎上と同じ形
      if (e.poisonT > 0) { e.poisonT -= dt; this.damage(run, e, (e.poison || 0) * dt, { color: '#c6ff7a', dot: true, by: e.poisonBy }); if (e.dead) continue; }
      // **感電と拘束にもスリップダメージ。**（ユーザー判断 2026-09-23）
      //   > 「凍結にスリップダメージは不要、**感電と拘束につける**、これでいきましょう」
      //   **凍結には付けない。**「時間を奪う軸」として上限を開かない決まりにしてあるため。
      //
      //   **最大HPに対する割合／秒。** 固定値にすると章が進んだ瞬間に意味が消える
      //   （敵のHPは30章で1e14倍になる）。装甲と同じ考え方
      //   **ボスには効かせない。**（2026-09-28）ボスはHPを制限時間内に削り切れるかを問う敵なので、割合で削るとHPが意味を持たない。
      //   倍率×8でも第15章から先のボスは口を出てすぐ倒れ、受けたダメージの 0〜93%（6本）が感電のスリップだった
      if (e.shock > 0 && BAL.shockDps && !e.boss) {
        this.damage(run, e, e.maxHp * BAL.shockDps * dt, { color: '#c9b3ff', dot: true, by: e.shockBy, shockTick: true });
        if (e.dead) continue;
      }
      if (e.stun > 0 && BAL.stunDps && !e.boss) {
        this.damage(run, e, e.maxHp * BAL.stunDps * dt, { color: '#bea0ff', dot: true, by: e.stunBy });
        if (e.dead) continue;
      }
      // （ボスが雑魚を出し続ける形は 2026-09-28 に撤去した。ボスのウェーブは雑魚が出ない・spawnBoss）
      // **再生。燃えている間は止まる**（炎上を積む意味をここで作る）
      if (e.boss) { if (e.bk === 'final') this.finalUpdate(run, e, dt); else this.bossPhaseUpdate(run, e, dt); }
      if (e.dead) continue;
      if (e.regen > 0 && e.burnT <= 0 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);

      const tc = (e.x / TILE) | 0, tr = (e.y / TILE) | 0;
      const inside = st.walkable(tc, tr);
      e.dist = inside ? st.dist[st.idx(tc, tr)] : 1e9;

      // 通行量の記録（どこに溜まるかを、次の準備フェーズで見せるため）
      if (sample && inside) run.traffic[st.idx(tc, tr)]++;

      // **詰まりの検知。**（2026-09-26）レーンに沿って BAL.stuckSec 秒前に進んでいなければ、レーンを捨てて最短経路へ、
      //   少しのあいだ押し合いも受けない（e.ghostT）。
      //   **どう壊れていたか**：レーンは帯の外では自分の帯へ戻ろうとするので、別のレーンと逆向きになるタイルの組がどの章にも数千ある。
      //   細い所で逆向きの2体が正面から当たると、押し合い（Crowd）が前進をちょうど打ち消して、死なず・漏れず止まり続けた
      //   （第35章から先の測定で、ゲーム内30分たってもウェーブが終わらない。湧き口の隣で、満タンのHP・足止めなしの敵が1秒に0〜4px）
      if (e.stun <= 0 && e.grabT <= 0 && inside) {      // ボスも歩くので見る（2026-09-28）
        const Ln = (e.lane !== null && e.lane !== undefined && st.lanes) ? st.lanes[e.lane] : null;
        const prog = (Ln && Ln.dist) ? Ln.dist[st.idx(tc, tr)] : e.dist;
        if (e.best === undefined || prog < e.best) { e.best = prog; e.stuckT = 0; }
        else if ((e.stuckT = (e.stuckT || 0) + dt) > BAL.stuckSec) {
          e.lane = null; e.best = undefined; e.stuckT = 0; e.ghostT = BAL.stuckGhostSec;
        }
      }
      if (e.ghostT > 0) e.ghostT -= dt;

      // 道の外に押し出された敵は、いちばん近いコアへ
      const goal = inside ? st.flowTo(tc, tr, e.lane) : (st.nearCore ? st.center(st.nearCore(tc, tr).c, st.nearCore(tc, tr).r) : { x: tw.x, y: tw.y });
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
            if (st.step((e.x / TILE) | 0, (e.y / TILE) | 0, (nx / TILE) | 0, (ny / TILE) | 0)) { e.x = nx; e.y = ny; }
          }
        } else {
          // **地形の仕掛け。**減速マスは遅く、加速マスは速くなる（src/mapgen.js の tagZones）。
          //   数値ではなく**地形で難易度を作る**ための口
          let zm = 1;
          // **いま加速／減速マスにいるかを、描画に渡す。**（ユーザー要望4・2026-09-22）
          //   > 「加速する時に敵が加速してそうな軽いエフェクト、減速も同様に」
          //   これまで速度だけ変えていて、敵の側には何も出ていなかった
          e.zfx = 0;
          if (inside && st.zone) {
            const z = st.zoneAt(tc, tr);
            if (z === 1) { zm = BAL.zoneMud; e.zfx = -1; }
            else if (z === 2) { zm = BAL.zoneSlope; e.zfx = 1; }
          }
          const slowMul = Math.max(BAL.enemySlowFloor, 1 - e.slow);
          e.x += Math.cos(a) * e.spd * slowMul * zm * dt;
          e.y += Math.sin(a) * e.spd * slowMul * zm * dt;
          e.ang = a;      // 描画で向きを出すため。挙動には使わない
          if (e.trail) this.wormFollow(e);
        }
      }

      // コアに触れた敵は、ライフを1つ持っていって消える（＝漏れ）。**コアが2つ以上なら、どれに触れても同じライフ**
      if ((run.towers || [tw]).some(T => Util.dist(e.x, e.y, T.x, T.y) <= T.r + e.r)) {
        // **ボスがコアに着いたら、その場で負け**（残りのライフを全部持っていく・2026-09-28 ユーザー「倒せなかった場合強制的に敗北」）
        const cost = e.boss ? Math.max(run.lives, BAL.leakLives) : e.upper ? Math.max(BAL.leakLives, Math.round(e.k * BAL.ascUpperLeakK)) : BAL.leakLives;
        run.lives -= cost;
        run.leaked++;
        run.livesLost += cost;
        Snd.leak();
        // 何に抜けられたか。死因を「どの敵に負けたか」まで残す
        const tn = e.tname || 'grunt';
        run.leakBy[tn] = (run.leakBy[tn] || 0) + 1;
        // 経路全体を塗るが、コアに近い区間ほど濃くする。
        // 「どこで止め損ねたか」が知りたいので、手前ほど強調しても意味が薄い
        const route = (e.lane !== null && e.lane !== undefined && st.lanes && st.lanes[e.lane]) ? st.lanes[e.lane].route : st.routes[e.si];
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

    if (run.lives <= 0) { run.lives = 0; this.finalLossCoin(run); return 'dead'; }

    // --- ユニット ---
    for (const w of run.units) {
      if (w.flags.heat && !w.target) w.dyn.heat = Math.max(0, w.dyn.heat - dt * BAL.heatCool);   // 冷えるのは、線に的が無いあいだだけ
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

      if (w.broken) continue;                      // ラスボスに壊された武器（その出撃の間は動かない）
      if (w.muzzle > 0) w.muzzle -= dt;
      this.aimUpdate(w, run, dt);
      w.target = this.findTarget(w, run);

      // **撃ちっぱなし。** 敵がいるかどうかで撃つ／撃たないを武器に決めさせない。
      // 首を振り続ける扇風機のガトリング、というのがこの武器たちの姿
      // 加熱には**上限がある。** 撃ちっぱなしにしたので、青天井だと
      // 「撃っているだけで速くなり続ける」になってしまう（heatCap で頭打ち）
      if (w.jamT > 0) { w.jamT -= dt; continue; }   // ボスの沈黙：撃てない
      const rate = w.s.rate *
        (w.flags.heat ? (1 + w.dyn.heat * Math.min(BAL.heatCap, w.dyn.heatMax || 0)) : 1);
      w.cd -= dt;
      if (w.cd <= 0) {
        w.cd = 1 / Math.max(0.02, rate);
        w.muzzle = 0.07;
        w.shots++;
        w.group = Game.groupingOf(w);  // 集弾率（常に1）。fire から参照する
        w.n = this.shotCount(w);       // この発射で撃つ弾数。fire から参照する
        this._by = w.id;               // この発射で起きたダメージは、この武器のもの（damage の記録）
        this._src = w;                 // その1基（装甲貫通・青い炎が読む）
        w.def.fire(w, run);
        this._by = null; this._src = null;
      }
    }

    // --- 弾 ---
    for (let i = run.bullets.length - 1; i >= 0; i--) {
      const b = run.bullets[i];
      this._by = b.wid || null;
      this._src = b.src || null;
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
        // **壁に当たったら細かく砕ける。**（ユーザー要望9・2026-09-22）
        //   > 「壁に向かって銃弾が当たると**細かく砕けてる**ようなエフェクト」
        //   前は光の点を1つ置くだけだった。**入射の逆向きへ破片を跳ね返す**。
        //   壁の色（灰）を混ぜると「壁が削れた」に見える
        if (run.fx.length < 150) {
          this.fx(run, { type: 'spark', x: b.x, y: b.y, color: b.color, life: 0.12 });
          this.fx(run, {
            type: 'splat', x: b.x, y: b.y, color: '#9aa6bd', life: 0.3,
            a: Math.atan2(py - b.y, px - b.x), n: 4, sp: 26,
          });
        }
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
        if (e.upper && this.immune(e, this.sysOf(b.wid))) { e.immT = 0.2; continue; }   // 無効の相手には当たらず、すり抜ける
        const reach = e.r + b.r;
        if (swept) { if (Util.segDist2(px, py, b.x, b.y, e.x, e.y) > reach * reach) continue; }
        else if (Util.dist(b.x, b.y, e.x, e.y) > reach) continue;

        // ワーム：残りの貫通の数だけ節をまとめて抜く（貫通を使い切る）
        let wormHits = 1;
        if (e.bk === 'worm' && b.pierce > 0) { wormHits = 1 + Math.min(b.pierce, BAL.wormSegs - 1); b.pierce -= wormHits - 1; }
        this.damage(run, e, b.dmg, {
          hits: wormHits,
          crit: b.crit, critMul: b.critMul, exec: b.exec, shock: b.shock,
          slow: b.slow, slowDur: b.slowDur, stun: b.stun,
          burn: b.burn, burnDur: b.burnDur, color: b.color,
          // 凍て弾幕（syn_frostgat）：凍っている敵に当たった弾は必ず会心
          forceCrit: !!(b.src && b.src.flags.frostCrit && e.chill > 0),
        });

        if (b.tracer > 0 && !e.dead) {
          e.armorDown = (e.armorT > 0) ? Math.max(e.armorDown, b.tracer) : b.tracer;
          e.armorT = BAL.cardFx.tracerDur;
        }
        if (b.src && b.src.flags.resonance && b.wid === 'gatling')
          run.resonance = Math.min(run.resonanceMax || 4.0, run.resonance + (run.resonanceStep || 0.006));
        // 曳光指示：スナイパーが撃ち抜いた敵に印が残る。
        // **ミサイルの狙いは変えない。**印の付いた敵に落ちたときだけ効く
        if (b.src && b.src.flags.spot && b.wid === 'sniper' && !e.dead) e.spotT = 3;
        // 帯電弾（ガトリング）・雷刃（手裏剣）。旗を立てるのは連携カードだけなので武器では縛らない
        if (b.src && b.src.flags.charged) {
          this.chainLightning(b.src, run, e, b.src.dyn.chargedChain || 2, b.dmg * 0.55);
        }
        if (b.src && b.src.flags.staticFoam && b.wid === 'bubble' && !e.dead && !this.inShield(run, e)) {
          if (!e.noStatus) e.shock = Math.max(e.shock, b.src.s.shockDur);
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
            // 影分身：当たった所から、威力を落とした分身がもう1枚、同じ向きに跳ぶ（分身は分身を呼ばない）
            if (b.src && b.src.flags.shadow && !b.child && run.bullets.length < 1200) {
              const c = Object.assign({}, b, { dmg: b.dmg * BAL.cardFx.shadowMul, child: true, hit: new Set(b.hit), color: '#8fa0b8' });
              run.bullets.push(c);
            }
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
    this._by = null; this._src = null;

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
        dmg: b.dmg * (b.src.dyn.clusterDmg || BAL.cardFx.clusterDmg), r: 4, pierce: 0, bounce: 0, hit: null,
        splash: b.splash * 0.55, splashMul: b.splashMul,
        homing: 2.4, crit: 0, critMul: 2, exec: 0, shock: 0,
        slow: 0, slowDur: 0, stun: 0, burn: 0, burnDur: 0,
        color: '#ffb066', life: 1.4, src: b.src, wid: b.wid,
        range: 420, ox: b.x, oy: b.y, target: null, child: true,
      });
    }
  },
};
