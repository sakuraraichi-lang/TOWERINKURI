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

const CardFX = {
  KIND_NAME: { weapon: '武器', mod: '武器強化', generic: '汎用', synergy: '連携', perm: '遺物', key: '鍵' },
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
        '<div class="cf-art"><div class="cf-icon">' + UI.cardIcon(c) + '</div>' +
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
    return '<div class="mpack" style="--pc:' + pk.color + '"><i class="mpack-strip"></i>' +
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

  // ---- パックを開ける ----
  //   pk … PACKS の1つ ／ ids … 中身 ／ steps … 1枚ごとの {n0, n1}（めくる前後の枚数）
  open(pk, ids, steps, isNew, onDone) {
    const glows = ids.map(id => BAL.rarity[CARDS[id].rarity].glow);
    const best = Math.max.apply(null, glows);
    const bestRar = BAL.rarityOrder[best] || 'common';
    const ov = Util.el('div', 'pfx best-' + bestRar);
    ov.style.setProperty('--pc', pk.color);
    ov.style.setProperty('--best', BAL.rarity[bestRar].color);
    ov.innerHTML =
      '<div class="pfx-rays"></div>' +
      // 金属の箱。上の帯（つまみ付き）を剥くと、口から光があふれてカードが飛び出す
      '<div class="pfx-pack"><div class="pfx-mouth"></div><div class="pfx-strip"></div><div class="pfx-seam"></div>' +
        '<div class="pfx-body"><i class="pfx-rv a"></i><i class="pfx-rv b"></i><i class="pfx-rv c"></i><i class="pfx-rv d"></i>' +
        '<div class="pfx-emb"><div class="pfx-gear">' + Icons.get('gear') + '</div><div class="pfx-logo">' + this.logoSvg() + '</div></div>' +
        '<div class="pfx-name">' + pk.name + '</div>' +
        '<div class="pfx-sub">' + ids.length + ' CARDS</div><i class="pfx-haz"></i></div></div>' +
      '<div class="pfx-cards"></div>' +
      '<div class="pfx-hint">タップして開ける</div>' +
      '<div class="pfx-fx"></div>';
    document.body.appendChild(ov);
    const pack = ov.querySelector('.pfx-pack');
    const hint = ov.querySelector('.pfx-hint');
    const row = ov.querySelector('.pfx-cards');
    const fx = ov.querySelector('.pfx-fx');
    Snd.resume && Snd.resume();

    let phase = 'pack';
    const center = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

    // ① 光を溜めてから、上の帯を剥く。**中身が良いほど光が強い**
    //   前は「揺れて、膨らみながら消える」だった。ユーザー「震えてフェードアウトしていくのに違和感」
    const tear = () => {
      phase = 'tearing';
      hint.textContent = '';
      ov.classList.add('charge');
      Snd.packShake(best);
      // **昇格演出。**光の色が コモン→レア→エピック→レジェンド と、中身の最高レア度まで段階的に上がる。
      //   1段ごとに音が上がり、粒が弾ける。レジェンドまで上がると画面が揺れる
      const steps0 = BAL.rarityOrder.slice(0, best + 1);
      const stepMs = best >= 3 ? 330 : 300;
      steps0.forEach((r, i) => setTimeout(() => {
        ov.style.setProperty('--best', BAL.rarity[r].color);
        ov.classList.remove('lv0', 'lv1', 'lv2', 'lv3'); ov.classList.add('lv' + i);
        if (i > 0) {
          Snd.promote(i);
          const c = center();
          this.particles(fx, c.x, c.y, BAL.rarity[r].color, 10 + i * 6, false);
          if (i >= 3) { document.body.classList.remove('bigshake'); void document.body.offsetWidth; document.body.classList.add('bigshake'); }
        }
      }, i * stepMs));
      setTimeout(() => {
        ov.classList.remove('charge');
        ov.classList.add('peel');
        Snd.packTear(best);
        // 裂け目に沿って火花：帯の下端を左から右へ
        const pr = pack.getBoundingClientRect();
        const sy = pr.top + pr.height * 0.12;
        for (let i = 0; i < 5; i++) setTimeout(() =>
          this.particles(fx, pr.left + pr.width * (i + 0.5) / 5, sy, BAL.rarity[bestRar].color, 4 + best * 2, false), i * 55);
        if (best >= 3) setTimeout(() => this.particles(fx, pr.left + pr.width / 2, sy, '#ffe08a', 16, true), 300);
        Snd.openLoop(true);
        // 口を下へずらしてから、カードを飛び出させる
        setTimeout(() => ov.classList.add('lower'), 520);
        setTimeout(() => { phase = 'cards'; deal(); }, 900);
      }, steps0.length * stepMs + 250);
    };

    // ② 伏せて配り、1枚ずつ捲る。**ルーレットはやめた**（ユーザー 2026-09-24「カードなので
    //   ルーレットでガチャガチャはせず、裏側から捲るようにしましょう」）。
    //   裏面はロゴ。**レア度の色が裏から透ける**ので、捲る前から期待できる
    const slots = [];
    let flipped = 0, busy = false;
    const deal = () => {
      ids.forEach((id, idx) => {
        const c = CARDS[id];
        const slot = Util.el('div', 'pfx-slot r-' + c.rarity);
        slot.style.setProperty('--rc', BAL.rarity[c.rarity].color);
        slot.classList.add('pre');
        const flip = Util.el('div', 'pfx-flip');
        const inner = Util.el('div', 'pfx-inner');
        const backF = Util.el('div', 'pfx-side pfx-backside');
        backF.appendChild(this.back(c.rarity));
        const front = Util.el('div', 'pfx-side pfx-frontside');
        inner.appendChild(backF); inner.appendChild(front);
        flip.appendChild(inner); slot.appendChild(flip);
        row.appendChild(slot);
        slots.push({ slot, inner, front, done: false });
        slot.addEventListener('click', (e) => { e.stopPropagation(); open1(idx); });
      });
      // **口から飛び出して、並びの位置へ。**並べ終えた位置から口までの差を出して、そこから飛ばす
      const pr = pack.getBoundingClientRect();
      const mx = pr.left + pr.width / 2, my = pr.top + pr.height * 0.14;
      slots.forEach((s, idx) => {
        const r = s.slot.getBoundingClientRect();
        s.slot.style.setProperty('--fx', (mx - (r.left + r.width / 2)).toFixed(0) + 'px');
        s.slot.style.setProperty('--fy', (my - (r.top + r.height / 2)).toFixed(0) + 'px');
        s.slot.style.setProperty('--fr', ((idx - (slots.length - 1) / 2) * -14).toFixed(0) + 'deg');
        s.slot.style.animationDelay = (idx * 0.16).toFixed(2) + 's';
        s.slot.classList.remove('pre');
        s.slot.classList.add('fly');
        setTimeout(() => {
          Snd.deal(idx);
          this.particles(fx, mx, my, BAL.rarity[CARDS[ids[idx]].rarity].color, 6, false);
        }, idx * 160);
      });
      // 出し切ったら、空の箱は下へ落ちる（消さない）
      setTimeout(() => ov.classList.add('away'), slots.length * 160 + 450);
      hint.textContent = 'タップして捲る';
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
          if (i >= 3) { document.body.classList.remove('bigshake'); void document.body.offsetWidth; document.body.classList.add('bigshake'); }
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
          const r = s.slot.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          this.particles(fx, cx, cy, BAL.rarity[c.rarity].color, 8 + g * 8, false);
          Snd.land(g, idx);
          s.slot.classList.add('landed');
          if (g >= 3) {
            ov.classList.remove('flash'); void ov.offsetWidth; ov.classList.add('flash');
            this.particles(fx, cx, cy, '#ffe08a', 24, true);
            this.banner(ov, 'LEGENDARY', c.name, '#ffb020');
            this.coinRain(fx, 42);
          } else if (g >= 2) {
            ov.classList.remove('flashp'); void ov.offsetWidth; ov.classList.add('flashp');
            this.banner(ov, 'EPIC', c.name, '#c26bff');
          }
          if (c.kind === 'weapon' && isNew[idx]) UI.toastMsg('新しい武器 ' + c.name, '#ffb43c');
          const t0 = Game.totuOf(st.n0), t1 = Game.totuOf(st.n1);
          let wait = g >= 3 ? 1100 : g >= 2 ? 700 : 250;
          if (t1 > t0 && !c.noRank) {
            wait += 600;
            setTimeout(() => this.totuUp(el, ov, fx, c, t0, t1), 250);
            if (t0 < BAL.totuBigFrom && t1 >= BAL.totuBigFrom) wait += 1800;
          }
          setTimeout(() => {
            busy = false;
            flipped++;
            if (flipped >= slots.length) finish();
          }, wait);
        }, 260);
      }, wait0);
    };
    const finish = () => {
      phase = 'done';
      Snd.openLoop(false);
      Snd.fanfare(best);
      const btn = Util.el('button', 'pfx-done', '受け取る');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        ov.classList.add('out');
        setTimeout(() => { ov.remove(); onDone && onDone(); }, 260);
      });
      ov.appendChild(btn);
      hint.textContent = 'カードをタップすると全文';
    };

    ov.addEventListener('click', (e) => {
      if (phase === 'pack') { tear(); return; }
      if (phase === 'cards') { open1(nextIdx()); return; }
      if (phase === 'done') {
        const card = e.target.closest('.cf');
        if (card) card.classList.toggle('full');
      }
    });
  },

  // 画面を横切る帯（エピック・レジェンド）
  banner(ov, word, name, color) {
    const b = Util.el('div', 'pfx-banner');
    b.style.setProperty('--bc', color);
    b.innerHTML = '<b>' + word + '</b><span>' + name + '</span>';
    ov.appendChild(b);
    setTimeout(() => b.remove(), 1500);
  },

  // 上からコインが降る
  coinRain(host, n) {
    for (let i = 0; i < n; i++) {
      const p = Util.el('i', 'pfx-rain');
      p.innerHTML = Icons.coin();
      p.style.left = (Math.random() * 100).toFixed(1) + 'vw';
      p.style.animationDelay = (Math.random() * 0.7).toFixed(2) + 's';
      p.style.animationDuration = (1.1 + Math.random() * 0.8).toFixed(2) + 's';
      p.style.fontSize = (12 + Math.random() * 14).toFixed(0) + 'px';
      host.appendChild(p);
      setTimeout(() => p.remove(), 2800);
    }
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

  // 凸が上がった瞬間：星が1つずつ灯り、倍率がカウントアップする
  totuUp(el, ov, fx, c, t0, t1) {
    const m0 = 1 + totuBonus(t0), m1 = 1 + totuBonus(t1);
    const big = t1 >= BAL.totuBigFrom;
    el.classList.add('leveling');
    const stars = el.querySelector('.cf-stars');
    if (stars) { stars.innerHTML = this.starsHtml(t1); stars.classList.add('pop'); }
    const tag = Util.el('div', 'cf-up' + (big ? ' big' : ''));
    tag.innerHTML = '<b>' + t1 + '凸</b><small>×' + m0.toFixed(2) + ' → ×' + m1.toFixed(2) + '</small>';
    el.appendChild(tag);
    const r = el.getBoundingClientRect();
    this.particles(fx, r.left + r.width / 2, r.top + r.height * 0.8, '#ffb43c', 14, true);
    Snd.totu(t1);
    if (t0 < BAL.totuBigFrom && big) {
      setTimeout(() => {
        const aw = Util.el('div', 'pfx-awaken');
        aw.innerHTML = '<div class="awk-ring"></div><div class="awk-ring r2"></div>' +
          '<div class="awk-txt">覚 醒</div><div class="awk-name">' + c.name + '</div>' +
          '<div class="awk-mul">×' + m0.toFixed(2) + ' → <b>×' + m1.toFixed(2) + '</b></div>';
        ov.appendChild(aw);
        this.particles(fx, window.innerWidth / 2, window.innerHeight / 2, '#ffe08a', 36, true);
        Snd.awaken();
        setTimeout(() => aw.remove(), 2000);
      }, 450);
    }
  },
};
