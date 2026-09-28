// ---------------------------------------------------------------
// debugroom.js : 演出の確認室（2026-09-29・ユーザー「更新した演出を見れるデバッグルームが欲しいです」）
//
//   URL に ?debugroom を付けて開く（タイトルは出さない）。⚙ の設定の一番下にも入口がある。
//   ボタンを押すと、その演出が**見本のデータで**その場に出る。**セーブは変わらない**：
//     ・パックは CardFX.demo / openBulk（中身は見本。パックの数は減らない）
//     ・結果画面・再起動の結果は見本の数字。押すボタンは「閉じる」だけにつなぎ替える（次の章へ進まない・再起動しない）
//     ・再起動の確認は demo 付き（UI.confirmPrestige(true)）。押しても Game.prestige() は呼ばれない
//     ・3択は demo 付き（UI.showDraft(ids)）。選んでもカードを取らず、戦闘も止めない
//   帯（カットイン）と3択は盤の上に出るので、裏で戦闘の画面（準備フェーズ）を開いておき、下半分を確認室のパネルにする。
//   凸・覚醒は CardFX.demoTotu(凸の数)（カード1枚のパックで、その凸に届く1枚を捲る）と、まとめて開封（覚醒あり）
//   演出そのものは本物の関数を呼ぶだけ（見本のために別の絵を作らない）。演出を作り直したら、ここに並べる
// ---------------------------------------------------------------
'use strict';

const DebugRoom = {
  el: null,

  // 手札に依らない見本のカード（種類ごとに先頭のもの）
  _cards(rar, n) {
    return CARD_IDS.filter(id => CARDS[id].rarity === rar && !['weapon', 'perm', 'key'].includes(CARDS[id].kind)).slice(0, n || 1);
  },

  // 結果画面の見本
  _res(o) {
    const wid = Object.keys(WEAPONS);
    const dmg = [{ id: wid[0], dmg: 900, pct: 52, n: 4 }, { id: wid[1], dmg: 520, pct: 30, n: 3 }, { id: wid[2], dmg: 310, pct: 18, n: 2 }];
    const wc = ((STAGES[1].reward || {}).cards || [])[0];
    return Object.assign({
      ok: true, perfect: false, stage: STAGES[2], wave: BAL.wavesPerStage, kills: 1842, coins: 48200, leaked: 3, lives: 21, livesMax: 24,
      missions: [{ name: '見本の実績' }], dmg,
      stageGot: { first: true, perfect: false, cards: wc && CARDS[wc] ? [wc] : [], packs: { basic: 2, arms: 1 }, stage: STAGES[2], next: STAGES[3] },
    }, o || {});
  },

  // モーダルに出した結果画面の、次へ進むボタンを「閉じる」だけにつなぎ替える（元のボタンは章を進める・再起動する・セーブする）
  _safe() {
    UI.el.modal.querySelectorAll('button.rs-go, button.rs-sub').forEach(b => {
      const c = b.cloneNode(true);
      c.addEventListener('click', () => UI.closeModal());
      b.replaceWith(c);
    });
  },

  // 一覧：[グループ名, [[ボタンの字, 押したときの関数], …]]
  groups() {
    const me = this;
    const cut = (t, s, k) => () => UI.cutin(t, s, k);
    const W = BAL.wavesPerStage;
    return [
      ['パック開封', [
        ['コモン', () => CardFX.demo('common')],
        ['レア', () => CardFX.demo('rare')],
        ['エピック', () => CardFX.demo('epic')],
        ['レジェンド', () => CardFX.demo('legendary')],
        ['まとめて開封', () => me.bulk()],
        ['レジェンドの割り込み', () => me.legend()],
        ['凸（0→1凸）', () => CardFX.demoTotu(1)],
        ['凸（2→3凸）', () => CardFX.demoTotu(3)],
        ['覚醒（3→4凸）', () => CardFX.demoTotu(4)],
        ['凸（覚醒のあと 4→5凸）', () => CardFX.demoTotu(5)],
        ['まとめて開封（覚醒あり）', () => me.bulk(true)],
      ]],
      ['結果画面', [
        ['CLEAR', () => { UI.showResult(me._res()); me._safe(); }],
        ['PERFECT', () => { UI.showResult(me._res({ perfect: true, leaked: 0, lives: 24 })); me._safe(); }],
        ['DEFEAT', () => { UI.showResult(me._res({ ok: false, wave: 3, lives: 0, leaked: 24, coins: 6400, missions: [], stageGot: null })); me._safe(); }],
        ['SKIP', () => { UI.showSkipResult({ stage: STAGES[2], next: STAGES[3] }); me._safe(); }],
        ['REBOOT', () => { UI.showPrestigeResult({ prestiges: 3, reward: { relic: 6, basic: 8, arms: 2 } }); me._safe(); }],
        ['再起動の確認', () => UI.confirmPrestige(true)],
      ]],
      ['戦闘の上に出るもの', [
        ['カード3択', () => UI.showDraft(me._cards('rare', 1).concat(me._cards('common', 2)))],
        ['3択（エピック・レジェンド入り）', () => UI.showDraft(me._cards('rare', 1).concat(me._cards('epic', 1), me._cards('legendary', 1)))],
        ['準備フェーズの帯', cut('準備フェーズ', '武器を置いて「準備完了」', 'prep')],
        ['ウェーブの帯', cut('WAVE 3<em> / ' + W + '</em>', '', 'wave')],
        ['最終ウェーブの帯', cut('WAVE ' + W + '<em> / ' + W + '</em>', '最終ウェーブ', 'last')],
        ['ボスの帯', () => { UI.cutinBoss(W); setTimeout(() => UI.sysWarn('boss'), 2100); }],
        ['BOSS DOWN（あと2体）', () => UI.cutinBossDown(2)],
        ['ボス戦の見本（第10章・2体）', () => me.bossBattle()],
      ]],
      ['通知（トースト）', [
        ['新しい武器', () => UI.toastMsg('新しい武器 ガトリング', '#ffb43c', 'weapon')],
        ['ウェーブ突破', () => UI.toastMsg('ウェーブ 3 突破', '#7ee3a0', 'wave')],
        ['カード取得（レア）', () => UI.toastMsg('取得: 見本のカード', BAL.rarity.rare.color, 'card')],
        ['カード取得（レジェンド）', () => UI.toastMsg('取得: 見本のカード', BAL.rarity.legendary.color, 'card')],
        ['自動購入', () => UI.toastMsg('自動購入 6件　コイン 12.4K', '#ff8a1f', 'auto')],
        ['まとめて購入', () => UI.toastMsg('4件 購入　コイン 8.1K', '#ff8a1f', 'buy')],
        ['スキップ（一括通過）', () => UI.toastMsg('5章をまとめて通過（報酬なし）', '#ffb43c', 'skip')],
        ['ステージ選択', () => UI.toastMsg('第7章 を選択', '#ff8a1f', 'select')],
        ['置く地面をタップ', () => UI.toastMsg('刀 を置く地面をタップ', '#ff5a3c', 'place')],
        ['注意（編成なし）', () => UI.toastMsg('武器を1つ以上編成してください', '#ff8080', 'warn')],
        ['ロック（開いていない）', () => UI.toastMsg('第10章を突破すると開きます', '#ff8080', 'lock')],
        ['置ける数がいっぱい', () => UI.toastMsg('盤に置ける数がいっぱいです（12基）', '#ff8080', 'limit')],
        ['システム', () => UI.toastMsg('処理の重さを表示', '#ff8a1f', 'sys')],
        ['エラー', () => UI.toastMsg('出せませんでした：見本', '#ff4a66', 'error')],
        ['連続で6個（差し替わる）', () => ['weapon', 'wave', 'buy', 'warn', 'card', 'lock'].forEach((k, i) => setTimeout(() =>
          UI.toastMsg(['新しい武器 ガトリング', 'ウェーブ ' + (i + 1) + ' 突破', '3件 購入　コイン 900', '盤に置ける数がいっぱいです', '取得: 見本のカード', '開いていません'][i], '#ffc24a', k), i * 260))],
      ]],
      ['場面・画面', [
        ['再起動の場面（部屋）', () => Scenes.reboot(null)],
        ['指揮官の記録', () => UI.openProfile(true)],
      ]],
    ];
  },

  bulk(awake) {
    const by = (r, n) => this._cards(r, n);
    const list = [];
    by('common', 6).forEach((id, i) => list.push({ id, gain: (i % 3) + 1, isNew: i === 0, t0: 0, t1: i % 3 === 0 ? 1 : 0 }));
    by('rare', 4).forEach((id, i) => list.push({ id, gain: 1 + (i % 2), isNew: false, t0: 0, t1: 0 }));
    by('epic', 2).forEach((id) => list.push({ id, gain: 1, isNew: true, t0: 0, t1: 0 }));
    by('legendary', 1).forEach((id) => list.push({ id, gain: 1, isNew: false, t0: 1, t1: 2 }));
    // 覚醒（3→4凸）が1枚：並びの最後に開き、全部開いたあとに大きく見せる
    if (awake) by('rare', 6).slice(4, 5).forEach((id) => list.push({ id, gain: 1, isNew: false, t0: 3, t1: 4 }));
    CardFX.openBulk(PACKS.basic, 5, list, null);
  },

  // レジェンドの割り込みだけ（放送停止 → 金の六角 → 警告 → 錠）。開封の箱の上に重ねて出し、終わったら消す
  legend() {
    const P = CardFX._packOverlay(PACKS.arms || PACKS.basic, [3], 'LEGEND SIGNAL');
    P.hint.textContent = '';
    CardFX.legendBreak(P.ov);
    setTimeout(() => P.ov.remove(), CardFX.LEG_MS + 300);
  },

  // ボス戦の見本：第10章（口2つ）の**本物の戦闘**でボスを2体出し、1体ずつ倒す（ボスの帯 → 1体倒して BOSS DOWN と倒した位置の演出 → もう1体で突破）。
  //   Combat.update を確認室が自分で回す（Game.phase は準備のまま＝本体のループは戦闘を進めず、突破の記録・報酬・セーブは動かない）。
  //   章の開放と currentStage は借りて、すぐ戻す。湧き口のバリア（約10秒）を抜けるまでは6倍速で進める
  //   **セーブを守る**：ボスを倒すとコイン・撃破数が入るので、始める前の perm/meta を写し取り、終わったら（ウェーブ終了・部屋を閉じる・作り直し）その場で書き戻す。
  //   演出中は Game.save を止める（8秒ごとの自動保存が、コインの入った状態を書かないように）
  _btEnd() {
    clearInterval(this._bt);
    if (!this._btSnap) return;
    const snap = this._btSnap; this._btSnap = null;
    for (const k of Object.keys(Game.perm)) delete Game.perm[k];
    for (const k of Object.keys(Game.meta)) delete Game.meta[k];
    Object.assign(Game.perm, snap.perm); Object.assign(Game.meta, snap.meta);
    Game.save = snap.save;
    try { Relic.invalidate(); } catch (e) {}
  },
  bossBattle() {
    this._btEnd();
    this._btSnap = { perm: JSON.parse(JSON.stringify(Game.perm)), meta: JSON.parse(JSON.stringify(Game.meta)), save: Game.save };
    Game.save = () => {};
    const perm = Game.perm, cur = perm.currentStage, orig = Game.stageUnlocked;
    let run;
    try { Game.stageUnlocked = () => true; run = Game.startPrep('ch10'); }
    finally { Game.stageUnlocked = orig; perm.currentStage = cur; }
    Render.fit(); UI.renderTray();
    run.phase = 'build'; run.wave = BAL.wavesPerStage - 1;
    Game.startNextWave();
    UI._bossKills = 0;
    UI.cutinWave(run.wave);
    const bosses = run.enemies.filter(e => e.boss);
    let t0 = performance.now(), tOut = null, done = false, doneAt = 0, last = t0;
    this._bt = setInterval(() => {
      if (!this.el || Game.run !== run) { this._btEnd(); return; }
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // ウェーブが終わったあとも、演出（fx）が消えきるまで時間を進める（準備に入ると本体のループは fx を進めず、最後のボスの演出が止まったまま残る）。最長2.5秒
      if (done) {
        Combat.update(run, dt);
        if (!run.fx.length || now - doneAt > 2500) this._btEnd();
        return;
      }
      const inSh = bosses.some(b => !b.dead && Combat.inShield(run, b));
      const steps = inSh ? 6 : 1;
      let sig = null;
      for (let i = 0; i < steps; i++) sig = Combat.update(run, dt) || sig;
      if (!inSh && tOut === null) tOut = now;
      if (tOut !== null) {
        const el = (now - tOut) / 1000;
        bosses.forEach((b, i) => { if (!b.dead && el >= 0.8 + i * 2.6) Combat.damage(run, b, b.maxHp * 2, { by: 'debug' }); });
      }
      if (sig === 'stageclear' || sig === 'waveclear') { done = true; UI.toastMsg('ボス戦の見本：全部倒してウェーブ終了（見本・記録なし）', '#ffc24a', 'demo'); doneAt = now; }
      if (now - t0 > 60000) { done = true; doneAt = now; }
    }, 16);
  },

  open() {
    if (this.el) return;
    // 設定の箱が開いていたら畳む
    if (UI.el.cfgBox) UI.el.cfgBox.classList.remove('on');
    if (UI.el.btnCfg) UI.el.btnCfg.classList.remove('on');
    // 裏で戦闘の画面（準備フェーズ）を出しておく：帯・警告・3択は盤の上に出るため。セーブには触れない（自動購入は toBattle 側で、ここは通らない）
    UI.setScreen('battle');
    Main.toPrep();
    setTimeout(() => Render.resize(), 0);

    const el = Util.el('div', 'rs fx');
    el.id = 'dbg';
    el.innerHTML = '<div class="rs-ban"><i class="rs-sweep"></i><em>// DEBUG ROOM</em><b>演出の確認室</b><span>押すと、その演出が見本で出ます（セーブは変わりません）</span></div>';
    let t = 0.3;
    for (const [name, keys] of this.groups()) {
      const h = Util.el('div', 'rs-h', name);
      h.style.setProperty('--dl', t.toFixed(2) + 's');
      const row = Util.el('div', 'dbg-keys');
      row.style.setProperty('--dl', (t + 0.04).toFixed(2) + 's');
      for (const [label, fn] of keys) {
        const b = Util.el('button', 'dbg-key', label);
        b.addEventListener('click', () => {
          try { Snd.ui(); fn(); } catch (e) { console.error('演出の確認室：' + label, e); UI.toastMsg('出せませんでした：' + label, '#ff4a66', 'error'); }
        });
        row.appendChild(b);
      }
      el.appendChild(h); el.appendChild(row);
      t += 0.08;
    }
    const subs = Util.el('div', 'rs-subs');
    const close = Util.el('button', 'rs-sub');
    close.innerHTML = Icons.get('close') + '閉じる';
    close.addEventListener('click', () => this.close());
    subs.appendChild(close);
    el.appendChild(subs);
    document.body.appendChild(el);
    this.el = el;
  },

  close() {
    this._btEnd();
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    UI.closeModal();
    Main.toHome();
  },
};
