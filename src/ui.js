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
      build: q('build'), buildNote: q('buildNote'),
      btnCfg: q('btnCfg'), cfgBox: q('cfgBox'),
      btnStart: q('btnStart'),
      homeCoin: q('homeCoin'), homeProg: q('homeProg'), homeLabel: q('homeLabel'),
      homeName: q('homeName'), homeMini: q('homeMini'),
      homeStat: q('homeStat'), homeStart: q('homeStart'),
      homeRank: q('homeRank'), homeXp: q('homeXp'), homeSkip: q('homeSkip'),
      homePrev: q('homePrev'), homeNext: q('homeNext'),
    };

    if (this.el.btnCfg) {
      this.el.btnCfg.addEventListener('click', () => { Snd.ui(); this.toggleCfg(); });
    }

    this.el.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      Snd.resume(); Snd.ui();
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

    if (this.el.homeSkip) this.el.homeSkip.addEventListener('click', () => Main.doSkip());

    // 左上の「ホームへ戻る」。タブを閉じて、章と出撃を戻す
    const back = document.getElementById('btnPanelBack');
    if (back) back.addEventListener('click', () => {
      Snd.resume(); Snd.ui();
      this.tabsOff = true;
      this.syncTabsOff(); this.renderTabs(); this.renderPanel();
    });

    this.el.homePrev.addEventListener('click', () => this.movePick(-1));
    this.el.homeNext.addEventListener('click', () => this.movePick(1));

    // 版を出しておく。更新されているかの切り分けに使う
    // 版。**何の数字か分からないと表示の意味が無い**ので、タップで説明を出す。
    // トーストは戦闘画面の中にあってホームでは見えないため、バーの下に出す
    if (this.el.build) {
      this.el.build.textContent = 'ver ' + BUILD;
      this.el.build.title = 'このゲームの版。更新されているかの目印です';
      this.el.build.addEventListener('click', () => {
        Snd.resume(); Snd.ui();
        const n = this.el.buildNote;
        if (!n) return;
        const on = n.classList.toggle('on');
        if (!on) { n.innerHTML = ''; return; }
        // **何が変わったかを、その場から読めるようにする。**
        // 版の数字だけ見せても「で、何が変わったの」に答えていない
        n.innerHTML = 'ver ' + BUILD + ' ＝ このゲームの版です。' +
          '「更新されていない気がする」ときに、ここが変わっているかで確かめられます<br>' +
          '<a href="' + PATCHNOTES_URL + '" target="_blank" rel="noopener">' +
          'この版で何が変わったか（パッチノート）</a>';
      });
    }

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
    // **飛ばして通っただけ。**突破ではないので、初回報酬はまだ残っている
    else if (rec.skipped) line = '<span class="ck">✓</span>通過（未突破）　<em>報酬は未取得</em>';
    else if (rec.attempts) line = '<span class="ck">…</span>最高 <em>ウェーブ ' + rec.bestWave + '</em>' +
      '　挑戦 ' + rec.attempts + '回';
    else line = '<span class="ck">＊</span>未挑戦　' + (st.experimental ? '報酬なし' : '全' + BAL.wavesPerStage + 'ウェーブ');
    e.homeStat.innerHTML = line;

    e.homeStart.disabled = !open;
    e.homeStart.innerHTML = open ? '出撃<s>▶</s>' : 'ロック中';

    // スキップ。**条件を満たしたステージにだけ出す。**
    // 出しっぱなしにすると「押せないボタン」が常に画面にいて邪魔になる
    if (e.homeSkip) {
      const can = Game.canSkip(st.id);
      // **鍵を持っていないうちは、ボタンの存在ごと出さない**
      const near = Game.hasSkipKey() && open && !st.experimental &&
                   !rec.cleared && !rec.skipped && !can;
      e.homeSkip.style.display = (can || near) ? '' : 'none';
      e.homeSkip.disabled = !can;
      // **もらえるものは無い。**チェックが付いて次へ行けるだけ、と書いておく
      e.homeSkip.innerHTML = can
        ? 'スキップ<u>報酬なし・転生の評価にも入りません</u>'
        : '<u>' + Game.skipWhy(st.id) + '</u>';
    }
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

  // ================= 設定 =================
  // **ホームの ⚙ から開く。** 出しっぱなしにしない
  toggleCfg() {
    const b = this.el.cfgBox, t = this.el.btnCfg;
    if (!b) return;
    const on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    if (t) t.classList.toggle('on', on);
    if (on) this.renderCfg();
  },

  renderCfg() {
    const b = this.el.cfgBox;
    if (!b) return;
    b.innerHTML = '';
    const row = (key, name, desc) => {
      const on = !!Game.perm[key];
      const el = Util.el('label', 'cfgrow' + (on ? ' on' : ''));
      el.innerHTML = '<span class="box">' + (on ? '✔' : '') + '</span>' +
        '<span><b>' + name + '</b><span>' + desc + '</span></span>';
      el.addEventListener('click', () => {
        Game.perm[key] = !Game.perm[key];
        Game.save(); Snd.ui(); this.renderCfg();
      });
      return el;
    };
    b.appendChild(row('autoWave', '次のウェーブへ自動で進む',
      '切ると、カードを選んだあと配置を直す時間が入ります'));
    b.appendChild(row('perf', '処理の重さを表示', 'fps と1フレームの時間'));
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

    // **盤に置ける総数。**種類ごとの上限とは別に、盤全体で頭打ちになる
    const slotsLeft = Game.slotsTotal() - Game.slotsUsed();
    for (const cid of Game.perm.loadout) {
      if (!cid || !CARDS[cid]) continue;
      const wid = CARDS[cid].weapon;
      const def = WEAPONS[wid];
      const have = Game.unitCount(wid);
      const cap = Game.unitCap(wid);
      const full = have >= cap || slotsLeft <= 0;
      const b = Util.el('button', 'chip unit' + (this.placingType === wid ? ' on' : '') + (full ? ' full' : ''));
      b.style.borderColor = def.color;
      b.innerHTML = '<b style="color:' + def.color + '">' + def.short + '</b>' +
        '<u>' + have + '/' + cap + '</u>';
      b.disabled = !build;
      b.addEventListener('click', () => {
        if (full) {
          this.toastMsg(slotsLeft <= 0
            ? '盤に置ける数がいっぱいです（' + Game.slotsTotal() + '基）'
            : def.name + ' はこれ以上置けません', '#ff8080');
          return;
        }
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
    // **戦闘が始まったら閉じる。** 触れないものを開いたままにしない
    if (!Game.canBuild()) { this.selected = null; this.aiming = null; this.moving = null; }
    if (!u || !Game.run || Game.run.over || !Game.canBuild()) {
      p.classList.remove('on'); p.innerHTML = '';
      this.el.stage.classList.remove('popopen');
      return;
    }
    const build = Game.canBuild();

    p.innerHTML = '';
    p.classList.add('on');
    // 調整パネルが出ているあいだ、チュートリアルの帯は上に逃がす（重なるため）
    this.el.stage.classList.add('popopen');

    // 指定攻撃は扇を持たない。**同じつまみが「着弾円の大きさ」になる**
    const spot = Game.usesAimPoint(u.def);
    const uInfoText = () => spot
      // **単位は六角。**盤に見えているのは六角で、タイル（40px）はもう画面に出ない。
      //   隣り合う六角の中心どうしは √3·R 離れているので、直径をそれで割る
      ? '着弾範囲 六角' + (Math.round(Game.spotR(u) * 2 / (Math.sqrt(3) * MapGen.HEX_R) * 10) / 10) + '個ぶん'
      : '射界 ' + Math.round(u.arc * 2 * 180 / Math.PI) +
        '°　集弾 ' + Math.round(Game.groupingOf(u) * 100) + '%';

    // 掴んで動かす取っ手。ここだけがドラッグを受ける
    const info = Util.el('div', 'usel uhandle');
    info.innerHTML = '<i class="ugrip"></i>' +
      '<b style="color:' + u.def.color + '">' + u.def.name + '</b>' +
      '<span id="uInfo">' + uInfoText() + '</span>';
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
    const ar = Game.arcRange(u.def);
    const arcPct = Math.round(Game.arcT(u) * 100);
    p.appendChild(bar(spot ? '着弾範囲' : '射界', 0, 100, arcPct, (v) => {
      const want = ar.min + (ar.max - ar.min) * (v / 100);
      Game.setArc(u, want - u.arc);
      this.tutAimed = true;
      const el = document.getElementById('uInfo');
      if (el) el.textContent = uInfoText();
      Game.save();
    }));

    const row = Util.el('div', 'urow');
    const mk = (label, fn, cls) => {
      const b = Util.el('button', 'chip ' + (cls || ''), label);
      b.disabled = !build;
      b.addEventListener('click', fn);
      return b;
    };
    // 指定攻撃だけ、砲弾を落とす場所を指せる
    if (spot) {
      row.appendChild(mk(this.aiming === u ? '…タップ' : '着弾円', () => {
        this.aiming = (this.aiming === u) ? null : u;
        this.moving = null; this.placingType = null;
        this.renderTray();
      }));
    }
    row.appendChild(mk('移動', () => {
      this.moving = u; this.aiming = null; this.placingType = null; this.renderTray();
    }));
    row.appendChild(mk('撤去', () => {
      if (Game.removeUnit(u)) { this.selected = null; this.moving = null; this.renderTray(); Game.save(); }
    }, 'danger'));
    row.appendChild(mk('閉じる', () => { this.selected = null; this.moving = null; this.aiming = null; this.renderTray(); }));
    p.appendChild(row);

    if (this.aiming === u) p.appendChild(Util.el('div', 'trayhint', '砲弾を落とす場所をタップ（壁の向こうでもよい）'));
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
    // **スナイパーを書かない。**（ユーザー 2026-09-23
    //   「初期装備はガトリング一種でいい、チュートリアルでスナイパーと出るからそこも消しておこう」）
    //   初期の持ち物はガトリングだけ（`STARTER_CARDS`）。スナイパーは第2章の突破報酬なので、
    //   第1章のチュートリアルに名前が出ると「持っていないものを説明される」ことになる
    { t: '左上の武器をひとつ選ぶ',      s: 'GAT はガトリング' },
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
    // スキルツリーだけは、下に詳細と購入ボタンを貼り付ける並びにする
    p.classList.toggle('treemode', this.tab === 'skill' && Game.tabOpen('skill'));

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
        '<div class="stmini" data-sid="' + (unlocked ? s.id : '') + '">' + (unlocked ? '' : '<span class="lk">🔒</span>') + '</div>' +
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
    // **ミニマップは1枚ずつ後から描く。**盤を作るのに大きい盤で1枚0.2秒かかるので、
    //   開いている章を全部その場で作ると一覧が数秒固まる
    const todo = Array.from(p.querySelectorAll('.stmini[data-sid]')).filter(el => el.dataset.sid);
    const step = () => {
      const el = todo.shift();
      if (!el) return;
      if (el.isConnected) el.innerHTML = this.miniMap(STAGE_BY_ID[el.dataset.sid]);
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  },

  // **実際に遊ぶ盤から描く。**（2026-09-24）
  //   前は `s.map`（手書きの四角い盤）を描いていた。生成マップに移ってからは
  //   手書きの盤はほぼ使われていないので、**ミニマップだけが別の地形を見せていた。**
  //   しかも四角いタイルのまま。盤と同じく、通路の六角を壁の上に抜いて描く
  miniMap(s) {
    const st = Stage.build(s.id);
    const R = MapGen.HEX_R;
    // 盤と同じく、**四角で切らずに六角の輪郭のまま**描く（外周の六角がはみ出すぶん余白を取る）
    let out = '<svg viewBox="' + (-R) + ' ' + (-R) + ' ' + (st.w + 2 * R) + ' ' + (st.h + 2 * R) + '" class="mm">';
    const hex = (x, y) => {
      let d = '';
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        d += (i ? ' ' : '') + (x + Math.cos(a) * R).toFixed(0) + ',' + (y + Math.sin(a) * R).toFixed(0);
      }
      return '<polygon points="' + d + '"/>';
    };
    if (st.vec) {
      out += '<g fill="#3b3527">';                                                 // 置ける壁
      for (const h of Render.wallHexes(st)) out += hex(h.x, h.y);
      out += '</g>';
    } else {
      out += '<rect width="' + st.w + '" height="' + st.h + '" fill="#3b3527"/>';
    }
    out += '<g fill="#0c0e13">';                                                   // 通路
    if (st.vec) for (const h of st.vec.hexes) out += hex(h.x, h.y);
    else {
      // 生成が通らず手書きの盤に落ちたとき（六角の情報が無い）
      for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
        if (st.grid[r][c] === '.') out += '<rect x="' + c * TILE + '" y="' + r * TILE + '" width="' + TILE + '" height="' + TILE + '"/>';
      }
    }
    out += '</g>';
    const dot = (t, col) => {
      const p = st.center(t.c, t.r);
      return '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (TILE * 0.7) + '" fill="' + col + '"/>';
    };
    for (const t of st.spawns) out += dot(t, '#ff5566');                           // 出現口
    out += dot(st.core, '#ffa32e');                                                // コア
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

    // **詳細と購入ボタンはパネルの下に貼り付ける。**
    // 前はツリーの後ろに流していたので、スマホだと節をタップしても
    // 強化ボタンが画面の外にいて、いちいちスクロールが要った
    const foot = Util.el('div', 'tfoot');
    foot.appendChild(this.treeDetail());
    foot.appendChild(this.treePoints());
    p.appendChild(foot);
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
    const cap = Skill.maxOf(perm, id);
    const maxed = lv >= cap;
    const capWhy = Skill.capReason(perm, id);
    const can = Game.canBuySkills() && Skill.canBuy(meta, perm, id);

    const d = Util.el('div', 'tdetail');
    if (!unlocked) {
      d.innerHTML = '<div class="tdhead"><div class="sic">🔒</div>' +
        '<div class="sbody"><div class="sname">？？？</div></div></div>' +
        '<div class="tdesc">' + Skill.lockReason(perm, id) + '</div>';
      return d;
    }
    // **アイコン＋題名＋一行＋ボタン。** これ以上は詰めない
    d.innerHTML =
      '<div class="tdhead"><div class="sic">' + n.icon + '</div><div class="sbody">' +
        '<div class="sname">' + n.name + (n.swapId ? ' <u>換装</u>' : '') + '</div>' +
        '<div class="tdesc">' + Skill.shortDesc(n) + '</div></div>' +
        '<div class="tdlv">Lv ' + lv + (cap !== Infinity ? '<i>/' + cap + '</i>' : '') + '</div></div>' +
      '<div class="tdbuy"><button class="sbuy"' + (can ? '' : ' disabled') + '>' +
        // 進行で止まっているときに「MAX」と出すと、もう伸びないと誤解される
        (maxed ? (capWhy ? 'まだ伸ばせない' : 'MAX') : '◈ ' + Util.fmt(Skill.cost(meta, id))) + '</button></div>' +
      // **お金で買えない上限は、その理由を出す。** 値段のせいだと誤解させない
      (capWhy ? '<div class="tdcap">' + capWhy + '</div>' : '');

    const btn = d.querySelector('.sbuy');
    let hold = null;
    // **押しっぱなしで連打できるので、描き直さずその場で書き換える。**
    // 描き直すと押している要素が消えて、連打が途切れる
    const doBuy = () => {
      if (!Game.canBuySkills()) return;
      if (!Skill.buy(Game.meta, Game.perm, id)) return;
      Game.applyMods();
      const lv2 = Skill.lv(meta, id);
      const cap2 = Skill.maxOf(Game.perm, id);
      d.querySelector('.tdlv').textContent = 'Lv ' + lv2 + (cap2 !== Infinity ? ' / ' + cap2 : '');
      btn.textContent = lv2 >= cap2 ? 'MAX' : '◈ ' + Util.fmt(Skill.cost(meta, id)) + ' で強化';
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

    // ---- 換装：**付け替えはここでやる。** パックで受け取った部品の置き場 ----
    if (Skill.hasSwapFor(id)) {
      const owned = Skill.ownedSwapsFor(perm, id);
      const sw = Util.el('div', 'tdswap');
      if (!owned.length) {
        sw.innerHTML = '<div class="tdswhead">換装</div>' +
          '<div class="tdswnone">この節に差せる部品があります。<b>パックから出ます。</b></div>';
      } else {
        sw.innerHTML = '<div class="tdswhead">換装　<i>レベルと値段はそのまま</i></div>';
        const line = Util.el('div', 'tdswrow');
        const mk = (label, icon, desc, on, onclick) => {
          const b = Util.el('button', 'swopt' + (on ? ' on' : ''));
          b.innerHTML = '<span class="swi">' + icon + '</span>' +
            '<span class="swn">' + label + '</span>' +
            '<span class="swd">' + desc + '</span>';
          b.addEventListener('click', () => { if (!on) onclick(); });
          return b;
        };
        line.appendChild(mk('元のまま', s.icon, Skill.shortDesc(s), !n.swapId, () => {
          Skill.setSwap(Game.perm, id, null);
          Game.applyMods(); Game.save(); Snd.ui(); this.refreshTree();
        }));
        for (const o of owned) {
          line.appendChild(mk(o.name, o.icon, Skill.shortDesc(o), n.swapId === o.id, () => {
            Skill.setSwap(Game.perm, id, o.id);
            Game.applyMods(); Game.save(); Snd.ui(); this.refreshTree();
          }));
        }
        sw.appendChild(line);
      }
      d.appendChild(sw);
    }
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
  // 買った直後の描き直し。**縦横のスクロール位置をそのまま保つ**
  refreshTree() {
    const sc = document.getElementById('tree');
    const x = sc ? sc.scrollLeft : 0;
    const ty = sc ? sc.scrollTop : 0;
    const y = this.el.panel.scrollTop;
    this.renderPanel();
    const sc2 = document.getElementById('tree');
    // **2回戻す。** 描き直した直後はまだ中身の幅が確定しておらず、
    // 横位置が途中までしか戻らない（406 まで出せる場所で 203 に丸められていた）
    const put = () => {
      const e = document.getElementById('tree');
      if (e) { e.scrollLeft = x; e.scrollTop = ty; }
      this.el.panel.scrollTop = y;
    };
    if (sc2) put();
    setTimeout(put, 0);
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
    // **3列 × 縦スクロール。** 縦に並べると、増えたぶんだけ画面が伸び続けていた
    const grid = Util.el('div', 'syngrid');
    for (const id of CARD_IDS) {
      const c = CARDS[id];
      if (c.kind !== 'synergy') continue;
      const ok = c.requires.every(w => ids.includes(w));
      const owned = Game.own(id) > 0;
      const cell = Util.el('div', 'syncell' + (ok ? (owned ? ' on' : ' noown') : ' off'));
      const icons = c.requires.map(w => (WEAPONS[w] && WEAPONS[w].icon) || '◆').join(' ');
      const pair = c.requires.map(w => (WEAPONS[w] && WEAPONS[w].short) || '??').join(' × ');
      cell.innerHTML = '<span class="si">' + icons + '</span>' +
        '<span class="sn">' + c.name + '</span>' +
        '<span class="sc">' + pair + '</span>' +
        '<span class="se">' + this.shortDesc(c) + '</span>';
      // 長い全文は、読もうとしてタップしたときだけ
      cell.addEventListener('click', () => this.openModal(
        this.cardEl(c, { count: Game.own(id) }), true));
      grid.appendChild(cell);
    }
    syn.appendChild(grid);
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
    head.innerHTML = '<b>パック開封</b><span class="sub">コインでは買えません</span>';
    p.appendChild(head);

    for (const pid of PACK_IDS) {
      const pk = PACKS[pid];
      const n = Game.perm.packs[pid] || 0;
      // 遺物パックは初回転生で解放される。それまでは存在も見せない
      if (pid === 'relic' && !Pack.isUnlocked(Game.perm, pid)) continue;
      const unlocked = Pack.isUnlocked(Game.perm, pid);
      const row = Util.el('div', 'prow' + (n > 0 && unlocked ? ' can' : ''));
      row.innerHTML = '<div class="pico" style="background:' + pk.color + '22;border-color:' + pk.color + '">⬢</div>' +
        '<div class="sbody"><div class="sname">' + pk.name + ' <em>×' + n + '</em></div>' +
        '<div class="sdesc">' + (unlocked
          ? pk.desc + '<br>' + pk.size + '枚入り' + (pk.guarantee ? ' / ' + BAL.rarity[pk.guarantee].name + '以上1枚確定' : '')
          : Pack.lockReason(Game.perm, pid)) + '</div></div>' +
        '<button class="sbuy"' + (n > 0 && unlocked ? '' : ' disabled') + '>開封</button>' +
        // **1枚ずつ開けるのは、溜まってくると作業になる。** まとめて開けられるようにする
        '<button class="sbuy bulk"' + (n > 1 && unlocked ? '' : ' disabled') + '>×' + n + '</button>';
      const btns = row.querySelectorAll('.sbuy');
      btns[0].addEventListener('click', () => this.openPack(pid));
      btns[1].addEventListener('click', () => this.openPackBulk(pid));
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
  // 持っているぶんを全部いっぺんに開ける。
  //   **1枚ずつめくる演出は、溜まってくるとただの作業になる。**
  //   中身は1枚ずつ開けたときと完全に同じ（同じ Pack.open を回数ぶん呼ぶだけ）。
  //   換装だけは選ばせる必要があるので、まとめたあとに順番に出す
  openPackBulk(pid) {
    if (this._opening) return;
    const n = Game.perm.packs[pid] || 0;
    if (n <= 0) return;
    this._opening = true;
    Snd.resume();
    const luck = Skill.mods(Game.meta, Game.perm).packLuck;
    const got = {};            // cardId -> 枚数
    const fresh = {};          // 初めて手に入れたか
    const swaps = [];
    for (let k = 0; k < n; k++) {
      for (const id of Pack.open(pid, luck)) {
        if (Game.own(id) === 0 && !got[id]) fresh[id] = true;
        got[id] = (got[id] || 0) + 1;
        Game.grant(id, 1);
      }
      if (Util.chance(Pack.swapChance(pid))) {
        const c = Skill.swapChoices(Game.meta, Game.perm, 3);
        if (c.length) swaps.push(c);
      }
    }
    Game.perm.packs[pid] = 0;
    Game.save();
    Snd.pack();

    const pk = PACKS[pid];
    const ids = Object.keys(got).sort((a, b) =>
      BAL.rarityOrder.indexOf(CARDS[b].rarity) - BAL.rarityOrder.indexOf(CARDS[a].rarity));
    const newCount = Object.keys(fresh).length;

    const body = Util.el('div', 'gacha');
    body.style.setProperty('--pc', pk.color);
    body.innerHTML =
      '<div class="gtop"><b>' + pk.name + ' ×' + n + '</b>' +
      '<span>' + ids.reduce((a, id) => a + got[id], 0) + '枚　新規 ' + newCount + '種</span></div>' +
      '<div class="gbody"></div><div class="ghint"></div>';
    const stage = body.querySelector('.gbody');
    const grid = Util.el('div', 'bulkgrid');
    for (const id of ids) grid.appendChild(this.cardEl(CARDS[id], { small: true, count: got[id], isNew: !!fresh[id] }));
    stage.appendChild(grid);
    this.openModal(body, true);
    if (newCount) this.burst('#ffb43c');

    // 換装は選ばせる。出た回数ぶん、順番に
    let si = 0;
    const nextSwap = () => {
      if (si >= swaps.length) {
        const close = Util.el('button', 'bigbtn', '受け取る');
        close.addEventListener('click', () => { this.closeModal(); this.renderPanel(); });
        body.appendChild(close);
        return;
      }
      const set = swaps[si++];
      stage.innerHTML = '';
      stage.appendChild(this.choiceHead('換装 ' + si + ' / ' + swaps.length,
        'スキルツリーの節を1つ、別の効き方に差し替える部品　レベルと値段はそのまま'));
      const row = Util.el('div', 'chrow');
      for (const sw of set) {
        const base = SKILL_BY_ID[sw.base];
        const cur = Skill.node(sw.base);
        const el = this.choiceCard({
          name: sw.name,
          desc: '<span class="swfrom">' + cur.icon + ' ' + cur.name + '：' + Skill.shortDesc(cur) + '</span>' +
                '<span class="swarrow">▼ ここに差す</span>' +
                '<span class="swto">' + sw.icon + ' ' + sw.name + '：' + Skill.shortDesc(sw) + '</span>',
          icon: sw.icon, color: 'var(--acc2)', isNew: true,
          type: base.group + 'の節「' + base.name + '」用',
          foot: 'Lv <b>' + Skill.lv(Game.meta, sw.base) + '</b> はそのまま引き継ぐ',
        });
        el.addEventListener('click', () => {
          Skill.applySwap(Game.perm, sw.id); Game.applyMods(); Game.save();
          this.toastMsg(base.name + ' → ' + sw.name + ' に換装', '#ff7a18');
          nextSwap();
        });
        row.appendChild(el);
      }
      stage.appendChild(row);
      stage.appendChild(Util.el('div', 'swnote',
        '選んだ部品は手持ちに残り、スキルツリーの節をタップすればいつでも付け外しできます。' +
        '元の効き方にも戻せます。選ばなかった部品は手に入りません。'));
      const skip = Util.el('button', 'gskip', 'どれも受け取らない');
      skip.addEventListener('click', nextSwap);
      stage.appendChild(skip);
    };
    if (swaps.length) {
      const go = Util.el('button', 'bigbtn', '換装を選ぶ（' + swaps.length + '回）');
      go.addEventListener('click', () => { go.remove(); nextSwap(); });
      body.appendChild(go);
    } else {
      const close = Util.el('button', 'bigbtn', '受け取る');
      close.addEventListener('click', () => { this.closeModal(); this.renderPanel(); });
      body.appendChild(close);
    }
  },

  // **1回のタップで2枚以上減ることがあった。**（ユーザー報告 2026-09-22・最優先）
  //   減らしているのはこの1箇所だけ（`Game.perm.packs[pid]--`）なので、
  //   **この関数が1タップで複数回呼ばれている。**
  //   開封のモーダルが出るまでのあいだ、下の「開封」ボタンは生きたままで、
  //   連打・二重タップ・合成クリックのどれでも二度目が入る。
  //   **開いている間は受け付けない。**（closeModal で解除する）
  openPack(pid) {
    if (this._opening) return;
    if ((Game.perm.packs[pid] || 0) <= 0) return;
    this._opening = true;
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
        'スキルツリーの節を1つ、別の効き方に差し替える部品　レベルと値段はそのまま'));
      const row = Util.el('div', 'chrow');
      for (const sw of swaps) {
        const base = SKILL_BY_ID[sw.base];
        const lv = Skill.lv(Game.meta, sw.base);
        const cur = Skill.node(sw.base);
        // **何と何が入れ替わるのかを、両方その場に出す。**
        // 新しい効果だけ見せても、何を手放すのか分からず選べない
        const el = this.choiceCard({
          name: sw.name,
          desc: '<span class="swfrom">' + cur.icon + ' ' + cur.name + '：' + Skill.shortDesc(cur) + '</span>' +
                '<span class="swarrow">▼ ここに差す</span>' +
                '<span class="swto">' + sw.icon + ' ' + sw.name + '：' + Skill.shortDesc(sw) + '</span>',
          icon: sw.icon,
          color: 'var(--acc2)',
          isNew: true,
          type: base.group + 'の節「' + base.name + '」用',
          foot: 'Lv <b>' + lv + '</b> はそのまま引き継ぐ',
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
      // **選ばなかったらどうなるのか／あとでどうするのかを、その場に書く。**
      // ここが無いと「今は換えない」を押したあと、戻し方が分からない
      stage.appendChild(Util.el('div', 'swnote',
        '選んだ部品は手持ちに残り、スキルツリーの節をタップすればいつでも付け外しできます。' +
        '元の効き方にも戻せます。選ばなかった部品は手に入りません。'));
      const skip = Util.el('button', 'gskip', 'どれも受け取らない');
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
      Snd.pack();
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

    // **転生ボタンは遺物一覧より前に置く。**
    // 後ろに置くと、遺物が増えるほどスクロールしないと押せなくなる
    const btn = Util.el('button', 'bigbtn danger', '転生する');
    btn.disabled = !Game.canPrestige() || Game.phase === 'battle';
    btn.addEventListener('click', () => this.confirmPrestige());
    p.appendChild(btn);

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
    // **まだ組めないので、説明も出さない。** 枠だけ見せる。
    // 中身が入ったら、ここに組む画面を作る
    const head = Util.el('div', 'phead');
    head.innerHTML = '<b>デッキ</b>';
    p.appendChild(head);

    const grid = Util.el('div', 'deckslots');
    for (let i = 0; i < 12; i++) {
      const s = Util.el('div', 'dslot');
      s.innerHTML = '<span>' + (i + 1) + '</span>';
      grid.appendChild(s);
    }
    p.appendChild(grid);
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
      const el = this.choiceCard({
        name: c.name,
        desc: this.shortDesc(c),
        icon: this.cardIcon(c),
        color: BAL.rarity[c.rarity].color,
        // NEW は出さない。**下の丸が「この出撃でまだ0枚」を示しているので重複する**
        type: c.kind === 'weapon' ? '武器を編成に追加'
            : c.kind === 'synergy' ? 'シナジー'
            : (c.weapon ? WEAPONS[c.weapon].name + ' 強化' : '全体強化'),
        // **3択に「あと◯枚で1凸」は出さない。**（ユーザー 2026-09-23）
        //   > 「**カードパックで被ったものだけ**枚数的にそう処理していただきたく、
        //   >   **3択チョイスでは被せて取る意味は残したい**です」
        //   凸（4枚/8枚/16枚）は**パックで増える所持枚数**の話。
        //   ここへ進捗を出すと、**3択で被せると凸が進む**ように読めてしまう。
        //   実際には3択の重ねは別の仕組みで、**1枚ごとにその場で効く**
        //   （`applyCard` が積むたびに走る。下の丸がその枚数）。
        //   **いまの倍率（×1.24 など）は出す。**その出撃での強さは知りたいので
        rank: Game.cardRank(id), rankMul: c.noRank ? 1 : Game.rankMul(id),
        owned: Game.own(id), totuNext: null,
        pips: { have: run.cards[id] || 0, limit: Game.stackLimit(id) },
        hot: BAL.rarity[c.rarity].glow >= 2,
      });
      el.addEventListener('click', () => {
        if (row.classList.contains('done')) return;   // 二度押しで2枚取らせない
        // **選んだ瞬間を目で分からせる。** 選んだ1枚が残り、他が退く
        row.classList.add('done');
        el.classList.add('sel');
        run.cards[id] = (run.cards[id] || 0) + 1;
        Game.applyCard(id, run);
        run.pendingPicks = Math.max(0, run.pendingPicks - 1);
        this.draftOpen = false;
        setTimeout(() => {
          this.closeModal();
          this.toastMsg('取得: ' + c.name, BAL.rarity[c.rarity].color);
          if (run.pendingPicks > 0) this.showDraft();
          else Game.paused = false;
        }, 260);
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

  // カードのアイコン。**どの武器のものかは絵で示し、文からは省く**
  cardIcon(c) {
    if (c.kind === 'perm') return '◈';
    if (c.kind === 'key') return '⚿';
    if (c.kind === 'synergy') {
      // シナジーは「関わる武器のアイコン2つ」。これだけで条件が分かる
      return (c.requires || []).map(w => (WEAPONS[w] && WEAPONS[w].icon) || '◆').join('');
    }
    if (c.weapon && WEAPONS[c.weapon]) return WEAPONS[c.weapon].icon || '◈';
    return '✦';
  },

  // 短い説明。**武器名は横のアイコンが示すので、文からは落とす。**
  // 長い文章は、読もうとしてタップしたときだけ出す
  shortDesc(c) {
    let s = c.desc || '';
    if (c.weapon && WEAPONS[c.weapon]) {
      s = s.replace(new RegExp('^' + WEAPONS[c.weapon].name + 'の?'), '');
      s = s.replace(new RegExp('^' + WEAPONS[c.weapon].name + '弾が?'), '');
    }
    s = s.replace(/^編成枠に装備。/, '');
    const cut = s.indexOf('。');
    if (cut > 0) s = s.slice(0, cut);
    return s;
  },

  choiceCard(o) {
    const el = Util.el('button', 'chcard pick' + (o.hot ? ' hot' : ''));
    el.style.setProperty('--ac', o.color || 'var(--acc)');
    el.innerHTML =
      (o.isNew ? '<span class="chnew">NEW</span>' : '') +
      this.rankBadge(o.rank, o.rankMul, o.owned, o.totuNext) +
      '<div class="chname">' + o.name + '</div>' +
      '<div class="chart">' + o.icon + '</div>' +
      '<div class="chdesc">' + o.desc + '</div>' +
      (o.pips ? this.stackPips(o.pips) : '') +
      (o.foot ? '<div class="chval">' + o.foot + '</div>' : '') +
      '<div class="chtype">' + o.type + '</div>';
    return el;
  },

  // ---- ダブり・所持・選択を **絵で** 示す部品（文は増やさない） ----
  //
  //   右上の菱形 … **凸の数**（4枚で1凸・8枚で2凸・16枚で3凸）。0凸のときは出さない。
  //                 何枚で次の凸かも添える（枚数＝ランクではなくなったので）
  //   下の丸     … この出撃で何枚積んだか。塗り＝積み済み、白抜き＝いま押すと埋まる枠
  //   倍率を数字で添えるのは、説明文の「×1.32」が実際と食い違うのを防ぐため。
  //   説明文そのものは書き換えない（代償や上限は倍率が乗らないので、嘘になる）
  rankBadge(rank, mul, owned, next) {
    const totu = (rank || 1) - 1;
    // 0凸でも「あと何枚で1凸か」は出す。**枚数が増えても何も起きない**のを
    // 黙っていると、壊れているように見える
    if (totu <= 0) {
      if (!owned || !next) return '';
      return '<span class="chrank dim"><u>あと' + (next - owned) + '枚で1凸</u></span>';
    }
    const n = Math.min(totu, 5);
    // ランクで伸びないカードは倍率を出さない（×1.00 と出すのは嘘に近い）
    const m = (mul || 1) > 1.0001 ? '<b>×' + mul.toFixed(2) + '</b>' : '';
    const nx = next ? '<u>あと' + (next - owned) + '枚</u>' : '';
    return '<span class="chrank">' + '<i></i>'.repeat(n) + (totu > 5 ? '<u>+</u>' : '') + m + nx + '</span>';
  },
  stackPips(p) {
    const lim = Math.min(p.limit, 8);
    let s = '<div class="chpip">';
    for (let i = 0; i < lim; i++)
      s += '<i class="' + (i < p.have ? 'f' : i === p.have ? 'n' : '') + '"></i>';
    if (p.limit > lim) s += '<u>+</u>';
    return s + '</div>';
  },

  // ================= カードの見た目 =================
  cardEl(c, o) {
    o = o || {};
    const R = BAL.rarity[c.rarity];
    const el = Util.el('div', 'card r-' + c.rarity + (o.small ? ' small' : '') + (o.dim ? ' dim' : '') +
      (o.pick ? ' pick' : '') + (o.reveal ? ' reveal' : ''));
    el.style.setProperty('--rc', R.color);
    let sub = '';
    if (o.count !== undefined) {
      // **凸の進捗はここ（コレクション）に出す。**（ユーザー 2026-09-23）
      //   > 「**カードパックで被ったものだけ**枚数的にそう処理していただきたく、
      //   >   3択チョイスでは被せて取る意味は残したいです」
      //   凸は**パックで増える所持枚数**の話なので、枚数が並ぶこの画面が置き場所。
      //   以前は3択の側だけに「あと◯枚で1凸」が出ていて、
      //   **3択で被せると凸が進む**ように読めてしまっていた
      sub = o.count > 0 ? '×' + o.count : '未所持';
      if (o.count > 0 && !c.noRank) {
        const totu = Game.cardTotu(c.id);
        const next = Game.cardTotuNext(c.id);
        if (totu > 0) sub += ' <b class="totu">' + totu + '凸</b>';
        if (next) sub += ' <u class="totunx">あと' + (next - o.count) + '枚</u>';
      }
    } else if (o.stacks) sub = o.stacks + ' / ' + o.limit + ' 枚目';
    // **アイコン＋題名＋一行。** 長い説明は、読もうとしてタップしたときだけ出す
    const short = this.shortDesc(c);
    const full = c.desc || '';
    el.innerHTML =
      '<div class="chead"><span class="cico">' + this.cardIcon(c) + '</span>' +
        '<span class="crar">' + R.name + '</span></div>' +
      '<div class="cname">' + c.name + '</div>' +
      '<div class="cdesc">' + short + '</div>' +
      '<div class="cfoot">' + sub + (o.isNew ? ' <b class="new">NEW</b>' : '') + '</div>';

    // 3択のカードはタップが「選ぶ」なので、そちらでは開かない
    if (!o.pick && full !== short) {
      el.classList.add('canopen');
      el.addEventListener('click', () => {
        const open = el.classList.toggle('open');
        el.querySelector('.cdesc').textContent = open ? full : short;
      });
    }
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
    this._opening = false;          // パックの多重開封の鍵を戻す（openPack）
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

  // スキップの結果。**手で突破したときと同じものが出た**ことを、そのまま並べる
  showSkipResult(res) {
    const body = Util.el('div');
    body.appendChild(this.choiceHead('スキップ',
      res.stage.name + ' を通過しました（突破ではありません）'));
    body.appendChild(Util.el('div', 'note',
      'チェックマークが付いて次の章へ進めます。'
      + 'コインもカードも手に入らず、**転生でもらえる量にも数えません。**'
      + 'この章の初回突破報酬は残っているので、あとから自分で突破すれば受け取れます。'
      + '先へ急ぐための機能で、強くなるための機能ではありません。'));
    const ok = Util.el('button', 'bigbtn', '次へ');
    ok.addEventListener('click', () => { this.closeModal(); this.renderHome(); });
    body.appendChild(ok);
    this.openModal(body, true);
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
