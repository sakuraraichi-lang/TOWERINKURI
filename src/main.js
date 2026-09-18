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
      if (Game.phase === 'battle') this.retreat();
      else this.beginBattle();
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
      '<b>準備フェーズ</b>でアップグレードを買い、編成を決め、武器を<b>壁の上</b>に置く。<br>' +
      '戦闘に入るとアップグレードは買えない。置き場所だけは動かせる。<br><br>' +
      '<b>ウェーブを1つ凌ぐごとにカードを1枚選べる</b>（1ステージで4回）。<br>' +
      'アップグレードの「増設スロット」で、1回に取れる枚数を増やせる。<br><br>' +
      '盤面の<b>色の濃いところが敵の溜まり場</b>、<b>赤い枠が抜けられたルート</b>。<br>' +
      'それを見て置き場所を決めるのがこのゲームの本体。</p>';
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
    UI.placing = null;
    UI.renderTray();
    UI.renderPanel();
    const b = document.getElementById('btnStart');
    b.textContent = '戦闘開始';
    b.classList.remove('danger');
    b.classList.add('go');
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
    const b = document.getElementById('btnStart');
    b.textContent = '撤退';
    b.classList.add('danger');
    b.classList.remove('go');
    UI.toastMsg('ウェーブ 1 / ' + BAL.wavesPerStage, '#4ea8ff');
  },

  retreat() { this.finish(false); },

  finish(ok) {
    const res = Game.endRun(ok);
    const b = document.getElementById('btnStart');
    b.textContent = '戦闘開始';
    b.classList.remove('danger');
    b.classList.add('go');
    UI.placing = null;
    UI.renderTray();
    UI.renderPanel();
    if (res) UI.showResult(res);
  },

  // ---------- 配置（壁の上だけ） ----------
  bindPlacement(cv) {
    let dragging = null, moved = false, downAt = null;

    const weaponAt = (c, r) => {
      const run = Game.run;
      if (!run) return null;
      return run.weapons.find(w => w.c === c && w.r === r) || null;
    };
    const tryPlace = (w, c, r) => {
      if (!Game.run.stage.isWall(c, r)) { UI.toastMsg('壁の上にしか置けません', '#ff8080'); return false; }
      if (!Game.moveWeapon(w, c, r)) { UI.toastMsg('そこには別の武器があります', '#ff8080'); return false; }
      Game.save();
      return true;
    };

    cv.addEventListener('pointerdown', (e) => {
      const run = Game.run;
      if (!run || run.over) return;
      const t = Render.tileAt(e.clientX, e.clientY);
      downAt = { x: e.clientX, y: e.clientY };
      moved = false;

      const onTile = weaponAt(t.c, t.r);
      if (UI.placing && !onTile) {
        if (tryPlace(UI.placing, t.c, t.r)) { UI.placing = null; UI.renderTray(); }
        return;
      }
      if (onTile) {
        dragging = onTile;
        UI.placing = onTile;
        UI.renderTray();
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
        e.preventDefault();
      }
    });

    cv.addEventListener('pointermove', (e) => {
      if (!dragging || !downAt) return;
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) moved = true;
      if (!moved) return;
      const t = Render.tileAt(e.clientX, e.clientY);
      if (t.c === dragging.c && t.r === dragging.r) return;
      if (Game.run.stage.isWall(t.c, t.r)) Game.moveWeapon(dragging, t.c, t.r);
      e.preventDefault();
    });

    const end = () => {
      if (dragging && moved) { Game.save(); UI.placing = null; UI.renderTray(); }
      dragging = null; downAt = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
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
          // ウェーブを1つ凌ぐごとにカードを引ける
          run.tower.hp = Math.min(run.tower.maxHp, run.tower.hp + run.tower.maxHp * run.mods.regen);
          run.pendingPicks += run.mods.picks;
          UI.toastMsg('ウェーブ ' + run.wave + ' 突破', '#7ee3a0');
          break;
        }
      }
      if (!run.over && run.pendingPicks > 0 && !UI.draftOpen) UI.showDraft();
    }

    Render.draw(run);
    UI.renderHud();
  },
};

window.addEventListener('load', () => Main.init());
