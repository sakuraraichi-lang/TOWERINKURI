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
    const bm = document.getElementById('btnMute');
    if (bm) {
      bm.textContent = Game.perm.mute ? '🔇' : '🔊';
      bm.addEventListener('click', (e) => {
        Snd.resume();
        Snd.setMute(!Game.perm.mute);
        e.currentTarget.textContent = Game.perm.mute ? '🔇' : '🔊';
      });
    }
    document.getElementById('btnPause').addEventListener('click', (e) => {
      Game.paused = !Game.paused;
      e.currentTarget.textContent = Game.paused ? '▶' : '❙❙';
    });
    document.getElementById('btnSpeed').addEventListener('click', (e) => {
      // ×4 は転生してから。再攻略のテンポを上げる報酬のひとつ
      const top = Game.perm.prestiges >= 1 ? 4 : 3;
      Game.speed = Game.speed >= top ? 1 : Game.speed + 1;
      e.currentTarget.textContent = '×' + Game.speed;
    });
    // ホームの「スタート」で戦場へ。**ここが唯一の入口**
    document.getElementById('homeStart').addEventListener('click', () => {
      const st = STAGES[UI.pick];
      if (!st || !Game.stageUnlocked(st.id)) return;
      Game.perm.currentStage = st.id;
      Game.save();
      this.toBattle();
    });
    // 戦場からホームへ戻る
    document.getElementById('btnHome').addEventListener('click', () => {
      if (Game.phase === 'battle') { this.finish(false); return; }
      this.toHome();
    });

    UI.el.modal.addEventListener('click', (e) => {
      if (e.target === UI.el.modal && UI.el.modal.dataset.noclose !== '1') UI.closeModal();
    });

    this.bindPlacement(cv);

    window.addEventListener('resize', () => Render.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => Render.resize(), 250));
    document.addEventListener('visibilitychange', () => { if (document.hidden) Game.save(); });
    setInterval(() => Game.save(), 8000);

    // 起動したらホーム。**いきなり盤面を出さない**
    Game.startPrep(Game.perm.currentStage);
    UI.setScreen('home');

    // **起動直後の説明モーダルは廃止した。**
    // ルールを1枚に並べても読まれない。戦場で1操作ずつ出す（UI.renderTut）

    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  },

  // ---------- ホームへ ----------
  toHome() {
    Snd.bgmStop();
    UI.placingType = null; UI.selected = null; UI.moving = null;
    Game.paused = false;
    // **ホームの選択を、いま居る章に合わせる。**（2026-09-22）
    //   突破しても `UI.pick` が動かないので、戻ってきたときに
    //   突破したばかりの章が選ばれたままだった。
    //   出撃を押すと同じ章をもう一度遊ぶことになり、
    //   「突破していないことになっている」と見える
    const i = STAGES.findIndex(x => x.id === Game.perm.currentStage);
    if (i >= 0) UI.pick = i;
    UI.setScreen('home');
  },

  // ---------- 戦場（準備フェーズ）へ ----------
  toBattle() {
    UI.setScreen('battle');
    this.toPrep();
    setTimeout(() => Render.resize(), 0);
  },

  toPrep() {
    Game.startPrep(Game.perm.currentStage);
    Render.fit();
    Game.paused = false;
    UI.placingType = null;
    UI.selected = null;
    UI.moving = null;
    UI.renderTray();
    this.syncStartButton();
  },

  beginBattle() {
    if (Game.loadoutWeapons().length === 0) {
      UI.toastMsg('武器を1つ以上編成してください', '#ff8080');
      UI.tab = 'load'; UI.renderTabs(); UI.renderPanel();
      return;
    }
    Game.beginBattle();
    // **戦闘に入ったら、編成のための表示は全部畳む。**
    // 向きのスライダーや配置調整が開いたままだと、触れないものが盤面に残る
    UI.selected = null; UI.placingType = null; UI.moving = null; UI.aiming = null;
    Snd.resume(); Snd.waveStart(); Snd.bgmStart();
    UI.renderTray();
    UI.renderPanel();
    this.syncStartButton();
    UI.toastMsg('ウェーブ 1 / ' + BAL.wavesPerStage, '#ff8a1f');
  },

  retreat() { this.finish(false); },

  // 戦わずに突破扱いにする。**何も失わない**ので、確認だけ取って進める
  doSkip() {
    const st = STAGES[UI.pick];
    if (!st || !Game.canSkip(st.id)) return;
    const res = Game.skipStage(st.id);
    if (!res) return;
    // 次のステージへ自動で送る。スキップは「先へ進むため」の機能なので
    //   （currentStage は skipStage が進めている）
    const nx = res.next;
    if (nx) UI.pick = STAGES.findIndex(s => s.id === nx.id);
    Game.save();
    UI.renderHome();
    UI.renderPanel();
    UI.showSkipResult(res);
  },

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
    const no = (msg) => { Snd.deny(); UI.toastMsg(msg, '#ff8080'); };

    // なぞった量。**9px以上動いたらタップではなく「見る場所を動かした」と見なす**
    let down = null;
    cv.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, moved: false };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.moved && Math.hypot(dx, dy) < 9) return;
      if (!Render.canPan()) { down.moved = true; return; }
      down.moved = true;
      Render.panBy(e.clientX - down.x, e.clientY - down.y);
      down.x = e.clientX; down.y = e.clientY;
      e.preventDefault();
    });
    cv.addEventListener('pointercancel', () => { down = null; });

    cv.addEventListener('pointerup', (e) => {
      const wasPan = down && down.moved;
      down = null;
      if (wasPan) return;                    // 動かしたときは選ばない
      const run = Game.run;
      if (!run || run.over) return;
      const t = Render.tileAt(e.clientX, e.clientY);
      const onTile = unitAt(t.c, t.r);

      // 着弾点を指している最中。**盤面のどこでも指せる**（壁の上でもよい）
      if (UI.aiming) {
        if (!Game.canBuild()) { no('戦闘中は変えられません'); return; }
        Game.setAimPoint(UI.aiming, t.x, t.y);
        Snd.place();
        UI.aiming = null;
        Game.save();
        UI.renderTray();
        e.preventDefault();
        return;
      }

      // 移動先を選んでいる最中
      if (UI.moving) {
        if (!Game.canBuild()) { no('戦闘中は動かせません'); return; }
        if (onTile) { no('そこには別のユニットがいます'); return; }
        if (!run.stage.buildable(t.c, t.r)) { no('地面にしか置けません'); return; }
        Game.moveUnit(UI.moving, t.c, t.r);
        Snd.place();
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
        Snd.place();
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
      UI.aiming = null;
      UI.renderTray();
      e.preventDefault();
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  // ボタンの文字をフェーズに合わせる
  syncStartButton() {
    const b = document.getElementById('btnStart');
    if (!b) return;
    const run = Game.run;
    let label, danger = false;
    if (Game.phase !== 'battle') label = '準備完了';
    else if (run && run.phase === 'build') label = '次のウェーブへ';
    else { label = '撤退'; danger = true; }
    if (b.textContent !== label) b.textContent = label;
    b.classList.toggle('danger', danger);
  },

  nextWave() {
    Game.startNextWave();
    Snd.waveStart();
    UI.placingType = null;
    UI.selected = null;
    UI.renderTray();
    UI.toastMsg('ウェーブ ' + Game.run.wave + ' / ' + BAL.wavesPerStage, '#ff8a1f');
  },

  // ---------- ループ ----------
  loop(t) {
    this.raf = requestAnimationFrame((tt) => this.loop(tt));
    const real = (t - this.last) / 1000;      // 実際に経った時間（fps用。上限を掛けない）
    let dt = real;
    this.last = t;
    if (dt > 0.1) dt = 0.1;
    const run = Game.run;
    const t0 = performance.now();

    if (run && Game.phase === 'battle' && !run.over && !Game.paused && !UI.draftOpen) {
      for (let i = 0; i < Game.speed; i++) {
        const sig = Combat.update(run, dt);
        if (sig === 'dead') { Snd.dead(); this.finish(false); break; }
        if (sig === 'stageclear') { Snd.stageClear(); this.finish(true); break; }
        if (sig === 'waveclear') {
          // ウェーブを1つ凌ぐごとにカードを引ける
          run.lives = Math.min(run.livesMax, run.lives + run.mods.regen);
          run.pendingPicks += run.mods.picks;
          Snd.waveClear();
          UI.toastMsg('ウェーブ ' + run.wave + ' 突破', '#7ee3a0');
          UI.renderTray();
          break;
        }
      }
      if (!run.over && run.pendingPicks > 0 && !UI.draftOpen) UI.showDraft();
      // カードを選び終えていて、設定が「自動で次へ」なら、そのまま次のウェーブへ。
      // 設定はホームの ⚙ で切り替える
      else if (!run.over && run.phase === 'build' && run.pendingPicks === 0
               && !UI.draftOpen && Game.perm.autoWave && run.wave > 0
               && run.wave < BAL.wavesPerStage) {
        this.nextWave();
      }
    }

    Render.draw(run);
    UI.perf(real, performance.now() - t0, run);
    UI.renderHud();
    this.syncStartButton();
  },
};

window.addEventListener('load', () => Main.init());
