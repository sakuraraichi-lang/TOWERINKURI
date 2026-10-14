// ---------------------------------------------------------------
// modbase.js : MOD モードの画面（2026-10-14 ユーザー）
//   MOD 基地（専用のホーム）・改造ツリー・武器・交換所・記録・起動条件・改造の3択・ランの終わり・戦闘中の札・確認室の見本
//   見た目は本編のホームの語彙（上の帯・RANK の輪・大きな出撃）で、色は改造の系統色。長い説明は書かない
//   仕組み（セーブ・ツリー・MP・敵の強さ）は src/modrun.js
// ---------------------------------------------------------------
'use strict';

Object.assign(ModRun, {
  RAR_EN: { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGEND' },
  // ---------- 改造の札（カードと同じ .cf の骨格） ----------
  face(id, o) {
    o = o || {};
    const m = MODS[id], S = MOD_SYS[m.sys[0]], R = BAL.rarity[m.rar];
    const el = Util.el('div', 'cf mdf r-' + m.rar + (m.need ? ' mdlink' : '') + (m.boss ? ' mdboss' : ''));
    el.style.setProperty('--rc', R.color);
    el.style.setProperty('--ac', S.col);
    const mr = o.mr;
    const pips = m.sys.filter(s => s !== 'boss').map(s => {
      const n = mr ? this.sysCount(mr, s) : 0, nx = Math.min(BAL.modRun.evoAt, n + 1);
      let h = '<span class="mdpip" style="--pc:' + MOD_SYS[s].col + '">';
      for (let i = 0; i < BAL.modRun.evoAt; i++) h += '<i class="' + (i < n ? 'on' : (i < nx && !o.owned) ? 'nx' : '') + '"></i>';
      return h + '</span>';
    }).join('');
    el.innerHTML =
      '<div class="cf-frame">' +
        '<div class="cf-top"><span class="cf-name">' + m.name + '</span></div>' +
        '<div class="cf-art mdart"><div class="cf-icon">' + this.glyph(id) + '</div>' +
          '<div class="cf-kind">' + m.sys.map(s => MOD_SYS[s].jp).join('＋') + '</div>' +
          (m.need ? '<div class="cf-upr md-tag">LINK</div>' : m.boss ? '<div class="cf-upr md-tag">PRICE</div>' : '') + '</div>' +
        '<div class="cf-text">' + this.lineHtml(m.line) + '</div>' +
        '<div class="cf-bottom"><span class="cf-stars">' + pips + '</span></div>' +
      '</div><div class="cf-holo"></div><div class="cf-rar">' + this.RAR_EN[m.rar] + '</div>';
    return el;
  },
  lineHtml(t) { const p = t.split('｜'); return p[0] + (p[1] ? '<br><s class="mdcost">' + p[1] + '</s>' : ''); },
  lineText(t) { return t.replace('｜', '　'); },
  hexPts(r, cx, cy, rot) { let p = ''; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + (rot === undefined ? Math.PI / 6 : rot); p += ((cx || 50) + Math.cos(a) * r).toFixed(1) + ',' + ((cy || 50) + Math.sin(a) * r).toFixed(1) + ' '; } return p; },
  // 絵：系統の色の六角（連携は2色）に、字
  glyphOf(g, c1, c2, key) {
    const gid = 'mdg' + key;
    return '<svg class="mdsvg" viewBox="0 0 100 100"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
      '<polygon points="' + this.hexPts(44) + '" fill="none" stroke="url(#' + gid + ')" stroke-width="3" opacity=".9"/>' +
      '<polygon points="' + this.hexPts(36) + '" fill="url(#' + gid + ')" opacity=".16"/>' +
      '<polygon points="' + this.hexPts(36) + '" fill="none" stroke="url(#' + gid + ')" stroke-width="1.2" opacity=".6" stroke-dasharray="4 3"/>' +
      '<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="40" font-weight="900" fill="#fff" stroke="' + c1 + '" stroke-width="1.5" paint-order="stroke">' + g + '</text></svg>';
  },
  glyph(id) { const m = MODS[id]; return this.glyphOf(m.g, MOD_SYS[m.sys[0]].col, m.sys[1] ? MOD_SYS[m.sys[1]].col : MOD_SYS[m.sys[0]].col, id); },
  strip(mr) {
    const w = Util.el('div', 'mdstrip');
    if (!mr.mods.length) { w.innerHTML = '<span class="mdnone">改造なし</span>'; return w; }
    w.innerHTML = mr.mods.map(id => {
      const m = MODS[id];
      return '<span class="mdmini" style="--pc:' + MOD_SYS[m.sys[0]].col + '" title="' + m.name + '">' + m.g + '</span>';
    }).join('') + Object.keys(MOD_EVO).filter(s => this.evo(mr, s)).map(s =>
      '<span class="mdevo" style="--pc:' + MOD_SYS[s].col + '">' + MOD_SYS[s].jp + ' EVO</span>').join('');
    return w;
  },
  // 6つの系統色の六角（MOD 基地の紋）
  mark() {
    const cols = ['adj', 'fuse', 'hit', 'bet', 'pos', 'greed'].map(s => MOD_SYS[s].col);
    let seg = '';
    for (let i = 0; i < 6; i++) {
      const a0 = Math.PI / 3 * i - Math.PI / 2, a1 = a0 + Math.PI / 3;
      seg += '<line x1="' + (50 + Math.cos(a0) * 44).toFixed(1) + '" y1="' + (50 + Math.sin(a0) * 44).toFixed(1) + '" x2="' + (50 + Math.cos(a1) * 44).toFixed(1) + '" y2="' + (50 + Math.sin(a1) * 44).toFixed(1) + '" stroke="' + cols[i] + '" stroke-width="6" stroke-linecap="round"/>';
    }
    return '<svg viewBox="0 0 100 100">' + seg + '<polygon points="' + this.hexPts(30, 50, 50, -Math.PI / 2) + '" fill="#0b0e15" stroke="#fff" stroke-opacity=".25" stroke-width="1.5"/>' +
      '<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="30" font-weight="900" fill="#fff">改</text></svg>';
  },
  mpIcon() { return '<svg class="mbmp" viewBox="0 0 20 20"><polygon points="' + this.hexPts(8.5, 10, 10, -Math.PI / 2) + '" fill="#c26bff"/><polygon points="' + this.hexPts(4, 10, 10, -Math.PI / 2) + '" fill="#4ee0ff"/></svg>'; },

  // ---------- 本編のホームの入口（?modlab のときだけ） ----------
  homeButton() {
    const row = document.querySelector('.startrow');
    if (!row) return;
    let b = document.getElementById('homeMod');
    if (!this.open()) { if (b) b.style.display = 'none'; return; }
    if (!b) {
      b = Util.el('button', 'skipbtn modbtn');
      b.id = 'homeMod';
      b.addEventListener('click', () => { Snd.resume(); Snd.ui(); this.openBase(); });
      row.appendChild(b);
    }
    b.style.display = '';
    b.innerHTML = 'MOD 基地<u>MOD MODE</u>';
  },

  // ---------- MOD 基地 ----------
  //   demo＝{ perm }（確認室の見本。押しても何も変わらない）
  openBase(demo) {
    this._inMod = !demo;
    this._demo = demo || null; this._demoBase = !!demo;
    let el = document.getElementById('modBase');
    if (!el) { el = Util.el('div', 'mb'); el.id = 'modBase'; document.body.appendChild(el); }
    el.style.display = '';
    document.body.classList.add('on-mod');
    if (!demo) Snd.bgm('cafe');
    this.renderBase();
  },
  closeBase() {
    this._inMod = false; this._demo = null; this._demoBase = false;
    const el = document.getElementById('modBase');
    if (el) el.style.display = 'none';
    document.body.classList.remove('on-mod');
  },
  hideBase() { const el = document.getElementById('modBase'); if (el) el.style.display = 'none'; document.body.classList.remove('on-mod'); },
  // Main.toHome の最後：MOD モードの中にいたら MOD 基地へ戻す
  onHome() { if (this._inMod) this.openBase(); },
  perm() { return this._demo ? this._demo.perm : Game.perm; },
  demoNo(msg) { UI.toastMsg('見本：' + msg, '#c26bff', 'select'); },

  renderBase() {
    const el = document.getElementById('modBase');
    if (!el || el.style.display === 'none') return;
    const perm = this.perm(), P = this.P(perm), mr = P.run, B = BAL.modRun, b = this.base(perm);
    const nodes = this.nodes(), got = nodes.filter(n => P.tree[n.id]).length;
    el.innerHTML =
      '<div class="mb-fx"><i class="mb-grid"></i><i class="mb-glow"></i><i class="hfx-scan"></i></div>' +
      '<div class="mb-bar">' +
        '<button class="mb-back">' + Icons.get('close') + '</button>' +
        '<div class="lvring mb-ring"><b>' + P.rec.best + '</b><i>BEST</i></div>' +
        '<div class="mb-id"><div class="mb-nm">MOD 基地<em>' + (this._demo ? 'DEMO' : 'LAB') + '</em></div><div class="mb-xp"><i style="width:' + (100 * got / nodes.length).toFixed(1) + '%"></i></div>' +
          '<div class="mb-num">TREE ' + got + '/' + nodes.length + '　CLEAR ' + P.rec.wins + '</div></div>' +
        '<div class="hpill mb-pill">' + this.mpIcon() + '<b>' + P.pts + '</b><em>MP</em></div>' +
      '</div>' +
      '<div class="mb-logo"><span class="mb-mark">' + this.mark() + '</span><span class="mb-word">MOD 基地<small>MODIFICATION BASE</small></span></div>';
    // 章の帯：8つの六角（突破・いま・ボス）
    const hero = Util.el('div', 'mb-hero');
    let rail = '<div class="mb-rail">';
    for (let k = 0; k < B.chapters; k++) {
      const boss = B.bossAt.indexOf(k + 1) >= 0, done = mr && k < mr.ch, cur = mr && k === mr.ch;
      rail += '<i class="' + (done ? 'done' : cur ? 'cur' : '') + (boss ? ' boss' : '') + '"><b>' + (boss ? 'B' : k + 1) + '</b></i>';
    }
    rail += '</div>';
    hero.innerHTML = '<div class="mb-kick">' + (mr ? '// RUN IN PROGRESS' : '// NEXT RUN') + '</div>' +
      '<div class="mb-title">' + (mr ? '第<b>' + (mr.ch + 1) + '</b>章' : '全<b>' + B.chapters + '</b>章') + '</div>' + rail;
    const stat = Util.el('div', 'mb-stat');
    const cell = (k, v, c) => '<span style="--sc:' + c + '"><em>' + k + '</em><b>' + v + '</b></span>';
    if (mr) {
      stat.innerHTML = cell('LIFE', mr.lives + '/' + mr.livesMax, '#ff5b8a') + cell('COST', mr.cap + this.capAdd({ mr }), '#ffd24a') + cell('REROLL', mr.rerolls, '#4ee0ff') + cell('MP', '+' + (mr.pts || 0), '#c26bff');
      hero.appendChild(stat);
      hero.appendChild(this.condEl(mr));
      hero.appendChild(this.strip(mr));
    } else {
      stat.innerHTML = cell('LIFE', b.lives, '#ff5b8a') + cell('COST', b.cost, '#ffd24a') + cell('REROLL', b.rerolls, '#4ee0ff') + cell('HEAL', '+' + b.heal, '#7ee3a0');
      hero.appendChild(stat);
      const ws = Util.el('div', 'mb-ws');
      ws.innerHTML = WEAPON_IDS.map(w => '<i class="' + (b.weapons.indexOf(w) >= 0 ? 'on' : '') + '" style="--wc:' + WEAPONS[w].color + '">' + WEAPONS[w].icon + '</i>').join('');
      hero.appendChild(ws);
    }
    el.appendChild(hero);
    // 4つの入口
    const nav = Util.el('div', 'mb-nav');
    const tile = (key, jp, en, sub, col, icon, fn) => {
      const t = Util.el('button', 'mb-tile');
      t.style.setProperty('--tc', col);
      t.innerHTML = '<span class="mb-ti">' + icon + '</span><b>' + jp + '</b><em>' + en + '</em><u>' + sub + '</u>' + (key === 'tree' && this.canAny(perm) ? '<s class="mb-dot"></s>' : '');
      t.addEventListener('click', () => { Snd.ui(); fn(); });
      nav.appendChild(t);
    };
    const wOpen = b.weapons.length;
    tile('tree', '改造ツリー', 'MOD TREE', got + '/' + nodes.length, '#c26bff', Icons.get('tree'), () => this.showTree());
    tile('weapon', '武器', 'ARMORY', wOpen + '/' + WEAPON_IDS.length, '#ffd24a', Icons.get('blades'), () => this.showWeapons());
    tile('shop', '交換所', 'EXCHANGE', 'MP → 本編', '#4ee0ff', Icons.get('pack'), () => this.showShop());
    tile('rec', '記録', 'RECORD', '最高 ' + P.rec.best + '/' + B.chapters, '#7ee3a0', Icons.get('trophy'), () => this.showRecord());
    el.appendChild(nav);
    // 出撃
    const row = Util.el('div', 'startrow mb-start');
    const go = Util.el('button', 'bigstart mb-go');
    go.innerHTML = (mr ? (mr.status === 'pick' && mr.offer ? '改造を選ぶ' : '続き　第' + (mr.ch + 1) + '章') : '出撃') + '<s>▶</s>';
    go.addEventListener('click', () => { Snd.resume(); Snd.ui(); this.go(); });
    row.appendChild(go);
    if (mr) {
      const q = Util.el('button', 'skipbtn mb-quit');
      q.innerHTML = '終える<u>MP は残る</u>';
      q.addEventListener('click', () => {
        if (this._demo) return this.demoNo('終える');
        if (q.dataset.arm !== '1') { q.dataset.arm = '1'; q.innerHTML = 'もう一度<u>押すと終える</u>'; return; }
        const end = this.abandon(Game.perm); Game.save(); this.showEnd(end);
      });
      row.appendChild(q);
    }
    el.appendChild(row);
    el.querySelector('.mb-back').addEventListener('click', () => {
      Snd.ui();
      if (this._demo) { this.closeBase(); return; }
      this.closeBase(); Main.toHome();
    });
  },
  canAny(perm) { return this.nodes().some(n => !this.canBuy(perm, n.id)); },

  // 出撃・続き・改造を選ぶ
  go() {
    if (this._demo) return this.demoNo('出撃');
    const mr = this.state();
    if (mr) { if (mr.status === 'pick' && mr.offer) this.showPick(); else this.enter(); return; }
    if (this.canPickCond(Game.perm)) { this.chooseCond(); return; }
    this.start(Game.perm); Game.save(); this.enter();
  },
  // 起動条件を選ぶ（改造ツリーの「起動条件を選ぶ」を取ってから）
  chooseCond() {
    const body = Util.el('div', 'draft mdcondpick');
    body.appendChild(UI.choiceHead('起動条件', '', '// BOOT CONDITION'));
    const list = Util.el('div', 'mb-conds');
    for (const id of MOD_COND_IDS.concat(['calm'])) {
      const c = MOD_COND[id], b = Util.el('button', 'mb-cond' + (id === 'calm' ? ' calm' : ''));
      b.innerHTML = '<b>' + c.name + '</b><span>' + c.line + '</span><em>' + (id === 'calm' ? 'MP ×1' : 'MP +' + Math.round(BAL.modRun.pts.cond * 100) + '%') + '</em>';
      b.addEventListener('click', () => {
        Snd.ui(); UI.closeModal();
        if (this._demo) return this.demoNo(c.name);
        this.start(Game.perm, undefined, id); Game.save(); this.enter();
      });
      list.appendChild(b);
    }
    body.appendChild(list);
    UI.openModal(body, false);
  },

  // ---------- パネル（ツリー・武器・交換所・記録）共通の枠 ----------
  panel(title, en, cls) {
    const body = Util.el('div', 'draft mbp ' + (cls || ''));
    const P = this.P(this.perm());
    body.appendChild(UI.choiceHead(title, '', '// ' + en));
    const mp = Util.el('div', 'mbp-mp');
    mp.innerHTML = this.mpIcon() + '<b>' + P.pts + '</b><em>MP</em>' + (P.run ? '<span>ツリーは次のランから</span>' : '');
    body.appendChild(mp);
    return body;
  },
  panelClose(body, again) {
    const subs = Util.el('div', 'rs-subs');
    const close = Util.el('button', 'rs-sub');
    close.innerHTML = Icons.get('close') + '閉じる';
    close.addEventListener('click', () => { UI.closeModal(); if (this._demo && !this._demoBase) this._demo = null; else this.renderBase(); });
    subs.appendChild(close);
    body.appendChild(subs);
  },
  // 下の帯：選んだ節の中身と「取る」
  detailBar(body, o) {
    let bar = body.querySelector('.mbp-det');
    if (!bar) { bar = Util.el('div', 'mbp-det'); body.insertBefore(bar, body.querySelector('.rs-subs')); }
    bar.style.setProperty('--dc', o.col);
    bar.innerHTML = '<div><b>' + o.name + '</b><span>' + o.line + '</span></div>';
    const btn = Util.el('button', 'mbp-buy');
    btn.innerHTML = o.why ? '<span>' + o.why + '</span>' : this.mpIcon() + '<b>' + o.cost + '</b>' + (o.verb || '取る');
    btn.disabled = !!o.why;
    btn.addEventListener('click', () => { if (!o.why) o.buy(); });
    bar.appendChild(btn);
  },

  // ---------- 改造ツリー ----------
  showTree(sel) {
    const perm = this.perm(), P = this.P(perm);
    const body = this.panel('改造ツリー', 'MOD TREE', 'mbtree');
    const groups = [['base', '初期値', 'BOOT'], ['mod', '改造', 'MODS'], ['cond', '起動条件', 'CONDITION']];
    const nodes = this.nodes();
    let first = null;
    for (const [g, jp, en] of groups) {
      const sec = Util.el('div', 'mbt-sec');
      sec.innerHTML = '<div class="mbt-h"><b>' + jp + '</b><em>' + en + '</em></div>';
      const keys = g === 'base' ? ['life', 'cost', 'reroll', 'heal'] : [null];
      for (const key of keys) {
        const row = Util.el('div', 'mbt-row' + (key ? ' chain' : ''));
        for (const n of nodes.filter(x => x.grp === g && (!key || x.key === key))) {
          const own = !!P.tree[n.id], why = this.canBuy(perm, n.id);
          const st = own ? 'own' : !why ? 'can' : (n.need && !P.tree[n.need]) ? 'lock' : 'far';
          const b = Util.el('button', 'mbt-node ' + st);
          b.style.setProperty('--nc', n.col);
          const g2 = n.g || (n.mods ? MODS[n.mods[0]].g : '?');
          b.innerHTML = '<span class="mbt-hex"><svg viewBox="0 0 100 100"><polygon points="' + this.hexPts(46) + '"/></svg><i>' + g2 + '</i></span>' +
            '<b>' + (n.add ? '+' + n.add : n.name) + '</b><u>' + (own ? '✓' : this.nodeCost(perm, n)) + '</u>';
          b.dataset.id = n.id;
          const pick = () => {
            body.querySelectorAll('.mbt-node.sel').forEach(x => x.classList.remove('sel'));
            b.classList.add('sel');
            const B0 = this.base(perm), cur = { life: B0.lives, cost: B0.cost, reroll: B0.rerolls, heal: B0.heal }[n.key];
            const line = n.grp === 'base' ? '次のラン　' + cur + (own ? '' : ' → ' + (cur + n.add)) : n.grp === 'mod' ? '候補に出る：' + n.line : n.line;
            this.detailBar(body, { name: n.name + (n.add ? ' +' + n.add : ''), line, col: n.col, cost: this.nodeCost(perm, n), why: own ? '取得済み' : why,
              buy: () => {
                if (this._demo) return this.demoNo(n.name);
                if (!this.buy(Game.perm, n.id)) return;
                Game.save(); Snd.ui();
                UI.toastMsg(n.name + (n.add ? ' +' + n.add : ''), n.col, 'buy');
                UI.closeModal(); this.showTree(n.id); this.renderBase();
              } });
          };
          b.addEventListener('click', () => { Snd.ui(); pick(); });
          if (n.id === sel || (!sel && !first && st === 'can')) first = pick;
          row.appendChild(b);
        }
        if (key) row.insertAdjacentHTML('afterbegin', '<span class="mbt-k" style="color:' + nodes.find(x => x.key === key).col + '">' + nodes.find(x => x.key === key).name + '</span>');
        sec.appendChild(row);
      }
      body.appendChild(sec);
    }
    this.panelClose(body);
    UI.openModal(body, false);
    if (first) first();
  },

  // ---------- 武器 ----------
  showWeapons(sel) {
    const perm = this.perm(), open = this.weaponsOpen(perm);
    const body = this.panel('武器', 'ARMORY', 'mbarm');
    const grid = Util.el('div', 'mba-grid');
    let first = null;
    for (const w of WEAPON_IDS) {
      const start = BAL.modRun.startWeapons.indexOf(w) >= 0, on = open.indexOf(w) >= 0, n = start ? null : this.node('w_' + w);
      const why = n ? this.canBuy(perm, n.id) : '';
      const b = Util.el('button', 'mba-w ' + (on ? 'on' : !why ? 'can' : 'off'));
      b.style.setProperty('--wc', WEAPONS[w].color);
      b.innerHTML = '<span class="mba-ic">' + WEAPONS[w].icon + '</span><b>' + WEAPONS[w].name + '</b><em>' + SYS_INFO[WEAPONS[w].sys].jp + '　コスト ' + WEAPONS[w].cost + '</em>' +
        '<u>' + (start ? 'START' : on ? '✓' : this.nodeCost(perm, n)) + '</u>';
      const pick = () => {
        body.querySelectorAll('.mba-w.sel').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel');
        this.detailBar(body, { name: WEAPONS[w].name, line: SYS_INFO[WEAPONS[w].sys].jp + '　コスト ' + WEAPONS[w].cost, col: WEAPONS[w].color, cost: n ? this.nodeCost(perm, n) : 0,
          why: start ? '始めから使える' : on ? '解放済み' : why, verb: '解放',
          buy: () => {
            if (this._demo) return this.demoNo(WEAPONS[w].name);
            if (!this.buy(Game.perm, n.id)) return;
            Game.save(); Snd.ui();
            UI.toastMsg(WEAPONS[w].name, WEAPONS[w].color, 'weapon');
            UI.closeModal(); this.showWeapons(w); this.renderBase();
          } });
      };
      b.addEventListener('click', () => { Snd.ui(); pick(); });
      if (w === sel || (!sel && !first && !on && !why)) first = pick;
      grid.appendChild(b);
    }
    body.appendChild(grid);
    this.panelClose(body);
    UI.openModal(body, false);
    if (first) first();
  },

  // ---------- 交換所 ----------
  showShop() {
    const perm = this.perm(), P = this.P(perm);
    const body = this.panel('交換所', 'EXCHANGE', 'mbshop');
    const items = this.shopItems(perm);
    const sec = (jp, list) => {
      const s = Util.el('div', 'mbt-sec');
      s.innerHTML = '<div class="mbt-h"><b>' + jp + '</b></div>';
      const row = Util.el('div', 'mbs-row');
      for (const it of list) {
        const b = Util.el('button', 'mbs-it' + (it.lock ? ' lock' : P.pts < it.price ? ' poor' : ''));
        const pk = it.pack && PACKS[it.pack];
        b.innerHTML = (pk ? CardFX.miniPack(pk) : '<span class="mbs-fus">' + this.glyphOf('合', '#ffd24a', '#ff5b8a', 'fus') + '</span>') +
          '<b>' + (pk ? pk.name : '合成の札') + '</b>' + (it.kind === 'fusion' && !it.lock ? '<em>のこり ' + it.left + '</em>' : '') +
          '<u>' + (it.lock ? Icons.get('lock') + it.lock : this.mpIcon() + it.price) + '</u>';
        b.addEventListener('click', () => {
          if (it.lock) return;
          if (this._demo) return this.demoNo(pk ? pk.name : '合成の札');
          const got = this.shopBuy(Game.perm, it.id);
          if (!got) { UI.toastMsg('MP が足りない', '#ff5566', 'warn'); return; }
          Game.save(); Snd.ui();
          UI.toastMsg(got.fusion ? '合成の札：' + FUSIONS[got.fusion].name : PACKS[got.pack].name + ' +1', got.fusion ? FUSIONS[got.fusion].color : PACKS[got.pack].color, 'buy');
          UI.closeModal(); this.showShop(); this.renderBase();
        });
        row.appendChild(b);
      }
      s.appendChild(row);
      body.appendChild(s);
    };
    sec('ふつうのパック', items.filter(x => x.kind === 'pack'));
    sec('上位パック', items.filter(x => x.kind === 'upack'));
    sec('合成の札', items.filter(x => x.kind === 'fusion'));
    this.panelClose(body);
    UI.openModal(body, false);
  },

  // ---------- 記録 ----------
  showRecord() {
    const P = this.P(this.perm()), B = BAL.modRun, r = P.rec;
    const body = Util.el('div', 'rs rs-clear mbrec');
    body.innerHTML = '<div class="rs-ban"><i class="rs-sweep"></i><em>// MOD RECORD</em><b>' + r.best + '/' + B.chapters + '</b><span>最高到達</span></div>';
    const ln = Util.el('div', 'rs-line');
    ln.innerHTML = '<span>踏破 <b>' + r.wins + '</b></span><span>挑戦 <b>' + r.runs + '</b></span><span>ボス撃破 <b>' + r.bossKills + '</b></span><span>MP 累計 <b>' + P.earned + '</b></span>';
    body.appendChild(ln);
    const go = Util.el('button', 'rs-go');
    go.innerHTML = '<span>戻る</span><b>MOD 基地</b>' + Icons.get('play');
    go.addEventListener('click', () => UI.closeModal());
    body.appendChild(go);
    UI.openModal(body, false);
    UI.el.modal.classList.add('rsmodal');
  },
  condEl(mr) {
    const c = MOD_COND[mr.cond], d = Util.el('div', 'mdcond');
    d.innerHTML = '<b>' + c.name + '</b><span>' + c.line + '</span>' + (mr.cond !== 'calm' ? '<i class="mdcmp">MP +' + Math.round(BAL.modRun.pts.cond * 100) + '%</i>' : '') +
      (mr.cond === 'few' ? '<em>' + mr.weapons.map(w => '<i style="color:' + WEAPONS[w].color + '">' + WEAPONS[w].icon + '</i>').join('') + '</em>' : '');
    return d;
  },

  // ---------- 章に入る（準備フェーズ） ----------
  enter() {
    const mr = this.state();
    if (!mr) return;
    this.hideBase();
    if (UI.closeBattleCfg) UI.closeBattleCfg();
    UI.setScreen('battle');
    Game.startPrep(mr.boards[mr.ch], mr);
    Snd.bgm('cafe');
    Render.fit();
    Game.paused = false;
    UI.placingType = null; UI.selected = null; UI.moving = null;
    UI.renderTray();
    Main.syncStartButton();
    setTimeout(() => Render.resize(), 0);
    const boss = this.isBossCh(mr);
    UI.cutin('MOD 第' + (mr.ch + 1) + '章', (boss ? 'ボスの章　' : '') + MOD_COND[mr.cond].name + ' ─ ' + MOD_COND[mr.cond].line, boss ? 'boss' : 'prep');
  },
  afterChapter(res) {
    if (res.end) { this.showEnd(res.end, res); return; }
    this.showPick(res);
  },

  // ---------- 改造の3択（確認室の見本は demo＝{ mr, evo }） ----------
  showPick(res, demo) {
    const mr = demo ? demo.mr : this.state();
    if (!mr || !mr.offer) return;
    const offer = mr.offer;
    if (!offer.ids.length && !demo) { this.skip(mr, Game.perm); Game.save(); this.enter(); return; }
    const body = Util.el('div', 'draft fx mdpick');
    const hot = offer.ids.map(id => BAL.rarity[MODS[id].rar]).filter(r => r.glow >= 2).sort((a, b) => b.glow - a.glow)[0];
    if (hot) body.style.setProperty('--rk', hot.color);
    const title = offer.boss ? '代償つきの改造' : '改造';
    const sub = demo ? '見本　選んでも何も変わりません' : (res ? '第' + res.ch + '章 突破' + (res.pts ? '　+' + res.pts + ' MP' : '') + '　' : '') + '1つ選ぶ';
    body.appendChild(UI.choiceHead(title, sub, offer.boss ? '// BOSS DOWN　PRICE MOD' : '// MOD SELECT'));
    const top = Util.el('div', 'mdtop');
    top.appendChild(this.strip(mr));
    top.insertAdjacentHTML('beforeend', '<span class="mdlives">LIFE <b>' + mr.lives + '</b>/' + mr.livesMax + '</span>');
    body.appendChild(top);
    const row = Util.el('div', 'chrow' + (offer.ids.length > 3 ? ' md5' : ''));
    offer.ids.forEach((id, i) => {
      const m = MODS[id];
      const el = Util.el('button', 'chcard pick cfpick' + (BAL.rarity[m.rar].glow >= 2 ? ' hot' : ''));
      el.style.setProperty('--dl', (0.12 + i * 0.09).toFixed(2) + 's');
      const face = Util.el('div', 'ch-face g' + BAL.rarity[m.rar].glow);
      face.style.setProperty('--rc', BAL.rarity[m.rar].color);
      const front = Util.el('div', 'ch-front');
      front.appendChild(this.face(id, { mr }));
      const back = CardFX.back(m.rar); back.classList.add('ch-back');
      face.appendChild(front); face.appendChild(back);
      el.appendChild(face);
      el.insertAdjacentHTML('beforeend', '<div class="chtype" style="color:' + MOD_SYS[m.sys[0]].col + '">' + m.sys.map(s => MOD_SYS[s].en).join(' + ') + '</div>');
      el.addEventListener('click', () => {
        if (row.classList.contains('done')) return;
        row.classList.add('done'); el.classList.add('sel');
        const fr = face.getBoundingClientRect();
        CardFX.hexShock(UI.el.modal, fr.left + fr.width / 2, fr.top + fr.height / 2, MOD_SYS[m.sys[0]].col, true);
        Snd.ui();
        let tk = null;
        if (!demo) { tk = this.take(mr, id); Game.save(); }
        setTimeout(() => {
          UI.closeModal();
          if (demo) {
            UI.toastMsg('見本: ' + m.name, MOD_SYS[m.sys[0]].col, 'select');
            if (demo.evo) this.evoFx(demo.evo); else if (m.need) this.linkFx(id);
            return;
          }
          this.enter();
          const evo = tk && tk.evo;
          if (evo && evo.length) setTimeout(() => this.evoFx(evo[0]), 1700);
          else if (m.need) setTimeout(() => this.linkFx(id), 1700);
        }, 380);
      });
      row.appendChild(el);
    });
    body.appendChild(row);
    const act = Util.el('div', 'rs-subs mdact');
    const rr = Util.el('button', 'rs-sub');
    rr.innerHTML = Icons.get('cycle') + '引き直し ' + mr.rerolls;
    rr.disabled = mr.rerolls <= 0;
    rr.addEventListener('click', () => {
      if (row.classList.contains('done')) return;
      if (demo) { UI.toastMsg('見本：引き直し', '#ffc24a', 'select'); return; }
      if (!this.reroll(mr)) return;
      Game.save(); Snd.ui();
      UI.closeModal(); this.showPick(res);
    });
    const sk = Util.el('button', 'rs-sub');
    const pass = this.has(mr, 'passer') ? this.M('passer').pts : 0;
    sk.innerHTML = Icons.get('close') + '<span>見送る' + (pass ? '　MP +' + pass : '') + '</span>';
    sk.addEventListener('click', () => {
      if (row.classList.contains('done')) return;
      if (demo) { UI.toastMsg('見本：見送り', '#ffc24a', 'select'); return; }
      if (sk.dataset.arm !== '1' && !pass) { sk.dataset.arm = '1'; sk.lastChild.textContent = 'もう一度押すと見送る'; return; }
      const got = this.skip(mr, Game.perm);
      Game.save();
      UI.closeModal();
      if (got) UI.toastMsg('見送り　MP +' + got, MOD_SYS.greed.col, 'select');
      this.enter();
    });
    act.appendChild(rr); act.appendChild(sk);
    body.appendChild(act);
    UI.openModal(body, true);
    setTimeout(() => { body.querySelectorAll('.ch-back, .ch-sweep').forEach(x => x.remove()); }, 1200);
  },
  evoFx(sys) {
    const E = MOD_EVO[sys];
    UI.cutin(E.name, E.line, 'evo', MOD_SYS[sys].col);
    if (Snd.stageClear) Snd.stageClear();
  },
  linkFx(id) {
    const m = MODS[id];
    UI.cutin(m.name, this.lineText(m.line), 'evo', MOD_SYS[m.sys[0]].col);
  },

  // ---------- ランの終わり（踏破・負け・やめた） ----------
  showEnd(end) {
    if (!end) { Main.toHome(); return; }
    const B = BAL.modRun;
    const body = Util.el('div', 'rs ' + (end.won ? 'rs-perfect' : end.cleared ? 'rs-clear' : 'rs-lose') + ' mdend');
    body.innerHTML = '<div class="rs-ban"><i class="rs-sweep"></i><em>' + (end.won ? '// MOD RUN COMPLETE' : '// MOD RUN TERMINATED') + '</em><b>' + (end.won ? 'COMPLETE' : 'END') + '</b>' +
      '<span>' + (end.won ? '全' + B.chapters + '章 踏破' : '第' + end.cleared + '章まで突破') + '</span></div>';
    const mp = Util.el('div', 'mdend-mp');
    mp.innerHTML = this.mpIcon() + '<b data-to="' + end.pts + '">+0</b><em>MP</em><span>所持 ' + end.total + '</span>';
    body.appendChild(mp);
    const ln = Util.el('div', 'rs-line');
    ln.innerHTML = '<span>突破 <b>' + end.cleared + '/' + B.chapters + '</b></span><span>改造 <b>' + end.mods.length + '</b></span><span>条件 <b>' + MOD_COND[end.cond].name + '</b></span>';
    body.appendChild(ln);
    body.appendChild(this.strip({ mods: end.mods }));
    const go = Util.el('button', 'rs-go');
    go.innerHTML = '<span>戻る</span><b>MOD 基地</b>' + Icons.get('play');
    go.addEventListener('click', () => { UI.closeModal(); if (this._demo) { if (!this._demoBase) this._demo = null; return; } Main.toHome(); });
    body.appendChild(go);
    UI.openModal(body, true);
    UI.el.modal.classList.add('rsmodal');
    UI._rsFx(body, end.won ? '#ffe27a' : end.cleared ? '#c26bff' : '#ff4a66', { perfect: end.won });
    // MP の数え上がり（VFD）
    const b = mp.querySelector('b'), to = end.pts, t0 = performance.now();
    const tick = (t) => { const k = Math.min(1, (t - t0 - 500) / 900); if (k > 0) b.textContent = '+' + Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1 && b.isConnected) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  },

  // ---------- 戦闘中の札（盤の右上） ----------
  hud(run) {
    let b = document.getElementById('mrBadge');
    const on = run && run.mr && document.body.classList.contains('on-battle');
    if (!on) { if (b) b.style.display = 'none'; return; }
    if (!b) {
      b = Util.el('button', 'mrbadge'); b.id = 'mrBadge';
      b.addEventListener('click', () => this.showList());
      (document.getElementById('stage') || document.body).appendChild(b);
    }
    const mr = run.mr, key = mr.ch + '|' + mr.mods.join(',');
    b.style.display = '';
    if (b.dataset.k === key) return;
    b.dataset.k = key;
    b.innerHTML = '<em>MOD ' + (mr.ch + 1) + '/' + BAL.modRun.chapters + '</em>' + mr.mods.map(id => '<i style="--pc:' + MOD_SYS[MODS[id].sys[0]].col + '">' + MODS[id].g + '</i>').join('');
  },
  showList() {
    const run = Game.run, mr = run && run.mr;
    if (!mr) return;
    const body = Util.el('div', 'draft mdlist');
    body.appendChild(UI.choiceHead('改造', '第' + (mr.ch + 1) + '章 / ' + BAL.modRun.chapters, '// MOD LIST'));
    body.appendChild(this.condEl(mr));
    const row = Util.el('div', 'mdgrid');
    for (const id of mr.mods) row.appendChild(this.face(id, { mr, owned: true }));
    if (!mr.mods.length) row.innerHTML = '<span class="mdnone">改造なし</span>';
    body.appendChild(row);
    const subs = Util.el('div', 'rs-subs');
    const close = Util.el('button', 'rs-sub');
    close.innerHTML = Icons.get('close') + '閉じる';
    close.addEventListener('click', () => UI.closeModal());
    subs.appendChild(close);
    body.appendChild(subs);
    Game.paused = true;
    UI.openModal(body, false);
  },

  // ---------- 確認室の見本（セーブは変えない） ----------
  demoMr(mods) {
    return { seed: 7, ch: 2, mods: mods || [], banned: [], rerolls: 2, skips: 0, lives: 24, livesMax: 30, cond: 'few', weapons: ['gatling', 'katana', 'flame'], hist: [], cap: 15, pts: 85 };
  },
  demoPerm(withRun) {
    const tree = { life1: 1, life2: 1, cost1: 1, cost2: 1, reroll1: 1, w_katana: 1, w_flame: 1, w_mortar: 1, m_bet: 1 };
    const mr = withRun ? Object.assign(this.demoMr(['glass', 'zero', 'backtoback']), { ch: 4, status: 'chapter' }) : null;
    return { collection: {}, packs: {}, asc: { lv: 1 }, mod: { v: 1, pts: 340, earned: 1260, tree, run: mr, rec: { runs: 9, wins: 1, best: 8, bossKills: 11 } } };
  },
  demoBase(withRun) { this.openBase({ perm: this.demoPerm(withRun) }); },
  demoTree() { this._demo = { perm: this.demoPerm(false) }; this.showTree(); },
  demoPick() {
    const mr = this.demoMr(['glass', 'zero']);
    mr.offer = { ids: ['backtoback', 'premonition', 'shatter'], boss: false };
    this.showPick(null, { mr });
  },
  demoEvo() {
    const mr = this.demoMr(['shatter', 'breakparty']);
    mr.offer = { ids: ['cascade', 'glass', 'free'], boss: false };
    this.showPick(null, { mr, evo: 'hit' });
  },
  demoLink() {
    const mr = this.demoMr(['backtoback', 'premonition']);
    mr.offer = { ids: ['corridor', 'family', 'inherit'], boss: false };
    this.showPick(null, { mr });
  },
  demoBoss() {
    const mr = this.demoMr(['glass', 'backwater', 'zero', 'family']);
    mr.offer = { ids: ['overclock', 'nova', 'hive'], boss: true };
    this.showPick(null, { mr });
  },
  demoGacha() {
    const mr = this.demoMr(['gacha']);
    mr.offer = { ids: ['backtoback', 'family', 'premonition', 'debt', 'zero'], boss: false };
    this.showPick(null, { mr });
  },
  demoEnd(won) {
    this._demo = { perm: this.demoPerm(false) };
    this.showEnd({ won, cleared: won ? 8 : 5, pts: won ? 642 : 165, total: won ? 982 : 505, mods: ['glass', 'backwater', 'kamikaze', 'zero', 'overclock'], cond: 'fast' });
  },
});
