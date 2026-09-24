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
//     ③ カードが回りながら出てくる。絵柄がスロットのように回って減速して止まる。
//        **レアほど長く回り、止まった瞬間が大きい**（レジェンドは画面が金色に弾ける）
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
  //   o.count … その時点の枚数（凸を出す） ／ o.isNew … 初めて
  face(c, o) {
    o = o || {};
    const R = BAL.rarity[c.rarity];
    const t = (o.count && !c.noRank) ? Game.totuOf(o.count) : 0;
    const el = Util.el('div', 'cf r-' + c.rarity + ' k-' + c.kind + (t >= BAL.totuBigFrom ? ' awake' : ''));
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
          (o.count ? '<span class="cf-count">×' + o.count + '</span>' : '') + '</div>' +
      '</div>' +
      '<div class="cf-holo"></div>' +
      '<div class="cf-rar">' + this.RAR_EN[c.rarity] + '</div>';
    return el;
  },

  back(color) {
    const el = Util.el('div', 'cf cf-back');
    el.style.setProperty('--rc', color || '#ff8a1f');
    el.innerHTML = '<div class="cf-backlogo">⬢</div>';
    return el;
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
      if (coin) p.textContent = '◈';
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
      '<div class="pfx-pack"><div class="pfx-flap"></div>' +
        '<div class="pfx-body"><div class="pfx-logo">⬢</div><div class="pfx-name">' + pk.name + '</div>' +
        '<div class="pfx-sub">' + ids.length + ' CARDS</div></div></div>' +
      '<div class="pfx-cards"></div>' +
      '<div class="pfx-hint">タップして開ける</div>' +
      '<div class="pfx-fx"></div>';
    document.body.appendChild(ov);
    const pack = ov.querySelector('.pfx-pack');
    const hint = ov.querySelector('.pfx-hint');
    const row = ov.querySelector('.pfx-cards');
    const fx = ov.querySelector('.pfx-fx');
    Snd.resume && Snd.resume();

    let phase = 'pack', k = 0, skip = null;
    const center = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

    // ① 揺れてから裂ける。**中身が良いほど光が強い**
    const tear = () => {
      phase = 'tearing';
      hint.textContent = '';
      ov.classList.add('shake');
      Snd.packShake(best);
      setTimeout(() => {
        ov.classList.remove('shake');
        ov.classList.add('torn');
        Snd.packTear(best);
        const c = center();
        this.particles(fx, c.x, c.y, BAL.rarity[bestRar].color, 18 + best * 10, false);
        if (best >= 3) this.particles(fx, c.x, c.y, '#ffe08a', 16, true);
        Snd.openLoop(true);
        setTimeout(() => { phase = 'cards'; nextCard(); }, 650);
      }, best >= 3 ? 1300 : best >= 2 ? 1000 : 700);
    };

    // ② 1枚ずつ。スロットのように絵柄が回り、減速して止まる
    const pool = CARD_IDS.filter(id => PACKS[pk.id] && PACKS[pk.id].accepts(CARDS[id]));
    const nextCard = () => {
      if (k >= ids.length) { finish(); return; }
      const idx = k++;
      const c = CARDS[ids[idx]];
      const g = glows[idx];
      const slot = Util.el('div', 'pfx-slot r-' + c.rarity);
      slot.style.setProperty('--rc', BAL.rarity[c.rarity].color);
      row.appendChild(slot);
      // 回る時間：コモン0.6秒〜レジェンド2.2秒
      const total = [600, 900, 1400, 2200][g];
      let el = null, t = 0, gap = 45, done = false;
      const spin = () => {
        if (done) return;
        const f = CARDS[Util.pick(pool.length ? pool : CARD_IDS)];
        const face = this.face(f, {});
        face.classList.add('spinning');
        slot.innerHTML = ''; slot.appendChild(face);
        Snd.slotTick(t / total);
        t += gap;
        gap *= 1.09;                        // だんだん遅くなる
        if (t >= total) land(); else tm = setTimeout(spin, gap);
      };
      let tm = null;
      const land = () => {
        if (done) return;
        done = true; clearTimeout(tm); skip = null;
        const st = steps[idx];
        el = this.face(c, { count: st.n1, isNew: isNew[idx] });
        el.classList.add('landed');
        slot.innerHTML = ''; slot.appendChild(el);
        slot.classList.add('landed');
        const r = slot.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        this.particles(fx, cx, cy, BAL.rarity[c.rarity].color, 8 + g * 8, false);
        Snd.land(g, idx);
        if (g >= 3) {                       // レジェンド：画面が金色に弾ける
          ov.classList.remove('flash'); void ov.offsetWidth; ov.classList.add('flash');
          this.particles(fx, cx, cy, '#ffe08a', 24, true);
        } else if (g >= 2) {
          ov.classList.remove('flashp'); void ov.offsetWidth; ov.classList.add('flashp');
        }
        if (c.kind === 'weapon' && isNew[idx]) UI.toastMsg('新しい武器 ' + c.name, '#ffb43c');
        // 凸が上がった
        const t0 = Game.totuOf(st.n0), t1 = Game.totuOf(st.n1);
        let wait = g >= 3 ? 900 : g >= 2 ? 650 : 420;
        if (t1 > t0 && !c.noRank) {
          wait += 700;
          setTimeout(() => this.totuUp(el, ov, fx, c, t0, t1), 250);
          if (t0 < BAL.totuBigFrom && t1 >= BAL.totuBigFrom) wait += 1800;
        }
        skip = () => { clearTimeout(nt); skip = null; nextCard(); };
        const nt = setTimeout(() => { skip = null; nextCard(); }, wait);
      };
      skip = () => land();                  // 回っている途中のタップは止める
      spin();
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
      if (phase === 'cards' && skip) { skip(); return; }
      if (phase === 'done') {
        const card = e.target.closest('.cf');
        if (card) card.classList.toggle('full');
      }
    });
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
