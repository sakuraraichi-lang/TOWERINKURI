// ---------------------------------------------------------------
// main.js : 起動・ゲームループ・配置入力
//   準備フェーズ → 戦闘（5ウェーブ） → 結果 の順に回す
// ---------------------------------------------------------------
'use strict';

const HEAT_MODES = [
  { heat: true,  leak: true,  label: '熱+漏' },
  { heat: true,  leak: false, label: '熱' },
  { heat: false, leak: true,  label: '漏' },
  { heat: false, leak: false, label: 'off' },
];

const Main = {
  last: 0,
  raf: 0,
  heatMode: 0,

  init() {
    Game.load();
    Game.checkMissions();

    const bad = Stage.validateAll();
    if (bad.length) console.error('ステージ定義がおかしい:', bad);

    const cv = document.getElementById('cv');
    Render.init(cv);
    UI.init();

    document.getElementById('btnStart').addEventListener('click', () => {
      if (Game.phase !== 'battle') { this.beginBattle(); return; }
      if (Game.run && Game.run.phase === 'build') { this.nextWave(); return; }
      this.retreat();
    });
    document.getElementById('btnPause').addEventListener('click', (e) => {
      Game.paused = !Game.paused;
      e.currentTarget.textContent = Game.paused ? '▶' : '❙❙';
    });
    document.getElementById('btnSpeed').addEventListener('click', (e) => {
      Game.speed = Game.speed === 1 ? 2 : Game.speed === 2 ? 3 : 1;
      e.currentTarget.textContent = '×' + Game.speed;
    });
    document.getElementById('btnHeat').addEventListener('click', (e) => {
      this.heatMode = (this.heatMode + 1) % HEAT_MODES.length;
      const m = HEAT_MODES[this.heatMode];
      Game.showHeat = m.heat; Game.showLeak = m.leak;
      e.currentTarget.textContent = m.label;
    });
    document.getElementById('btnPanel').addEventListener('click', () => {
      document.getElementById('app').classList.toggle('collapsed');
      setTimeout(() => Render.resize(), 30);
    });

    UI.el.modal.addEventListener('click', (e) => {
      if (e.target === UI.el.modal && UI.el.modal.dataset.noclose !== '1') UI.closeModal();
    });

    this.bindPlacement(cv);

    window.addEventListener('resize', () => Render.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => Render.resize(), 250));
    document.addEventListener('visibilitychange', () => { if (document.hidden) Game.save(); });
    setInterval(() => Game.save(), 8000);

    this.toPrep();

    if (!Game.perm.seenIntro) {
      Game.perm.seenIntro = true;
      Game.save();
      this.intro();
    }

    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  },

  intro() {
    const b = Util.el('div');
    b.appendChild(Util.el('h3', null, 'INKURIMENT'));
    b.innerHTML += '<p class="note">' +
      '<b>1ステージ＝' + BAL.wavesPerStage + 'ウェーブ。</b>全部凌げば突破、コアが割れたら失敗。<br>' +
      '失敗してもコインとアップグレードは残るので、整えてもう一度挑む。<br><br>' +
      '<b>準備フェーズ</b>でアップグレードを買い、編成を決め、ユニットを<b>地面</b>に置く。<br>' +
      '同じ武器を上限まで何基でも置ける。ユニットは<b>向いている扇の中だけ</b>攻撃する。<br>' +
      '扇を狭めるほど弾がまとまり（集弾率が上がり）、広げるほど守備範囲が増える代わりに散る。<br>' +
      'ウェーブとウェーブの間は<b>ウェーブ間</b>。ここでは<b>置き直しだけ</b>できる。<br>' +
      '<b>アップグレードを買えるのは準備フェーズだけ</b>（戦闘に入ると買えない）。<br><br>' +
      '<b>ウェーブを1つ凌ぐごとにカードを1枚選べる</b>（1ステージで4回）。<br>' +
      'アップグレードの「増設スロット」で、1回に取れる枚数を増やせる。<br><br>' +
      '盤面の<b>色の濃いところが敵の溜まり場</b>、<b>赤い枠が抜けられたルート</b>。<br>' +
      'それを見て、角度をつけて射線を重ねるのがこのゲームの本体。</p>';
    const ok = Util.el('button', 'bigbtn', 'はじめる');
    ok.addEventListener('click', () => UI.closeModal());
    b.appendChild(ok);
    UI.openModal(b, true);
  },

  // ---------- 準備フェーズへ ----------
  toPrep() {
    Game.startPrep(Game.perm.currentStage);
    Render.fit();
    Game.paused = false;
    UI.placingType = null;
    UI.selected = null;
    UI.renderTray();
    UI.renderPanel();
    this.syncStartButton();
  },

  beginBattle() {
    if (Game.loadoutWeapons().length === 0) {
      UI.toastMsg('武器を1つ以上編成してください', '#ff8080');
      UI.tab = 'load'; UI.renderTabs(); UI.renderPanel();
      return;
    }
    Game.beginBattle();
    UI.renderTray();
    UI.renderPanel();
    this.syncStartButton();
    UI.toastMsg('ウェーブ 1 / ' + BAL.wavesPerStage, '#4ea8ff');
  },

  retreat() { this.finish(false); },

  finish(ok) {
    const res = Game.endRun(ok);
    this.syncStartButton();
    UI.placingType = null;
    UI.selected = null;
    UI.renderTray();
    UI.renderPanel();
    if (res) UI.showResult(res);
  },

  // ---------- 配置（地面の上・ビルドフェーズのみ） ----------
  // **なぞって向けるのはやめた。** スマホで狙いづらく、移動に使えるジェスチャも残らない。
  //   武器を選ぶ    → 置ける場所が光る → タップで設置
  //   置いたものをタップ → 選択（向き・射界はバーで決める）
  //   「配置を変える」 → また光る → タップで移動
  bindPlacement(cv) {
    const unitAt = (c, r) => {
      const run = Game.run;
      if (!run) return null;
      return run.units.find(u => u.c === c && u.r === r) || null;
    };
    const no = (msg) => UI.toastMsg(msg, '#ff8080');

    cv.addEventListener('pointerup', (e) => {
      const run = Game.run;
      if (!run || run.over) return;
      const t = Render.tileAt(e.clientX, e.clientY);
      const onTile = unitAt(t.c, t.r);

      // 移動先を選んでいる最中
      if (UI.moving) {
        if (!Game.canBuild()) { no('戦闘中は動かせません'); return; }
        if (onTile) { no('そこには別のユニットがいます'); return; }
        if (!run.stage.buildable(t.c, t.r)) { no('地面にしか置けません'); return; }
        Game.moveUnit(UI.moving, t.c, t.r);
        UI.moving = null;
        Game.save();
        UI.renderTray();
        e.preventDefault();
        return;
      }

      // 新しく置く
      if (UI.placingType && !onTile) {
        if (!Game.canBuild()) { no('戦闘中は配置を変えられません'); return; }
        if (!run.stage.buildable(t.c, t.r)) { no('地面にしか置けません'); return; }
        const u = Game.placeUnit(UI.placingType, t.c, t.r);
        if (!u) { no('そこには置けません'); return; }
        Game.save();
        UI.selected = u;
        UI.placingType = null;
        UI.renderTray();
        e.preventDefault();
        return;
      }

      // 選ぶ／選択を外す
      UI.selected = (onTile && UI.selected !== onTile) ? onTile : null;
      UI.placingType = null;
      UI.moving = null;
      UI.renderTray();
      e.preventDefault();
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  // ボタンの文字をフェーズに合わせる
  syncStartButton() {
    const b = document.getElementById('btnStart');
    const run = Game.run;
    let label, danger = false, go = true;
    if (Game.phase !== 'battle') label = '戦闘開始';
    else if (run && run.phase === 'build') label = 'ウェーブ ' + (run.wave + 1) + ' 開始';
    else { label = '撤退'; danger = true; go = false; }
    if (b.textContent !== label) b.textContent = label;
    b.classList.toggle('danger', danger);
    b.classList.toggle('go', go);
  },

  nextWave() {
    Game.startNextWave();
    UI.placingType = null;
    UI.selected = null;
    UI.renderTray();
    UI.toastMsg('ウェーブ ' + Game.run.wave + ' / ' + BAL.wavesPerStage, '#4ea8ff');
  },

  // ---------- ループ ----------
  loop(t) {
    this.raf = requestAnimationFrame((tt) => this.loop(tt));
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (dt > 0.1) dt = 0.1;
    const run = Game.run;

    if (run && Game.phase === 'battle' && !run.over && !Game.paused && !UI.draftOpen) {
      for (let i = 0; i < Game.speed; i++) {
        const sig = Combat.update(run, dt);
        if (sig === 'dead') { this.finish(false); break; }
        if (sig === 'stageclear') { this.finish(true); break; }
        if (sig === 'waveclear') {
          // ウェーブを1つ凌ぐごとにカードを引ける。そのままビルドフェーズで止まる
          run.lives = Math.min(run.livesMax, run.lives + run.mods.regen);
          run.pendingPicks += run.mods.picks;
          UI.toastMsg('ウェーブ ' + run.wave + ' 突破', '#7ee3a0');
          UI.renderTray();
          break;
        }
      }
      if (!run.over && run.pendingPicks > 0 && !UI.draftOpen) UI.showDraft();
    }

    Render.draw(run);
    UI.renderHud();
    this.syncStartButton();
  },
};

window.addEventListener('load', () => Main.init());
