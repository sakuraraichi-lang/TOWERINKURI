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
      upop: q('upop'), stage: q('stage'), tut: q('tut'), perf: q('perf'),
      btnStart: q('btnStart'),
      homeCoin: q('homeCoin'), homeProg: q('homeProg'), homeLabel: q('homeLabel'),
      homeName: q('homeName'), homeMini: q('homeMini'),
      homeStat: q('homeStat'), homeStart: q('homeStart'),
      homeRank: q('homeRank'), homeXp: q('homeXp'),
      homePrev: q('homePrev'), homeNext: q('homeNext'),
    };

    this.el.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      if (!Game.tabOpen(b.dataset.tab)) {
        this.toastMsg(this.lockWhy(b.dataset.tab), '#ff8080');
        return;
      }
      // **同じタブをもう一度押すと閉じる。** 閉じているあいだはステージだけが見える
      this.tabsOff = (this.tab === b.dataset.tab) ? !this.tabsOff : false;
      this.tab = b.dataset.tab;
      this.syncTabsOff();
      this.renderTabs();
      this.renderPanel();
    });

    // 「残り◯」をタップすると、処理の重さの表示が出入りする
    if (this.el.hudWaveTxt) this.el.hudWaveTxt.addEventListener('click', () => this.togglePerf());

    this.el.homePrev.addEventListener('click', () => this.movePick(-1));
    this.el.homeNext.addEventListener('click', () => this.movePick(1));

    this.pick = Math.max(0, STAGES.findIndex(s => s.id === Game.perm.currentStage));
    // 最初はどのタブも開いていないので、ステージだけを見せる
    this.tabsOff = true;
    this.syncTabsOff();
    this.renderTabs();
    this.renderPanel();
    this.renderTray();
  },

  // タブを閉じているあいだはパネルを畳み、ステージの的を大きく見せる
  syncTabsOff() {
    document.body.classList.toggle('tabsoff', !!this.tabsOff);
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
    const done = Game.clearedCount(), all = MAIN_STAGES.length;

    e.homeCoin.textContent = Util.fmt(Game.meta.coins);
    // 階級＝転生回数。伸び方が一番ゆっくりで、外から見た「格」に近い
    if (e.homeRank) e.homeRank.textContent = Game.perm.prestiges;
    if (e.homeXp) e.homeXp.style.width = (100 * done / all).toFixed(1) + '%';
    e.homeProg.textContent = '突破 ' + done + ' / ' + all +
      '　撃破 ' + Util.fmt(Game.perm.totalKills);

    const mi = MAIN_STAGES.findIndex(x => x.id === st.id);
    e.homeLabel.innerHTML = st.experimental
      ? '実験ステージ <b>' + (EXP_STAGES.findIndex(x => x.id === st.id) + 1) + '</b>'
      : 'ステージ <b>' + (mi + 1) + '</b>';
    // 名前は最後の1語だけ琥珀にして、参考画像の二色見出しに寄せる
    e.homeName.innerHTML = open ? this.splitTitle(st.name) : '？？？';
    // miniMap は SVG の文字列を返す（Node ではない）
    e.homeMini.innerHTML = open ? this.miniMap(st) : '<span class="lk">🔒</span>';
    e.homeMini.classList.toggle('locked', !open);

    let line;
    if (!open) line = '<span class="ck">🔒</span>前のステージを突破すると開きます';
    else if (rec.perfect) line = '<span class="ck">✓</span>完璧クリア済み　<em>★★</em>';
    else if (rec.cleared) line = '<span class="ck">✓</span>突破済み　<em>W' + rec.bestWave + '</em>';
    else if (rec.attempts) line = '<span class="ck">…</span>最高 <em>ウェーブ ' + rec.bestWave + '</em>' +
      '　挑戦 ' + rec.attempts + '回';
    else line = '<span class="ck">＊</span>未挑戦　' + (st.experimental ? '報酬なし' : '全' + BAL.wavesPerStage + 'ウェーブ');
    e.homeStat.innerHTML = line;

    e.homeStart.disabled = !open;
    e.homeStart.innerHTML = open ? '出撃<s>▶</s>' : 'ロック中';
  },

  // 「実験場・広大」→「実験場・<em>広大</em>」。区切りが無ければ後ろ半分を色付け
  splitTitle(name) {
    const m = name.match(/^(.*[・\s])(.+)$/);
    if (m) return m[1] + '<em>' + m[2] + '</em>';
    if (name.length <= 2) return '<em>' + name + '</em>';
    const cut = Math.ceil(name.length / 2);
    return name.slice(0, cut) + '<em>' + name.slice(cut) + '</em>';
  },

  // ===== 画面の切り替え =====
  setScreen(name) {
    document.body.classList.toggle('on-home', name === 'home');
    document.body.classList.toggle('on-battle', name === 'battle');
    if (name === 'home') { this.renderHome(); this.renderTabs(); this.renderPanel(); }
  },

  // ================= 処理の重さ =================
  // **実機で何体まで出せるかを測るための表示。** 既定では出さない。
  // fps は「上限を掛ける前の実時間」から出すので、重くなると素直に下がる
  perf(realDt, frameMs, run) {
    const p = this.el.perf;
    if (!p) return;
    if (!Game.perm || !Game.perm.perf) { if (p.textContent) p.textContent = ''; return; }

    this._pfA = (this._pfA || 0) + realDt;
    this._pfN = (this._pfN || 0) + 1;
    this._pfMs = Math.max(this._pfMs || 0, frameMs);   // 山を見る。平均だとカクつきが消える
    if (this._pfA < 0.5) return;

    const fps = Math.round(this._pfN / Math.max(0.0001, this._pfA));
    const en = run ? run.enemies.length : 0;
    const bu = run ? run.bullets.length : 0;
    p.innerHTML = '<b class="' + (fps >= 50 ? 'ok' : fps >= 30 ? 'mid' : 'bad') + '">' + fps + '</b> fps' +
      '<span>敵 ' + en + '　弾 ' + bu + '　最大 ' + this._pfMs.toFixed(1) + 'ms</span>';
    this._pfA = 0; this._pfN = 0; this._pfMs = 0;
  },

  togglePerf() {
    Game.perm.perf = !Game.perm.perf;
    if (!Game.perm.perf && this.el.perf) this.el.perf.textContent = '';
    Game.save();
    this.toastMsg(Game.perm.perf ? '処理の重さを表示' : '非表示', '#ff8a1f');
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

  // 選んだ武器の調整。
  // **武器の横には出さない。** 武器そのものと射界に被って、いじりたい対象が隠れていた。
  // 決まった場所に出して、掴んで好きなところへ動かせるようにする
  renderUnitPop() {
    const p = this.el.upop;
    if (!p) return;
    const u = this.selected;
    if (!u || !Game.run || Game.run.over) {
      p.classList.remove('on'); p.innerHTML = '';
      this.el.stage.classList.remove('popopen');
      return;
    }
    const build = Game.canBuild();

    p.innerHTML = '';
    p.classList.add('on');
    // 調整パネルが出ているあいだ、チュートリアルの帯は上に逃がす（重なるため）
    this.el.stage.classList.add('popopen');

    // 掴んで動かす取っ手。ここだけがドラッグを受ける
    const info = Util.el('div', 'usel uhandle');
    info.innerHTML = '<i class="ugrip"></i>' +
      '<b style="color:' + u.def.color + '">' + u.def.name + '</b>' +
      '<span id="uInfo">射界 ' + Math.round(u.arc * 2 * 180 / Math.PI) +
      '°　集弾 ' + Math.round(Game.groupingOf(u) * 100) + '%</span>';
    this.bindPopDrag(info);
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

  // 決まった場所に置く。**武器には寄せない。**
  //   既定は左下（盤面の手前側）。「準備完了」と操作列を避ける高さ。
  //   一度動かしたらその位置を覚え、次に開いたときも同じところに出る
  placeUnitPop() {
    const p = this.el.upop;
    if (!p || !p.classList.contains('on')) return;
    const host = this.el.stage.getBoundingClientRect();
    const w = p.offsetWidth || 196, h = p.offsetHeight || 158;
    const pos = Game.perm && Game.perm.upop;

    let x, y;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      x = pos.x; y = pos.y;
    } else {
      x = 10;
      y = host.height - h - 122;      // 操作列とチュートリアル帯の上
    }
    p.style.left = Util.clamp(x, 6, Math.max(6, host.width - w - 6)) + 'px';
    p.style.top = Util.clamp(y, 6, Math.max(6, host.height - h - 6)) + 'px';
  },

  // 取っ手を掴んで動かす。指を離したところを覚える
  bindPopDrag(handle) {
    const p = this.el.upop;
    let st = null;
    handle.addEventListener('pointerdown', (e) => {
      const host = this.el.stage.getBoundingClientRect();
      st = { px: e.clientX, py: e.clientY, x: p.offsetLeft, y: p.offsetTop, host };
      handle.setPointerCapture(e.pointerId);
      p.classList.add('drag');
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!st) return;
      const w = p.offsetWidth, h = p.offsetHeight;
      const x = Util.clamp(st.x + (e.clientX - st.px), 6, Math.max(6, st.host.width - w - 6));
      const y = Util.clamp(st.y + (e.clientY - st.py), 6, Math.max(6, st.host.height - h - 6));
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      e.preventDefault();
    });
    const end = () => {
      if (!st) return;
      st = null;
      p.classList.remove('drag');
      Game.perm.upop = { x: p.offsetLeft, y: p.offsetTop };
      Game.save();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  },

  // ============ チュートリアル ============
  // **一度に1操作しか教えない。** 全部並べると読まれない。
  // 進み方は perm.tut に持つので、途中でやめても続きから出る
  TUT: [
    { t: '左上の武器をひとつ選ぶ',      s: 'GAT はガトリング、SNP はスナイパー' },
    { t: '光っている地面をタップして置く', s: '置けるのは地面（壁）の上だけ' },
    { t: '調整パネルのバーで、向きを敵のほうへ', s: 'パネルは上をつまんで好きな場所へ動かせる' },
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
      b.classList.toggle('on', open && id === this.tab && !this.tabsOff);
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
          this.toastMsg(s.name + ' を選択', '#ff8a1f');
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
        if (ch === '#') col = '#3b3527';        // 置ける地面（壁）
        else if (ch === 'S') col = '#ff5566';   // 出現口
        else if (ch === 'C') col = '#ffa32e';   // コア
        else if (ch === '.') col = '#0c0e13';   // 通路
        if (col) out += '<rect x="' + c + '" y="' + r + '" width="1" height="1" fill="' + col + '"/>';
      }
    }
    return out + '</svg>';
  },

  // ================= スキルツリー =================
  // ツリーの節を、コインの増減に合わせて光らせ直す。
  // **描き直しはしない。** 触っている最中に節が動くと押せない
  refreshSkills() {
    if (!this.skillRows || !this.skillRows.length) return;
    const canPhase = Game.canBuySkills();
    for (const r of this.skillRows) {
      if (!r.node || !r.node.isConnected) continue;
      const lv = Skill.lv(Game.meta, r.id);
      if (r.lv !== lv) {
        r.lv = lv;
        const u = r.node.querySelector('u');
        if (lv > 0 && u) u.textContent = lv;
        r.node.classList.toggle('have', lv > 0);
      }
      const can = canPhase && Skill.canBuy(Game.meta, Game.perm, r.id);
      if (r.can !== can) { r.can = can; r.node.classList.toggle('can', can); }
    }
    const c = document.getElementById('treeCoin');
    if (c) c.textContent = Util.fmt(Game.meta.coins);
    if (this.treeBuyBtn && this.treeBuyBtn.isConnected && this.treeSel) {
      const can = canPhase && Skill.canBuy(Game.meta, Game.perm, this.treeSel);
      this.treeBuyBtn.disabled = !can;
    }
  },

  // ================= アップグレード（枝で結んだツリー） =================
  // 一覧だと「どこから伸びているのか」が見えないので、節と枝で描く。
  // **座標は定義から自動で決める。** ノードを足しても、ここを直さなくていい
  panelSkill(p) {
    const perm = Game.perm;
    this.skillRows = [];
    const head = Util.el('div', 'phead');
    head.innerHTML = '<b>スキルツリー</b><span class="sub">コインで数字を大きくする。' +
      '火力は<b>武器カテゴリ単位</b>で伸ばす。節をタップすると中身が出る</span>';
    p.appendChild(head);

    if (!Game.canBuySkills()) {
      p.appendChild(Util.el('div', 'warn', '戦闘中は購入できません。撤退するか、ステージを終えてから。'));
    }

    // 枝＝group。定義に出てくる順に左から並べる
    const branches = [];
    for (const s of SKILLS) {
      let b = branches.find(x => x.group === s.group);
      if (!b) { b = { group: s.group, cat: s.cat || null, nodes: [] }; branches.push(b); }
      b.nodes.push(s);
    }

    const COL = 78, ROW = 82, ROOT_Y = 34, TOP = 104;
    const W = branches.length * COL;
    const rows = Math.max.apply(null, branches.map(b => b.nodes.length));
    const H = TOP + (rows - 1) * ROW + 54;
    const rootX = W / 2;

    const box = Util.el('div', 'treecanvas');
    box.style.width = W + 'px';
    box.style.height = H + 'px';

    let svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">';
    const dots = [];
    branches.forEach((b, gi) => {
      const x = gi * COL + COL / 2;
      const col = b.cat ? CATEGORIES[b.cat].color : '#ff8a1f';
      const lit = b.nodes.some(s => Skill.lv(Game.meta, s.id) > 0);
      const o = lit ? .85 : .25;
      // 幹から枝へ。**曲げて描くと、どこから分かれたのかが目で追える**
      svg += '<path d="M' + rootX + ' ' + (ROOT_Y + 26) +
             ' C ' + rootX + ' ' + (TOP - 22) + ', ' + x + ' ' + (ROOT_Y + 34) + ', ' + x + ' ' + TOP +
             '" fill="none" stroke="' + col + '" stroke-width="' + (lit ? 2 : 1.2) +
             '" opacity="' + o + '"/>';
      for (let i = 1; i < b.nodes.length; i++) {
        const litSeg = Skill.lv(Game.meta, b.nodes[i - 1].id) > 0;
        svg += '<line x1="' + x + '" y1="' + (TOP + (i - 1) * ROW) +
               '" x2="' + x + '" y2="' + (TOP + i * ROW) +
               '" stroke="' + col + '" stroke-width="' + (litSeg ? 2 : 1.2) +
               '" opacity="' + (litSeg ? .85 : .25) + '"/>';
      }
      dots.push({ b, x, col });
    });
    svg += '</svg>';
    box.innerHTML = svg;

    // 幹のてっぺん
    const root = Util.el('div', 'tnode root have', '⬢');
    root.style.left = rootX + 'px';
    root.style.top = ROOT_Y + 'px';
    box.appendChild(root);

    for (const d of dots) {
      const g = Util.el('div', 'tgroup', d.b.group);
      g.style.left = d.x + 'px';
      g.style.top = (TOP - 34) + 'px';
      g.style.color = d.col;
      box.appendChild(g);

      d.b.nodes.forEach((s, i) => {
        const y = TOP + i * ROW;
        const unlocked = Skill.isUnlocked(perm, s.id);
        const lv = Skill.lv(Game.meta, s.id);
        const n = Skill.node(s.id, perm);
        const can = Game.canBuySkills() && Skill.canBuy(Game.meta, perm, s.id);
        const btn = Util.el('button', 'tnode' +
          (!unlocked ? ' locked' : lv > 0 ? ' have' : '') +
          (can ? ' can' : '') + (n.swapId ? ' swapped' : '') +
          (this.treeSel === s.id ? ' sel' : ''));
        btn.innerHTML = (unlocked ? n.icon : '🔒') + (lv > 0 ? '<u>' + lv + '</u>' : '');
        btn.style.left = d.x + 'px';
        btn.style.top = y + 'px';
        if (unlocked) btn.style.borderColor = lv > 0 ? d.col : '';
        btn.addEventListener('click', () => {
          this.treeSel = s.id;
          this.refreshTree();
        });
        box.appendChild(btn);

        const lb = Util.el('div', 'tlabel', unlocked ? n.name : '？？？');
        lb.style.left = d.x + 'px';
        lb.style.top = (y + 26) + 'px';
        box.appendChild(lb);

        this.skillRows.push({ id: s.id, row: btn, btn: null, can, lv, node: btn });
      });
    }

    const scroller = Util.el('div');
    scroller.id = 'tree';
    scroller.appendChild(box);
    p.appendChild(scroller);
    // 横の見ている位置。開き直しても同じところを見せる
    requestAnimationFrame(() => {
      if (this._treeX != null) { scroller.scrollLeft = this._treeX; this._treeX = null; return; }
      const sel = box.querySelector('.tnode.sel');
      scroller.scrollLeft = sel
        ? parseFloat(sel.style.left) - scroller.clientWidth / 2
        : (W - scroller.clientWidth) / 2;
    });

    p.appendChild(this.treeDetail());
    p.appendChild(this.treePoints());
  },

  // 選んだ節の中身と、買うボタン
  treeDetail() {
    const id = this.treeSel;
    if (!id || !SKILL_BY_ID[id]) {
      return Util.el('div', 'tdetail none', '節をタップすると、効果と値段が出ます');
    }
    const s = SKILL_BY_ID[id];
    const perm = Game.perm, meta = Game.meta;
    const n = Skill.node(id, perm);
    const unlocked = Skill.isUnlocked(perm, id);
    const lv = Skill.lv(meta, id);
    const maxed = lv >= s.max;
    const can = Game.canBuySkills() && Skill.canBuy(meta, perm, id);

    const d = Util.el('div', 'tdetail');
    if (!unlocked) {
      d.innerHTML = '<div class="tdhead"><div class="sic">🔒</div>' +
        '<div class="sbody"><div class="sname">？？？</div></div></div>' +
        '<div class="tdesc">' + Skill.lockReason(perm, id) + '</div>';
      return d;
    }
    d.innerHTML =
      '<div class="tdhead"><div class="sic">' + n.icon + '</div><div class="sbody">' +
        '<div class="sname">' + n.name + (n.swapId ? ' <u>換装</u>' : '') + '</div>' +
        '<div class="sdesc">' + s.group + '</div></div>' +
        '<div class="tdlv">Lv ' + lv + (s.max !== Infinity ? ' / ' + s.max : '') + '</div></div>' +
      '<div class="tdesc">' + Skill.desc(n) +
        (n.swapId ? '<span class="was">元：' + n.swappedFrom + '</span>' : '') + '</div>' +
      '<div class="tdbuy"><button class="sbuy"' + (can ? '' : ' disabled') + '>' +
        (maxed ? 'MAX' : '◈ ' + Util.fmt(Skill.cost(meta, id)) + ' で強化') + '</button></div>';

    const btn = d.querySelector('.sbuy');
    let hold = null;
    // **押しっぱなしで連打できるので、描き直さずその場で書き換える。**
    // 描き直すと押している要素が消えて、連打が途切れる
    const doBuy = () => {
      if (!Game.canBuySkills()) return;
      if (!Skill.buy(Game.meta, Game.perm, id)) return;
      Game.applyMods();
      const lv2 = Skill.lv(meta, id);
      d.querySelector('.tdlv').textContent = 'Lv ' + lv2 + (s.max !== Infinity ? ' / ' + s.max : '');
      btn.textContent = lv2 >= s.max ? 'MAX' : '◈ ' + Util.fmt(Skill.cost(meta, id)) + ' で強化';
      this.refreshSkills();
      btn.disabled = !(Game.canBuySkills() && Skill.canBuy(meta, Game.perm, id));
    };
    btn.addEventListener('click', doBuy);
    btn.addEventListener('pointerdown', () => { hold = setTimeout(function rep() { doBuy(); hold = setTimeout(rep, 90); }, 420); });
    const stop = () => clearTimeout(hold);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    this.treeBuyBtn = btn;
    return d;
  },

  treePoints() {
    const t = Util.el('div', 'tpoints');
    t.innerHTML = '<span>使用可能なコイン</span><b id="treeCoin">' + Util.fmt(Game.meta.coins) + '</b>';

    // **周回のたびに同じ買い物を手で繰り返させない。**
    // 安い順に買えるだけ買う（測定器が1周を回すときと同じ買い方）
    const can = Game.canBuySkills() && Skill.canBuyAny(Game.meta, Game.perm);
    const b = Util.el('button', 'sbuy tbuyall', 'まとめて購入');
    b.disabled = !can;
    b.addEventListener('click', () => {
      const r = Skill.buyAll(Game.meta, Game.perm);
      if (!r.n) return;
      Game.applyMods();
      Game.save();
      this.toastMsg(r.n + '件 購入　◈ ' + Util.fmt(r.spent), '#ff8a1f');
      this.refreshTree();
    });
    t.appendChild(b);
    return t;
  },

  // 買った直後の描き直し。**横スクロールの位置を保つ**
  refreshTree() {
    const sc = document.getElementById('tree');
    const x = sc ? sc.scrollLeft : 0;
    const y = this.el.panel.scrollTop;
    this.renderPanel();
    const sc2 = document.getElementById('tree');
    if (sc2) sc2.scrollLeft = x;
    this.el.panel.scrollTop = y;
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
    head.innerHTML = '<b>パック開封</b><span class="sub">コインでは買えない。<b>完璧クリア</b>・ステージ突破・転生・ミッションで手に入る。<br>' +
      '<b>パックは分野で分かれている。</b>奥の分野は奥のステージまで行かないと掘れない。<br>' +
      '武器本体のほか、<b>今あるアップグレードを別の効き方に入れ替える「換装」</b>が3択で出ることがある</span>';
    p.appendChild(head);

    for (const pid of PACK_IDS) {
      const pk = PACKS[pid];
      const n = Game.perm.packs[pid] || 0;
      // 遺物パックは転生でしか出ない。一度も見ていないうちは並べない
      if (pid === 'relic' && n === 0 && Game.perm.prestiges === 0) continue;
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

  // ================= 開封（ガチャ画面） =================
  //   ① 封を切る（タップ） → ② 1枚ずつめくる → ③ 換装の3択 → ④ 受け取る
  //   **武器本体が出たときは、ただのカードとして流さず止めて見せる。**
  openPack(pid) {
    if ((Game.perm.packs[pid] || 0) <= 0) return;
    Game.perm.packs[pid]--;
    const luck = Skill.mods(Game.meta, Game.perm).packLuck;
    const ids = Pack.open(pid, luck);
    const isNew = ids.map(id => Game.own(id) === 0);
    for (const id of ids) Game.grant(id, 1);

    // 換装が出るかどうか。**買っていないノードは候補にならない**ので、
    // 序盤は自然と出ない
    const swaps = Util.chance(Pack.swapChance(pid))
      ? Skill.swapChoices(Game.meta, Game.perm, 3) : [];
    Game.save();

    const pk = PACKS[pid];
    const body = Util.el('div', 'gacha');
    body.style.setProperty('--pc', pk.color);
    body.innerHTML =
      '<div class="gtop"><b>' + pk.name + '</b><span>' + pk.size + '枚' +
      (swaps.length ? ' ＋ 換装' : '') + '</span></div>' +
      '<div class="gseal"><div class="gpack">⬢</div><div class="gsealtxt">タップで開封</div></div>' +
      '<div class="gbody"></div>' +
      '<div class="ghint"></div>';
    const seal = body.querySelector('.gseal');
    const stage = body.querySelector('.gbody');
    const hint = body.querySelector('.ghint');
    this.openModal(body, true);

    const finish = () => {
      const close = Util.el('button', 'bigbtn', '受け取る');
      close.addEventListener('click', () => { this.closeModal(); this.renderPanel(); });
      body.appendChild(close);
      hint.textContent = '';
    };

    // ---- ③ 換装の3択 ----
    const showSwaps = () => {
      stage.innerHTML = '';
      stage.appendChild(this.choiceHead('換装',
        '今あるアップグレードを1つ、別の効き方に入れ替える　レベルと値段はそのまま'));
      const row = Util.el('div', 'chrow');
      for (const sw of swaps) {
        const base = SKILL_BY_ID[sw.base];
        const lv = Skill.lv(Game.meta, sw.base);
        const cur = Skill.node(sw.base);
        const el = this.choiceCard({
          name: sw.name,
          desc: Skill.desc(sw),
          icon: sw.icon,
          color: 'var(--acc2)',
          isNew: true,
          type: cur.name + ' と入れ替え',
          foot: '引き継ぐレベル <b>' + lv + '</b>',
        });
        el.addEventListener('click', () => {
          Skill.applySwap(Game.perm, sw.id);
          Game.applyMods();
          Game.save();
          this.toastMsg(base.name + ' → ' + sw.name + ' に換装', '#ff7a18');
          stage.innerHTML = '';
          stage.appendChild(Util.el('div', 'gdone', sw.name + ' に換装した'));
          finish();
        });
        row.appendChild(el);
      }
      stage.appendChild(row);
      const skip = Util.el('button', 'gskip', '今は換えない');
      skip.addEventListener('click', () => { stage.innerHTML = ''; finish(); });
      stage.appendChild(skip);
      hint.textContent = '';
    };

    // ---- ② カードを1枚ずつ ----
    const row = Util.el('div', 'popenrow');
    let i = 0;
    const flipNext = () => {
      if (i >= ids.length) return;
      const c = CARDS[ids[i]];
      row.appendChild(this.cardEl(c, { reveal: true, isNew: isNew[i] }));
      // **武器本体は別格。** 派手に光らせて、出たことが分かるようにする
      if (c.kind === 'weapon' && isNew[i]) {
        this.burst(WEAPONS[c.weapon] ? WEAPONS[c.weapon].color : '#ffb43c');
        this.toastMsg('新しい武器 ' + c.name, '#ffb43c');
      } else if (BAL.rarity[c.rarity].glow >= 2) {
        this.burst(BAL.rarity[c.rarity].color);
      }
      i++;
      hint.textContent = i < ids.length ? 'タップでめくる（' + i + ' / ' + ids.length + '）' : '';
      if (i >= ids.length) { if (swaps.length) showSwaps(); else finish(); }
    };

    // ---- ① 封を切る ----
    const unseal = () => {
      seal.remove();
      stage.appendChild(row);
      this.burst(pk.color);
      flipNext();
    };
    seal.addEventListener('click', unseal);
    stage.addEventListener('click', (e) => {
      if (e.target.closest('.chcard') || e.target.closest('.gskip')) return;
      flipNext();
    });
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
      '<b>遺物パック</b>を得る。遺物は<b>転生でも消えない</b>強化で、次の周の立ち上がりが速くなる</span>';
    p.appendChild(head);

    const R = Relic.mods(perm);
    const st = Util.el('div', 'stats');
    st.innerHTML =
      '<div><span>転生回数</span><b>' + perm.prestiges + '</b></div>' +
      '<div><span>遺物の枚数</span><b>' + R.count + '</b></div>' +
      '<div><span>遺物：ダメージ</span><b>×' + Util.fmt(R.dmg) + '</b></div>' +
      '<div><span>遺物：コイン</span><b>×' + Util.fmt(R.coin) + '</b></div>' +
      '<div><span>突破ステージ</span><b>' + Game.clearedCount() + ' / ' + MAIN_STAGES.length + '</b></div>' +
      '<div><span>累計撃破</span><b>' + Util.fmt(perm.totalKills) + '</b></div>';
    p.appendChild(st);

    const cleared = Game.clearedCount();
    p.appendChild(Util.el('div', 'note', Game.canPrestige()
      ? '今転生すると <b>遺物パック ' + (3 + Math.floor(cleared * 0.8)) + '個</b> ＋ カードパック 約' +
        Math.round(Math.pow(cleared, 1.7)) + '個。奥まで突破してから転生するほど、もらえる数が増えます'
      : 'ステージを ' + BAL.prestigeMinStages + ' 個突破すると転生できます（現在 ' + cleared + ' 個）'));
    p.appendChild(Util.el('div', 'warn', '※ 転生するとステージの突破状況も戻ります。もう一度突破すれば初回報酬と初回完璧クリアの報酬を取り直せます（カード・パック・遺物は残ります）'));

    // 持っている遺物の一覧
    const owned = Relic.owned(perm);
    if (owned.length) {
      const g = Util.el('div', 'sgroup');
      g.innerHTML = '<span>遺物</span><i>転生で消えない</i>';
      p.appendChild(g);
      if (R.startLv > 0) {
        p.appendChild(Util.el('div', 'reward',
          '出撃するとき、アップグレードが最初から Lv+' + R.startLv + ' の状態になります'));
      }
      for (const o of owned) {
        const row = Util.el('div', 'srow');
        row.style.borderColor = BAL.rarity[o.card.rarity].color + '66';
        row.innerHTML =
          '<div class="sic" style="color:' + BAL.rarity[o.card.rarity].color + '">◈</div>' +
          '<div class="sbody"><div class="sname">' + o.card.name +
            ' <em>×' + o.n + '</em></div>' +
          '<div class="sdesc">' + o.card.desc + '</div></div>';
        p.appendChild(row);
      }
    }

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
    const n = Object.keys(Game.perm.collection).length;
    const head = Util.el('div', 'phead');
    head.innerHTML = '<b>デッキ</b><span class="sub">ウェーブ突破ごとの3択に、' +
      'どのカードを入れるかを自分で組む場所。<b>枠だけ置いてあります</b>（まだ組めません）。<br>' +
      '今は持っているカード ' + n + ' 種類すべてが抽選に入ります</span>';
    p.appendChild(head);

    const grid = Util.el('div', 'deckslots');
    for (let i = 0; i < 12; i++) {
      const s = Util.el('div', 'dslot');
      s.innerHTML = '<span>' + (i + 1) + '</span>';
      grid.appendChild(s);
    }
    p.appendChild(grid);
    p.appendChild(Util.el('div', 'note', '※ カードの種類が揃ってからでないと選ぶ意味が出ないので、中身は後から入れます。'));
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
    body.appendChild(this.choiceHead('レベルアップ',
      'ウェーブ ' + run.wave + ' 突破　1枚選ぶ' +
      (run.pendingPicks > 1 ? '（あと ' + run.pendingPicks + ' 枚）' : '')));
    body.appendChild(this.runSlots());

    const row = Util.el('div', 'chrow');
    for (const id of ids) {
      const c = CARDS[id];
      const stacks = (run.cards[id] || 0) + 1;
      const el = this.choiceCard({
        name: c.name,
        desc: c.desc,
        icon: this.cardIcon(c),
        color: BAL.rarity[c.rarity].color,
        isNew: Game.own(id) === 0 || stacks === 1,
        type: c.kind === 'weapon' ? '武器を編成に追加'
            : c.kind === 'synergy' ? 'シナジー'
            : (c.weapon ? WEAPONS[c.weapon].name + ' 強化' : '全体強化'),
        foot: BAL.rarity[c.rarity].name + '　' + stacks + ' / ' + Game.stackLimit(id) + ' 枚目',
        hot: BAL.rarity[c.rarity].glow >= 2,
      });
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

  // ---- 3択の画面の部品（レベルアップと換装で使い回す） ----
  choiceHead(title, sub) {
    const h = Util.el('div', 'chhead');
    h.innerHTML = '<b>' + title + '</b>' + (sub ? '<span>' + sub + '</span>' : '');
    return h;
  },

  // 上に並ぶ枠。**今この出撃で何を積んだか**を見せる（空きは ＋）
  runSlots() {
    const run = Game.run;
    const wrap = Util.el('div', 'chslots');
    const ids = run ? Object.keys(run.cards || {}) : [];
    const show = ids.slice(-3);
    for (let i = 0; i < 4; i++) {
      const id = show[i];
      const s = Util.el('div', 'chslot' + (id ? ' on' : ' empty'));
      if (id) {
        s.innerHTML = this.cardIcon(CARDS[id]) + '<u>×' + run.cards[id] + '</u>';
        s.style.color = BAL.rarity[CARDS[id].rarity].color;
      } else s.textContent = '＋';
      wrap.appendChild(s);
    }
    return wrap;
  },

  // 絵の素材が無いので、カテゴリの記号で代用する
  cardIcon(c) {
    if (c.kind === 'synergy') return '⧉';
    if (c.weapon && WEAPONS[c.weapon]) {
      const cat = CATEGORIES[WEAPONS[c.weapon].cat];
      return (cat && cat.icon) || '◈';
    }
    return '✦';
  },

  choiceCard(o) {
    const el = Util.el('button', 'chcard pick' + (o.hot ? ' hot' : ''));
    el.style.setProperty('--ac', o.color || 'var(--acc)');
    el.innerHTML =
      (o.isNew ? '<span class="chnew">NEW</span>' : '') +
      '<div class="chname">' + o.name + '</div>' +
      '<div class="chart">' + o.icon + '</div>' +
      '<div class="chdesc">' + o.desc + '</div>' +
      (o.foot ? '<div class="chval">' + o.foot + '</div>' : '') +
      '<div class="chtype">' + o.type + '</div>';
    return el;
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
    else if (c.kind === 'perm') wname = '遺物・転生で消えない';
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
        this.burst('#ff8a1f');
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
        this.burst('#ff8a1f');
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
