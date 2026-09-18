// ---------------------------------------------------------------
// main.js : 起動・ゲームループ・配置入力（タッチ／マウス共通）
// ---------------------------------------------------------------
'use strict';

const Main = {
  last: 0,
  raf: 0,

  init() {
    Game.load();
    Game.checkMissions();

    const bad = Stage.validateAll();
    if (bad.length) console.error('ステージ定義がおかしい:', bad);

    const cv = document.getElementById('cv');
    Render.init(cv);
    UI.init();

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
    b.innerHTML += '<p class="note">敵は通路を通ってコアへ向かう。<b>武器は壁の上にだけ置ける。</b><br>' +
      'マップはステージごとに違い、どこに置くかがそのまま攻略になる。<br><br>' +
      '<b>◈コイン</b> → 下の「スキル」でひたすら数字を上げる（ラン中も買える）<br>' +
      '<b>経験値</b> → レベルアップで <b>3択カード</b>。武器の挙動そのものが変わる<br><br>' +
      'ステージを突破すると新しい武器カードが解放され、<br>' +
      'カードパックからは刀・手裏剣・触手・泡といった変わり種が出る。<br>' +
      'コアが壊れてもコインとスキルは残る。転生すると、それも捨ててパックに換わる。</p>';
    const ok = Util.el('button', 'bigbtn', 'はじめる');
    ok.addEventListener('click', () => { UI.closeModal(); this.startRun(); });
    b.appendChild(ok);
    UI.openModal(b, true);
  },

  startRun(stageId) {
    if (Game.loadoutWeapons().length === 0) {
      UI.toastMsg('武器を1つ以上編成してください', '#ff8080');
      UI.tab = 'load'; UI.renderTabs(); UI.renderPanel();
      return;
    }
    Game.startRun(stageId);
    Render.fit();
    Combat.startWave(Game.run);
    Game.paused = false;
    UI.placing = null;
    UI.renderTray();
    const b = document.getElementById('btnStart');
    b.textContent = '自壊'; b.classList.add('danger');
    UI.renderPanel();
  },

  selfDestruct() { if (Game.run && !Game.run.over) this.finish(); },

  finish() {
    const res = Game.endRun();
    const b = document.getElementById('btnStart');
    b.textContent = '出撃'; b.classList.remove('danger');
    UI.placing = null;
    UI.renderTray();
    if (res) UI.showResult(res);
    UI.renderPanel();
  },

  // ---------- 配置（壁の上だけ） ----------
  bindPlacement(cv) {
    let dragging = null;
    let moved = false;
    let downAt = null;

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
      if (dragging && moved) {
        Game.save();
        UI.placing = null;
        UI.renderTray();
      }
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

    if (run && !run.over && !Game.paused && !UI.draftOpen) {
      for (let i = 0; i < Game.speed; i++) {
        const r = Combat.update(run, dt);
        if (r === 'dead') { this.finish(); break; }
      }
      if (!run.over) {
        // ウェーブを1つ終えるたびに、ステージ突破の条件を見る
        if (run.justClearedWave) {
          const w = run.justClearedWave;
          run.justClearedWave = null;
          const def = STAGE_BY_ID[run.stageId];
          if (!run.cleared && w >= def.clearWave) {
            run.cleared = true;
            const got = Game.clearStage(run.stageId);
            if (got) { Game.paused = true; UI.renderPanel(); UI.showStageClear(got); }
          }
        }
        if (run.pendingDrafts > 0 && !UI.draftOpen) UI.showDraft();
      }
    }

    Render.draw(run);
    UI.renderHud();
  },
};

window.addEventListener('load', () => Main.init());
