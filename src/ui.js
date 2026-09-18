// ---------------------------------------------------------------
// ui.js : DOM側のUI（HUD・スキルツリー・編成・コレクション・パック・3択）
// ---------------------------------------------------------------
'use strict';

const UI = {
  tab: 'skill',
  el: {},
  draftOpen: false,

  init() {
    const q = (id) => document.getElementById(id);
    this.el = {
      hudWave: q('hudWave'), hudPhase: q('hudPhase'), hudCoin: q('hudCoin'),
      hudHp: q('hudHp'), hudHpBar: q('hudHpBar'), hudXpBar: q('hudXpBar'), hudLv: q('hudLv'),
      hudDps: q('hudDps'), panel: q('panel'), tabs: q('tabs'), modal: q('modal'),
      toast: q('toast'), badgePack: q('badgePack'),
    };

    this.el.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      this.tab = b.dataset.tab;
      this.renderTabs();
      this.renderPanel();
    });

    this.renderTabs();
    this.renderPanel();
  },

  // ================= HUD =================
  renderHud() {
    const r = Game.run;
    this.el.hudCoin.textContent = Util.fmt(Game.meta.coins);
    this._sk = (this._sk || 0) + 1;
    if (this._sk % 12 === 0) this.refreshSkills();
    const np = (Game.perm.packs.basic || 0) + (Game.perm.packs.rare || 0) + (Game.perm.packs.epic || 0);
    this.el.badgePack.textContent = np;
    this.el.badgePack.style.display = np > 0 ? '' : 'none';

    if (!r) {
      this.el.hudWave.textContent = '—';
      this.el.hudPhase.textContent = '待機中';
      this.el.hudHpBar.style.width = '0%';
      this.el.hudXpBar.style.width = '0%';
      this.el.hudLv.textContent = '-';
      this.el.hudHp.textContent = '';
      this.el.hudDps.textContent = '';
      return;
    }
    this.el.hudWave.textContent = 'W' + r.wave + (Combat.isBossWave(r.wave) ? ' ★BOSS' : '');
    this.el.hudPhase.textContent = r.phase === 'spawn' ? '交戦中'
      : r.phase === 'clear' ? '残敵掃討' : '次ウェーブ ' + r.gapTimer.toFixed(1) + 's';
    this.el.hudHpBar.style.width = (Util.clamp(r.tower.hp / r.tower.maxHp, 0, 1) * 100) + '%';
    this.el.hudHp.textContent = Util.fmt(r.tower.hp) + ' / ' + Util.fmt(r.tower.maxHp);
    this.el.hudXpBar.style.width = (Util.clamp(r.xp / r.xpNeed, 0, 1) * 100) + '%';
    this.el.hudLv.textContent = 'Lv' + r.level;
    this.el.hudDps.textContent = '敵 ' + r.enemies.length + ' / 撃破 ' + Util.fmt(r.kills);
  },

  renderTabs() {
    for (const b of this.el.tabs.querySelectorAll('[data-tab]')) {
      b.classList.toggle('on', b.dataset.tab === this.tab);
    }
  },

  renderPanel() {
    const p = this.el.panel;
    p.innerHTML = '';
    this.skillRows = null;
    if (this.tab === 'skill') this.panelSkill(p);
    else if (this.tab === 'load') this.panelLoadout(p);
    else if (this.tab === 'coll') this.panelCollection(p);
    else if (this.tab === 'pack') this.panelPacks(p);
    else if (this.tab === 'pres') this.panelPrestige(p);
  },

  // ================= スキルツリー =================
  // コインは毎秒増えるので、レベル・価格・購入可否だけ軽く追従させる
  refreshSkills() {
    if (!this.skillRows) return;
    for (const r of this.skillRows) {
      const s = SKILL_BY_ID[r.id];
      const lv = Skill.lv(Game.meta, r.id);
      if (r.lv !== lv) {
        r.lv = lv;
        r.lvEl.textContent = 'Lv' + lv + (s.max !== Infinity ? '/' + s.max : '');
        r.btn.textContent = lv >= s.max ? 'MAX' : '◈ ' + Util.fmt(Skill.cost(Game.meta, r.id));
      }
      const can = Skill.canBuy(Game.meta, Game.perm, r.id);
      if (r.can !== can) {
        r.can = can;
        r.btn.disabled = !can;
        r.row.classList.toggle('can', can);
      }
    }
  },

  panelSkill(p) {
    const meta = Game.meta, perm = Game.perm;
    this.skillRows = [];
    const head = Util.el('div', 'phead');
    head.innerHTML = '<b>インクリメンタル・スキルツリー</b><span class="sub">コインで数字を大きくする。ラン中もいつでも買える</span>';
    p.appendChild(head);

    let group = null;
    for (const s of SKILLS) {
      if (!Skill.isUnlocked(perm, s.id)) {
        const row = Util.el('div', 'srow locked');
        row.innerHTML = '<div class="sic">🔒</div><div class="sbody"><div class="sname">？？？</div>' +
          '<div class="sdesc">ウェーブ ' + s.unlock + ' 到達で解放</div></div>';
        p.appendChild(row);
        continue;
      }
      if (s.group !== group) {
        group = s.group;
        p.appendChild(Util.el('div', 'sgroup', group));
      }
      const lv = Skill.lv(meta, s.id);
      const cost = Skill.cost(meta, s.id);
      const can = Skill.canBuy(meta, perm, s.id);
      const maxed = lv >= s.max;
      const row = Util.el('div', 'srow' + (can ? ' can' : ''));
      row.innerHTML =
        '<div class="sic">' + s.icon + '</div>' +
        '<div class="sbody"><div class="sname">' + s.name + ' <em>Lv' + lv + (s.max !== Infinity ? '/' + s.max : '') + '</em></div>' +
        '<div class="sdesc">' + s.desc + '</div></div>' +
        '<button class="sbuy"' + (can ? '' : ' disabled') + '>' + (maxed ? 'MAX' : '◈ ' + Util.fmt(cost)) + '</button>';
      const btn = row.querySelector('.sbuy');
      let hold = null;
      // パネルを作り直すとスクロール位置が飛ぶので、行だけ更新する
      const doBuy = () => {
        if (Skill.buy(Game.meta, Game.perm, s.id)) this.refreshSkills();
      };
      btn.addEventListener('click', doBuy);
      // 長押しで連続購入（インクリメンタルの手触り）
      btn.addEventListener('pointerdown', () => { hold = setTimeout(function rep() { doBuy(); hold = setTimeout(rep, 90); }, 420); });
      const stop = () => { clearTimeout(hold); };
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointerleave', stop);
      btn.addEventListener('pointercancel', stop);
      this.skillRows.push({ id: s.id, row, btn, can, lv, lvEl: row.querySelector('.sname em') });
      p.appendChild(row);
    }
  },

  // ================= 編成 =================
  panelLoadout(p) {
    const head = Util.el('div', 'phead');
    head.innerHTML = '<b>編成（最大4枠）</b><span class="sub">この4種で戦う。組み合わせでシナジーカードが解禁される</span>';
    p.appendChild(head);

    const slots = Util.el('div', 'slots');
    Game.perm.loadout.forEach((cid, i) => {
      const c = cid ? CARDS[cid] : null;
      const s = Util.el('button', 'slot' + (c ? ' filled' : ''));
      if (c) {
        const w = WEAPONS[c.weapon];
        s.style.borderColor = w.color;
        s.innerHTML = '<div class="sw" style="color:' + w.color + '">' + w.short + '</div>' +
          '<div class="sn">' + w.name + '</div><div class="sx">タップで変更</div>';
      } else {
        s.innerHTML = '<div class="sw dim">＋</div><div class="sn dim">空き枠</div><div class="sx">タップで装備</div>';
      }
      s.addEventListener('click', () => this.pickWeapon(i));
      slots.appendChild(s);
    });
    p.appendChild(slots);

    // シナジー表示
    const ids = Game.loadoutWeapons();
    const syn = Util.el('div', 'synbox');
    syn.appendChild(Util.el('div', 'sgroup', 'この編成で狙えるシナジー'));
    let any = false;
    for (const id of CARD_IDS) {
      const c = CARDS[id];
      if (c.kind !== 'synergy') continue;
      const ok = c.requires.every(w => ids.includes(w));
      const owned = Game.own(id) > 0;
      const row = Util.el('div', 'synrow' + (ok ? (owned ? ' on' : ' noown') : ' off'));
      row.innerHTML = '<span class="dot" style="background:' + BAL.rarity[c.rarity].color + '"></span>' +
        '<b>' + c.name + '</b><span class="sdesc">' + c.desc + '</span>' +
        '<em>' + (!ok ? '編成が不足' : owned ? '抽選に出る' : '未所持') + '</em>';
      syn.appendChild(row); any = true;
    }
    if (!any) syn.appendChild(Util.el('div', 'sdesc', '無し'));
    p.appendChild(syn);

    const note = Util.el('div', 'note');
    note.textContent = '※ 武器は戦場で直接ドラッグして動かせます（拠点から一定範囲内）';
    p.appendChild(note);
  },

  pickWeapon(slot) {
    const owned = WEAPON_IDS.filter(wid => Game.own('wc_' + wid) > 0);
    const body = Util.el('div');
    body.appendChild(Util.el('h3', null, '枠 ' + (slot + 1) + ' に装備'));
    const list = Util.el('div', 'wlist');
    const mk = (cid) => {
      const b = Util.el('button', 'wpick');
      if (cid === null) {
        b.innerHTML = '<b>外す</b>';
      } else {
        const w = WEAPONS[CARDS[cid].weapon];
        const used = Game.perm.loadout.includes(cid) && Game.perm.loadout[slot] !== cid;
        b.innerHTML = '<b style="color:' + w.color + '">' + w.name + '</b><span>' + w.desc + '</span>' +
          (used ? '<em>他の枠で使用中</em>' : '');
        if (used) b.disabled = true;
        b.style.borderColor = w.color + '66';
      }
      b.addEventListener('click', () => {
        Game.perm.loadout[slot] = cid;
        Game.save(); this.closeModal(); this.renderPanel();
      });
      return b;
    };
    for (const wid of owned) list.appendChild(mk('wc_' + wid));
    list.appendChild(mk(null));
    if (owned.length < 4) {
      const n = Util.el('div', 'note', '未所持の武器カードはカードパックから出ます');
      list.appendChild(n);
    }
    body.appendChild(list);
    this.openModal(body);
  },

  // ================= コレクション =================
  panelCollection(p) {
    const total = CARD_IDS.length;
    const have = CARD_IDS.filter(id => Game.own(id) > 0).length;
    const head = Util.el('div', 'phead');
    head.innerHTML = '<b>カードコレクション</b><span class="sub">' + have + ' / ' + total +
      ' 種類　永久資源。転生しても消えない</span>';
    p.appendChild(head);

    const order = { weapon: 0, synergy: 1, mod: 2, generic: 3 };
    const ids = CARD_IDS.slice().sort((a, b) => {
      const ca = CARDS[a], cb = CARDS[b];
      return (order[ca.kind] - order[cb.kind]) ||
        (BAL.rarityOrder.indexOf(cb.rarity) - BAL.rarityOrder.indexOf(ca.rarity)) ||
        a.localeCompare(b);
    });

    const grid = Util.el('div', 'cgrid');
    for (const id of ids) {
      const c = CARDS[id];
      const n = Game.own(id);
      grid.appendChild(this.cardEl(c, { count: n, dim: n === 0, small: true }));
    }
    p.appendChild(grid);
  },

  // ================= パック =================
  panelPacks(p) {
    const head = Util.el('div', 'phead');
    head.innerHTML = '<b>カードパック</b><span class="sub">コインでは買えない。ボス突破・転生・ミッションで手に入る</span>';
    p.appendChild(head);

    for (const pid of PACK_IDS) {
      const pk = PACKS[pid];
      const n = Game.perm.packs[pid] || 0;
      const unlocked = Pack.isUnlocked(Game.perm, pid);
      const row = Util.el('div', 'prow' + (n > 0 && unlocked ? ' can' : ''));
      row.innerHTML = '<div class="pico" style="background:' + pk.color + '22;border-color:' + pk.color + '">⬢</div>' +
        '<div class="sbody"><div class="sname">' + pk.name + ' <em>×' + n + '</em></div>' +
        '<div class="sdesc">' + (unlocked ? pk.size + '枚入り' + (pk.guarantee ? ' / ' + BAL.rarity[pk.guarantee].name + '以上1枚確定' : '')
          : 'ウェーブ ' + pk.unlock + ' 到達で解放') + '</div></div>' +
        '<button class="sbuy"' + (n > 0 && unlocked ? '' : ' disabled') + '>開封</button>';
      row.querySelector('.sbuy').addEventListener('click', () => this.openPack(pid));
      p.appendChild(row);
    }

    p.appendChild(Util.el('div', 'sgroup', 'ミッション'));
    for (const m of MISSIONS) {
      const done = !!Game.perm.missions[m.id];
      const row = Util.el('div', 'mrow' + (done ? ' done' : ''));
      const rw = Object.entries(m.reward).map(([k, v]) => PACKS[k].name + '×' + v).join(' / ');
      row.innerHTML = '<span>' + (done ? '✔' : '□') + '</span><b>' + m.name + '</b><em>' + rw + '</em>';
      p.appendChild(row);
    }
  },

  openPack(pid) {
    if ((Game.perm.packs[pid] || 0) <= 0) return;
    Game.perm.packs[pid]--;
    const luck = Skill.mods(Game.meta, Game.perm).packLuck;
    const ids = Pack.open(pid, luck);
    for (const id of ids) Game.grant(id, 1);
    Game.save();

    const pk = PACKS[pid];
    const body = Util.el('div', 'packopen');
    body.appendChild(Util.el('h3', null, pk.name + ' 開封'));
    const row = Util.el('div', 'popenrow');
    body.appendChild(row);
    const hint = Util.el('div', 'note', 'タップでめくる');
    body.appendChild(hint);
    this.openModal(body, true);

    // 1枚ずつめくる
    let i = 0;
    const flipNext = () => {
      if (i >= ids.length) return;
      const c = CARDS[ids[i]];
      const el = this.cardEl(c, { reveal: true, isNew: Game.own(ids[i]) === 1 });
      row.appendChild(el);
      // レアリティ演出
      const glow = BAL.rarity[c.rarity].glow;
      if (glow >= 2) this.burst(BAL.rarity[c.rarity].color);
      i++;
      if (i >= ids.length) {
        hint.textContent = '';
        const close = Util.el('button', 'bigbtn', '受け取る');
        close.addEventListener('click', () => { this.closeModal(); this.renderPanel(); });
        body.appendChild(close);
      }
    };
    body.addEventListener('click', (e) => { if (!e.target.closest('.bigbtn')) flipNext(); });
    flipNext();
  },

  burst(color) {
    const b = Util.el('div', 'burst');
    b.style.background = 'radial-gradient(circle,' + color + '88 0%, transparent 70%)';
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 620);
  },

  // ================= 転生 =================
  panelPrestige(p) {
    const perm = Game.perm;
    const head = Util.el('div', 'phead');
    head.innerHTML = '<b>転生</b><span class="sub">コインとスキルツリーを全て失う代わりに、カードパックと永久ボーナスを得る</span>';
    p.appendChild(head);

    const st = Util.el('div', 'stats');
    st.innerHTML =
      '<div><span>転生回数</span><b>' + perm.prestiges + '</b></div>' +
      '<div><span>永久コインボーナス</span><b>' + Util.pct(1 + perm.prestiges * BAL.prestigeCoinBonusPer) + '</b></div>' +
      '<div><span>自己ベスト</span><b>W' + perm.bestWave + '</b></div>' +
      '<div><span>累計撃破</span><b>' + Util.fmt(perm.totalKills) + '</b></div>' +
      '<div><span>総ラン数</span><b>' + perm.totalRuns + '</b></div>';
    p.appendChild(st);

    const n = Util.clamp(Math.floor(perm.bestWave / BAL.packPerPrestigeDiv), 1, BAL.packPerPrestigeMax);
    const info = Util.el('div', 'note');
    info.textContent = Game.canPrestige()
      ? '今転生すると カードパック 約' + n + '個 ＋ 永久コインボーナス +' + (BAL.prestigeCoinBonusPer * 100).toFixed(0) + '%'
      : 'ウェーブ ' + BAL.prestigeMinWave + ' に到達すると転生できます（現在の自己ベスト W' + perm.bestWave + '）';
    p.appendChild(info);

    const btn = Util.el('button', 'bigbtn danger', '転生する');
    btn.disabled = !Game.canPrestige();
    btn.addEventListener('click', () => this.confirmPrestige());
    p.appendChild(btn);

    const reset = Util.el('button', 'linkbtn', 'セーブデータを全消去');
    reset.addEventListener('click', () => {
      if (confirm('全てのデータ（カードコレクション含む）を消去します。よろしいですか？')) {
        Game.hardReset(); Game.run = null; Game.save(); location.reload();
      }
    });
    p.appendChild(reset);
  },

  confirmPrestige() {
    const body = Util.el('div');
    body.appendChild(Util.el('h3', null, '転生しますか？'));
    body.appendChild(Util.el('p', 'note', 'コイン・スキルツリーは全て失われます。カードコレクションは残ります。'));
    const ok = Util.el('button', 'bigbtn danger', '転生する');
    ok.addEventListener('click', () => {
      const res = Game.prestige();
      Game.run = null;
      this.closeModal();
      if (res) this.showPrestigeResult(res);
      this.renderPanel();
    });
    const no = Util.el('button', 'linkbtn', 'やめる');
    no.addEventListener('click', () => this.closeModal());
    body.appendChild(ok); body.appendChild(no);
    this.openModal(body);
  },

  showPrestigeResult(res) {
    const body = Util.el('div');
    body.appendChild(Util.el('h3', null, '転生 #' + res.prestiges + ' 完了'));
    const list = Util.el('div', 'stats');
    list.innerHTML = PACK_IDS.filter(k => res.reward[k] > 0)
      .map(k => '<div><span>' + PACKS[k].name + '</span><b>×' + res.reward[k] + '</b></div>').join('') || '<div><span>報酬なし</span><b>-</b></div>';
    body.appendChild(list);
    if (res.missions.length) {
      body.appendChild(Util.el('div', 'sgroup', 'ミッション達成'));
      for (const m of res.missions) body.appendChild(Util.el('div', 'note', '✔ ' + m.name));
    }
    const b = Util.el('button', 'bigbtn', 'パックを開けにいく');
    b.addEventListener('click', () => { this.closeModal(); this.tab = 'pack'; this.renderTabs(); this.renderPanel(); });
    body.appendChild(b);
    this.openModal(body);
  },

  // ================= 3択カード =================
  eligibleCards() {
    const ids = Game.loadoutWeapons();
    const run = Game.run;
    return CARD_IDS.filter(id => {
      const c = CARDS[id];
      if (c.kind === 'weapon') return false;
      if (Game.own(id) <= 0) return false;
      const have = run.cards[id] || 0;
      if (have >= Game.stackLimit(id)) return false;
      if (c.kind === 'mod') return ids.includes(c.weapon);
      if (c.kind === 'synergy') return c.requires.every(w => ids.includes(w));
      return true;
    });
  },

  rollDraft() {
    const pool = this.eligibleCards();
    if (!pool.length) return [];
    const luck = Game.run.mods.luck;
    const out = [];
    for (let i = 0; i < BAL.draftSize && out.length < pool.length; i++) {
      const rem = pool.filter(id => !out.includes(id));
      const rEnt = BAL.rarityOrder
        .map(r => ({ r, w: BAL.rarityWeight[r], n: rem.filter(id => CARDS[id].rarity === r).length }))
        .filter(e => e.n > 0);
      if (!rEnt.length) break;
      const pickR = Util.weighted(rEnt, e => Math.max(0.01, e.w * (1 + BAL.rarityDraftLuck[e.r] * luck * 0.05))).r;
      const cand = rem.filter(id => CARDS[id].rarity === pickR);
      out.push(Util.pick(cand));
    }
    return out;
  },

  showDraft() {
    const run = Game.run;
    if (!run || run.over) return;
    const ids = this.rollDraft();
    if (!ids.length) { run.pendingDrafts = Math.max(0, run.pendingDrafts - 1); return; }

    this.draftOpen = true;
    Game.paused = true;

    const body = Util.el('div', 'draft');
    body.appendChild(Util.el('h3', null, 'LEVEL ' + run.level + ' — カードを1枚選ぶ'));
    const row = Util.el('div', 'drow');
    for (const id of ids) {
      const c = CARDS[id];
      const el = this.cardEl(c, { pick: true, stacks: (run.cards[id] || 0) + 1, limit: Game.stackLimit(id) });
      el.addEventListener('click', () => {
        run.cards[id] = (run.cards[id] || 0) + 1;
        if (CARDS[id].apply) CARDS[id].apply(run);
        run.pendingDrafts = Math.max(0, run.pendingDrafts - 1);
        this.draftOpen = false;
        this.closeModal();
        Game.paused = false;
        this.toastMsg('取得: ' + c.name, BAL.rarity[c.rarity].color);
        if (run.pendingDrafts > 0) setTimeout(() => this.showDraft(), 260);
      });
      row.appendChild(el);
    }
    body.appendChild(row);
    this.openModal(body, true);
  },

  // ================= カードの見た目 =================
  cardEl(c, o) {
    o = o || {};
    const R = BAL.rarity[c.rarity];
    const el = Util.el('div', 'card r-' + c.rarity + (o.small ? ' small' : '') + (o.dim ? ' dim' : '') +
      (o.pick ? ' pick' : '') + (o.reveal ? ' reveal' : ''));
    el.style.setProperty('--rc', R.color);
    let sub = '';
    if (o.count !== undefined) sub = o.count > 0 ? '×' + o.count : '未所持';
    else if (o.stacks) sub = o.stacks + ' / ' + o.limit + ' 枚目';
    const wname = c.weapon ? WEAPONS[c.weapon].name : (c.kind === 'synergy' ? 'シナジー' : '汎用');
    el.innerHTML =
      '<div class="crar">' + R.name + '</div>' +
      '<div class="cwep">' + wname + '</div>' +
      '<div class="cname">' + c.name + '</div>' +
      '<div class="cdesc">' + c.desc + '</div>' +
      '<div class="cfoot">' + sub + (o.isNew ? ' <b class="new">NEW</b>' : '') + '</div>';
    return el;
  },

  // ================= 汎用モーダル =================
  openModal(body, noClose) {
    const m = this.el.modal;
    m.innerHTML = '';
    const box = Util.el('div', 'mbox');
    box.appendChild(body);
    m.appendChild(box);
    m.classList.add('on');
    m.dataset.noclose = noClose ? '1' : '';
  },

  closeModal() {
    this.el.modal.classList.remove('on');
    this.el.modal.innerHTML = '';
    if (!this.draftOpen) Game.paused = false;
  },

  toastMsg(txt, color) {
    const t = this.el.toast;
    t.textContent = txt;
    t.style.color = color || '#fff';
    t.classList.remove('on');
    void t.offsetWidth;
    t.classList.add('on');
  },

  // ================= ラン結果 =================
  showResult(res) {
    const body = Util.el('div');
    body.appendChild(Util.el('h3', null, res.wave > 0 ? '拠点が破壊された' : 'ラン終了'));
    const st = Util.el('div', 'stats');
    st.innerHTML =
      '<div><span>到達ウェーブ</span><b>' + res.wave + (res.newBest ? ' <em class="new">自己ベスト!</em>' : '') + '</b></div>' +
      '<div><span>撃破数</span><b>' + Util.fmt(res.kills) + '</b></div>' +
      '<div><span>獲得コイン</span><b>◈ ' + Util.fmt(res.coins) + '</b></div>';
    body.appendChild(st);

    if (res.packs > 0) {
      const g = Util.el('div', 'reward');
      g.innerHTML = '🎁 節目突破ボーナス： <b>基本パック ×' + res.packs + '</b>';
      body.appendChild(g);
    }
    if (res.missions && res.missions.length) {
      body.appendChild(Util.el('div', 'sgroup', 'ミッション達成'));
      for (const m of res.missions) body.appendChild(Util.el('div', 'note', '✔ ' + m.name));
    }
    body.appendChild(Util.el('p', 'note', 'コインとスキルツリーは残ります。そのまま次のランへ。'));

    const again = Util.el('button', 'bigbtn', 'もう一度出撃');
    again.addEventListener('click', () => { this.closeModal(); Main.startRun(); });
    body.appendChild(again);
    const back = Util.el('button', 'linkbtn', 'スキルを強化してから');
    back.addEventListener('click', () => { this.closeModal(); this.tab = 'skill'; this.renderTabs(); this.renderPanel(); });
    body.appendChild(back);

    this.openModal(body, true);
  },
};
