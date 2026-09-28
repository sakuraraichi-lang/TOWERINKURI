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
        ['ボスの帯', () => { UI.cutin('WAVE ' + W + '<em> / ' + W + '</em>', 'VIRUS DETECTED ─ コアに届く前に倒せ', 'last'); setTimeout(() => UI.sysWarn('boss'), 1700); }],
        ['BOSS DOWN', cut('BOSS DOWN', 'あと 2体', 'last')],
      ]],
      ['場面・画面', [
        ['再起動の場面（部屋）', () => Scenes.reboot(null)],
        ['指揮官の記録', () => UI.openProfile(true)],
      ]],
    ];
  },

  bulk() {
    const by = (r, n) => this._cards(r, n);
    const list = [];
    by('common', 6).forEach((id, i) => list.push({ id, gain: (i % 3) + 1, isNew: i === 0, t0: 0, t1: i % 3 === 0 ? 1 : 0 }));
    by('rare', 4).forEach((id, i) => list.push({ id, gain: 1 + (i % 2), isNew: false, t0: 0, t1: 0 }));
    by('epic', 2).forEach((id) => list.push({ id, gain: 1, isNew: true, t0: 0, t1: 0 }));
    by('legendary', 1).forEach((id) => list.push({ id, gain: 1, isNew: false, t0: 1, t1: 2 }));
    CardFX.openBulk(PACKS.basic, 5, list, null);
  },

  // レジェンドの割り込みだけ（放送停止 → 金の六角 → 警告 → 錠）。開封の箱の上に重ねて出し、終わったら消す
  legend() {
    const P = CardFX._packOverlay(PACKS.arms || PACKS.basic, [3], 'LEGEND SIGNAL');
    P.hint.textContent = '';
    CardFX.legendBreak(P.ov);
    setTimeout(() => P.ov.remove(), CardFX.LEG_MS + 300);
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
          try { Snd.ui(); fn(); } catch (e) { console.error('演出の確認室：' + label, e); UI.toastMsg('出せませんでした：' + label, '#ff4a66'); }
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
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    UI.closeModal();
    Main.toHome();
  },
};
