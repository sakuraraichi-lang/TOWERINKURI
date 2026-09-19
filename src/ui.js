// ---------------------------------------------------------------
// ui.js : DOM側のUI
//   準備フェーズ（スキル購入・編成・配置）と 戦闘（配置のみ）を分けて見せる
// ---------------------------------------------------------------
'use strict';

const SRC_LABEL = { start: '初期装備', stage: 'ステージ報酬', pack: 'パック限定' };

const UI = {
  tab: 'skill',
  el: {},
  draftOpen: false,
  placingType: null,     // 設置しようとしている武器id
  moving: null,          // 「配置を変える」で移動先を選んでいるユニット
  selected: null,      // 選んでいるユニット
  skillRows: null,

  pick: 0,               // ホームで選んでいるステージの番号

  init() {
    const q = (id) => document.getElementById(id);
    this.el = {
      hudPhase: q('hudPhase'), hudHp: q('hudHp'), hudHpBar: q('hudHpBar'),
      hudWaveTxt: q('hudWaveTxt'), tray: q('tray'),
      panel: q('panel'), tabs: q('tabs'), modal: q('modal'),
      toast: q('toast'), badgePack: q('badgePack'),
      upop: q('upop'), stage: q('stage'), tut: q('tut'),
      btnStart: q('btnStart'),
      homeCoin: q('homeCoin'), homeProg: q('homeProg'), homeLabel: q('homeLabel'),
      homeName: q('homeName'), homeDesc: q('homeDesc'), homeMini: q('homeMini'),
      homeStat: q('homeStat'), homeStart: q('homeStart'),
      homePrev: q('homePrev'), homeNext: q('homeNext'),
    };

    this.el.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      if (!Game.tabOpen(b.dataset.tab)) {
        this.toastMsg(this.lockWhy(b.dataset.tab), '#ff8080');
        return;
      }
      this.tab = b.dataset.tab;
      this.renderTabs();
      this.renderPanel();
    });

    this.el.homePrev.addEventListener('click', () => this.movePick(-1));
    this.el.homeNext.addEventListener('click', () => this.movePick(1));

    this.pick = Math.max(0, STAGES.findIndex(s => s.id === Game.perm.currentStage));
    this.renderTabs();
    this.renderPanel();
    this.renderTray();
  },

  lockWhy(id) {
    if (id === 'pack' || id === 'deck') return 'パックを手に入れると開きます';
    return '一度出撃すると開きます';
  },

  // ===== ホーム =====
  movePick(d) {
    const n = STAGES.length;
    this.pick = (this.pick + d + n) % n;
    this.renderHome();
  },

  renderHome() {
    const e = this.el;
    if (!e.homeName) return;
    const st = STAGES[this.pick];
    const rec = Game.stageRec(st.id);
    const open = Game.stageUnlocked(st.id);

    e.homeCoin.textContent = Util.fmt(Game.meta.coins);
    e.homeProg.textContent = '突破 ' + Game.clearedCount() + ' / ' + MAIN_STAGES.length;

    const mi = MAIN_STAGES.findIndex(x => x.id === st.id);
    e.homeLabel.textContent = st.experimental ? '実験用' : ('ステージ ' + (mi + 1));
    e.homeName.textContent = open ? st.name : '？？？';
    e.homeDesc.textContent = open ? st.desc : '前のステージを突破すると開きます';
    // miniMap は SVG の文字列を返す（Node ではない）
    e.homeMini.innerHTML = open ? this.miniMap(st) : '';

    const bits = [];
    if (rec.cleared) bits.push('★ 突破');
    if (rec.perfect) bits.push('★★ 完璧');
    if (rec.attempts) bits.push('挑戦 ' + rec.attempts + '回');
    if (st.experimental) bits.push('報酬なし');
    e.homeStat.textContent = bits.join('　');

    e.homeStart.disabled = !open;
    e.homeStart.textContent = open ? 'スタート' : 'ロック中';
    document.querySelector('.scard').classList.toggle('locked', !open);
  },

  // ===== 画面の切り替え =====
  setScreen(name) {
    document.body.classList.toggle('on-home', name === 'home');
    document.body.classList.toggle('on-battle', name === 'battle');
    if (name === 'home') { this.renderHome(); this.renderTabs(); this.renderPanel(); }
  },

  // ================= HUD =================
  renderHud() {
    const r = Game.run;
    const np = (Game.perm.packs.basic || 0) + (Game.perm.packs.arms || 0)
             + (Game.perm.packs.chem || 0) + (Game.perm.packs.syn || 0);
    if (this.el.badgePack) {
      // タブがまだ開いていないうちは、中身を匂わせない
      const show = np > 0 && Game.tabOpen('pack');
      this.el.badgePack.textContent = np;
      this.el.badgePack.style.display = show ? '' : 'none';
    }
    if (this.el.homeCoin && document.body.classList.contains('on-home')) {
      this.el.homeCoin.textContent = Util.fmt(Game.meta.coins);
    }
    if (!document.body.classList.contains('on-battle')) return;

    // なぞって視点を動かしても、調整バーは武器についていく
    if (this.selected) this.placeUnitPop();

    this._sk = (this._sk || 0) + 1;
    if (this._sk % 12 === 0) this.refreshSkills();
    if (!r) return;

    // **戦闘中に常時出すのは、フェーズ名・ライフ・残りだけ。**
    // 数字を並べるほど盤面が見えなくなる
    if (Game.phase === 'prep') {
      this.el.hudPhase.textContent = '準備フェーズ';
      this.el.hudWaveTxt.textContent = '全' + BAL.wavesPerStage + 'ウェーブ';
    } else if (r.phase === 'build') {
      this.el.hudPhase.textContent = 'ウェーブ ' + r.wave + ' 突破';
      this.el.hudWaveTxt.textContent = '次は ' + (r.wave + 1) + ' / ' + BAL.wavesPerStage;
    } else {
      this.el.hudPhase.textContent = 'ウェーブ ' + r.wave + ' / ' + BAL.wavesPerStage +
        (Combat.isLastWave(r) ? ' ★' : '');
      this.el.hudWaveTxt.textContent = '残り ' + Util.fmt(r.toSpawn + r.enemies.length);
    }

    const k = Util.clamp(r.lives / Math.max(1, r.livesMax), 0, 1);
    this.el.hudHpBar.style.transform = 'scaleX(' + k.toFixed(3) + ')';
    this.el.hudHp.textContent = Math.ceil(r.lives) + ' / ' + r.livesMax;
  },

  // 画面下のユニットバー。編成した4種を「配置済 / 上限」で出す
  renderTray() {
    const t = this.el.tray;
    t.innerHTML = '';
    const run = Game.run;
    if (!run || run.over) { t.classList.remove('on'); this.renderTut(); return; }
    t.classList.add('on');

    const build = Game.canBuild();
    this.renderUnitPop();
    this.renderTut();

    for (const cid of Game.perm.loadout) {
      if (!cid || !CARDS[cid]) continue;
      const wid = CARDS[cid].weapon;
      const def = WEAPONS[wid];
      const have = Game.unitCount(wid);
      const cap = Game.unitCap(wid);
      const full = have >= cap;
      const b = Util.el('button', 'chip unit' + (this.placingType === wid ? ' on' : '') + (full ? ' full' : ''));
      b.style.borderColor = def.color;
      b.innerHTML = '<b style="color:' + def.color + '">' + def.short + '</b>' +
        '<u>' + have + '/' + cap + '</u>';
      b.disabled = !build;
      b.addEventListener('click', () => {
        if (full) { this.toastMsg(def.name + ' はこれ以上置けません', '#ff8080'); return; }
        this.placingType = (this.placingType === wid) ? null : wid;
        this.renderTray();
        if (this.placingType) this.toastMsg(def.name + ' を置く地面をタップ', def.color);
      });
      t.appendChild(b);
    }
    t.appendChild(Util.el('span', 'trayhint',
      !build ? '戦闘中は配置を変えられません'
        : this.placingType ? '光っている地面をタップ' : 'ユニットを選んで配置／置いたものをタップで調整'));
  },

  // 選んだ武器の調整を、**その武器のすぐ横に**出す。
  // 画面下だと、どれを触っているのか目で追えなかった
  renderUnitPop() {
    const p = this.el.upop;
    if (!p) return;
    const u = this.selected;
    if (!u || !Game.run || Game.run.over) { p.classList.remove('on'); p.innerHTML = ''; return; }
    const build = Game.canBuild();

    p.innerHTML = '';
    p.classList.add('on');

    const info = Util.el('div', 'usel');
    info.innerHTML = '<b style="color:' + u.def.color + '">' + u.def.name + '</b>' +
      '<span id="uInfo">射界 ' + Math.round(u.arc * 2 * 180 / Math.PI) +
      '°　集弾 ' + Math.round(Game.groupingOf(u) * 100) + '%</span>';
    p.appendChild(info);

    // **向きも射界もバーで決める。**なぞって向けるのはスマホでうまく効かなかった
    const bar = (label, min, max, val, oninput) => {
      const wrap = Util.el('label', 'ubar');
      wrap.appendChild(Util.el('span', null, label));
      const r = Util.el('input');
      r.type = 'range'; r.min = min; r.max = max; r.step = 1; r.value = val;
      r.disabled = !build;
      r.addEventListener('input', () => oninput(+r.value));
      wrap.appendChild(r);
      return wrap;
    };
    let deg = Math.round(u.face * 180 / Math.PI); if (deg < 0) deg += 360;
    p.appendChild(bar('向き', 0, 359, deg, (v) => {
      Game.aimUnit(u, v * Math.PI / 180);
      this.tutAimed = true;
      Game.save();
    }));
    const arcPct = Math.round((u.arc - BAL.arcMin) / (BAL.arcMax - BAL.arcMin) * 100);
    p.appendChild(bar('射界', 0, 100, arcPct, (v) => {
      const want = BAL.arcMin + (BAL.arcMax - BAL.arcMin) * (v / 100);
      Game.setArc(u, want - u.arc);
      this.tutAimed = true;
      const el = document.getElementById('uInfo');
      if (el) el.textContent = '射界 ' + Math.round(u.arc * 2 * 180 / Math.PI) +
        '°　集弾 ' + Math.round(Game.groupingOf(u) * 100) + '%';
      Game.save();
    }));

    const row = Util.el('div', 'urow');
    const mk = (label, fn, cls) => {
      const b = Util.el('button', 'chip ' + (cls || ''), label);
      b.disabled = !build;
      b.addEventListener('click', fn);
      return b;
    };
    row.appendChild(mk('移動', () => {
      this.moving = u; this.placingType = null; this.renderTray();
    }));
    row.appendChild(mk('撤去', () => {
      if (Game.removeUnit(u)) { this.selected = null; this.moving = null; this.renderTray(); Game.save(); }
    }, 'danger'));
    row.appendChild(mk('閉じる', () => { this.selected = null; this.moving = null; this.renderTray(); }));
    p.appendChild(row);

    if (this.moving) p.appendChild(Util.el('div', 'trayhint', '光っているところをタップ'));
    if (!build) p.appendChild(Util.el('div', 'trayhint', '戦闘中は動かせません'));

    this.placeUnitPop();
  },

  // 武器の横に置く。**画面からはみ出すときは反対側へ回す**
  placeUnitPop() {
    const p = this.el.upop;
    const u = this.selected;
    if (!p || !u || !p.classList.contains('on')) return;
    const host = this.el.stage.getBoundingClientRect();
    const at = Render.toClient(u.x, u.y);
    const w = p.offsetWidth || 190, h = p.offsetHeight || 150;
    const gap = TILE * Render.scale * 0.7;

    let x = at.x - host.left + gap;
    if (x + w > host.width - 6) x = at.x - host.left - gap - w;
    let y = at.y - host.top - h / 2;

    p.style.left = Util.clamp(x, 6, Math.max(6, host.width - w - 6)) + 'px';
    p.style.top = Util.clamp(y, 6, Math.max(6, host.height - h - 6)) + 'px';
  },

  // ============ チュートリアル ============
  // **一度に1操作しか教えない。** 全部並べると読まれない。
  // 進み方は perm.tut に持つので、途中でやめても続きから出る
  TUT: [
    { t: '左上の武器をひとつ選ぶ',      s: 'GAT はガトリング、SNP はスナイパー' },
    { t: '光っている地面をタップして置く', s: '置けるのは地面（壁）の上だけ' },
    { t: '武器の横のバーで、向きを敵のほうへ', s: '射界を広げると守備範囲が増え、集弾が落ちる' },
    { t: '右下の「準備完了」で始まる',    s: '置き直しはウェーブの合間にできる' },
    { t: 'あとは眺めるだけ',            s: '倒すと ◈ が増える。負けても持ち帰れる' },
  ],

  // 今のステップが済んだかを、盤面の状態から見る（押させるボタンは作らない）
  tutDone(i) {
    const run = Game.run;
    switch (i) {
      case 0: return !!this.placingType || (run && run.units.length > 0);
      case 1: return !!(run && run.units.length > 0);
      case 2: return !!this.tutAimed;
      case 3: return Game.phase === 'battle';
      case 4: return !!(run && run.wave > 1);
      default: return true;
    }
  },

  renderTut() {
    const p = this.el.tut;
    if (!p) return;
    const run = Game.run;
    // 最後まで見せたあとに出撃が終わったら、そこで畳む。
    // **ウェーブ1で負けると wave は 2 にならない**ので、これが無いと次の出撃でも
    // 「あとは眺めるだけ」が準備フェーズに出てしまう
    if (run && run.over && (Game.perm.tut || 0) === this.TUT.length - 1) {
      Game.perm.tut = this.TUT.length;
      Game.save();
    }
    // 2回目以降の出撃では出さない。**一度覚えたものを毎回見せない**
    if (!run || run.over || Game.perm.totalRuns > 1 || (Game.perm.tut || 0) >= this.TUT.length) {
      p.classList.remove('on'); p.innerHTML = ''; return;
    }

    let i = Game.perm.tut || 0;
    while (i < this.TUT.length && this.tutDone(i)) i++;
    if (i !== (Game.perm.tut || 0)) { Game.perm.tut = i; Game.save(); }
    if (i >= this.TUT.length) { p.classList.remove('on'); p.innerHTML = ''; return; }

    const step = this.TUT[i];
    const html = '<i>' + (i + 1) + ' / ' + this.TUT.length + '</i>' +
      '<b>' + step.t + '</b><span>' + step.s + '</span>';
    if (p.innerHTML !== html) p.innerHTML = html;
    p.classList.add('on');
  },

  renderTabs() {
    for (const b of this.el.tabs.querySelectorAll('[data-tab]')) {
      const id = b.dataset.tab;
      const open = Game.tabOpen(id);
      b.classList.toggle('lock', !open);
      b.classList.toggle('on', open && id === this.tab);
    }
  },

  renderPanel() {
    const p = this.el.panel;
    p.innerHTML = '';
    this.skillRows = null;

    // **開いていないタブの中身は出さない。**
    // 一度に全部見せないのが狙いなので、ここで見えてしまうと意味が無い
    if (!Game.tabOpen(this.tab)) {
      p.classList.add('empty');
      const d = Util.el('div', 'panelhint');
      d.innerHTML = Game.perm.totalRuns > 0
        ? '<b>' + this.lockWhy(this.tab) + '</b>'
        : 'まずは<b>スタート</b>を押して、一度戦ってみよう。<br>' +
          '<span class="dim">戦い終わると、下のタブが開きます。</span>';
      p.appendChild(d);
      return;
    }
    p.classList.remove('empty');

    if (this.tab === 'stage') this.panelStages(p);
    else if (this.tab === 'skill') this.panelSkill(p);
    else if (this.tab === 'load') this.panelLoadout(p);
    else if (this.tab === 'coll') this.panelCollection(p);
    else if (this.tab === 'pack') this.panelPacks(p);
    else if (this.tab === 'pres') this.panelPrestige(p);
    else if (this.tab === 'deck') this.panelDeck(p);
  },

  // ================= ステージ =================
  panelStages(p) {
    const head = Util.el('div', 'phead');
    head.innerHTML = '<b>ステージ</b><span class="sub">1ステージ＝' + BAL.wavesPerStage +
      'ウェーブ。全部凌げば突破。<b>1体も通さず凌ぐと「完璧クリア」でカードパック</b></span>';
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
            (rec.perfect ? ' <em class="ok">★完璧</em>' : rec.cleared ? ' <em class="ok">突破済</em>' : ' <em>未突破</em>') + '</div>' +
          '<div class="sdesc">' + (unlocked ? s.desc : '前のステージを突破すると解放') + '</div>' +
          '<div class="sdesc rw">初回報酬: ' + rw +
            (rec.attempts ? '　／　挑戦 ' + rec.attempts + '回・最高 W' + rec.bestWave : '') + '</div>' +
        '</div>';
      if (unlocked) {
        const b = Util.el('button', 'sbuy', cur ? '選択中' : '選ぶ');
        b.disabled = cur || Game.phase === 'battle';
        b.addEventListener('click', () => {
          Game.perm.currentStage = s.id;
          UI.pick = STAGES.findIndex(x => x.id === s.id);
          Game.save();
          this.renderHome();
          this.toastMsg(s.name + ' を選択', '#4ea8ff');
        });
        row.appendChild(b);
      }
      p.appendChild(row);
    }
    if (Game.phase === 'battle') p.appendChild(Util.el('div', 'note', '※ 戦闘中はステージを変えられません'));
  },

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
    const canPhase = Game.canBuySkills();
    for (const r of this.skillRows) {
      const s = SKILL_BY_ID[r.id];
      const lv = Skill.lv(Game.meta, r.id);
      if (r.lv !== lv) {
        r.lv = lv;
        r.lvEl.textContent = 'Lv' + lv + (s.max !== Infinity ? '/' + s.max : '');
        r.btn.textContent = lv >= s.max ? 'MAX' : '◈ ' + Util.fmt(Skill.cost(Game.meta, r.id));
      }
      const can = canPhase && Skill.canBuy(Game.meta, Game.perm, r.id);
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
    head.innerHTML = '<b>アップグレード</b><span class="sub">コインで数字を大きくする。' +
      '火力は<b>武器カテゴリ単位</b>で伸ばす</span>';
    p.appendChild(head);

    if (!Game.canBuySkills()) {
      p.appendChild(Util.el('div', 'warn', '戦闘中は購入できません。撤退するか、ステージを終えてから。'));
    }

    let group = null;
    for (const s of SKILLS) {
      const unlocked = Skill.isUnlocked(perm, s.id);
      if (s.group !== group) {
        group = s.group;
        const g = Util.el('div', 'sgroup');
        const cat = s.cat ? CATEGORIES[s.cat] : null;
        g.innerHTML = cat
          ? '<span style="color:' + cat.color + '">' + cat.icon + ' ' + cat.name + '</span>' +
            '<i>' + cat.desc + '</i>'
          : group;
        p.appendChild(g);
      }
      if (!unlocked) {
        const row = Util.el('div', 'srow locked');
        row.innerHTML = '<div class="sic">🔒</div><div class="sbody"><div class="sname">？？？</div>' +
          '<div class="sdesc">' + Skill.lockReason(perm, s.id) + '</div></div>';
        p.appendChild(row);
        continue;
      }
      const lv = Skill.lv(meta, s.id);
      const cost = Skill.cost(meta, s.id);
      const can = Game.canBuySkills() && Skill.canBuy(meta, perm, s.id);
      const maxed = lv >= s.max;
      const row = Util.el('div', 'srow' + (can ? ' can' : ''));
      row.innerHTML =
        '<div class="sic">' + s.icon + '</div>' +
        '<div class="sbody"><div class="sname">' + s.name + ' <em>Lv' + lv + (s.max !== Infinity ? '/' + s.max : '') + '</em></div>' +
        '<div class="sdesc">' + Skill.desc(s) + '</div></div>' +
        '<button class="sbuy"' + (can ? '' : ' disabled') + '>' + (maxed ? 'MAX' : '◈ ' + Util.fmt(cost)) + '</button>';
      const btn = row.querySelector('.sbuy');
      let hold = null;
      const doBuy = () => {
        if (!Game.canBuySkills()) return;
        if (Skill.buy(Game.meta, Game.perm, s.id)) { Game.applyMods(); this.refreshSkills(); }
      };
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
    head.innerHTML = '<b>編成（' + BAL.loadoutSlots + '種類）</b><span class="sub">' +
      '使える武器の<b>種類</b>を4つ選ぶ。同じ武器は上限まで何基でも置ける</span>';
    p.appendChild(head);

    const slots = Util.el('div', 'slots');
    Game.perm.loadout.forEach((cid, i) => {
      const c = cid ? CARDS[cid] : null;
      const s = Util.el('button', 'slot' + (c ? ' filled' : ''));
      if (c) {
        const w = WEAPONS[c.weapon];
        const cat = CATEGORIES[w.cat];
        s.style.borderColor = w.color;
        s.innerHTML = '<div class="sw" style="color:' + w.color + '">' + w.short + '</div>' +
          '<div class="sn">' + w.name + '</div>' +
          '<div class="sx" style="color:' + cat.color + '">' + cat.icon + ' ' + cat.name +
          '　最大' + Game.unitCap(w.id) + '基</div>';
      } else {
        s.innerHTML = '<div class="sw dim">＋</div><div class="sn dim">空き枠</div><div class="sx">タップで装備</div>';
      }
      s.disabled = Game.phase === 'battle';
      s.addEventListener('click', () => this.pickWeapon(i));
      slots.appendChild(s);
    });
    p.appendChild(slots);
    if (Game.phase === 'battle') p.appendChild(Util.el('div', 'warn', '戦闘中は編成を変えられません'));

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
        '<b>' + c.name + '</b><em>' + (!ok ? '編成が不足' : owned ? '抽選に出る' : '未所持') + '</em>' +
        '<span class="sdesc">' + c.desc + '</span>';
      syn.appendChild(row);
    }
    p.appendChild(syn);
  },

  pickWeapon(slot) {
    if (Game.phase === 'battle') return;
    const body = Util.el('div');
    body.appendChild(Util.el('h3', null, '枠 ' + (slot + 1) + ' に装備'));
    const list = Util.el('div', 'wlist');
    const mk = (cid) => {
      const b = Util.el('button', 'wpick');
      if (cid === null) b.innerHTML = '<b>外す</b>';
      else {
        const w = WEAPONS[CARDS[cid].weapon];
        const cat = CATEGORIES[w.cat];
        const used = Game.perm.loadout.includes(cid) && Game.perm.loadout[slot] !== cid;
        b.innerHTML = '<b style="color:' + w.color + '">' + w.name +
          ' <i style="color:' + cat.color + '">' + cat.icon + ' ' + cat.name + '</i></b>' +
          '<span>' + w.desc + '</span>' + (used ? '<em>他の枠で使用中</em>' : '');
        if (used) b.disabled = true;
        b.style.borderColor = w.color + '66';
      }
      b.addEventListener('click', () => {
        Game.perm.loadout[slot] = cid;
        Game.save(); this.closeModal();
        // ホームで装備を変えただけなら盤面を作り直す必要は無い
        if (document.body.classList.contains('on-battle')) Main.toPrep();
        else this.renderPanel();
      });
      return b;
    };
    // カテゴリごとに並べる
    for (const cat of CATEGORY_IDS) {
      const owned = WEAPON_IDS.filter(wid => WEAPONS[wid].cat === cat && Game.own('wc_' + wid) > 0);
      if (!owned.length) continue;
      const h = Util.el('div', 'sgroup');
      h.innerHTML = '<span style="color:' + CATEGORIES[cat].color + '">' +
        CATEGORIES[cat].icon + ' ' + CATEGORIES[cat].name + '</span>';
      list.appendChild(h);
      for (const wid of owned) list.appendChild(mk('wc_' + wid));
    }
    list.appendChild(mk(null));
    body.appendChild(list);

    const miss = WEAPON_IDS.filter(wid => Game.own('wc_' + wid) === 0);
    if (miss.length) {
      body.appendChild(Util.el('div', 'sgroup', '未所持の武器'));
      for (const wid of miss) {
        const w = WEAPONS[wid];
        body.appendChild(Util.el('div', 'note',
          '・' + w.name + '（' + CATEGORIES[w.cat].name + '）… ' +
          (w.src === 'stage' ? 'ステージ突破報酬' : 'カードパック')));
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
      ' 種類　永久資源。同じカードを重ねて持つほど、カード選択に顔を出しやすくなる</span>';
    p.appendChild(head);

    const order = { weapon: 0, synergy: 1, mod: 2, generic: 3 };
    const ids = CARD_IDS.slice().sort((a, b) => {
      const ca = CARDS[a], cb = CARDS[b];
      return (order[ca.kind] - order[cb.kind]) ||
        (BAL.rarityOrder.indexOf(cb.rarity) - BAL.rarityOrder.indexOf(ca.rarity)) || a.localeCompare(b);
    });
    const grid = Util.el('div', 'cgrid');
    for (const id of ids) grid.appendChild(this.cardEl(CARDS[id], { count: Game.own(id), dim: Game.own(id) === 0, small: true }));
    p.appendChild(grid);
  },

  // ================= パック =================
  panelPacks(p) {
    const head = Util.el('div', 'phead');
    head.innerHTML = '<b>カードパック</b><span class="sub">コインでは買えない。<b>完璧クリア</b>・ステージ突破・転生・ミッションで手に入る。<br>' +
      '<b>パックは分野で分かれている。</b>奥の分野は奥のステージまで行かないと掘れない</span>';
    p.appendChild(head);

    for (const pid of PACK_IDS) {
      const pk = PACKS[pid];
      const n = Game.perm.packs[pid] || 0;
      const unlocked = Pack.isUnlocked(Game.perm, pid);
      const row = Util.el('div', 'prow' + (n > 0 && unlocked ? ' can' : ''));
      row.innerHTML = '<div class="pico" style="background:' + pk.color + '22;border-color:' + pk.color + '">⬢</div>' +
        '<div class="sbody"><div class="sname">' + pk.name + ' <em>×' + n + '</em></div>' +
        '<div class="sdesc">' + (unlocked
          ? pk.desc + '<br>' + pk.size + '枚入り' + (pk.guarantee ? ' / ' + BAL.rarity[pk.guarantee].name + '以上1枚確定' : '')
          : 'ステージを ' + pk.unlock + ' 個突破すると解放') + '</div></div>' +
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
    head.innerHTML = '<b>転生</b><span class="sub">コインとアップグレードを全て失う代わりに、' +
      'カードパックと永久倍率を得る</span>';
    p.appendChild(head);

    const st = Util.el('div', 'stats');
    st.innerHTML =
      '<div><span>転生回数</span><b>' + perm.prestiges + '</b></div>' +
      '<div><span>永久倍率（火力・コイン）</span><b>×' + Util.fmt(Math.pow(BAL.prestigePower, perm.prestiges)) + '</b></div>' +
      '<div><span>突破ステージ</span><b>' + Game.clearedCount() + ' / ' + MAIN_STAGES.length + '</b></div>' +
      '<div><span>累計撃破</span><b>' + Util.fmt(perm.totalKills) + '</b></div>';
    p.appendChild(st);

    p.appendChild(Util.el('div', 'note', Game.canPrestige()
      ? '今転生すると カードパック 約' +
        Math.round(Math.pow(Game.clearedCount(), 1.7)) + '個 ＋ 火力とコインが永久に ×' +
        BAL.prestigePower + '（累積）。奥まで突破してから転生するほど、もらえる数が増えます'
      : 'ステージを ' + BAL.prestigeMinStages + ' 個突破すると転生できます（現在 ' + Game.clearedCount() + ' 個）'));
    p.appendChild(Util.el('div', 'warn', '※ 転生するとステージの突破状況も戻ります。もう一度突破すれば初回報酬と初回完璧クリアの報酬を取り直せます（カードとパックは残ります）'));

    const btn = Util.el('button', 'bigbtn danger', '転生する');
    btn.disabled = !Game.canPrestige() || Game.phase === 'battle';
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
    body.appendChild(Util.el('p', 'note', 'コインとアップグレードは全て失われ、ステージの突破状況も戻ります。カードとパックは残ります。'));
    const ok = Util.el('button', 'bigbtn danger', '転生する');
    ok.addEventListener('click', () => {
      const res = Game.prestige();
      this.closeModal();
      UI.pick = 0;
      Main.toHome();
      if (res) this.showPrestigeResult(res);
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
    const b = Util.el('button', 'bigbtn', 'パックを開けにいく');
    b.addEventListener('click', () => { this.closeModal(); this.tab = 'pack'; this.renderTabs(); this.renderPanel(); });
    body.appendChild(b);
    this.openModal(body);
  },

  // デッキ。**まだ枠だけ。**
  // 3択の抽選に入るカードを自分で組めるようにする場所だが、
  // カードの種類が増えてからでないと選ぶ意味が出ないので、今は説明だけ置く
  panelDeck(p) {
    p.appendChild(Util.el('h3', null, 'デッキ'));
    p.appendChild(Util.el('p', 'note',
      'ウェーブ突破ごとの3択に、どのカードを入れるかを自分で組む場所です。' +
      '**まだ作っていません。**カードが揃ってからでないと選ぶ意味が出ないので、先に置いてあります。'));
    const n = Object.keys(Game.perm.collection).length;
    p.appendChild(Util.el('div', 'sgroup', '今の手札'));
    p.appendChild(Util.el('p', 'note', 'カード ' + n + ' 種類を持っています。' +
      '今は持っているもの全部が3択の抽選に入ります。'));
  },

  // ================= カード選択（ウェーブ突破ごと） =================
  // 抽選の規則は src/draft.js に置いてある（測定器と同じものを使うため）
  eligibleCards() { return Draft.eligible(); },
  rollDraft(n) { return Draft.roll(n); },

  showDraft() {
    const run = Game.run;
    if (!run || run.over) return;
    const ids = this.rollDraft(run.mods.choices);
    if (!ids.length) { run.pendingPicks = 0; return; }

    this.draftOpen = true;
    Game.paused = true;

    const body = Util.el('div', 'draft');
    body.appendChild(Util.el('h3', null,
      'ウェーブ ' + run.wave + ' 突破 — カードを1枚選ぶ' +
      (run.pendingPicks > 1 ? '（あと ' + run.pendingPicks + ' 枚）' : '')));
    const row = Util.el('div', 'drow');
    for (const id of ids) {
      const c = CARDS[id];
      const el = this.cardEl(c, { pick: true, stacks: (run.cards[id] || 0) + 1, limit: Game.stackLimit(id) });
      el.addEventListener('click', () => {
        run.cards[id] = (run.cards[id] || 0) + 1;
        if (CARDS[id].apply) CARDS[id].apply(run);
        run.pendingPicks = Math.max(0, run.pendingPicks - 1);
        this.draftOpen = false;
        this.closeModal();
        this.toastMsg('取得: ' + c.name, BAL.rarity[c.rarity].color);
        if (run.pendingPicks > 0) setTimeout(() => this.showDraft(), 220);
        else Game.paused = false;
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
    if (c.kind === 'weapon') {
      const w = WEAPONS[c.weapon];
      wname = SRC_LABEL[w.src] + '・' + CATEGORIES[w.cat].name;
    } else if (c.kind === 'synergy') wname = 'シナジー';
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

  // ================= モーダル =================
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

  // ================= 結果 =================
  // 「完璧クリアすると何がもらえるか」を名指しで出す。
  // パックは分野で分かれているので、分野名まで言わないと狙う理由にならない
  perfectHint(stage, leaked) {
    // **実験用のステージは報酬が出ない。** 出ると書くと嘘になる
    if (stage.experimental) {
      const el = Util.el('div', 'note');
      el.innerHTML = '<b>実験用のステージ</b>です。比べるために置いてあるだけなので、' +
        '<b>報酬もパックも出ません</b>し、進行にも影響しません。' +
        (leaked > 0 ? '<br>今回は <b>' + Util.fmt(leaked) + '</b> 体通した。' : '');
      return el;
    }
    const rec = Game.stageRec(stage.id);
    const pk = PACKS[Pack.forStage(stage.id)];
    const n = rec.perfect ? 1 : 2;
    const el = Util.el('div', 'note');
    el.innerHTML = '1体も通さずに凌ぐと<b>完璧クリア</b>。<b style="color:' + pk.color + '">' +
      pk.name + ' ×' + n + '</b> が手に入る' +
      (rec.perfect ? '' : '（このステージ初の完璧クリアなので2個）') + '。<br>' +
      '<span class="dim">' + pk.desc + '</span>' +
      (leaked > 0 ? '<br>今回は <b>' + Util.fmt(leaked) + '</b> 体通した。' +
        '盤面の赤い枠が抜けられたルート。' : '');
    return el;
  },

  showResult(res) {
    const body = Util.el('div');
    if (res.ok) {
      body.appendChild(Util.el('h3', null,
        res.perfect ? '★★ ' + res.stage.name + ' 完璧クリア！' : '★ ' + res.stage.name + ' 突破！'));
      if (res.perfect && !res.stage.experimental) {
        body.appendChild(Util.el('div', 'reward', '🏆 1体も通さなかった。' +
          PACKS[Pack.forStage(res.stage.id)].name + 'を獲得' +
          (res.stageGot && res.stageGot.firstPerfect ? '（初回なので2個）' : '')));
        this.burst('#ffb020');
      } else if (res.perfect) {
        body.appendChild(Util.el('div', 'reward', '🏆 1体も通さなかった（実験用なので報酬は無し）'));
      } else {
        body.appendChild(this.perfectHint(res.stage, res.leaked));
      }
      if (res.stageGot && res.stageGot.first && res.stageGot.cards.length) {
        body.appendChild(Util.el('div', 'sgroup', '新しい武器カードを獲得'));
        const row = Util.el('div', 'popenrow');
        for (const cid of res.stageGot.cards) row.appendChild(this.cardEl(CARDS[cid], { reveal: true, isNew: true }));
        body.appendChild(row);
        this.burst('#ffb020');
      }
      const pk = res.stageGot ? Object.entries(res.stageGot.packs).map(([k, v]) => PACKS[k].name + ' ×' + v).join(' / ') : '';
      if (pk) body.appendChild(Util.el('div', 'reward', '🎁 ' + pk));
    } else {
      body.appendChild(Util.el('h3', null, '防衛線が抜かれた'));
      body.appendChild(this.perfectHint(res.stage, res.leaked));
    }

    const st = Util.el('div', 'stats');
    st.innerHTML =
      '<div><span>ステージ</span><b>' + res.stage.name + '</b></div>' +
      '<div><span>到達ウェーブ</span><b>' + res.wave + ' / ' + BAL.wavesPerStage + '</b></div>' +
      '<div><span>撃破数</span><b>' + Util.fmt(res.kills) + '</b></div>' +
      '<div><span>獲得コイン</span><b>◈ ' + Util.fmt(res.coins) + '</b></div>' +
      '<div><span>残りライフ</span><b>' + res.lives + ' / ' + res.livesMax + '</b></div>' +
      '<div><span>通した敵</span><b>' + Util.fmt(res.leaked) + '</b></div>';
    body.appendChild(st);

    if (res.missions && res.missions.length) {
      body.appendChild(Util.el('div', 'sgroup', 'ミッション達成'));
      for (const m of res.missions) body.appendChild(Util.el('div', 'note', '✔ ' + m.name));
    }

    const next = res.ok && res.stageGot && res.stageGot.next;
    if (next) {
      const b = Util.el('button', 'bigbtn', '次のステージ「' + next.name + '」へ');
      b.addEventListener('click', () => {
        this.closeModal();
        Game.perm.currentStage = next.id;
        UI.pick = STAGES.findIndex(x => x.id === next.id);
        Game.save();
        Main.toBattle();
      });
      body.appendChild(b);
    }
    const again = Util.el('button', next ? 'linkbtn' : 'bigbtn', 'このステージの準備に戻る');
    again.addEventListener('click', () => { this.closeModal(); Main.toHome(); });
    body.appendChild(again);
    const up = Util.el('button', 'linkbtn', 'アップグレードを見る');
    up.addEventListener('click', () => {
      this.closeModal(); Main.toHome();
      this.tab = 'skill'; this.renderTabs(); this.renderPanel();
    });
    body.appendChild(up);

    this.openModal(body, true);
  },
};
