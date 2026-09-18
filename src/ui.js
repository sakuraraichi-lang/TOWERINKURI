// ---------------------------------------------------------------
// ui.js : DOM側のUI（HUD・武器トレイ・ステージ・スキル・編成・コレクション・パック）
// ---------------------------------------------------------------
'use strict';

const SRC_LABEL = { start: '初期装備', stage: 'ステージ報酬', pack: 'パック限定' };

const UI = {
  tab: 'skill',
  el: {},
  draftOpen: false,
  placing: null,      // 配置中の武器
  skillRows: null,

  init() {
    const q = (id) => document.getElementById(id);
    this.el = {
      hudWave: q('hudWave'), hudPhase: q('hudPhase'), hudCoin: q('hudCoin'),
      hudHp: q('hudHp'), hudHpBar: q('hudHpBar'), hudXpBar: q('hudXpBar'), hudLv: q('hudLv'),
      hudDps: q('hudDps'), hudStage: q('hudStage'), tray: q('tray'),
      panel: q('panel'), tabs: q('tabs'), modal: q('modal'),
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
    this.renderTray();
  },

  // ================= HUD =================
  renderHud() {
    const r = Game.run;
    this.el.hudCoin.textContent = Util.fmt(Game.meta.coins);
    const np = (Game.perm.packs.basic || 0) + (Game.perm.packs.rare || 0) + (Game.perm.packs.epic || 0);
    this.el.badgePack.textContent = np;
    this.el.badgePack.style.display = np > 0 ? '' : 'none';

    this._sk = (this._sk || 0) + 1;
    if (this._sk % 12 === 0) this.refreshSkills();

    const stDef = STAGE_BY_ID[Game.perm.currentStage] || STAGES[0];
    if (!r) {
      this.el.hudStage.textContent = stDef.name;
      this.el.hudWave.textContent = '—';
      this.el.hudPhase.textContent = '待機中';
      this.el.hudHpBar.style.width = '0%';
      this.el.hudXpBar.style.width = '0%';
      this.el.hudLv.textContent = '-';
      this.el.hudHp.textContent = '';
      this.el.hudDps.textContent = '';
      return;
    }
    const def = STAGE_BY_ID[r.stageId];
    this.el.hudStage.textContent = def.name + '（突破 W' + def.clearWave + '）';
    this.el.hudWave.textContent = 'W' + r.wave + (Combat.isBossWave(r.wave) ? ' ★BOSS' : '');
    this.el.hudPhase.textContent = r.phase === 'spawn' ? '交戦中'
      : r.phase === 'clear' ? '残敵掃討' : '次ウェーブ ' + r.gapTimer.toFixed(1) + 's';
    this.el.hudHpBar.style.width = (Util.clamp(r.tower.hp / r.tower.maxHp, 0, 1) * 100) + '%';
    this.el.hudHp.textContent = Util.fmt(r.tower.hp) + ' / ' + Util.fmt(r.tower.maxHp);
    this.el.hudXpBar.style.width = (Util.clamp(r.xp / r.xpNeed, 0, 1) * 100) + '%';
    this.el.hudLv.textContent = 'Lv' + r.level;
    this.el.hudDps.textContent = '敵 ' + r.enemies.length + ' / 撃破 ' + Util.fmt(r.kills);
  },

  // 武器トレイ（タップして配置モードに入る）
  renderTray() {
    const t = this.el.tray;
    t.innerHTML = '';
    const run = Game.run;
    if (!run || run.over) { t.classList.remove('on'); return; }
    t.classList.add('on');
    for (const w of run.weapons) {
      const b = Util.el('button', 'chip' + (this.placing === w ? ' on' : ''));
      b.style.borderColor = w.def.color;
      b.innerHTML = '<b style="color:' + w.def.color + '">' + w.def.short + '</b>';
      b.addEventListener('click', () => {
        this.placing = (this.placing === w) ? null : w;
        this.renderTray();
        this.toastMsg(this.placing ? w.def.name + ' を置く壁をタップ' : '配置をやめました', w.def.color);
      });
      t.appendChild(b);
    }
    const hint = Util.el('span', 'trayhint', this.placing ? '光っている壁をタップ' : '武器を選んで配置');
    t.appendChild(hint);
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
    if (this.tab === 'stage') this.panelStages(p);
    else if (this.tab === 'skill') this.panelSkill(p);
    else if (this.tab === 'load') this.panelLoadout(p);
    else if (this.tab === 'coll') this.panelCollection(p);
    else if (this.tab === 'pack') this.panelPacks(p);
    else if (this.tab === 'pres') this.panelPrestige(p);
  },

  // ================= ステージ =================
  panelStages(p) {
    const head = Util.el('div', 'phead');
    head.innerHTML = '<b>ステージ</b><span class="sub">マップごとに通路と壁の形が違う。突破すると新しい武器カードが解放される</span>';
    p.appendChild(head);

    for (const s of STAGES) {
      const unlocked = Game.stageUnlocked(s.id);
      const rec = Game.stageRec(s.id);
      const cur = Game.perm.currentStage === s.id;
      const row = Util.el('div', 'strow' + (cur ? ' cur' : '') + (unlocked ? '' : ' locked'));
      const rw = (s.reward.cards || []).map(c => CARDS[c].name).concat(
        Object.entries(s.reward.packs || {}).map(([k, v]) => PACKS[k].name + '×' + v)).join(' / ');
      row.innerHTML =
        '<div class="stmini">' + this.miniMap(s) + '</div>' +
        '<div class="sbody">' +
          '<div class="sname">' + (unlocked ? s.name : '？？？') +
            (rec.cleared ? ' <em class="ok">突破済</em>' : ' <em>突破 W' + s.clearWave + '</em>') + '</div>' +
          '<div class="sdesc">' + (unlocked ? s.desc : '前のステージを突破すると解放') + '</div>' +
          '<div class="sdesc rw">初回報酬: ' + rw + (rec.bestWave ? '　／　自己ベスト W' + rec.bestWave : '') + '</div>' +
        '</div>';
      if (unlocked) {
        const b = Util.el('button', 'sbuy', cur ? '選択中' : '選ぶ');
        b.disabled = cur;
        b.addEventListener('click', () => {
          Game.perm.currentStage = s.id;
          Game.save();
          if (!Game.run || Game.run.over) { Render.fit(); }
          this.renderPanel();
          this.toastMsg(s.name + ' を選択', '#4ea8ff');
        });
        row.appendChild(b);
      }
      p.appendChild(row);
    }
    p.appendChild(Util.el('div', 'note', '※ ステージを変えると、次の出撃からそのマップになります'));
  },

  // パネルに出す小さなマップ図
  miniMap(s) {
    let out = '<svg viewBox="0 0 ' + s.map[0].length + ' ' + s.map.length + '" class="mm">';
    for (let r = 0; r < s.map.length; r++) {
      for (let c = 0; c < s.map[r].length; c++) {
        const ch = s.map[r][c];
        let col = null;
        if (ch === '#') col = '#22344c';
        else if (ch === 'S') col = '#ff4e63';
        else if (ch === 'C') col = '#5ec8ff';
        else if (ch === '.') col = '#0d1826';
        if (col) out += '<rect x="' + c + '" y="' + r + '" width="1" height="1" fill="' + col + '"/>';
      }
    }
    return out + '</svg>';
  },

  // ================= スキルツリー =================
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
    head.innerHTML = '<b>インクリメンタル・スキルツリー</b><span class="sub">コインで数字を大きくする。ラン中もいつでも買える／長押しで連続購入</span>';
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
      if (s.group !== group) { group = s.group; p.appendChild(Util.el('div', 'sgroup', group)); }
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
      const doBuy = () => { if (Skill.buy(Game.meta, Game.perm, s.id)) this.refreshSkills(); };
      btn.addEventListener('click', doBuy);
      btn.addEventListener('pointerdown', () => { hold = setTimeout(function rep() { doBuy(); hold = setTimeout(rep, 90); }, 420); });
      const stop = () => clearTimeout(hold);
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
    head.innerHTML = '<b>編成（最大4枠）</b><span class="sub">この4種で戦う。組み合わせでシナジーカードが抽選に出るようになる</span>';
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

    const ids = Game.loadoutWeapons();
    const syn = Util.el('div', 'synbox');
    syn.appendChild(Util.el('div', 'sgroup', 'この編成で狙えるシナジー'));
    for (const id of CARD_IDS) {
      const c = CARDS[id];
      if (c.kind !== 'synergy') continue;
      const ok = c.requires.every(w => ids.includes(w));
      const owned = Game.own(id) > 0;
      const row = Util.el('div', 'synrow' + (ok ? (owned ? ' on' : ' noown') : ' off'));
      row.innerHTML = '<span class="dot" style="background:' + BAL.rarity[c.rarity].color + '"></span>' +
        '<b>' + c.name + '</b>' +
        '<em>' + (!ok ? '編成が不足' : owned ? '抽選に出る' : '未所持') + '</em>' +
        '<span class="sdesc">' + c.desc + '</span>';
      syn.appendChild(row);
    }
    p.appendChild(syn);
    p.appendChild(Util.el('div', 'note', '※ 武器の置き場所は戦場の壁の上。画面下の武器チップを選んでから壁をタップします'));
  },

  pickWeapon(slot) {
    const owned = WEAPON_IDS.filter(wid => Game.own('wc_' + wid) > 0);
    const body = Util.el('div');
    body.appendChild(Util.el('h3', null, '枠 ' + (slot + 1) + ' に装備'));
    const list = Util.el('div', 'wlist');
    const mk = (cid) => {
      const b = Util.el('button', 'wpick');
      if (cid === null) b.innerHTML = '<b>外す</b>';
      else {
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
    body.appendChild(list);
    const miss = WEAPON_IDS.filter(wid => Game.own('wc_' + wid) === 0);
    if (miss.length) {
      body.appendChild(Util.el('div', 'sgroup', '未所持の武器'));
      for (const wid of miss) {
        const w = WEAPONS[wid];
        body.appendChild(Util.el('div', 'note',
          '・' + w.name + '　… ' + (w.src === 'stage' ? 'ステージ突破報酬' : 'カードパック')));
      }
    }
    this.openModal(body);
  },

  // ================= コレクション =================
  panelCollection(p) {
    const total = CARD_IDS.length;
    const have = CARD_IDS.filter(id => Game.own(id) > 0).length;
    const head = Util.el('div', 'phead');
    head.innerHTML = '<b>カードコレクション</b><span class="sub">' + have + ' / ' + total +
      ' 種類　永久資源。転生しても消えない。同じカードを重ねて持つと、1ランで重ねられる上限が上がる</span>';
    p.appendChild(head);

    const order = { weapon: 0, synergy: 1, mod: 2, generic: 3 };
    const ids = CARD_IDS.slice().sort((a, b) => {
      const ca = CARDS[a], cb = CARDS[b];
      return (order[ca.kind] - order[cb.kind]) ||
        (BAL.rarityOrder.indexOf(cb.rarity) - BAL.rarityOrder.indexOf(ca.rarity)) ||
        a.localeCompare(b);
    });
    const grid = Util.el('div', 'cgrid');
    for (const id of ids) grid.appendChild(this.cardEl(CARDS[id], { count: Game.own(id), dim: Game.own(id) === 0, small: true }));
    p.appendChild(grid);
  },

  // ================= パック =================
  panelPacks(p) {
    const head = Util.el('div', 'phead');
    head.innerHTML = '<b>カードパック</b><span class="sub">コインでは買えない。ボス突破・ステージ突破・転生・ミッションで手に入る。' +
      '刀・手裏剣・触手・泡といった変わり種の武器はここからしか出ない</span>';
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
    const isNew = ids.map(id => Game.own(id) === 0);
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

    let i = 0;
    const flipNext = () => {
      if (i >= ids.length) return;
      const c = CARDS[ids[i]];
      row.appendChild(this.cardEl(c, { reveal: true, isNew: isNew[i] }));
      if (BAL.rarity[c.rarity].glow >= 2) this.burst(BAL.rarity[c.rarity].color);
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
      '<div><span>突破ステージ</span><b>' + STAGES.filter(s => Game.stageRec(s.id).cleared).length + ' / ' + STAGES.length + '</b></div>' +
      '<div><span>総ラン数</span><b>' + perm.totalRuns + '</b></div>';
    p.appendChild(st);

    const n = Util.clamp(Math.floor(perm.bestWave / BAL.packPerPrestigeDiv), 1, BAL.packPerPrestigeMax);
    p.appendChild(Util.el('div', 'note', Game.canPrestige()
      ? '今転生すると カードパック 約' + n + '個 ＋ 永久コインボーナス +' + (BAL.prestigeCoinBonusPer * 100).toFixed(0) + '%'
      : 'ウェーブ ' + BAL.prestigeMinWave + ' に到達すると転生できます（現在の自己ベスト W' + perm.bestWave + '）'));
    p.appendChild(Util.el('div', 'note', '※ ステージの突破状況とカードコレクションは転生しても残ります'));

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
    body.appendChild(Util.el('p', 'note', 'コイン・スキルツリーは全て失われます。カードコレクションとステージ進行は残ります。'));
    const ok = Util.el('button', 'bigbtn danger', '転生する');
    ok.addEventListener('click', () => {
      const res = Game.prestige();
      Game.run = null;
      this.closeModal();
      this.renderTray();
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
      .map(k => '<div><span>' + PACKS[k].name + '</span><b>×' + res.reward[k] + '</b></div>').join('') ||
      '<div><span>報酬なし</span><b>-</b></div>';
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

  // ================= ステージ突破 =================
  showStageClear(got) {
    const body = Util.el('div');
    body.appendChild(Util.el('h3', null, '★ ' + got.stage.name + ' 突破！'));
    if (got.cards.length) {
      body.appendChild(Util.el('div', 'sgroup', '新しい武器カードを獲得'));
      const row = Util.el('div', 'popenrow');
      for (const cid of got.cards) row.appendChild(this.cardEl(CARDS[cid], { reveal: true, isNew: true }));
      body.appendChild(row);
      this.burst('#ffb020');
    }
    const pk = Object.entries(got.packs).map(([k, v]) => PACKS[k].name + ' ×' + v).join(' / ');
    if (pk) body.appendChild(Util.el('div', 'reward', '🎁 ' + pk));
    body.appendChild(Util.el('p', 'note', got.next
      ? '次のステージ「' + got.next.name + '」が解放されました。このランはこのまま続けられます。'
      : '全ステージ突破。あとはどこまでウェーブを伸ばせるか。'));
    const ok = Util.el('button', 'bigbtn', 'このランを続ける');
    ok.addEventListener('click', () => { this.closeModal(); });
    body.appendChild(ok);
    if (got.next) {
      const go = Util.el('button', 'linkbtn', '次のステージへ移動する（今のランは終了）');
      go.addEventListener('click', () => {
        this.closeModal();
        Game.perm.currentStage = got.next.id;
        Game.save();
        Main.finish();
      });
      body.appendChild(go);
    }
    this.openModal(body, true);
  },

  // ================= 3択カード =================
  eligibleCards() {
    const ids = Game.loadoutWeapons();
    const run = Game.run;
    return CARD_IDS.filter(id => {
      const c = CARDS[id];
      if (c.kind === 'weapon') return false;
      if (Game.own(id) <= 0) return false;
      if ((run.cards[id] || 0) >= Game.stackLimit(id)) return false;
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
      out.push(Util.pick(rem.filter(id => CARDS[id].rarity === pickR)));
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
    let wname;
    if (c.kind === 'weapon') wname = SRC_LABEL[WEAPONS[c.weapon].src] || '武器';
    else if (c.kind === 'synergy') wname = 'シナジー';
    else if (c.weapon) wname = WEAPONS[c.weapon].name;
    else wname = '汎用';
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
    body.appendChild(Util.el('h3', null, 'コアが破壊された'));
    const st = Util.el('div', 'stats');
    st.innerHTML =
      '<div><span>ステージ</span><b>' + res.stage.name + '</b></div>' +
      '<div><span>到達ウェーブ</span><b>' + res.wave + (res.newBest ? ' <em class="new">自己ベスト!</em>' : '') + '</b></div>' +
      '<div><span>撃破数</span><b>' + Util.fmt(res.kills) + '</b></div>' +
      '<div><span>獲得コイン</span><b>◈ ' + Util.fmt(res.coins) + '</b></div>';
    body.appendChild(st);

    if (res.packs > 0) {
      body.appendChild(Util.el('div', 'reward', '🎁 節目突破ボーナス： 基本パック ×' + res.packs));
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
