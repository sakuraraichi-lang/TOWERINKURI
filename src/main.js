// ---------------------------------------------------------------
// main.js : 起動・ゲームループ・入力（スマホのタッチ操作込み）
// ---------------------------------------------------------------
'use strict';

const Main = {
  last: 0,
  acc: 0,
  raf: 0,

  init() {
    Game.load();
    Game.checkMissions();   // 達成済みだが未受取のミッションを起動時に回収する

    const cv = document.getElementById('cv');
    Render.init(cv);
    UI.init();

    // ボタン
    document.getElementById('btnStart').addEventListener('click', () => {
      if (Game.run && !Game.run.over) this.selfDestruct();
      else this.startRun();
    });
    document.getElementById('btnPause').addEventListener('click', (e) => {
      Game.paused = !Game.paused;
      e.currentTarget.textContent = Game.paused ? '▶' : '❙❙';
    });
    document.getElementById('btnSpeed').addEventListener('click', (e) => {
      Game.speed = Game.speed === 1 ? 2 : Game.speed === 2 ? 3 : 1;
      e.currentTarget.textContent = '×' + Game.speed;
    });

    // モーダルの外側タップで閉じる（3択・開封中は閉じない）
    UI.el.modal.addEventListener('click', (e) => {
      if (e.target === UI.el.modal && UI.el.modal.dataset.noclose !== '1') UI.closeModal();
    });

    this.bindDrag(cv);

    window.addEventListener('resize', () => Render.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => Render.resize(), 250));
    document.addEventListener('visibilitychange', () => { if (document.hidden) Game.save(); });
    setInterval(() => Game.save(), 8000);

    // 初回だけ遊び方を出す
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
    b.innerHTML += '<p class="note">中央の拠点を守り、押し寄せる敵を武器で倒す。<br>' +
      '敵を倒すと <b>◈コイン</b> と <b>経験値</b> が入る。<br><br>' +
      '<b>◈コイン</b> → 下の「スキル」でひたすら数字を上げる（ラン中も買える）<br>' +
      '<b>経験値</b> → レベルアップで <b>3択カード</b>。武器の挙動そのものが変わる<br><br>' +
      '拠点が壊れたらラン終了。コインとスキルは残るので、そのまま次へ。<br>' +
      '節目のウェーブと転生で <b>カードパック</b> が手に入り、カードは永久に残る。</p>';
    const ok = Util.el('button', 'bigbtn', 'はじめる');
    ok.addEventListener('click', () => { UI.closeModal(); this.startRun(); });
    b.appendChild(ok);
    UI.openModal(b, true);
  },

  startRun() {
    if (Game.loadoutWeapons().length === 0) {
      UI.toastMsg('武器を1つ以上編成してください', '#ff8080');
      UI.tab = 'load'; UI.renderTabs(); UI.renderPanel();
      return;
    }
    Game.startRun();
    Combat.startWave(Game.run);
    Game.paused = false;
    document.getElementById('btnStart').textContent = '自壊';
    document.getElementById('btnStart').classList.add('danger');
    UI.renderPanel();
  },

  selfDestruct() {
    if (!Game.run || Game.run.over) return;
    this.finish();
  },

  finish() {
    const res = Game.endRun();
    document.getElementById('btnStart').textContent = '出撃';
    document.getElementById('btnStart').classList.remove('danger');
    if (res) UI.showResult(res);
    UI.renderPanel();
  },

  // ---------- 武器のドラッグ配置（マウスもタッチも同じ扱い） ----------
  bindDrag(cv) {
    let drag = null;
    const pick = (p) => {
      const r = Game.run; if (!r) return null;
      let best = null, bd = 34 * 34;
      for (const w of r.weapons) {
        const d = Util.dist2(p.x, p.y, w.x, w.y);
        if (d < bd) { bd = d; best = w; }
      }
      return best;
    };
    cv.addEventListener('pointerdown', (e) => {
      const p = Render.toField(e.clientX, e.clientY);
      drag = pick(p);
      if (drag) { Game.dragging = true; cv.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = Render.toField(e.clientX, e.clientY);
      const t = Game.run.tower;
      let dx = p.x - t.x, dy = p.y - t.y;
      const d = Math.hypot(dx, dy) || 1;
      const min = t.r + 16, max = BAL.placeR;
      const k = Util.clamp(d, min, max) / d;
      drag.ox = dx * k; drag.oy = dy * k;
      Game.syncWeaponPos();
      e.preventDefault();
    });
    const end = () => {
      if (!drag) return;
      Game.perm.slotPos = Game.perm.slotPos || {};
      for (const w of Game.run.weapons) Game.perm.slotPos[w.id] = { x: w.ox, y: w.oy };
      Game.save();
      drag = null; Game.dragging = false;
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
    if (dt > 0.1) dt = 0.1;               // タブ復帰時の暴走を防ぐ
    const run = Game.run;

    if (run && !run.over && !Game.paused && !UI.draftOpen) {
      const steps = Game.speed;
      for (let i = 0; i < steps; i++) {
        const r = Combat.update(run, dt);
        if (r === 'dead') { this.finish(); break; }
      }
      if (run.pendingDrafts > 0 && !UI.draftOpen && !run.over) UI.showDraft();
    }

    Render.draw(run && !run.over ? run : run);
    UI.renderHud();
  },
};

window.addEventListener('load', () => Main.init());
