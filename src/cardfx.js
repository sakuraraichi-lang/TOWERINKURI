// ---------------------------------------------------------------
// cardfx.js : カードの見た目と、パックを開ける演出
//
//   **ユーザー 2026-09-24**
//   > 「カードの演出そのものを作り直しませんか？カードをちゃんとデザインして、カードパックを出して、
//   >   ヴァンパイアサバイバーの宝箱のようにドーパミンがガッとでる、射倖心あふれる演出が良いです」
//   > 「今のはあまりに『情報』だけが排出されています」
//
//   流れ：
//     ① パックが浮かぶ。タップすると揺れ、**中身の一番良いレア度の色の光**が漏れる（期待を先に見せる）
//     ② パックが裂けて光が弾ける
//     ③ カードが伏せて配られる。裏面はロゴで、**レア度の色が裏から透ける**。タップで1枚ずつ捲る。
//        レア以上は捲る前に裏が震えて色が上がる（昇格）。レジェンドは画面が金色に弾ける
//     ④ 凸が上がったら星が灯り、倍率が上がる。4凸は「覚醒」
//   開けているあいだは音楽が鳴り、1枚ごとに高くなる
// ---------------------------------------------------------------
'use strict';

// パックの絵（2026-09-29・ComfyUI で作った1枚を元に、光る線の色だけ塗り替えて5種・300×430・透明な背景。tools/packart.js）
//   ユーザー「パック5種について いいですけどせめてパックの大きさは整えてください」→ 形も大きさも5種で同じ
const PACK_IMG = { basic: 'assets/packs/basic.png', arms: 'assets/packs/arms.png', chem: 'assets/packs/chem.png', relic: 'assets/packs/relic.png', syn: 'assets/packs/syn.png' };

const CardFX = {
  KIND_NAME: { weapon: '武器', mod: '武器強化', generic: '汎用', synergy: '連携', perm: '常駐', key: '鍵' },
  RAR_EN: { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' },

  // カードの絵の色。武器ものは武器の色、それ以外は種類ごと
  artColor(c) {
    if (c.weapon && WEAPONS[c.weapon]) return WEAPONS[c.weapon].color;
    if (c.kind === 'synergy' && c.requires && WEAPONS[c.requires[0]]) return WEAPONS[c.requires[0]].color;
    if (c.kind === 'perm') return '#ffb43c';
    if (c.kind === 'generic') return '#9fe0c0';
    return '#9fb2c4';
  },

  // 凸の星。1〜4凸は★を灯し、4凸からは「覚醒」
  starsHtml(t) {
    let s = '';
    for (let i = 1; i <= 4; i++) s += '<i class="' + (i <= t ? 'on' : '') + '">★</i>';
    if (t >= BAL.totuBigFrom) s += '<b class="cf-awk">覚醒' + (t > BAL.totuBigFrom ? '+' + (t - BAL.totuBigFrom) : '') + '</b>';
    return s;
  },

  // カードの絵：ComfyUI で作ったアイコン（assets/icons・2026-09-29）。
  //   ユーザー「それぞれ違う必要はありません、汎用アイコンとか武器アイコンを貼り付ければいい」「漫画っぽいやつにしましょう」
  //   武器と武器強化はその武器、連携は関わる2つの武器を並べる（条件が一目で分かる）、常駐はフロッピー、ほかは光るチップ
  artHtml(c) {
    const img = (id) => '<img class="cimg" src="assets/icons/' + id + '.png" alt="" draggable="false">';
    if (c.kind === 'perm') return img('perm');
    if (c.kind === 'synergy') { const r = (c.requires || []).filter(w => WEAPONS[w]); return r.length ? r.map(img).join('') : img('synergy'); }
    if (c.weapon && WEAPONS[c.weapon]) return img(c.weapon);
    return img('generic');
  },

  // ---- カードの表 ----
  //   o.count … その時点の枚数（凸を出す） ／ o.isNew … 初めて ／ o.dim … 未所持
  //   o.gain  … まとめて開けたときに増えた枚数 ／ o.tap … タップで説明の全文
  face(c, o) {
    o = o || {};
    const R = BAL.rarity[c.rarity];
    const t = (o.count && !c.noRank) ? Game.totuOf(o.count) : 0;
    const el = Util.el('div', 'cf r-' + c.rarity + ' k-' + c.kind + (t >= BAL.totuBigFrom ? ' awake' : '') +
      (o.dim ? ' dim' : ''));
    if (o.tap) el.addEventListener('click', () => el.classList.toggle('full'));
    el.style.setProperty('--rc', R.color);
    el.style.setProperty('--ac', this.artColor(c));
    el.innerHTML =
      '<div class="cf-frame">' +
        '<div class="cf-top"><span class="cf-name">' + c.name + '</span></div>' +
        '<div class="cf-art"><div class="cf-icon' + ((c.kind === 'synergy' && (c.requires || []).length > 1) ? ' dual' : '') + '">' + this.artHtml(c) + '</div>' +
          '<div class="cf-kind">' + (this.KIND_NAME[c.kind] || '') + '</div>' +
          (o.isNew ? '<div class="cf-new">NEW</div>' : '') + '</div>' +
        '<div class="cf-text">' + UI.shortDesc(c) + '</div>' +
        '<div class="cf-bottom"><span class="cf-stars">' + (c.noRank ? '' : this.starsHtml(t)) + '</span>' +
          (o.noCount ? '' : o.gain ? '<span class="cf-count gain">+' + o.gain + '</span>'
            : o.count ? '<span class="cf-count">×' + o.count + '</span>' : o.dim ? '<span class="cf-count">未所持</span>' : '') + '</div>' +
      '</div>' +
      '<div class="cf-holo"></div>' +
      '<div class="cf-rar">' + this.RAR_EN[c.rarity] + '</div>';
    return el;
  },

  // **ゲームのロゴ**（ユーザー 2026-09-24 に見本画像）。外周の輪と4方向の突起・内側の輪・
  //   矢じりの付いた8本の光条・中心の歯車。画像を貼らずに描き起こす（どの大きさでも滲まない）
  logoSvg() {
    const rot = (pts, a) => pts.map(([x, y]) => {
      const c = Math.cos(a), s = Math.sin(a);
      return (x * c - y * s).toFixed(2) + ',' + (x * s + y * c).toFixed(2);
    }).join(' ');
    let spikes = '', rays = '';
    for (let i = 0; i < 4; i++) {                     // 外周の4方向の突起
      spikes += '<polygon points="' + rot([[0, -50], [5.5, -38], [0, -42], [-5.5, -38]], i * Math.PI / 2) + '"/>';
    }
    for (let i = 0; i < 8; i++) {                     // 8本の光条（縦横は長く、斜めは短い）
      const a = i * Math.PI / 4, L = i % 2 ? 23 : 29;
      rays += '<polygon points="' + rot([[0, -L - 3], [4.2, -L + 5], [1.3, -L + 3.6], [1.3, -10], [-1.3, -10], [-1.3, -L + 3.6], [-4.2, -L + 5]], a) + '"/>';
    }
    return '<svg class="gamelogo" viewBox="-52 -52 104 104" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="lgGold" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#fff4c2"/><stop offset=".4" stop-color="#f2c34a"/>' +
        '<stop offset=".7" stop-color="#b47212"/><stop offset="1" stop-color="#ffe08a"/></linearGradient></defs>' +
      '<g fill="url(#lgGold)" stroke="#5a3606" stroke-width=".9" stroke-linejoin="round">' + spikes + rays + '</g>' +
      '<g fill="none" stroke-linecap="round">' +
        '<circle r="40" stroke="#5a3606" stroke-width="7.6"/><circle r="40" stroke="url(#lgGold)" stroke-width="5.6"/>' +
        '<circle r="40" stroke="#fff4c2" stroke-width=".8" opacity=".7"/>' +
        '<circle r="31" stroke="#5a3606" stroke-width="3.2"/><circle r="31" stroke="url(#lgGold)" stroke-width="1.8"/>' +
        '<circle r="13" stroke="#5a3606" stroke-width="3.4"/><circle r="13" stroke="url(#lgGold)" stroke-width="2"/>' +
        '<circle r="7.6" stroke="url(#lgGold)" stroke-width="3" stroke-dasharray="2.2 1.5"/>' +
      '</g>' +
      '<circle r="5.6" fill="url(#lgGold)" stroke="#5a3606" stroke-width=".8"/><circle r="2.6" fill="#241604"/>' +
      '</svg>';
  },

  // カードの裏面。**レア度の色が裏から透ける**（ユーザー 2026-09-24「裏面からレア度の色が透けてると良い」）
  back(rarity) {
    const el = Util.el('div', 'cf cf-back br-' + (rarity || 'common'));
    el.style.setProperty('--rc', BAL.rarity[rarity || 'common'].color);
    el.innerHTML = '<div class="cf-backin"><div class="cf-backglow"></div>' + this.logoSvg() + '</div>';
    return el;
  },

  // 一覧に並べる小さなパック（開封画面の金属の箱の縮小版）
  miniPack(pk) {
    return '<div class="mpack' + (PACK_IMG[pk.id] ? ' img' : '') + '" style="--pc:' + pk.color + (PACK_IMG[pk.id] ? ';--pimg:url(' + PACK_IMG[pk.id] + ')' : '') + '"><i class="mpack-strip"></i>' +
      '<i class="mpack-gear">' + Icons.get('gear') + '</i><i class="mpack-haz"></i></div>';
  },

  // 粒子。**数は抑える**（スマホで重くしない）
  particles(host, x, y, color, n, coin) {
    for (let i = 0; i < n; i++) {
      const p = Util.el('i', 'pfx-p' + (coin ? ' coin' : ''));
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 160;
      p.style.left = x + 'px'; p.style.top = y + 'px';
      p.style.setProperty('--dx', (Math.cos(a) * d).toFixed(0) + 'px');
      p.style.setProperty('--dy', (Math.sin(a) * d - 40).toFixed(0) + 'px');
      p.style.setProperty('--pc', color);
      p.style.animationDelay = (Math.random() * 0.08).toFixed(2) + 's';
      if (coin) p.innerHTML = Icons.coin();
      host.appendChild(p);
      setTimeout(() => p.remove(), 1300);
    }
  },

  // ---- パックの画面（1個でもまとめてでも同じ） ----
  //   金属の箱。上の帯（つまみ付き）を剥くと、口から光があふれてカードが飛び出す。
  //   glows … 中身のレア度の光（中身が良いほど溜めの光が強い） ／ sub … 箱の下の小さな字
  _packOverlay(pk, glows, sub, cls) {
    const best = Math.max.apply(null, glows);
    const bestRar = BAL.rarityOrder[best] || 'common';
    const ov = Util.el('div', 'pfx best-' + bestRar + (cls ? ' ' + cls : ''));
    ov.style.setProperty('--pc', pk.color);
    // 最初はパックの色。**中身のレア度の色は、タップしてから段階的に上がる**（錠の輪が最初から見えているので、ここで中身の色を入れると開ける前に分かる）
    ov.style.setProperty('--best', pk.color);
    if (PACK_IMG[pk.id]) { ov.classList.add('img'); ov.style.setProperty('--pimg', 'url(' + PACK_IMG[pk.id] + ')'); }
    // **開封は「システムの中でデータの包みを復号する」場面**（2026-09-29 ユーザー「色のついた集中線がクルクルしてるだけで、
    //   レジェンダリー以外チープすぎます、ここのアニメーションを世界観に合わせながら作り直しましょう」）
    //   ハニカムの格子とデータの雨の空間に、パックを六角の錠の輪が3重に囲む。上に「DATA PACKAGE」、タップで復号の数字が駆け上がる
    const ring = (r, cls) => { let p = ''; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; p += (i ? ' ' : '') + (Math.cos(a) * r).toFixed(1) + ',' + (Math.sin(a) * r).toFixed(1); } return '<polygon class="' + cls + '" points="' + p + '"/>'; };
    ov.innerHTML =
      '<div class="pfx-sys"><i class="pfx-grid"></i><i class="pfx-data"></i>' +
        '<svg class="pfx-rings" viewBox="-100 -100 200 200">' + ring(64, 'ra') + ring(78, 'rb') + ring(92, 'rc') + '</svg></div>' +
      '<div class="pfx-hud"><div class="pfx-hud-t"><b>DATA PACKAGE</b><span>' + pk.name + '</span></div>' +
        '<div class="pfx-hud-c"><em class="pfx-lbl">SEALED</em><b class="pfx-pct">000</b><i>%</i></div>' +
        '<div class="pfx-sig">SIGNAL ▸ ----</div><div class="pfx-code"></div></div>' +
      '<i class="pfx-shock"></i>' +
      '<div class="pfx-pack"><div class="pfx-mouth"></div><div class="pfx-strip"></div><div class="pfx-seam"></div>' +
        '<div class="pfx-body"><i class="pfx-rv a"></i><i class="pfx-rv b"></i><i class="pfx-rv c"></i><i class="pfx-rv d"></i>' +
        '<div class="pfx-emb"><div class="pfx-gear">' + Icons.get('gear') + '</div><div class="pfx-logo">' + this.logoSvg() + '</div></div>' +
        '<div class="pfx-name">' + pk.name + '</div>' +
        '<div class="pfx-sub">' + sub + '</div><i class="pfx-haz"></i></div></div>' +
      '<div class="pfx-cards"></div>' +
      '<div class="pfx-hint">タップして開ける</div>' +
      '<div class="pfx-fx"></div>';
    document.body.appendChild(ov);
    Snd.resume && Snd.resume();
    return {
      ov, best, bestRar,
      pack: ov.querySelector('.pfx-pack'),
      hint: ov.querySelector('.pfx-hint'),
      row: ov.querySelector('.pfx-cards'),
      fx: ov.querySelector('.pfx-fx'),
    };
  },

  // ① 光を溜めてから、上の帯を剥く。剥き終わってカードを出す番になったら onOut を呼ぶ。
  //   前は「揺れて、膨らみながら消える」だった。ユーザー「震えてフェードアウトしていくのに違和感」
  _tear(P, onOut) {
    const { ov, fx, pack, best, bestRar } = P;
    P.hint.textContent = '';
    ov.classList.add('charge');
    Snd.packShake(best);
    // **昇格演出。**光の色が コモン→レア→エピック→レジェンド と、中身の最高レア度まで段階的に上がる。
    //   1段ごとに音が上がり、粒が弾ける。レジェンドまで上がると画面が揺れる
    const steps0 = BAL.rarityOrder.slice(0, best + 1);
    const stepMs = best >= 3 ? 330 : 300;
    // **復号の表示**：数字が 000→100% と駆け上がり、16進の記号の行が流れ、レア度が上がるたびに SIGNAL が書き換わる
    const chargeMs = steps0.length * stepMs + 250;
    const legMs = best >= 3 ? this.LEG_MS : 0;
    const pctEl = ov.querySelector('.pfx-pct'), lblEl = ov.querySelector('.pfx-lbl'), sigEl = ov.querySelector('.pfx-sig'), codeEl = ov.querySelector('.pfx-code');
    if (lblEl) lblEl.textContent = 'DECRYPTING';
    const t0 = performance.now();
    const hex = () => ((Math.random() * 65536) | 0).toString(16).toUpperCase().padStart(4, '0');
    const tick = () => {
      if (!ov.isConnected) return;
      const k = Math.min(1, (performance.now() - t0) / chargeMs);
      if (pctEl) pctEl.textContent = String(Math.floor(100 * (1 - Math.pow(1 - k, 1.6)))).padStart(3, '0');
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const codeTimer = setInterval(() => {
      if (!codeEl || !ov.isConnected) { clearInterval(codeTimer); return; }
      const ln = Util.el('div', '', '0x' + hex() + ' ' + hex() + ' ' + hex() + '  ' + ['AUTH', 'SYNC', 'KEY', 'SEG', 'ACK'][(Math.random() * 5) | 0]);
      codeEl.appendChild(ln);
      while (codeEl.children.length > 6) codeEl.firstChild.remove();
    }, 70);
    setTimeout(() => clearInterval(codeTimer), chargeMs + 200);
    steps0.forEach((r, i) => setTimeout(() => { if (sigEl) { sigEl.textContent = 'SIGNAL ▸ ' + this.RAR_EN[r]; sigEl.style.color = BAL.rarity[r].color; } }, i * stepMs));
    setTimeout(() => { if (lblEl) lblEl.textContent = 'ACCESS GRANTED'; if (pctEl) pctEl.textContent = '100'; ov.classList.add('granted'); }, chargeMs + legMs);
    steps0.forEach((r, i) => setTimeout(() => {
      ov.style.setProperty('--best', BAL.rarity[r].color);
      ov.classList.remove('lv0', 'lv1', 'lv2', 'lv3'); ov.classList.add('lv' + i);
      if (i > 0) {
        Snd.promote(i);
        this.particles(fx, window.innerWidth / 2, window.innerHeight / 2, BAL.rarity[r].color, 10 + i * 6, false);
        if (i >= 3) this.bigShake();
      }
    }, i * stepMs));
    // **レジェンダリーだけ、表示の法則が一瞬破られる。**（企画書 §20「放送停止画面 → グリッチ → 虹色」・2026-09-28）
    //   一番豪華な演出ではなく「いつもの画面が一瞬だけ別のものに乗っ取られる」。長さは約1.4秒・レジェンダリーのときだけ
    const legend = best >= 3;
    if (legend) setTimeout(() => this.legendBreak(ov), steps0.length * stepMs + 120);
    setTimeout(() => {
      ov.classList.remove('charge');
      ov.classList.add('peel');
      Snd.packTear(best);
      // 裂け目に沿って火花：帯の下端を左から右へ
      const pr = pack.getBoundingClientRect();
      const sy = pr.top + pr.height * 0.12;
      for (let i = 0; i < 5; i++) setTimeout(() =>
        this.particles(fx, pr.left + pr.width * (i + 0.5) / 5, sy, BAL.rarity[bestRar].color, 4 + best * 2, false), i * 55);
      if (best >= 3) setTimeout(() => this.particles(fx, pr.left + pr.width / 2, sy, '#ffe08a', 16, false), 300);
      Snd.openLoop(true);
      // 口を下へずらしてから、カードを飛び出させる
      setTimeout(() => ov.classList.add('lower'), 520);
      setTimeout(onOut, 900);
    }, chargeMs + legMs);
  },

  // **レジェンドの割り込み。**放送停止（カラーバー）→ グリッチ → 深層信号の警告。ov の上に全面で重ね、終わったら消す
  //   2026-09-29 ユーザー「レジェンドでも虹の集中線をやめて、レジェンドの演出もスクラップアンドビルドを…
  //   レジェンドで良いのはテレビの放送停止画面の演出の部分のみです」→ 放送停止だけ残し、その後の虹をやめた。
  //   いまは：真っ暗 → 中心から金の六角が外へ点いていく（ハニカムの奥が露出する）→ WARNING の板 → 錠の輪が一気に締まる
  LEG_MS: 2000,
  legendBreak(ov) {
    const el = Util.el('div', 'lgb');
    el.innerHTML = '<div class="lgb-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="lgb-low"><i></i><i></i><i></i><i></i></div>' +
      '<div class="lgb-msg"><b>PLEASE STAND BY</b><span>しばらくお待ちください</span></div>' +
      '<div class="lgb-ov"><i class="lgb-hex"></i><i class="lgb-scan"></i>' +
        '<div class="lgb-warn"><em>WARNING</em><b>LEGENDARY SIGNAL</b><span>深層信号を検出 ─ 封印を解除します</span></div></div>';
    ov.appendChild(el);
    try { Snd.tone({ type: 'sine', f0: 1000, f1: 1000, dur: 0.55, vol: 0.07 }); } catch (e) {}   // 放送休止の「ピー」
    setTimeout(() => {
      el.classList.add('glitch');
      try { Snd.noise({ dur: 0.38, vol: 0.12, f: 2400, q: 0.6 }); } catch (e) {}
    }, 560);
    // 映像が切れて真っ暗 → 金の六角が中心から外へ点く。場面全体も金に変わる
    setTimeout(() => {
      el.classList.remove('glitch'); el.classList.add('override');
      ov.classList.add('legend');
      this.bigShake();
      try { Snd.tone({ type: 'sawtooth', f0: 220, f1: 55, dur: 0.7, vol: 0.09 }); } catch (e) {}
    }, 960);
    // 錠の輪が一気に締まる（ガチッ）
    setTimeout(() => {
      ov.classList.add('lock');
      try { Snd.noise({ dur: 0.09, vol: 0.16, f: 900, q: 1.2 }); Snd.tone({ type: 'square', f0: 140, f1: 90, dur: 0.12, vol: 0.06 }); } catch (e) {}
    }, 1560);
    setTimeout(() => el.classList.add('out'), 1760);
    setTimeout(() => el.remove(), this.LEG_MS);
  },

  // 六角の衝撃波（カードが表になった瞬間など）。x, y は画面の座標
  //   big が true なら大きく3重、'sm' なら小さく（結果画面の獲得物など）
  hexShock(host, x, y, color, big) {
    const sm = big === 'sm'; big = big === true;
    for (let k = 0; k < (big ? 3 : 1); k++) {
      const h = Util.el('i', 'pfx-hexshock' + (big ? ' big' : sm ? ' sm' : ''));
      h.style.left = x + 'px'; h.style.top = y + 'px';
      h.style.setProperty('--hc', color);
      h.style.animationDelay = (k * 0.12).toFixed(2) + 's';
      host.appendChild(h);
      setTimeout(() => h.remove(), 1300);
    }
  },

  bigShake() {
    document.body.classList.remove('bigshake'); void document.body.offsetWidth; document.body.classList.add('bigshake');
    clearTimeout(this._bsT); this._bsT = setTimeout(() => document.body.classList.remove('bigshake'), 600);   // 揺れ（.5秒）が終わったらクラスも片付ける
  },

  // 伏せたカード1枚（裏と表の2面）。**裏面はロゴで、レア度の色が裏から透ける**
  _slot(c) {
    const slot = Util.el('div', 'pfx-slot pre r-' + c.rarity);
    slot.style.setProperty('--rc', BAL.rarity[c.rarity].color);
    const flip = Util.el('div', 'pfx-flip');
    const inner = Util.el('div', 'pfx-inner');
    const backF = Util.el('div', 'pfx-side pfx-backside');
    backF.appendChild(this.back(c.rarity));
    const front = Util.el('div', 'pfx-side pfx-frontside');
    inner.appendChild(backF); inner.appendChild(front);
    flip.appendChild(inner); slot.appendChild(flip);
    return { slot, inner, front, done: false };
  },

  // **口から飛び出して、並びの位置へ。**並べ終えた位置から口までの差を出して、そこから飛ばす。
  //   出し切ったら、空の箱は下へ落ちる（消さない）。gap … 1枚ごとの間隔（ミリ秒）
  _flyOut(P, slots, rars, gap) {
    const pr = P.pack.getBoundingClientRect();
    const mx = pr.left + pr.width / 2, my = pr.top + pr.height * 0.14;
    slots.forEach((s, idx) => {
      const r = s.slot.getBoundingClientRect();
      s.slot.style.setProperty('--fx', (mx - (r.left + r.width / 2)).toFixed(0) + 'px');
      s.slot.style.setProperty('--fy', (my - (r.top + r.height / 2)).toFixed(0) + 'px');
      s.slot.style.setProperty('--fr', ((idx - (slots.length - 1) / 2) * -14 / Math.max(1, slots.length / 3)).toFixed(0) + 'deg');
      s.slot.style.animationDelay = (idx * gap / 1000).toFixed(2) + 's';
      s.slot.classList.remove('pre');
      s.slot.classList.add('fly');
      // 音と粒は間引く（まとめて開けたとき何十枚も鳴らさない）
      if (idx < 8 || idx % 4 === 0) setTimeout(() => {
        Snd.deal(idx % 8);
        this.particles(P.fx, mx, my, BAL.rarity[rars[idx]].color, 6, false);
      }, idx * gap);
    });
    setTimeout(() => P.ov.classList.add('away'), slots.length * gap + 450);
  },

  // 受け取るボタン
  _finish(P, onDone) {
    Snd.openLoop(false);
    Snd.fanfare(P.best);
    const btn = Util.el('button', 'pfx-done', '受け取る');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      P.ov.classList.add('out');
      setTimeout(() => { P.ov.remove(); onDone && onDone(); }, 260);
    });
    P.ov.appendChild(btn);
    P.hint.textContent = 'カードをタップすると全文';
  },

  // 表が見えた瞬間の光（レジェンドは金色に弾けて帯とコインの雨、エピックは紫の帯）
  _land(P, slot, c, g, i) {
    const r = slot.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    this.particles(P.fx, cx, cy, BAL.rarity[c.rarity].color, 8 + g * 8, false);
    Snd.land(g, i);
    slot.classList.add('landed');
    if (g >= 3) {
      P.ov.classList.remove('dim'); void P.ov.offsetWidth; P.ov.classList.add('dim');
      this.hexShock(P.fx, cx, cy, '#ffc24a', true);
      this.particles(P.fx, cx, cy, '#ffe08a', 24, false);
      this.banner(P.ov, 'LEGENDARY', c.name, '#ffb020', 'leg');
    } else if (g >= 2) {
      this.hexShock(P.fx, cx, cy, '#c26bff', false);
      this.banner(P.ov, 'EPIC', c.name, '#c26bff');
    }
  },

  // ---- パックを1個開ける ----
  //   pk … PACKS の1つ ／ ids … 中身 ／ steps … 1枚ごとの {n0, n1}（めくる前後の枚数）
  open(pk, ids, steps, isNew, onDone) {
    const glows = ids.map(id => BAL.rarity[CARDS[id].rarity].glow);
    const P = this._packOverlay(pk, glows, ids.length + ' CARDS');
    const { ov, fx, row, hint } = P;
    let phase = 'pack';

    // ② 伏せて配り、1枚ずつ捲る。**ルーレットはやめた**（ユーザー 2026-09-24「カードなので
    //   ルーレットでガチャガチャはせず、裏側から捲るようにしましょう」）
    const slots = [];
    let flipped = 0, busy = false;
    const deal = () => {
      phase = 'cards';
      ids.forEach((id, idx) => {
        const s = this._slot(CARDS[id]);
        row.appendChild(s.slot);
        slots.push(s);
        s.slot.addEventListener('click', (e) => { e.stopPropagation(); open1(idx); });
      });
      this._flyOut(P, slots, ids.map(id => CARDS[id].rarity), 160);
      hint.textContent = 'タップして捲る';
      hint.classList.add('mid');   // カードの列のすぐ下へ（下がってきたパックの紋章に重なって読めなかった・2026-09-26 テストプレイ）
    };
    // 次に捲るのは、まだ伏せてある一番左
    const nextIdx = () => slots.findIndex(s => !s.done);
    const open1 = (idx) => {
      if (busy || idx < 0 || slots[idx].done) return;
      busy = true;
      const s = slots[idx];
      const c = CARDS[ids[idx]];
      const g = glows[idx];
      s.done = true;
      // **溜め**：レア以上は、捲る前に裏が震え、透けている色が コモン→…→そのレア度 と上がる
      const lv = BAL.rarityOrder.slice(0, g + 1);
      const stepMs = g >= 3 ? 360 : 300;
      if (g >= 1) {
        s.slot.classList.add('charging');
        lv.forEach((r, i) => setTimeout(() => {
          s.slot.style.setProperty('--glowc', BAL.rarity[r].color);
          s.slot.classList.remove('gl0', 'gl1', 'gl2', 'gl3'); s.slot.classList.add('gl' + i);
          if (i > 0) Snd.promote(i);
          if (i >= 3) this.bigShake();
        }, i * stepMs));
      }
      const wait0 = g >= 1 ? lv.length * stepMs + 120 : 0;
      setTimeout(() => {
        s.slot.classList.remove('charging');
        const st = steps[idx];
        const el = this.face(c, { count: st.n1, isNew: isNew[idx] });
        s.front.appendChild(el);
        s.slot.classList.add('flipped');
        Snd.flip(g);
        // 表が見えた瞬間（回転の半ばを過ぎたところ）
        setTimeout(() => {
          this._land(P, s.slot, c, g, idx);
          if (c.kind === 'weapon' && isNew[idx]) UI.toastMsg('新しい武器 ' + c.name, '#ffb43c', 'weapon');
          const t0 = Game.totuOf(st.n0), t1 = Game.totuOf(st.n1);
          let wait = g >= 3 ? 1100 : g >= 2 ? 700 : 250;
          if (t1 > t0 && !c.noRank) {
            wait += 600;
            setTimeout(() => this.totuUp(el, ov, fx, c, t0, t1), 250);
            if (t0 < BAL.totuBigFrom && t1 >= BAL.totuBigFrom) wait += this.AWK_MS - 250;
          }
          setTimeout(() => {
            busy = false;
            flipped++;
            if (flipped >= slots.length) { phase = 'done'; this._finish(P, onDone); }
          }, wait);
        }, 260);
      }, wait0);
    };

    ov.addEventListener('click', (e) => {
      if (phase === 'pack') { phase = 'tearing'; this._tear(P, deal); return; }
      if (phase === 'cards') { open1(nextIdx()); return; }
      if (phase === 'done') {
        const card = e.target.closest('.cf');
        if (card) card.classList.toggle('full');
      }
    });
  },

  // ---- まとめて開ける ----
  //   **前は演出が無く、しかも凸が上がると例外で止まり、パックだけ消えていた。**
  //   （ユーザー 2026-09-25「まとめて開封を押したら演出を挟まずになくなりました。これはよくないですね」）
  //   1個のときと同じ箱を剥き、カードを種類ごとに1枚ずつ伏せて並べ、**低いレア度から順に波のように捲る。**
  //   一番良いものが最後に開く。タップで残りを一気に捲れる。
  //   list … [{ id, gain, isNew, t0, t1 }]（並べる順） ／ packN … 開けた個数
  openBulk(pk, packN, list, onDone) {
    const total = list.reduce((a, e) => a + e.gain, 0);
    const glows = list.map(e => BAL.rarity[CARDS[e.id].rarity].glow);
    const P = this._packOverlay(pk, glows, packN + ' PACKS · ' + total + ' CARDS', 'bulk');
    const { ov, fx, hint } = P;
    let phase = 'pack';
    const grid = Util.el('div', 'pfx-bulk');
    ov.insertBefore(grid, P.row);
    const slots = [];

    // 捲る順：レア度の低い順（同じなら並びの後ろから）。一番良いものを最後に
    const order = list.map((e, i) => i).sort((a, b) => glows[a] - glows[b] || b - a);
    let next = 0, timer = null;
    const flipOne = (i, quiet) => {
      const s = slots[i];
      if (s.done) return;
      s.done = true;
      const e = list[i], c = CARDS[e.id], g = glows[i];
      const el = this.face(c, { count: Game.own(e.id), gain: e.gain, isNew: e.isNew });
      s.front.appendChild(el);
      s.slot.classList.add('flipped');
      if (!quiet || g >= 2) Snd.flip(g);
      setTimeout(() => {
        if (quiet && g < 2) s.slot.classList.add('landed');
        else this._land(P, s.slot, c, g, i % 8);
        if (e.t1 > e.t0 && !c.noRank) {
          const tag = this._totuTag(e.t0, e.t1);
          el.appendChild(tag);
          this._countMul(tag.querySelector('strong'), 1 + totuBonus(e.t0), 1 + totuBonus(e.t1), 300, 500, () => tag.classList.add('done'));
        }
      }, 260);
    };
    const done = () => {
      if (phase === 'done') return;
      phase = 'done';
      clearTimeout(timer);
      // 覚醒（4凸に届いた）が出ていたら、1枚だけ大きく見せる
      const aw = list.findIndex(e => !CARDS[e.id].noRank && e.t0 < BAL.totuBigFrom && e.t1 >= BAL.totuBigFrom);
      const wait = aw >= 0 ? 700 : 300;
      if (aw >= 0) setTimeout(() => {
        const el = slots[aw].front.querySelector('.cf');
        if (el) this.totuUp(el, ov, fx, CARDS[list[aw].id], list[aw].t0, list[aw].t1);
      }, 400);
      setTimeout(() => this._finish(P, onDone), wait + (aw >= 0 ? this.AWK_MS + 100 : 0));
    };
    // 波：1枚ずつ間を空けて捲る。**全部で2.5秒前後に収める**（何十種類でも待たせすぎない）
    const wave = () => {
      if (phase !== 'cards') return;
      if (next >= order.length) { done(); return; }
      const i = order[next++];
      const g = glows[i];
      flipOne(i, order.length > 12);
      const gap = Math.max(60, Math.min(260, 2500 / order.length));
      timer = setTimeout(wave, g >= 2 ? 900 : gap);
    };
    const deal = () => {
      phase = 'cards';
      list.forEach(e => {
        const s = this._slot(CARDS[e.id]);
        grid.appendChild(s.slot);
        slots.push(s);
      });
      const gap = Math.max(25, Math.min(120, 1200 / list.length));
      this._flyOut(P, slots, list.map(e => CARDS[e.id].rarity), gap);
      hint.textContent = 'タップで全部めくる';
      timer = setTimeout(wave, list.length * gap + 500);
    };

    ov.addEventListener('click', (e) => {
      if (phase === 'pack') { phase = 'tearing'; this._tear(P, deal); return; }
      if (phase === 'cards') {
        // 残りを一気に捲る
        clearTimeout(timer);
        while (next < order.length) flipOne(order[next++], true);
        done();
        return;
      }
      if (phase === 'done') {
        const card = e.target.closest('.cf');
        if (card) card.classList.toggle('full');
      }
    });
  },

  // 画面を横切る帯（エピック・レジェンド）
  banner(ov, word, name, color, cls) {
    const b = Util.el('div', 'pfx-banner' + (cls ? ' ' + cls : ''));
    b.style.setProperty('--bc', color);
    b.innerHTML = (cls === 'leg' ? '<em>▲ WARNING ▲ 最上位の記録を確認</em>' : '') + '<b>' + word + '</b><span>' + name + '</span>';
    ov.appendChild(b);
    setTimeout(() => b.remove(), cls === 'leg' ? 1900 : 1500);
  },

  // **見本のパック。**セーブには触らない（URL の ?packdemo=legendary など）。
  //   レア度の高い演出はめったに出ないので、いつでも確かめられるようにしておく
  demo(rar) {
    rar = BAL.rarity[rar] ? rar : 'legendary';
    const g = BAL.rarity[rar].glow;
    const pick = (r) => CARD_IDS.find(id => CARDS[id].kind === 'mod' && CARDS[id].rarity === r) || CARD_IDS[0];
    const ids = [pick('common'), pick(g >= 2 ? 'epic' : 'rare'), pick(rar)];
    // 3枚目は 31→32枚＝4凸（覚醒）、1枚目は 3→4枚＝1凸 を見せる
    const steps = [{ n0: 3, n1: 4 }, { n0: 0, n1: 1 }, { n0: 31, n1: 32 }];
    this.open(PACKS.arms || PACKS.basic, ids, steps, [false, true, false], null);
  },

  // **凸・覚醒の見本**（演出の確認室）。カード1枚のパックで、枚数が t1 凸に届く1枚を捲る。セーブには触れない
  //   t1 … 上がった先の凸（1〜。BAL.totuBigFrom に届くと覚醒）
  demoTotu(t1) {
    const id = CARD_IDS.find(x => CARDS[x].kind === 'mod' && CARDS[x].rarity === 'rare' && !CARDS[x].noRank) || CARD_IDS[0];
    const n1 = Game.totuNeed(t1);
    this.open(PACKS.arms || PACKS.basic, [id], [{ n0: n1 - 1, n1 }], [false], null);
  },

  // ---- 凸・覚醒（0929s・ユーザー「演出面のチープさが全体的に目立つ」→ 結果画面（0929m）と同じ言葉で作り直した） ----
  //   凸：カードが金にひらめき、六角の衝撃波が1つ。星が1つずつ灯り、札（VFD の窓）の倍率が数え上がる。札は数え終わりに脈打って右上へ退く
  //   覚醒（4凸に届いた）：暗くなって中心から金の六角が点き、斜めの黒い帯が叩きつけられる。「// LIMIT BREAK」→ 覚醒 が赤と青に割れて1字ずつ落ち、倍率が数え上がる
  //   凸・覚醒の条件・倍率の計算・効果は変えていない（totuBonus / BAL.totuBigFrom のまま）

  // 倍率の数字を m0 → m1 へ数え上げる（VFD の窓）。要素が消えたら止まる。数え終わりに onDone
  _countMul(node, m0, m1, delayMs, durMs, onDone) {
    node.textContent = '×' + m0.toFixed(2);
    const t0 = performance.now() + delayMs;
    const tick = (t) => {
      if (!node.isConnected) return;
      const k = Math.max(0, Math.min(1, (t - t0) / durMs));
      node.textContent = '×' + (m0 + (m1 - m0) * (1 - Math.pow(1 - k, 3))).toFixed(2);
      if (k < 1) requestAnimationFrame(tick); else if (onDone) onDone();
    };
    requestAnimationFrame(tick);
  },

  // 凸の札。カードの中ほどに出て、少しして右上へ退く（説明文を隠したままにしない）
  _totuTag(t0, t1) {
    const big = t1 >= BAL.totuBigFrom;
    const tag = Util.el('div', 'cf-up' + (big ? ' big' : ''));
    tag.innerHTML = '<em>// ' + (big ? 'LIMIT BREAK' : 'LIMIT UP') + '</em><b>' + t1 + '凸</b>' +
      '<div class="cfu-v"><span>×' + (1 + totuBonus(t0)).toFixed(2) + '</span><u>›</u><strong>×' + (1 + totuBonus(t1)).toFixed(2) + '</strong></div>';
    return tag;
  },

  totuUp(el, ov, fx, c, t0, t1) {
    const m0 = 1 + totuBonus(t0), m1 = 1 + totuBonus(t1);
    const brk = t0 < BAL.totuBigFrom && t1 >= BAL.totuBigFrom;
    el.classList.add('leveling');
    setTimeout(() => el.classList.remove('leveling'), 900);
    if (brk) el.classList.remove('awake');   // 覚醒の枠は、覚醒の瞬間に点く
    // 星：いったん上がる前の数に戻し、新しい星だけ1つずつ灯す
    const stars = el.querySelector('.cf-stars');
    if (stars) {
      stars.innerHTML = this.starsHtml(t0);
      setTimeout(() => {
        if (!stars.isConnected) return;
        stars.innerHTML = this.starsHtml(t1);
        stars.classList.add('pop');
        stars.querySelectorAll('i.on').forEach((st, i) => {
          if (i >= t0) { st.classList.add('nw'); st.style.setProperty('--sd', ((i - t0) * 0.12).toFixed(2) + 's'); }
        });
      }, 350);
    }
    const tag = this._totuTag(t0, t1);
    el.appendChild(tag);
    const num = tag.querySelector('strong');
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.44;
    this.hexShock(fx, cx, cy, brk ? '#ffe08a' : '#ffb43c', 'sm');
    this.particles(fx, cx, cy, '#ffb43c', 10, false);
    Snd.totu(t1);
    this._countMul(num, m0, m1, 350, 550, () => {
      tag.classList.add('done');
      if (tag.isConnected && !brk) { const q = tag.getBoundingClientRect(); this.hexShock(fx, q.left + q.width / 2, q.top + q.height / 2, '#ffb43c', 'sm'); }
    });
    if (brk) setTimeout(() => {
      this._awaken(ov, c, m0, m1);
      setTimeout(() => el.classList.add('awake'), 500);
    }, 350);
  },

  // 覚醒：全面を暗くして、中心から金の六角が点き、斜めの帯が叩きつけられる。約2秒で片付く（AWK_MS）
  AWK_MS: 2050,
  _awaken(ov, c, m0, m1) {
    const aw = Util.el('div', 'pfx-awaken');
    const chars = '覚醒'.split('').map((ch, i) => '<span class="ch" style="--d:' + (0.2 + i * 0.1).toFixed(2) + 's">' + ch + '</span>').join('');
    aw.innerHTML = '<i class="awk-hex"></i><div class="awk-band"><em>// LIMIT BREAK</em><b>' + chars + '</b>' +
      '<span class="awk-name">' + c.name + '</span>' +
      '<div class="awk-vfd"><span>×' + m0.toFixed(2) + '</span><u>→</u><strong>×' + m1.toFixed(2) + '</strong></div></div>';
    ov.appendChild(aw);
    this.bigShake();
    Snd.awaken();
    const band = aw.querySelector('.awk-band');
    const q = band.getBoundingClientRect();
    const cx = q.left + q.width / 2, cy = q.top + q.height / 2;
    this.hexShock(aw, cx, cy, '#ffc24a', true);
    this.particles(aw, cx, cy, '#ffe08a', 20, false);
    const vfd = aw.querySelector('.awk-vfd');
    this._countMul(vfd.querySelector('strong'), m0, m1, 700, 800, () => {
      vfd.classList.add('done');
      if (aw.isConnected) { const v = vfd.getBoundingClientRect(); this.hexShock(aw, v.left + v.width / 2, v.top + v.height / 2, '#ffc24a', 'sm'); }
    });
    setTimeout(() => aw.classList.add('out'), this.AWK_MS - 300);
    setTimeout(() => aw.remove(), this.AWK_MS);
  },
};
