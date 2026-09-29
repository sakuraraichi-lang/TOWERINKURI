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
      hudLeft: q('hudLeft'), cutin: q('cutin'), zoneTip: q('zoneTip'), bcfg: q('bcfg'), btnBcfg: q('btnBcfg'),
      tray: q('tray'),
      panel: q('panel'), tabs: q('tabs'), modal: q('modal'),
      toast: q('toast'), badgePack: q('badgePack'),
      upop: q('upop'), stage: q('stage'), tut: q('tut'), perf: q('perf'),
      btnDmg: q('btnDmg'), dmgpop: q('dmgpop'),
      build: q('build'), buildNote: q('buildNote'),
      btnCfg: q('btnCfg'), cfgBox: q('cfgBox'),
      btnStart: q('btnStart'),
      homeCoin: q('homeCoin'), homeProg: q('homeProg'), homeLabel: q('homeLabel'),
      homeName: q('homeName'), homeMini: q('homeMini'),
      homeStat: q('homeStat'), homeStart: q('homeStart'),
      homeRank: q('homeRank'), homeXp: q('homeXp'), homeSkip: q('homeSkip'), homeSkipAll: q('homeSkipAll'),
      homePrev: q('homePrev'), homeNext: q('homeNext'),
    };

    if (this.el.btnCfg) {
      this.el.btnCfg.addEventListener('click', () => { Snd.ui(); this.toggleCfg(); });
    }
    // 左上（RANK と名前）を押すと「指揮官の記録」
    document.querySelectorAll('#home .hbar .lvring, #home .hbar .hid').forEach(x => x.addEventListener('click', () => { Snd.ui(); this.openProfile(); }));

    this.el.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      Snd.resume(); Snd.ui();
      if (!Game.tabOpen(b.dataset.tab)) {
        this.toastMsg(this.lockWhy(b.dataset.tab), '#ff8080', 'lock');
        return;
      }
      // **同じタブをもう一度押すと閉じる。** 閉じているあいだはステージだけが見える
      // パックのタブへ入るときだけ、台に光が昇る演出（panelPacks が読んで消す）
      this._gsFx = (b.dataset.tab === 'pack' && (this.tab !== 'pack' || this.tabsOff)) ? 'go' : null;
      this.tabsOff = (this.tab === b.dataset.tab) ? !this.tabsOff : false;
      this.tab = b.dataset.tab;
      this.syncTabsOff();
      this.renderTabs();
      this.renderPanel();
    });

    // 「残り◯」をタップすると、処理の重さの表示が出入りする
    if (this.el.hudWaveTxt) this.el.hudWaveTxt.addEventListener('click', () => this.togglePerf());
    // 戦闘中の火力の内訳（ユーザー 2026-09-25「ゲーム中に武器ごとのダメージランキングの表示」）。押したときだけ出す
    if (this.el.btnDmg) this.el.btnDmg.addEventListener('click', () => {
      Snd.resume(); Snd.ui();
      Game.perm.dmgOpen = !Game.perm.dmgOpen;
      this._dmgT = 0;
      this.renderDmg(true);
      Game.save();
    });

    if (this.el.homeSkip) this.el.homeSkip.addEventListener('click', () => Main.doSkip());
    if (this.el.homeSkipAll) this.el.homeSkipAll.addEventListener('click', () => Main.doSkipAll());

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
        // **武器ごとの記録を文字で持ち出す。**（ユーザー 2026-09-25「何件か分保存しておけば、あなたがそれを確認して…」）
        //   端末の中の記録は開発側から見えないので、コピーして貼ってもらう
        const log = Game.perm.dmgLog || [];
        const b = Util.el('button', 'bn-copy', '武器の記録をコピー（直近 ' + log.length + ' 回）');
        b.disabled = !log.length;
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const txt = this.dmgLogText();
          const done = () => { b.textContent = 'コピーしました（' + log.length + ' 回ぶん）'; };
          const fallback = () => {
            const ta = Util.el('textarea', 'bn-txt'); ta.value = txt; ta.readOnly = true;
            n.appendChild(ta); ta.select();
            b.textContent = '下の文字を長押しでコピーしてください';
          };
          try { navigator.clipboard.writeText(txt).then(done, fallback); } catch (e) { fallback(); }
        });
        n.appendChild(b);
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

  // 武器の名前（記録用。'other' は武器に紐づかないダメージ）
  wname(id) { return id === 'other' ? 'その他' : (WEAPONS[id] ? WEAPONS[id].name : id); },

  // 武器ごとの記録（Game.perm.dmgLog）を、貼り付けて読める文字にする。1行＝1回の出撃、新しい順
  dmgLogText() {
    const log = Game.perm.dmgLog || [];
    const lines = ['エクスメントマキナ 武器の記録（新しい順・' + log.length + '回）',
      '版 章 結果 W 再起動 前回到達 最深 漏れ 撃破 置いた数 | 武器 有効ダメージの割合%（有効ダメージ／撃破／基数）'];
    for (const x of log) {
      const tot = x.w.reduce((a, w) => a + w[1], 0) || 1;
      const d = new Date(x.at);
      lines.push([x.build, x.stage, x.ok ? '突破' : '敗北', 'W' + x.wave, '再起動' + x.prestiges, '前回' + x.legacyDeep, '最深' + x.deepest,
        '漏れ' + x.leaked, '撃破' + x.kills, '置' + x.placed].join(' ') + ' (' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
        d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') + ') | ' +
        x.w.map(w => this.wname(w[0]) + ' ' + (Math.round(1000 * w[1] / tot) / 10) + '%（' + (+w[1]).toExponential(2) + '／' + w[2] + '／' + w[3] + '基）').join('、'));
    }
    return lines.join('\n');
  },

  // 武器ごとの火力の帯（上位 n 件）。リザルトと戦闘中の両方で使う
  dmgBars(rank, n) {
    const box = Util.el('div', 'dmg-bars');
    const top = rank.length ? rank[0].dmg || 1 : 1;
    for (const x of rank.slice(0, n)) {
      const w = WEAPONS[x.id];
      const row = Util.el('div', 'dmg-row');
      row.innerHTML = '<div class="dmg-top"><span class="dmg-ic" style="color:' + (w ? w.color : '#aab') + '">' + (w ? w.icon : '') + '</span>' +
        '<span class="dmg-n">' + this.wname(x.id) + (x.n ? '<em>×' + x.n + '</em>' : '') + '</span>' +
        '<span class="dmg-p">' + x.pct + '%</span></div>' +
        '<div class="dmg-bar"><div style="width:' + Math.max(2, 100 * x.dmg / top).toFixed(1) + '%;background:' + (w ? w.color : '#889') + '"></div></div>';
      box.appendChild(row);
    }
    return box;
  },

  // タブを閉じているあいだはパネルを畳み、ステージの的を大きく見せる
  syncTabsOff() {
    document.body.classList.toggle('tabsoff', !!this.tabsOff);
  },

  lockWhy(id) {
    if (id === 'pack') return 'パックを手に入れると開きます';
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
    const done = Game.clearedCount(), all = STAGES.length;

    e.homeCoin.textContent = Util.fmt(Game.meta.coins);
    // **RANK＝到達した章**（2026-09-29 ユーザー「ランクは到達階層、プレイヤー名は設定できても良い」）。
    //   前は転生の回数で、何を表すのか分からなかった。押すと「指揮官の記録」（名前・記録・実績）が開く
    if (e.homeRank) e.homeRank.textContent = this.reachCh();
    const nm = document.getElementById('homeName2');
    if (nm) nm.textContent = Game.perm.playerName || 'PLAYER 1';
    const achN = MISSIONS.filter(m => Game.perm.missions[m.id]).length;
    if (Asc.on(Game.perm)) {
      // アセンション中：レベルと、次のレベルまでの経験値
      const a = Game.perm.asc;
      if (e.homeXp) e.homeXp.style.width = Math.min(100, 100 * a.exp / Asc.need(a.lv)).toFixed(1) + '%';
      e.homeProg.textContent = 'アセンション Lv' + a.lv + '　実績 ' + achN + ' / ' + MISSIONS.length;
    } else {
      if (e.homeXp) e.homeXp.style.width = (100 * done / all).toFixed(1) + '%';
      e.homeProg.textContent = '突破 ' + done + ' / ' + all + '　実績 ' + achN + ' / ' + MISSIONS.length;
    }

    const mi = STAGES.findIndex(x => x.id === st.id);
    e.homeLabel.innerHTML = 'ステージ <b>' + (mi + 1) + '</b>';
    // 名前は最後の1語だけ琥珀にして、参考画像の二色見出しに寄せる
    e.homeName.innerHTML = open ? this.splitTitle(st.name) : '？？？';
    // miniMap は SVG の文字列を返す（Node ではない）
    e.homeMini.innerHTML = open ? this.miniMap(st) + '<i class="radar"></i>' : '<span class="lk">' + Icons.get('lock') + '</span>';
    e.homeMini.classList.toggle('locked', !open);

    let line;
    if (!open) line = '<span class="ck">' + Icons.get('lock') + '</span>前のステージを突破すると開きます';
    else if (rec.perfect) line = '<span class="ck">✓</span>完璧クリア済み　<em>★★</em>';
    else if (rec.cleared) line = '<span class="ck">✓</span>突破済み　<em>W' + rec.bestWave + '</em>';
    // **飛ばして通っただけ。**突破ではないので、初回報酬はまだ残っている
    else if (rec.skipped) line = '<span class="ck">✓</span>通過（未突破）　<em>報酬は未取得</em>';
    else if (rec.attempts) line = '<span class="ck">…</span>最高 <em>ウェーブ ' + rec.bestWave + '</em>' +
      '　挑戦 ' + rec.attempts + '回';
    else line = '<span class="ck">＊</span>未挑戦　' + '全' + BAL.wavesPerStage + 'ウェーブ';
    e.homeStat.innerHTML = line;

    e.homeStart.disabled = !open;
    e.homeStart.innerHTML = open ? '出撃<s>▶</s>' : 'ロック中';

    // スキップ。**条件を満たしたステージにだけ出す。**
    // 出しっぱなしにすると「押せないボタン」が常に画面にいて邪魔になる
    if (e.homeSkip) {
      const can = Game.canSkip(st.id);
      // **鍵を持っていないうちは、ボタンの存在ごと出さない**
      const near = Game.hasSkipKey() && open &&
                   !rec.cleared && !rec.skipped && !can;
      e.homeSkip.style.display = (can || near) ? '' : 'none';
      e.homeSkip.disabled = !can;
      // **もらえるものは無い。**チェックが付いて次へ行けるだけ、と書いておく
      e.homeSkip.innerHTML = can
        ? 'スキップ<u>報酬なし・再起動の評価にも入りません</u>'
        : '<u>' + Game.skipWhy(st.id) + '</u>';
    }
    // 一括突破。**2章以上まとめて飛ばせるときだけ出す**（1章なら上のスキップと同じ）
    if (e.homeSkipAll) {
      const run = (open && Game.autoOpen('skipAll')) ? Game.skipRun(st.id) : [];
      e.homeSkipAll.style.display = run.length >= 2 ? '' : 'none';
      if (run.length >= 2) {
        e.homeSkipAll.innerHTML = 'まとめてスキップ ' + run.length + '章<u>第' + (STAGE_BY_ID[run[run.length - 1]].idx + 1) + '章まで・報酬なし</u>';
      }
      // スキップが2つ並ぶと出撃ボタンが潰れるので、出撃を1段上に分ける
      e.homeSkipAll.parentNode.classList.toggle('two', run.length >= 2 && e.homeSkip && e.homeSkip.style.display !== 'none');
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
    // 画面が変わるときは、短い電子的な切り替え（光の線が横切る・約0.28秒・触るのを止めない）。企画書 §5「高速な画面遷移」§26
    if (this._screen && this._screen !== name && !this._quiet) {
      const fx = Util.el('div', 'scrx');
      document.body.appendChild(fx);
      setTimeout(() => fx.remove(), 320);
    }
    this._screen = name;
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

  // 到達した章（転生しても戻らない）。第30章の先はアセンションで伸びた章
  reachCh() {
    const p = Game.perm;
    return Math.max(p.deepest || 0, Game.progressCount(), Asc.on(p) ? Math.max(MAIN_CHAPTERS, Game.endlessReach()) : 0);
  },

  // ---- 指揮官の記録：左上（RANK と名前）を押すと開く ----
  //   名前を決める・これまでの記録・実績（パックの入手ミッション）。実績はパックのタブにも同じ一覧がある
  // demo … 演出の確認室から。名前の欄は読み取り専用（セーブは変わらない）
  openProfile(demo) {
    const p = Game.perm;
    const body = Util.el('div', 'prof');
    const stat = (k, v) => '<div><em>' + k + '</em><b>' + v + '</b></div>';
    const perfect = STAGES.filter(s => (p.stages[s.id] || {}).perfect).length;
    const achN = MISSIONS.filter(m => p.missions[m.id]).length;
    body.innerHTML =
      '<div class="prof-h"><div class="lvring"><b>' + this.reachCh() + '</b><i>RANK</i></div>' +
        '<div><small>COMMANDER</small><div class="prof-nm"><input maxlength="12" spellcheck="false" autocomplete="off" placeholder="PLAYER 1"></div>' +
        '<span class="prof-note">RANK は到達した章。転生しても戻りません</span></div></div>' +
      '<div class="prof-st">' +
        stat('到達', '第' + this.reachCh() + '章') + stat('突破', STAGES.slice(0, MAIN_CHAPTERS).filter(s => (p.stages[s.id] || {}).cleared).length + ' / ' + MAIN_CHAPTERS) +
        stat('完璧クリア', perfect + '章') + stat('転生', p.prestiges + '回') +
        stat('撃破', Util.fmt(p.totalKills || 0)) + stat('カード', Object.keys(p.collection).length + '種') +
        (Asc.on(p) ? stat('アセンション', 'Lv' + p.asc.lv) : '') + stat('出撃', Util.fmt(p.totalRuns || 0) + '回') +
      '</div>' +
      '<div class="prof-ach"><div class="prof-t">実績 <b>' + achN + ' / ' + MISSIONS.length + '</b><span>達成するとパックがもらえる</span></div></div>';
    const inp = body.querySelector('input');
    inp.value = p.playerName || '';
    if (demo) inp.readOnly = true;
    const commit = () => {
      if (demo) return;
      const v = Array.from(inp.value).filter(ch => ch >= ' ').join('').trim().slice(0, 12);   // 改行などの制御文字は落とす
      if (v === (p.playerName || '')) return;
      p.playerName = v; Game.save(); this.renderHome();
    };
    inp.addEventListener('change', commit);
    inp.addEventListener('keyup', (ev) => { if (ev.key === 'Enter') inp.blur(); });
    const ach = body.querySelector('.prof-ach');
    for (const m of MISSIONS) {
      const done = !!p.missions[m.id];
      const row = Util.el('div', 'mrow' + (done ? ' done' : ''));
      const rw = Object.entries(m.reward).map(([k, v]) => PACKS[k].name + '×' + v).join(' / ');
      row.innerHTML = '<span>' + (done ? Icons.get('check') : '□') + '</span><b>' + m.name + '</b><em>' + rw + '</em>';
      ach.appendChild(row);
    }
    const close = Util.el('button', 'rs-sub synclose');
    close.innerHTML = Icons.get('close') + '閉じる';
    close.addEventListener('click', () => { commit(); this.closeModal(); });
    body.appendChild(close);
    this.openModal(body);
  },

  renderCfg() {
    const b = this.el.cfgBox;
    if (!b) return;
    b.innerHTML = '';
    const row = (key, name, desc) => {
      const on = !!Game.perm[key];
      const el = Util.el('label', 'cfgrow' + (on ? ' on' : ''));
      el.innerHTML = '<span class="box">' + (on ? Icons.get('check') : '') + '</span>' +
        '<span><b>' + name + '</b><span>' + desc + '</span></span>';
      el.addEventListener('click', () => {
        Game.perm[key] = !Game.perm[key];
        Game.save(); Snd.ui(); this.renderCfg();
      });
      return el;
    };
    b.appendChild(row('autoWave', '次のウェーブへ自動で進む',
      '切ると、カードを選んだあと配置を直す時間が入ります'));
    {
      // ライフのバー（初期は出す。hideLifeBar で消す）
      const on = !Game.perm.hideLifeBar;
      const el = Util.el('label', 'cfgrow' + (on ? ' on' : ''));
      el.innerHTML = '<span class="box">' + (on ? Icons.get('check') : '') + '</span>' +
        '<span><b>ライフのバーを出す</b><span>戦闘中、盤の左上にライフの残りをバーと数字で出します（切るとコアの輪だけ）</span></span>';
      el.addEventListener('click', () => { Game.perm.hideLifeBar = !Game.perm.hideLifeBar; Game.save(); Snd.ui(); this.renderCfg(); });
      b.appendChild(el);
    }
    {
      // ダメージ数字（初期は出す。hideDmgNum で消す・企画書 §23）
      const on = !Game.perm.hideDmgNum;
      const el = Util.el('label', 'cfgrow' + (on ? ' on' : ''));
      el.innerHTML = '<span class="box">' + (on ? Icons.get('check') : '') + '</span>' +
        '<span><b>ダメージの数字を出す</b><span>敵に当たったときの数字（切ると盤がすっきりします）</span></span>';
      el.addEventListener('click', () => { Game.perm.hideDmgNum = !Game.perm.hideDmgNum; Game.save(); Snd.ui(); this.renderCfg(); });
      b.appendChild(el);
    }
    {
      // 配置の通知（初期は出す。hidePlaceToast で消す・2026-09-29 ユーザー「ユニット設置時の右上の通知設定で消せるようにしといて、うざい」）
      const on = !Game.perm.hidePlaceToast;
      const el = Util.el('label', 'cfgrow' + (on ? ' on' : ''));
      el.innerHTML = '<span class="box">' + (on ? Icons.get('check') : '') + '</span>' +
        '<span><b>配置の通知を出す</b><span>武器を選んだとき、右上に「〜 を置く地面をタップ」と出します（置けない理由の警告は、切っても出ます）</span></span>';
      el.addEventListener('click', () => { Game.perm.hidePlaceToast = !Game.perm.hidePlaceToast; Game.save(); Snd.ui(); this.renderCfg(); });
      b.appendChild(el);
    }
    // 自動化は開いてから出す（BAL.autoUnlock）
    if (Game.autoOpen('autoPlace')) b.appendChild(row('autoPlace', '自動設置',
      'この周でまだ触っていない章に、前の周の配置を置き直します'));
    if (Game.autoOpen('autoBuy')) b.appendChild(row('autoBuy', '自動購入',
      '出撃するとき、「まとめて購入」と同じ順で買えるだけ買います'));
    b.appendChild(row('perf', '処理の重さを表示', 'fps と1フレームの時間'));
    // 演出の確認室（src/debugroom.js）。セーブは変わらない
    {
      const el = Util.el('label', 'cfgrow cfgroom');
      el.innerHTML = '<span class="box">▶</span><span><b>演出の確認室</b><span>パック開封・結果画面・カード3択・帯などを、見本でいつでも見られます（セーブは変わりません）</span></span>';
      el.addEventListener('click', () => { Snd.ui(); if (typeof DebugRoom !== 'undefined') DebugRoom.open(); });
      b.appendChild(el);
    }
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
    this.toastMsg(Game.perm.perf ? '処理の重さを表示' : '非表示', '#ff8a1f', 'sys');
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

    // **戦闘中に常時出すのは、ウェーブの番号と残りだけ（盤の左上に小さく）。**（2026-09-26 作り直し）
    //   準備フェーズとウェーブの始まりはカットイン（cutin）で見せる。ライフはコアの周りの輪で見える
    let left = '';
    if (Game.phase === 'battle' && r.phase !== 'build') {
      left = 'W' + r.wave + '/' + BAL.wavesPerStage + (Combat.isLastWave(r) ? '★' : '') + '　残り ' + Util.fmt(r.toSpawn + r.enemies.length);
    } else if (Game.phase === 'battle') {
      left = 'W' + r.wave + '/' + BAL.wavesPerStage + '　突破';
    }
    if (this.el.hudLeft && this.el.hudLeft.textContent !== left) this.el.hudLeft.textContent = left;
    // ボスを1体倒すたびに「あと何体」を出す（最後の1体は、そのまま突破の画面になる）
    if ((r.bossKills || 0) !== (this._bossKills || 0)) {
      this._bossKills = r.bossKills || 0;
      const rest = r.enemies.filter(e => e.boss && !e.dead).length;
      if (this._bossKills > 0 && rest > 0) this.cutinBossDown(rest);
    }
    // **ライフのバー。初期は常に出し、⚙で消せる**（2026-09-28・ユーザー「HPバーはデフォルトで常時表示で、設定から非表示にできる形のが良い」。
    //   0926c で上の帯ごと外し、0926i で「数字を出す（初期はオフ）」にしていた）
    const lb = document.getElementById('hudLife');
    if (lb) {
      const show = !Game.perm.hideLifeBar;
      lb.style.display = show ? '' : 'none';
      if (show) {
        const k = r.livesMax > 0 ? Util.clamp(r.lives / r.livesMax, 0, 1) : 1;
        const t = Math.max(0, Math.ceil(r.lives)) + ' / ' + r.livesMax;
        const bar = lb.firstChild, txt = lb.lastChild;
        const tf = 'scaleX(' + k.toFixed(3) + ')';
        if (bar.style.transform !== tf) bar.style.transform = tf;
        if (txt.textContent !== t) txt.textContent = t;
        lb.classList.toggle('low', k < 0.34);
      }
    }
    this.renderDmg(false);
    this.renderZoneTip();
  },

  // 盤の右上の火力の内訳。開いているあいだだけ、0.5秒ごとに組み直す
  renderDmg(now) {
    const p = this.el.dmgpop;
    if (!p) return;
    const on = !!Game.perm.dmgOpen;
    p.classList.toggle('on', on);
    if (this.el.btnDmg) this.el.btnDmg.classList.toggle('on', on);
    if (!on) { if (p.firstChild) p.innerHTML = ''; return; }
    const t = performance.now();
    if (!now && t - (this._dmgT || 0) < 500) return;
    this._dmgT = t;
    const r = Game.run;
    const rank = r ? Game.dmgRanking(r) : [];
    p.innerHTML = '';
    p.appendChild(Util.el('div', 'dmg-h', '火力（与えたダメージの割合）'));
    if (!rank.some(x => x.dmg > 0)) p.appendChild(Util.el('div', 'dmg-none', 'まだダメージがありません'));
    else p.appendChild(this.dmgBars(rank, 6));
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
    for (const wid of Game.loadoutWeapons()) {
      const def = WEAPONS[wid];
      const have = Game.unitCount(wid);
      const cap = Game.unitCap(wid);
      const full = have >= cap || slotsLeft <= 0;
      const b = Util.el('button', 'chip unit' + (this.placingType === wid ? ' on' : '') + (full ? ' full' : '') +
        (this.isNew('w_' + wid) && this.WEAPON_TIP[wid] ? ' new' : ''));
      b.style.borderColor = def.color;
      b.innerHTML = '<i class="uico" style="color:' + def.color + '">' + def.icon + '</i>' +
        '<b style="color:' + def.color + '">' + def.short + '</b>' +
        '<u>' + have + '/' + cap + '</u>';
      b.disabled = !build;
      b.addEventListener('click', () => {
        if (full) {
          this.toastMsg(slotsLeft <= 0
            ? '盤に置ける数がいっぱいです（' + Game.slotsTotal() + '基）'
            : def.name + ' はこれ以上置けません', '#ff8080', 'limit');
          return;
        }
        this.placingType = (this.placingType === wid) ? null : wid;
        // 初めて手に取った武器には一言だけ添える（置くか、選び直すまで出す）
        if (this.placingType && this.isNew('w_' + wid) && this.WEAPON_TIP[wid]) {
          this.markSeen('w_' + wid);
          this.tip = { wid: wid, t: def.name + '：' + this.WEAPON_TIP[wid] };
        }
        this.renderTray();
        if (this.placingType && !Game.perm.hidePlaceToast) this.toastMsg(def.name + ' を置く地面をタップ', def.color, 'place');
      });
      t.appendChild(b);
    }
    // **横にはみ出しているときだけ、右端をぼかして続きがあると見せる。**（2026-09-26 テストプレイ：
    //   武器が4種以上だと、4つ目が「準備完了」の陰に半分隠れて気づきにくかった）
    const more = () => t.classList.toggle('more', t.scrollWidth > t.clientWidth + t.scrollLeft + 2);
    if (!t._moreBound) { t._moreBound = true; t.addEventListener('scroll', more, { passive: true }); }
    requestAnimationFrame(more);
  },

  // ================= カットイン =================
  // **準備フェーズとウェーブの始まりは、上の帯ではなくカットインで見せる。**（2026-09-26・ユーザー
  //   「準備フェーズはカットインで見せればいいので上の情報を消せます」「今は何ウェーブかはカットインで出しましょう」）
  //   盤の真ん中を斜めの帯が横切り、1.4秒で消える。触れない（pointer-events: none）
  cutin(title, sub, kind) {
    const c = this.el.cutin;
    if (!c) return;
    c.className = '';
    // **文字を1つずつの動きにする。**（企画書 §17「文字の出現・移動・拡散・消失・複数文字の連鎖」・2026-09-28）
    //   散らばった位置からぼけて飛び込み、1字ずつ所定の位置に収まる。抜けるときは1字ずつ散っていく。
    //   タグ（<em> など）はそのまま残し、文字だけを包む
    let n = 0;
    const split = String(title).split(/(<[^>]+>)/).map(t => t.startsWith('<') ? t :
      Array.from(t).map(ch => ch === ' ' ? ' ' :
        '<i class="cc" style="--d:' + (n++ * 0.035).toFixed(3) + 's;--x:' + ((Math.random() - 0.5) * 120 | 0) + 'px;--y:' +
        ((Math.random() - 0.5) * 70 | 0) + 'px;--r:' + ((Math.random() - 0.5) * 60 | 0) + 'deg">' + ch + '</i>').join('')).join('');
    // 帯の下を流れる小さなシステムの行（情報の集中）
    const hex = () => '0x' + ((Math.random() * 65536) | 0).toString(16).toUpperCase().padStart(4, '0');
    // ボス（0929o）：赤い警告の帯（縞・WARNING の行・画面の縁の赤い明滅）。倒したとき：金の帯と六角の衝撃波。
    //   通常のウェーブの帯の骨格（斜めの帯の叩きつけ・字が1字ずつ収まる）はそのまま。長さだけ 1.45 → 1.9 秒（ボスの帯のみ）
    const boss = kind === 'boss', down = kind === 'down';
    const kick = boss ? '// WARNING　VIRUS DETECTED' : down ? '// TARGET ELIMINATED' : '';
    const sys = 'SYS//' + String(title).replace(/<[^>]+>/g, '').replace(/\s+/g, '_').toUpperCase() + '  ' + hex() + '  ' + hex() + '  ' + (boss ? 'ALERT' : down ? 'PURGED' : 'OK');
    c.innerHTML = '<div class="ci ci-' + (kind || 'wave') + '"><i class="ci-band"></i>' +
      (kick ? '<div class="ci-kick">' + kick + '</div>' : '') +
      '<b>' + split + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '<i class="ci-sys">' + sys + '</i></div>';
    void c.offsetWidth;
    c.className = 'on' + (boss || down ? ' ' + kind : '');
    // 動きが終わったら片付ける（動きだけに頼ると、見た目の定義を変えたときに出たままになる・0929a）。次のカットインが来ていたら触らない
    const tok = this._cutTok = (this._cutTok || 0) + 1;
    clearTimeout(this._cutTimer);
    this._cutTimer = setTimeout(() => { if (this._cutTok === tok) { c.className = ''; c.innerHTML = ''; } }, boss ? 2100 : 1600);
    // 叩きつけた瞬間の六角の衝撃波（ボスは赤・倒したときは金で2回）
    if (boss || down) {
      const shock = (ms, big) => setTimeout(() => {
        if (this._cutTok !== tok) return;
        const band = c.querySelector('.ci-band');
        if (!band) return;
        const r = band.getBoundingClientRect();
        CardFX.hexShock(c, r.left + r.width / 2, r.top + r.height / 2, boss ? '#ff3d4d' : '#ffc24a', big);
      }, ms);
      if (boss) shock(140, true); else { shock(90, true); shock(420, 'sm'); }
    }
  },
  // ボスのウェーブの帯（n ウェーブ目／total）。警告の文字は帯が抜けたあとに流す
  cutinBoss(n) {
    this.cutin('BOSS<em> WAVE ' + n + ' / ' + BAL.wavesPerStage + '</em>', 'ボスが来る ─ コアに届く前に倒せ', 'boss');
  },
  // ボスを1体倒した（まだ残りがいる）とき
  cutinBossDown(rest) {
    this.cutin('BOSS DOWN', 'あと<strong class="ci-n">' + rest + '</strong>体', 'down');
  },
  cutinWave(n) {
    const run = Game.run;
    const last = n >= BAL.wavesPerStage;
    const boss = run && Combat.isBossWave(run);
    if (boss) this.cutinBoss(n);
    else this.cutin('WAVE ' + n + '<em> / ' + BAL.wavesPerStage + '</em>', last ? '最終ウェーブ' : '', last ? 'last' : 'wave');
    // 警告の文字は、カットインが抜けたあとに流す（重ねると読めない）
    const tier = run && run.stage ? Render.exposeTier(run.stage) : 1;
    const p = boss ? 1 : [0, 0, 0.15, 0.3, 0.45, 0.7][tier];
    if (Math.random() < p) setTimeout(() => this.sysWarn(boss ? 'boss' : 'wave'), boss ? 2100 : 1700);
  },

  // ================= 大量撃破（企画書 §16） =================
  //   盤の上の方に「×N」を1字ずつ弾けさせ、盤全体に光の輪を広げ、上がっていく短い音を鳴らす。0.7秒で消える・触れる
  chainFx(n) {
    const host = document.querySelector('#stage .bfield');
    if (!host) return;
    const el = Util.el('div', 'chainfx');
    el.innerHTML = '<i class="cf-ring"></i><b>' + Array.from('×' + n).map((ch, i) => '<em style="--d:' + (i * 0.03).toFixed(2) + 's">' + ch + '</em>').join('') + '</b><span>CHAIN</span>';
    host.appendChild(el);
    setTimeout(() => el.remove(), 760);
    try { Snd.chain(n); } catch (e) {}
  },

  // ================= 警告の文字（企画書 §11） =================
  //   **遊びには何も関係しない。**操作も要らない。盤の奥を一瞬流れて消える。「ゲームの裏側で何かが起きている」と感じさせるだけ。
  //   英語と日本語を混ぜる（ユーザー 2026-09-28）。1度に1行・2.5秒は間を空ける。触れない（pointer-events:none）
  //   出す場面：ウェーブの始まり（深い章ほど出やすい・第1〜4章は出ない）／ボスのウェーブ／敵がコアに届いたとき（第5章から）
  WARN_TEXT: {
    wave: ['EXTERNAL ATTACK DETECTED', '外部から攻撃を受けています！', 'UNAUTHORIZED ACCESS', '不正なパケットを破棄しました',
           'FIREWALL REBUILDING...', 'ファイアウォール再構成中', 'TRACE ROUTE LOST', '接続元を特定できません',
           'PACKET STORM 0x3F2A', 'SYNC ERROR — RETRYING', '侵入経路を遮断しています', 'INTRUSION COUNT OVERFLOW'],
    boss: ['VIRUS DETECTED', '警告！ウイルスが検出されました！', 'QUARANTINE FAILED', '隔離に失敗しました'],
    leak: ['CORE ACCESS VIOLATION', 'コアへの不正アクセスを検知', 'MAKINA / CORE : INTEGRITY WARNING', '防壁を突破されました'],
  },
  sysWarn(kind) {
    const host = document.querySelector('#stage .bfield');
    if (!host) return;
    const now = performance.now();
    if (now - (this._warnT || 0) < 2500) return;
    if (kind === 'leak' && now - (this._leakWarnT || 0) < 8000) return;   // 漏れが続いても流しっぱなしにしない
    if (kind === 'leak') this._leakWarnT = now;
    this._warnT = now;
    const list = this.WARN_TEXT[kind] || this.WARN_TEXT.wave;
    const el = Util.el('div', 'syswarn syswarn-' + kind);
    el.innerHTML = '<i>!!</i><span>' + list[(Math.random() * list.length) | 0] + '</span>';
    el.style.top = (14 + Math.random() * 60).toFixed(1) + '%';
    host.appendChild(el);
    setTimeout(() => el.remove(), 2700);
  },

  // ================= 戦闘中の ⚙（一時停止） =================
  // **ホームへ戻る・一時停止・音をここにまとめる。開いている間は止める。**（2026-09-26・ユーザー指示）
  //   閉じたら、開く前の状態（ふつうは動いている）に戻す
  toggleBattleCfg() {
    const b = this.el.bcfg;
    if (!b) return;
    if (b.classList.contains('on')) { this.closeBattleCfg(); return; }
    this.bcfgPrev = !!Game.paused;
    Game.paused = true;
    b.classList.add('on');
    if (this.el.btnBcfg) this.el.btnBcfg.classList.add('on');
    this.renderBattleCfg();
  },
  closeBattleCfg() {
    const b = this.el.bcfg;
    if (!b || !b.classList.contains('on')) return;
    b.classList.remove('on');
    b.innerHTML = '';
    if (this.el.btnBcfg) this.el.btnBcfg.classList.remove('on');
    Game.paused = !!this.bcfgPrev;
  },
  renderBattleCfg() {
    const b = this.el.bcfg;
    if (!b) return;
    b.innerHTML = '';
    const box = Util.el('div', 'bc-box');
    box.appendChild(Util.el('div', 'bc-h', Game.phase === 'battle' ? '一時停止中' : '設定'));
    const btn = (cls, html, fn) => { const e = Util.el('button', 'bc-btn ' + cls); e.innerHTML = html; e.addEventListener('click', fn); return e; };
    box.appendChild(btn('go', Icons.get('play') + '<span>' + (Game.phase === 'battle' ? '再開' : '閉じる') + '</span>', () => { Snd.ui(); this.closeBattleCfg(); }));
    box.appendChild(btn('', Icons.get(Game.perm.mute ? 'mute' : 'sound') + '<span>音 ' + (Game.perm.mute ? 'オフ' : 'オン') + '</span>', () => {
      Snd.resume(); Snd.setMute(!Game.perm.mute); this.renderBattleCfg();
    }));
    const tog = (key, name) => btn(Game.perm[key] ? 'on' : '', '<i class="bc-chk">' + (Game.perm[key] ? Icons.get('check') : '') + '</i><span>' + name + '</span>', () => {
      Game.perm[key] = !Game.perm[key]; Game.save(); Snd.ui(); this.renderBattleCfg();
    });
    box.appendChild(tog('autoWave', '次のウェーブへ自動で進む'));
    box.appendChild(btn(Game.perm.hideLifeBar ? '' : 'on', '<i class="bc-chk">' + (Game.perm.hideLifeBar ? '' : Icons.get('check')) + '</i><span>ライフのバーを出す</span>', () => {
      Game.perm.hideLifeBar = !Game.perm.hideLifeBar; Game.save(); Snd.ui(); this.renderBattleCfg(); this.renderHud();
    }));
    box.appendChild(btn(Game.perm.hideDmgNum ? '' : 'on', '<i class="bc-chk">' + (Game.perm.hideDmgNum ? '' : Icons.get('check')) + '</i><span>ダメージの数字を出す</span>', () => {
      Game.perm.hideDmgNum = !Game.perm.hideDmgNum; Game.save(); Snd.ui(); this.renderBattleCfg();
    }));
    box.appendChild(btn(Game.perm.hidePlaceToast ? '' : 'on', '<i class="bc-chk">' + (Game.perm.hidePlaceToast ? '' : Icons.get('check')) + '</i><span>配置の通知を出す</span>', () => {
      Game.perm.hidePlaceToast = !Game.perm.hidePlaceToast; Game.save(); Snd.ui(); this.renderBattleCfg();
    }));
    // 減速・加速の説明の札（閉じたあとで、もう一度出せるように）
    box.appendChild(btn(Game.perm.zoneTipOff ? '' : 'on', '<i class="bc-chk">' + (Game.perm.zoneTipOff ? '' : Icons.get('check')) + '</i><span>減速・加速の説明を出す</span>', () => {
      Game.perm.zoneTipOff = !Game.perm.zoneTipOff; Game.save(); Snd.ui(); this._zoneKey = null; this.renderBattleCfg();
    }));
    const inBattle = Game.phase === 'battle' && Game.run && !Game.run.over;
    box.appendChild(btn('danger', Icons.get('close') + '<span>' + (inBattle ? '撤退してホームへ' : 'ホームへ戻る') + '</span>', () => {
      Snd.ui();
      this.closeBattleCfg();
      if (inBattle) Main.finish(false); else Main.toHome();
    }));
    b.appendChild(box);
  },

  // ================= 減速・加速の説明 =================
  // **一度知れば十分なので、閉じられるようにする。**（2026-09-26・ユーザー「減速と加速の説明は消せるようにしましょう」）
  //   前はキャンバスに描いていて消せなかった（Render.zoneLegend）。閉じたことは perm.zoneTipOff に覚える（⚙ から戻せる）
  renderZoneTip() {
    const z = this.el.zoneTip;
    if (!z) return;
    const st = Game.run && Game.run.stage;
    const has = !!(st && st.vec && st.vec.hexes && st.vec.hexes.some(h => h.zone));
    const show = has && !Game.perm.zoneTipOff && document.body.classList.contains('on-battle');
    const key = show ? 'on' : 'off';
    if (this._zoneKey === key) return;
    this._zoneKey = key;
    z.classList.toggle('on', show);
    z.innerHTML = '';
    if (show) {
      z.innerHTML = '<div><b class="zt-mud">減速</b>敵が遅くなる</div><div><b class="zt-slope">加速</b>敵が速くなる</div>';
      const x = Util.el('button', 'zt-x');
      x.innerHTML = Icons.get('close');
      x.title = 'この説明を閉じる（⚙ から戻せます）';
      x.addEventListener('click', () => { Game.perm.zoneTipOff = true; Game.save(); Snd.ui(); this._zoneKey = null; this.renderZoneTip(); });
      z.appendChild(x);
    }
    // 札が出入りすると、盤を動かせる範囲も変わる（札の下に隠れる六角を作らない・Render.insets）
    if (typeof Render !== 'undefined' && Render.canvas && Game.run) Render.fit();
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
    // **向きは六角の6方向から選ぶ。**（2026-09-25・プレイヤーの感想「360度ある意味がない」→ ユーザー採用）
    //   0929y：板の中の矢印ボタンの列をやめ、**選んだ武器の六角のまわりに、辺ごとに六角のボタンを出す**（盤の上・Render.dirRing。押す処理は Main.bindPlacement）。
    //   向きの意味・保存（perm.placements の a）・射界の計算は前のまま
    if (build) p.appendChild(Util.el('div', 'udhint', '向き：まわりの六角をタップ'));
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
    x = Util.clamp(x, 6, Math.max(6, host.width - w - 6));
    y = Util.clamp(y, 6, Math.max(6, host.height - h - 6));
    // 向きの花（盤の上の六角ボタン）と重ならないようにする。**板が花を覆うと、覆われたボタンは押せない。**
    //   覚えた位置（perm.upop）は書き換えず、そのときだけ別の隅へ逃がす（下・上の左右の順に、花と重ならない最初の隅）
    const ring = Render.dirRing();
    if (ring) {
      const q = Render.toClient(ring.cx, ring.cy), s = Render.scale;
      const par = (p.offsetParent || this.el.stage).getBoundingClientRect();
      const fx = q.x - par.left, fy = q.y - par.top, fw = ring.hx * s + 4, fh = ring.hy * s + 4;
      const hit = (px, py) => px < fx + fw && px + w > fx - fw && py < fy + fh && py + h > fy - fh;
      if (hit(x, y)) {
        const L = 10, Rt = Math.max(6, host.width - w - 10), B = Math.max(6, host.height - h - 122), T = 40;
        for (const c of [[L, B], [Rt, B], [Rt, T], [L, T]]) {
          if (!hit(c[0], c[1])) { x = c[0]; y = c[1]; break; }
        }
      }
    }
    p.style.left = x + 'px';
    p.style.top = y + 'px';
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
    { t: '下の列の武器をひとつ選ぶ',    s: 'GAT はガトリング' },
    // **敵の通り道（点線）を撃てるように置く、を教える。**（2026-09-26・ユーザー「敵が通るガイドをみて、そこを打つようにしておくと良いよ！みたいなチュートリアルを少し挟んであげると、親切なゲームになりそう」）
    //   オタクくんのテストプレイで、コアの周りに固めて置くと第1章を 12本中0本 しか越えられなかった
    { t: '点線が敵の通り道。その近くの光っている地面に置く', s: 'コアのすぐ横より、道の途中のほうが長く撃てる' },
    { t: 'まわりの六角を押して向きを変え、扇（撃てる範囲）に点線を入れる', s: '扇に入る点線が長いほど、たくさん撃てる。向きは六角の6方向' },
    { t: '右下の「準備完了」で始まる',    s: '置き直しはウェーブの合間にできる' },
    { t: 'あとは眺めるだけ',            s: '倒すとコインが増える。負けても持ち帰れる' },
  ],

  // ============ 初めてのときの一言（2026-09-26・ユーザー「少し導線を設置するだけでかなり良くなります」「短い一言でいいです」） ============
  // チュートリアルは第3章まで（ユーザー決定）。それより先に出てくる武器と画面は、
  // 初めて触ったときに一言だけ添え、まだ触っていないものには NEW の印を付ける。見たかどうかは perm.seen に持つ
  isNew(key) { return !(Game.perm.seen && Game.perm.seen[key]); },
  markSeen(key) {
    if (!Game.perm.seen) Game.perm.seen = {};
    if (Game.perm.seen[key]) return;
    Game.perm.seen[key] = 1;
    Game.save();
  },
  // 武器を初めて選んだときの一言。**どこに置くと働くか**だけを言う（ガトリングはチュートリアルで教える）
  WEAPON_TIP: {
    sniper:   '射程が長い。長くまっすぐな道を見通せる場所に',
    missile:  '円の中へ降らせる。円は敵の通り道の上に',
    tesla:    '射程が短い。道のすぐ脇に',
    flame:    '射程が短く、壁を越えて焼ける。道の曲がり角に',
    gas:      '毒の雲は壁を越える。敵が長く通る場所に',
    cryo:     'まわりの敵を遅くする。火力の強い武器の近くに',
    katana:   '間合いが短く、壁を越えて斬れる。道のすぐ脇に',
    shuriken: '敵から敵へ跳ねる。敵が詰まる場所に',
    tentacle: '敵を来た道へ引き戻す。コアの手前の道に',
    bubble:   '円の中の敵を閉じ込める。円は火力の届く道に',
    mortar:   '円の中へ重い砲弾。射程が長いので離れた道にも届く',
  },
  // 画面（下のタブ）を初めて開いたときの一言
  TAB_TIP: {
    skill: 'コインで強化を取る。取ると次の節が開く',
    load:  '出撃に持っていく武器を選ぶ画面',
    pack:  'パックを開けてカードを集める。カードは再起動しても残る',
    coll:  '集めたカードの一覧。同じカードを重ねると強くなる',
    pres:  '再起動すると章とコインは戻るが、土台がずっと強くなる',
  },

  // 画面の一言と、見たかどうかの鍵。**アセンション中の「転生」タブは別の画面なので、別の一言と別の鍵**（開いたらもう一度 NEW が付く）
  tabTip(id) {
    if (id === 'pres' && Asc.on(Game.perm)) return { key: 'tab_asc', text: 'アセンション：章を進めるとレベルが上がり、恒久の火力とパックがもらえる。何も失わない' };
    return this.TAB_TIP[id] ? { key: 'tab_' + id, text: this.TAB_TIP[id] } : null;
  },

  // 今のステップが済んだかを、盤面の状態から見る（押させるボタンは作らない）
  tutDone(i) {
    const run = Game.run;
    switch (i) {
      // 戦闘が始まったら、準備の段（0〜2）は済んだことにする（2026-09-26：向きを合わせずに始めると、戦闘中も「向きを合わせて」が出続けていた）
      case 0: return Game.phase === 'battle' || !!this.placingType || (run && run.units.length > 0);
      case 1: return Game.phase === 'battle' || !!(run && run.units.length > 0);
      case 2: return Game.phase === 'battle' || !!this.tutAimed;
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
      // チュートリアルが済んだあとは、初めて手に取った武器の一言だけをここに出す
      const tp = this.tip;
      if (tp && run && !run.over && this.placingType === tp.wid) {
        const html = '<i>NEW</i><b>' + tp.t + '</b>';
        if (p.innerHTML !== html) p.innerHTML = html;
        p.classList.add('on');
      } else {
        if (tp && this.placingType !== tp.wid) this.tip = null;
        p.classList.remove('on'); p.innerHTML = '';
      }
      return;
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
      // 第30章を突破したら「転生」は「アセンション」になる（src/ascension.js）
      if (id === 'pres') { const tl = b.querySelector('.tl'); if (tl) tl.textContent = Asc.on(Game.perm) ? 'アセンション' : '再起動'; }
      b.classList.toggle('new', open && !!this.tabTip(id) && this.isNew(this.tabTip(id).key));
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
    // 初めて開いた画面には一言だけ出す（次に開いたときには消えている）
    const tip = this.tabTip(this.tab);
    if (tip && this.isNew(tip.key) && !this.tabsOff && document.body.classList.contains('on-home')) {
      this.markSeen(tip.key);
      this.renderTabs();
      const h = Util.el('div', 'firsthint');
      h.innerHTML = '<i>NEW</i>' + tip.text;
      p.appendChild(h);
    }

    if (this.tab === 'stage') this.panelStages(p);
    else if (this.tab === 'skill') this.panelSkill(p);
    else if (this.tab === 'load') this.panelLoadout(p);
    else if (this.tab === 'coll') this.panelCollection(p);
    else if (this.tab === 'pack') this.panelPacks(p);
    else if (this.tab === 'pres') (Asc.on(Game.perm) ? this.panelAscension(p) : this.panelPrestige(p));
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
        '<div class="stmini" data-sid="' + (unlocked ? s.id : '') + '">' + (unlocked ? '' : '<span class="lk">' + Icons.get('lock') + '</span>') + '</div>' +
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
          this.toastMsg(s.name + ' を選択', '#ff8a1f', 'select');
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
    for (const co of (st.cores || [st.core])) out += dot(co, '#ffa32e');           // コア（2つの盤は2つ）
    return out + '</svg>';
  },

  // ================= スキルツリー =================
  //   **目的ごとに分けた「連なり」の札で見せる。**（ユーザー 2026-09-25「スキルツリーについて、ここは完全にリデザインするようにしましょう、
  //   現状横にずらっと伸びてて下にずらっと伸びてて、移動範囲が多く不便です、武器は武器、パッシブはパッシブなどで
  //   広がるブランチを分けて、目的に応じて見やすくしましょう」）
  //   前は 10本の枝を横に並べた1枚の大きな木（幅780px・縦は最長17節）で、縦横にスクロールが要った。
  //   ツリーの中身は「短い連なり」の集まり（取り切りで順に開く）なので、形もそれに合わせる：
  //     上の目的タブ（武器／拠点／カード／危険） → 武器なら分類の切り替え → 連なりごとの札
  //     札 … 名前と進み（3/5）、節の粒（取った／次／まだ）、選んだ節（ふつうは次の1つ）の中身と取るボタン
  SKILL_TABS: [
    { id: 'weapon', name: '武器',   sub: '分類ごとの火力と置ける数',       groups: ['短射程', '中射程', '長射程', '範囲攻撃', '指定攻撃', '支援'] },
    { id: 'base',   name: '拠点',   sub: 'コイン・修理・盤に置ける数',     groups: ['資源', '拠点'] },
    { id: 'card',   name: 'カード', sub: '3択の枚数・選択肢・運・パック',  groups: ['カード'] },
    { id: 'risk',   name: '危険',   sub: '敵を増やしてコインを稼ぐ',       groups: ['危険'] },
  ],
  // 連なりの名前（gkey ごと。分類の節は「火力」「設置」）
  CHAIN_NAME: { coin: '資源', regen: '修理', units: '盤に置ける数', picks: '取れる枚数', choices: '選択肢',
    luck: '運', pack: '解析', lure: '誘引' },

  // 目的タブ → 連なりの一覧。連なり＝needs でつながった節の列
  skillChains(groups) {
    const out = [];
    for (const g of groups) {
      const map = {};
      for (const s of SKILLS) {
        if (s.group !== g) continue;
        // 分類の節は gkey を持たない（火力の列）。設置の列は short_unit などの gkey
        const k = s.gkey || (s.cat + '_main');
        if (!map[k]) { map[k] = { key: k, group: g, cat: s.cat || null, nodes: [] }; out.push(map[k]); }
        map[k].nodes.push(s);
      }
    }
    for (const ch of out) {
      ch.name = this.CHAIN_NAME[ch.key] || (/_unit$/.test(ch.key) ? '設置' : /_main$/.test(ch.key) ? '火力' : ch.group);
    }
    return out;
  },

  // 目的タブに「いま取れる節」がいくつあるか
  skillTabCan(tab) {
    if (!Game.canBuySkills()) return 0;
    return SKILLS.filter(s => tab.groups.indexOf(s.group) >= 0 && Skill.canBuy(Game.meta, Game.perm, s.id)).length;
  },

  // コインが増減したときの光らせ直し（ui.js の毎フレームの見回りから呼ばれる）。**描き直しはしない**
  refreshSkills() {
    if (!this.skillRows || !this.skillRows.length) return;
    const c = document.getElementById('treeCoin');
    if (c) c.textContent = Util.fmt(Game.meta.coins);
    let changed = false;
    for (const r of this.skillRows) {
      if (!r.el.isConnected) continue;
      const can = Game.canBuySkills() && Skill.canBuy(Game.meta, Game.perm, r.id);
      if (r.can !== can) { r.can = can; changed = true; }
    }
    // 取れるかどうかが変わったら、そのときだけ描き直す（ボタンの文言と粒の光が変わるため）
    if (changed) this.refreshTree();
  },

  panelSkill(p) {
    const perm = Game.perm, meta = Game.meta;
    this.skillRows = [];
    if (!this.skillTab) this.skillTab = 'weapon';
    // 「危険」（敵誘引）のタブは BAL.lureInTree のときだけ出す（2026-09-26 ツリーから外した）
    const tabList = this.SKILL_TABS.filter(t => t.id !== 'risk' || BAL.lureInTree);
    const tab = tabList.find(t => t.id === this.skillTab) || tabList[0];

    // コインとまとめ買い（上に貼り付く）
    p.appendChild(this.treePoints());
    if (!Game.canBuySkills()) p.appendChild(Util.el('div', 'warn', '戦闘中は購入できません。撤退するか、ステージを終えてから。'));

    // 目的タブ
    const tabs = Util.el('div', 'sk-tabs');
    for (const t of tabList) {
      const n = this.skillTabCan(t);
      const b = Util.el('button', 'sk-tab' + (t.id === tab.id ? ' on' : ''));
      b.innerHTML = '<b>' + t.name + '</b>' + (n ? '<i>' + n + '</i>' : '');
      b.addEventListener('click', () => { this.skillTab = t.id; Snd.ui(); this.renderPanel(); });
      tabs.appendChild(b);
    }
    p.appendChild(tabs);
    p.appendChild(Util.el('div', 'sk-sub', tab.sub));

    let groups = tab.groups;
    // 武器は分類を1つずつ見せる。**武器を持っていない分類は鍵**（その分類の節は開かない）
    if (tab.id === 'weapon') {
      const chips = Util.el('div', 'sk-cats');
      const catOf = (g) => SKILLS.find(s => s.group === g).cat;
      const owns = (g) => Skill.isUnlocked(perm, SKILLS.find(s => s.group === g && !s.needs).id);
      if (!this.skillCat || groups.indexOf(this.skillCat) < 0) {
        this.skillCat = groups.find(g => owns(g) && SKILLS.some(s => s.group === g && Skill.canBuy(meta, perm, s.id))) ||
          groups.find(owns) || groups[0];
      }
      for (const g of groups) {
        const C = CATEGORIES[catOf(g)];
        const n = Game.canBuySkills() ? SKILLS.filter(s => s.group === g && Skill.canBuy(meta, perm, s.id)).length : 0;
        const b = Util.el('button', 'sk-cat' + (g === this.skillCat ? ' on' : '') + (owns(g) ? '' : ' locked'));
        b.style.setProperty('--bc', C.color);
        b.innerHTML = C.icon + '<span>' + g + '</span>' + (n ? '<i>' + n + '</i>' : '');
        b.addEventListener('click', () => { this.skillCat = g; Snd.ui(); this.renderPanel(); });
        chips.appendChild(b);
      }
      p.appendChild(chips);
      groups = [this.skillCat];
      if (!owns(this.skillCat)) {
        p.appendChild(Util.el('div', 'rs-tip', CATEGORIES[catOf(this.skillCat)].name + 'の武器を手に入れると開きます'));
      }
    }

    for (const ch of this.skillChains(groups)) p.appendChild(this.skillTrack(ch));
  },

  // 連なり1本の札。dm … 演出の確認室の見本（debugroom.js）。あれば見本のセーブ・見本の選択で描き、押しても実セーブは変わらない
  skillTrack(ch, dm) {
    const perm = Game.perm, meta = Game.meta;
    const canBuy = dm ? true : Game.canBuySkills();
    const col = ch.cat ? CATEGORIES[ch.cat].color : ({ '資源': '#ffd24a', '拠点': '#9fe0c0', 'カード': '#c9a0ff', '危険': '#ff6a7e' })[ch.group] || '#ff8a1f';
    const got = ch.nodes.filter(s => Skill.lv(meta, s.id) > 0).length;
    const next = ch.nodes.find(s => Skill.lv(meta, s.id) <= 0);
    const sel = dm ? dm.sel : (this.skillSel = this.skillSel || {});
    const selId = (sel[ch.key] && ch.nodes.some(s => s.id === sel[ch.key])) ? sel[ch.key] : (next || ch.nodes[ch.nodes.length - 1]).id;
    // 取った直後の描き直しだけ、動きの印（sk-*）を付ける。動きは CSS の backwards だけで、描き直せば消える
    const pend = this._skPend && this._skPend.key === ch.key ? this._skPend : null;

    const tk = Util.el('div', 'tk' + (got === ch.nodes.length ? ' full' : ''));
    tk.dataset.key = ch.key;
    tk.style.setProperty('--bc', col);
    tk.innerHTML = '<div class="tk-head"><i class="tk-ic">' + Icons.skill(ch.nodes[0]) + '</i><b>' + ch.name + '</b>' +
      '<span' + (pend ? ' class="sk-cnt"' : '') + '>' + got + ' / ' + ch.nodes.length + '</span></div>';

    // 節の粒（取った／次／まだ）。タップでその節の中身を見る
    const pips = Util.el('div', 'tk-pips');
    ch.nodes.forEach((s, i) => {
      const lv = Skill.lv(meta, s.id);
      const can = canBuy && Skill.canBuy(meta, perm, s.id);
      const b = Util.el('button', 'tk-pip' + (lv > 0 ? ' have' : s === next ? ' next' : '') + (can ? ' can' : '') + (s.id === selId ? ' sel' : '') +
        (pend && i === pend.idx ? ' sk-got' : '') + (pend && pend.done && lv > 0 ? ' sk-wave' : ''));
      if (pend && pend.done) b.style.setProperty('--i', i);
      b.addEventListener('click', () => { sel[ch.key] = s.id; if (dm) this._demoView(dm, dm.rerender); else this.refreshTree(); });
      pips.appendChild(b);
      if (!dm) this.skillRows.push({ id: s.id, el: b, can });
    });
    tk.appendChild(pips);

    // 選んだ節の中身と、取るボタン
    const s = SKILL_BY_ID[selId];
    const lv = Skill.lv(meta, s.id);
    const unlocked = Skill.isUnlocked(perm, s.id);
    const can = canBuy && Skill.canBuy(meta, perm, s.id);
    const node = Util.el('div', 'tk-node');
    node.innerHTML =
      '<div class="tk-plate' + (lv > 0 ? ' have' : '') + (pend ? ' sk-open' : '') + '"><i class="tplate">' + (unlocked || lv > 0 ? Icons.skill(s) : Icons.get('lock')) + '</i></div>' +
      '<div class="tk-body' + (pend ? ' sk-in' : '') + '"><b>' + (unlocked || lv > 0 ? s.name : '？？？') + '</b>' +
        '<span>' + (unlocked || lv > 0 ? Skill.shortDesc(s) : Skill.lockReason(perm, s.id)) + '</span></div>';
    const btn = Util.el('button', 'tk-buy' + (lv > 0 ? ' done' : can ? '' : ' short'));
    if (lv > 0) btn.innerHTML = Icons.get('check') + '取得済';
    else if (!unlocked) btn.innerHTML = Icons.get('lock');
    else btn.innerHTML = '<span>' + (can ? '取得' : !canBuy ? '戦闘中' : '不足') + '</span><b>' + Icons.coin() + Util.fmt(Skill.cost(meta, s.id)) + '</b>';
    btn.disabled = lv > 0 || !can;
    btn.addEventListener('click', () => this.skillBuy(ch, s, dm));
    node.appendChild(btn);
    tk.appendChild(node);
    return tk;
  },

  // ノードを買う。買う・値段・効果は前のまま（Skill.buy / Game.applyMods）。そのあと取った瞬間の演出（skillFxPlay）を出す
  //   dm があるときは見本：見本のセーブを Game.meta / Game.perm の代わりに読み出しのあいだだけ差し替え、実セーブは触らない
  skillBuy(ch, s, dm) {
    const go = () => {
      if (!dm && !Game.canBuySkills()) return;
      const meta = Game.meta, perm = Game.perm;
      const host = dm ? dm.host : this.el.panel;
      const sel = dm ? dm.sel : this.skillSel;
      const oldTk = host.querySelector('.tk[data-key="' + ch.key + '"]');
      const plate = oldTk && oldTk.querySelector('.tk-plate');
      const pr = plate ? plate.getBoundingClientRect() : null;   // 押した節の位置（描き直す前に控える）
      const kind = Skill.fxKind(s), t0 = Skill.fxTotal(meta, s);
      if (!Skill.buy(meta, perm, s.id)) return;
      const t1 = Skill.fxTotal(meta, s);
      if (!dm) Game.applyMods();
      Snd.ui();
      delete sel[ch.key];       // 取ったら次の節へ
      const done = ch.nodes.every(x => Skill.lv(meta, x.id) > 0);
      this._skPend = { key: ch.key, idx: ch.nodes.indexOf(s), done };
      try { if (dm) dm.rerender(); else this.refreshTree(); }
      finally { this._skPend = null; }
      const tk = host.querySelector('.tk[data-key="' + ch.key + '"]');
      const mile = s.gkey === 'units' ? 'units' : done ? 'done' : null;   // 設置枠と、連なりを取り切った節は一段強く
      try { this.skillFxPlay({ tk, pr, kind, t0, t1, idx: ch.nodes.indexOf(s), done, mile, chName: ch.name, n: ch.nodes.length, col: ch.cat ? CATEGORIES[ch.cat].color : (tk ? tk.style.getPropertyValue('--bc') : '#ff8a1f') }); }
      catch (e) { console.error('スキルの演出', e); }
    };
    if (dm) this._demoView(dm, go); else go();
  },

  // 見本のセーブに差し替えて fn を回す（同期だけ。実セーブはすぐ戻す）
  _demoView(dm, fn) {
    if (this._demoOn) return fn();
    const m = Game.meta, p = Game.perm;
    this._demoOn = true; Game.meta = dm.meta; Game.perm = dm.perm;
    try { return fn(); }
    finally { Game.meta = m; Game.perm = p; this._demoOn = false; try { Relic.invalidate(); } catch (e) {} }
  },

  // ================= ノードを取った瞬間の演出（0929t） =================
  //   結果画面と同じ語彙：六角の衝撃波・VFD の窓で数え上がる「前 → 後」・斜めの帯（設置枠と連なりの取り切りだけ）。
  //   **操作を妨げない**：全部 pointer-events:none の別の層（#skfx）に出し、通常は約1.1秒・帯は約1.5秒で片付ける。
  //   連打しても溜まらない：出すたびに前の層を空にして、前の数え上げ・待ち時間も止める。次の節を押すのは、押した瞬間から可能
  _skLayer() {
    let L = document.getElementById('skfx');
    if (!L) { L = Util.el('div'); L.id = 'skfx'; document.body.appendChild(L); }
    clearInterval(this._skIv);
    (this._skTimers || []).forEach(clearTimeout);
    this._skTimers = [];
    L.replaceChildren();
    return L;
  },
  skillFxClear() {
    clearInterval(this._skIv);
    (this._skTimers || []).forEach(clearTimeout);
    this._skTimers = [];
    const L = document.getElementById('skfx');
    if (L) L.replaceChildren();
  },
  skillFxPlay(P) {
    const tk = P.tk;
    if (!tk || !tk.isConnected) return;
    const L = this._skLayer();
    const col = P.col, tr = tk.getBoundingClientRect(), mile = P.mile;
    const from = P.kind.v(P.t0), to = P.kind.v(P.t1), f = P.kind.f;
    const later = (fn, ms) => this._skTimers.push(setTimeout(fn, ms));
    const anim = (el, kf, o) => { try { el.animate(kf, Object.assign({ fill: 'both' }, o)); } catch (e) {} };
    const pips = tk.querySelectorAll('.tk-pip');
    const A = pips[P.idx], B = P.done ? null : pips[P.idx + 1];
    const mid = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

    // 1) 押した節から六角の衝撃波。取った粒にも小さく
    const [px, py] = P.pr ? [P.pr.left + P.pr.width / 2, P.pr.top + P.pr.height / 2] : [tr.left + 40, tr.top + 50];
    CardFX.hexShock(L, px, py, col, mile ? true : false);
    if (A) { const [ax, ay] = mid(A); later(() => CardFX.hexShock(L, ax, ay, '#ffffff', 'sm'), 70); }

    // 2) 次の節へ、つながりの線を光が走る（粒の列を伝う）。着いた粒がもう一度光る
    if (A && B && !mile) {
      const [ax, ay] = mid(A), [bx, by] = mid(B);
      const len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
      const beam = Util.el('i', 'skfx-beam');
      beam.style.width = len + 'px'; beam.style.setProperty('--bc', col);
      const T = 'translate(' + ax + 'px,' + ay + 'px) rotate(' + ang + 'rad) ';
      L.appendChild(beam);
      anim(beam, [{ transform: T + 'scaleX(0)', opacity: 1 }, { transform: T + 'scaleX(1)', opacity: 1, offset: 0.45 }, { transform: T + 'scaleX(1)', opacity: 0 }],
        { duration: 560, delay: 60, easing: 'ease-out' });
      const run = Util.el('div', 'skfx-run');
      run.style.setProperty('--bc', col);
      run.innerHTML = '<i></i>';
      L.appendChild(run);
      anim(run, [{ transform: 'translate(' + ax + 'px,' + ay + 'px) scale(.7)', opacity: 1 },
        { transform: 'translate(' + bx + 'px,' + by + 'px) scale(1)', opacity: 1, offset: 0.6 },
        { transform: 'translate(' + bx + 'px,' + by + 'px) scale(1.9)', opacity: 0 }], { duration: 520, delay: 80, easing: 'cubic-bezier(.4,0,.2,1)' });
      later(() => { if (B.isConnected) { B.classList.add('sk-arrive'); B.addEventListener('animationend', () => B.classList.remove('sk-arrive'), { once: true }); } CardFX.hexShock(L, bx, by, col, 'sm'); }, 320);
    }

    // 3) 数え上がる窓（前 → 後）。設置枠と取り切りは、斜めの帯に載せる
    const count = (el, f0) => {
      let i = 0; const N = 8;
      el.textContent = f(f0);
      this._skIv = setInterval(() => {
        i++;
        el.textContent = f(f0 + (to - f0) * (1 - Math.pow(1 - i / N, 2)));
        if (i >= N) { clearInterval(this._skIv); if (el.parentNode) el.parentNode.classList.add('done'); }
      }, 45);
    };
    if (mile) {
      const pb = tk.querySelector('.tk-pips').getBoundingClientRect().bottom;
      const h = 86;
      const top = Math.max(4, Math.min(window.innerHeight - h - 4, tr.top + (pb - tr.top) / 2 - h / 2));
      const units = mile === 'units';
      const chars = Array.from(units ? '増設完了' : '系統完了').map((c, i) => '<i style="--d:' + (i * 0.05).toFixed(2) + 's">' + c + '</i>').join('');
      const band = Util.el('div', 'skfx-band');
      band.style.setProperty('--bc', col); band.style.top = top + 'px'; band.style.height = h + 'px';
      band.innerHTML = '<i class="skb-bg"></i><em>' + (units ? '// MODULE INSTALLED' : '// BRANCH COMPLETE') + '</em><b>' + chars + '</b>' +
        '<span>' + (units ? P.kind.label + ' <b class="a">' + f(from) + '</b> → <b class="to">' + f(from) + '</b>' : P.chName + '　' + P.n + '節 すべて取得') + '</span>';
      L.appendChild(band);
      const cy = top + h / 2;
      later(() => CardFX.hexShock(L, window.innerWidth / 2, cy, col, true), 90);
      if (units) later(() => { const el = band.querySelector('.to'); if (el && el.isConnected) count(el, from); }, 300);
      try { Snd.tone({ type: 'triangle', f0: 392, f1: 784, dur: 0.16, vol: 0.06 }); setTimeout(() => Snd.tone({ type: 'triangle', f0: 587, f1: 1174, dur: 0.22, vol: 0.06 }), 90); } catch (e) {}
      later(() => L.replaceChildren(), 1500);
    } else {
      const rd = Util.el('div', 'skfx-read');
      rd.style.setProperty('--bc', col);
      rd.style.left = (tr.left + 8) + 'px'; rd.style.top = (tr.top + 4) + 'px'; rd.style.width = (tr.width - 16) + 'px';
      rd.innerHTML = '<small>' + P.kind.label + '</small><b class="a">' + f(from) + '</b><i>→</i><b class="b">' + f(from) + '</b>';
      L.appendChild(rd);
      later(() => { const el = rd.querySelector('.b'); if (el && el.isConnected) count(el, from); }, 200);
      try { Snd.tone({ type: 'triangle', f0: 520, f1: 1040, dur: 0.09, vol: 0.045 }); } catch (e) {}
      later(() => L.replaceChildren(), 1100);
    }
  },

  treePoints() {
    const t = Util.el('div', 'tpoints');
    t.innerHTML = '<span>' + Icons.coin() + '</span><b id="treeCoin">' + Util.fmt(Game.meta.coins) + '</b>';

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
      this.toastMsg(r.n + '件 購入　コイン ' + Util.fmt(r.spent), '#ff8a1f', 'buy');
      this.refreshTree();
    });
    t.appendChild(b);
    return t;
  },

  // 描き直し。**パネルの縦位置をそのまま保つ**
  refreshTree() {
    const y = this.el.panel.scrollTop;
    this.renderPanel();
    this.el.panel.scrollTop = y;
  },
  // ================= 装備（編成） =================
  //   **武器はカードで見せる。**（2026-09-25・ユーザー「装備画面のリデザイン」）
  //   前は「GAT ガトリング／中射程 最大N基」の文字の枠と、15種の連携を全部並べた表だった。
  //   枠には武器カードそのもの（絵・凸の星）を置き、連携は「成立している」「あと1種」だけ出す
  panelLoadout(p) {
    const nOpen = Game.loadoutSlots();
    const battle = Game.phase === 'battle';
    const hero = Util.el('div', 'lo-hero');
    hero.innerHTML =
      '<div><b>編成</b><span>使う武器の<em>種類</em>を選ぶ。同じ武器は上限まで何基でも置ける</span></div>' +
      '<div class="lo-num"><i>種類</i><b>' + Game.loadoutWeapons().length + '<small>/' + nOpen + '</small></b></div>' +
      '<div class="lo-num"><i>盤に置ける</i><b>' + Game.slotsTotal() + '<small>基</small></b></div>';
    p.appendChild(hero);

    const slots = Util.el('div', 'lo-slots');
    Game.perm.loadout.forEach((cid, i) => {
      if (i >= nOpen) {
        // **まだ開いていない枠。**到達した章で開く（BAL.loadoutByDeep）
        const need = Game.loadoutNeed(i);
        if (need === null) return;
        const s = Util.el('div', 'lo-slot locked');
        s.innerHTML = '<div class="lo-ph">' + Icons.get('lock') + '<b>' + (i + 1) + '種目</b><span>第' + need + '章に到達すると開く</span></div>';
        slots.appendChild(s);
        return;
      }
      const c = cid ? CARDS[cid] : null;
      const s = Util.el('button', 'lo-slot' + (c ? ' filled' : ' empty'));
      if (c) {
        const w = WEAPONS[c.weapon], cat = CATEGORIES[w.cat];
        s.style.setProperty('--wc', w.color);
        s.appendChild(CardFX.face(c, { count: Game.own(cid) }));
        s.insertAdjacentHTML('beforeend', '<div class="lo-cap"><span style="color:' + cat.color + '">' + cat.icon + cat.name + '</span>' +
          '<b>最大 ' + Game.unitCap(w.id) + '基</b></div>');
      } else {
        s.innerHTML = '<div class="lo-ph"><i class="lo-plus">＋</i><b>武器を選ぶ</b><span>' + (i + 1) + '種目</span></div>';
      }
      s.disabled = battle;
      s.addEventListener('click', () => this.pickWeapon(i));
      slots.appendChild(s);
    });
    p.appendChild(slots);
    if (battle) p.appendChild(Util.el('div', 'warn', '戦闘中は編成を変えられません'));

    // 連携：成立している／あと1種で成立
    const ids = Game.loadoutWeapons();
    const on = [], near = [];
    for (const id of CARD_IDS) {
      const c = CARDS[id];
      if (c.kind !== 'synergy') continue;
      const k = c.requires.filter(w => ids.includes(w)).length;
      if (k === c.requires.length) on.push(id);
      else if (k === c.requires.length - 1) near.push(id);
    }
    const row = (id, st) => {
      const c = CARDS[id];
      const d = Util.el('button', 'lo-syn ' + st + (Game.own(id) > 0 ? '' : ' noown'));
      d.innerHTML = '<span class="lo-si">' + c.requires.map(w => '<i style="color:' + WEAPONS[w].color + '">' + WEAPONS[w].icon + '</i>').join('') + '</span>' +
        '<b>' + c.name + '</b><span class="lo-sd">' + this.shortDesc(c) + '</span>' +
        '<em>' + (st === 'on' ? (Game.own(id) > 0 ? '成立' : '成立・未所持') :
          'あと ' + c.requires.filter(w => !ids.includes(w)).map(w => WEAPONS[w].name).join('') + '</em>');
      // カードを大きく見せる。**閉じるキーを付け、背景を押しても閉じる**（2026-09-29 ユーザー報告：
      //   「連携を押すとカードが一枚出てきて、その後戻ることができなくなる」。背景で閉じない設定で開いていて、閉じる手段が無かった）
      d.addEventListener('click', () => {
        const body = Util.el('div', 'synview');
        body.appendChild(CardFX.face(c, { count: Game.own(id), tap: true }));
        const close = Util.el('button', 'rs-sub synclose');
        close.innerHTML = Icons.get('close') + '閉じる';
        close.addEventListener('click', () => this.closeModal());
        body.appendChild(close);
        this.openModal(body);
      });
      return d;
    };
    const syn = Util.el('div', 'lo-synbox');
    syn.innerHTML = '<div class="csec"><b>連携</b><span>2つの武器がそろうと、3択に出る</span><em>' + on.length + ' 成立</em></div>';
    if (!on.length && !near.length) syn.appendChild(Util.el('div', 'lo-none', 'この編成で狙える連携はありません'));
    for (const id of on) syn.appendChild(row(id, 'on'));
    for (const id of near) syn.appendChild(row(id, 'near'));
    p.appendChild(syn);
  },

  // 枠に入れる武器を選ぶ。**武器カードの格子で見せる**（持っていない武器は伏せ気味に、入手先を添える）
  pickWeapon(slot) {
    if (Game.phase === 'battle') return;
    const body = Util.el('div', 'wp');
    // **いつでも閉じられるように。**（ユーザー 2026-09-25「武器を所有してない状態で武器を選ぶを押すと戻れなくなります」）
    //   持っている武器がほかの枠で使用中だと全部押せず、外側もほとんど見えないので、閉じる手段が画面の下の
    //   「この枠を空ける」しか無かった。上に貼り付く ✕ と、下の「閉じる」を置く
    //   **✕ は見出しの中の右端に置く。**（2026-09-28・ユーザー「スマホの枠から閉じるための❌が飛び出ている」）
    //   前は見出しの外に浮かせていて、見出しの枠線と角の縞に重なり、枠から飛び出して見えた。閉じるは下にも「閉じる」がある
    const x = Util.el('button', 'wp-x');
    x.innerHTML = Icons.get('close');
    x.addEventListener('click', () => this.closeModal());
    const head = this.choiceHead('武器を選ぶ', (slot + 1) + '種目の枠に入れる武器');
    head.classList.add('hasx');
    head.appendChild(x);
    body.appendChild(head);
    const free = WEAPON_IDS.filter(wid => Game.own('wc_' + wid) > 0 && !Game.perm.loadout.includes('wc_' + wid));
    if (!free.length) body.appendChild(Util.el('div', 'rs-tip',
      '入れられる武器がありません。武器は章の突破とパックで手に入ります'));
    const pick = (cid) => {
      Game.perm.loadout[slot] = cid;
      Game.save(); this.closeModal();
      // ホームで装備を変えただけなら盤面を作り直す必要は無い
      if (document.body.classList.contains('on-battle')) Main.toPrep();
      else this.renderPanel();
    };
    for (const cat of CATEGORY_IDS) {
      const wids = WEAPON_IDS.filter(wid => WEAPONS[wid].cat === cat);
      if (!wids.length) continue;
      const C = CATEGORIES[cat];
      const h = Util.el('div', 'wp-cat');
      h.innerHTML = '<b style="color:' + C.color + '">' + C.icon + ' ' + C.name + '</b><span>' + C.desc + '</span>';
      body.appendChild(h);
      const grid = Util.el('div', 'wp-grid');
      for (const wid of wids) {
        const cid = 'wc_' + wid, w = WEAPONS[wid];
        const have = Game.own(cid) > 0;
        const cur = Game.perm.loadout[slot] === cid;
        const used = !cur && Game.perm.loadout.includes(cid);
        const b = Util.el('button', 'wp-card' + (cur ? ' cur' : '') + (used ? ' used' : '') + (have ? '' : ' miss'));
        b.appendChild(CardFX.face(CARDS[cid], { count: Game.own(cid), dim: !have }));
        b.insertAdjacentHTML('beforeend', '<div class="wp-tag">' + (cur ? '装備中' : used ? '他の枠' :
          !have ? (w.src === 'stage' ? '章の突破で入手' : 'パックで入手') : '最大 ' + Game.unitCap(wid) + '基') + '</div>');
        b.disabled = !have || used;
        if (have && !used) b.addEventListener('click', () => pick(cid));
        grid.appendChild(b);
      }
      body.appendChild(grid);
    }
    const subs = Util.el('div', 'rs-subs wp-foot');
    if (Game.perm.loadout[slot]) {
      const off = Util.el('button', 'rs-sub');
      off.innerHTML = Icons.get('close') + 'この枠を空ける';
      off.addEventListener('click', () => pick(null));
      subs.appendChild(off);
    }
    const close = Util.el('button', 'rs-sub');
    close.textContent = '閉じる';
    close.addEventListener('click', () => this.closeModal());
    subs.appendChild(close);
    body.appendChild(subs);
    this.openModal(body);
  },

  // ================= コレクション =================
  panelCollection(p) {
    const total = CARD_IDS.length;
    const have = CARD_IDS.filter(id => Game.own(id) > 0).length;
    const head = Util.el('div', 'phead');
    head.innerHTML = '<b>カードコレクション</b><span class="sub">' + have + ' / ' + total +
      ' 種類　永久資源。同じカードを重ねるほど凸が上がって強くなる</span>';
    p.appendChild(head);

    // **種類ごとに分けて並べる。**（2026-09-25）
    //   前は1つの格子に全部入れていて、並べ替えの表に遺物と鍵が無く（比較が NaN）、
    //   **遺物がほかのカードの間にばらばらに混ざっていた。**
    //   遺物は「持っているだけで効くカード」（ユーザー 2026-09-25「遺物もパッシブで働くカードのつもりでした、
    //   これも凸で性能を制御するものとして」）なので、独立した節にして凸の星を見せる
    const sections = [
      { kind: 'weapon',  name: '武器',       sub: '編成に入れて盤に置く' },
      { kind: 'mod',     name: '武器強化',   sub: '3択に出る。その武器が編成にあると効く' },
      { kind: 'synergy', name: '連携',       sub: '3択に出る。2つの武器がそろうと効く' },
      { kind: 'generic', name: '汎用',       sub: '3択に出る。どの編成でも効く' },
      { kind: 'perm',    name: '常駐',       sub: '持っているだけで常に効く。凸で強くなる' },
      { kind: 'key',     name: '鍵',         sub: '機能を開く' },
    ];
    for (const sec of sections) {
      const ids = CARD_IDS.filter(id => CARDS[id].kind === sec.kind).sort((a, b) =>
        (BAL.rarityOrder.indexOf(CARDS[b].rarity) - BAL.rarityOrder.indexOf(CARDS[a].rarity)) || a.localeCompare(b));
      if (!ids.length) continue;
      const got = ids.filter(id => Game.own(id) > 0).length;
      const g = Util.el('div', 'csec k-' + sec.kind);
      g.innerHTML = '<b>' + sec.name + '</b><span>' + sec.sub + '</span><em>' + got + ' / ' + ids.length + '</em>';
      p.appendChild(g);
      const grid = Util.el('div', 'cgrid');
      for (const id of ids) grid.appendChild(CardFX.face(CARDS[id], { count: Game.own(id), dim: Game.own(id) === 0, tap: true }));
      p.appendChild(grid);
    }
  },

  // ================= ガチャ（パック） =================
  //   **いわゆるソシャゲのガチャ画面にする。**（ユーザー 2026-09-25「パックの画面を、所謂ソシャゲのガチャ画面の場所にしましょう、
  //   ここはデザインが行き届いてないところです」）
  //   前は「パック名・説明・開封・×N」の行が縦に並ぶだけだった。
  //   選んだパックを舞台の真ん中に大きく置き、提供割合と引くボタンを添える。下の帯で別のパックに切り替える
  //   **【2026-09-29・0929u】台を「データの包みを読み込む装置」にした**（演出の方針：結果画面が基準）。
  //   パックの下に六角の台座・後ろに中心から点く六角の格子・上の窓は VFD（「// DATA PACKAGE ／ 所持」）・開けるボタンは物理スイッチ（LED つき）。
  //   パックを切り替える／タブに入ると、台座から光が昇って絵が差し替わる（fx = 'go'）。開け終わったあとは所持数の窓が光る（fx = 'tick'）。
  //   選び方・開ける処理・まとめて開ける処理・所持数の数え方は変えていない。
  //   demo（演出の確認室）：見本の perm・見本の選びで台を見せる。開けるボタンは demo.open1 / demo.openAll に繋がり、セーブは変わらない
  panelPacks(p, demo) {
    const st = demo || this;              // 選んでいるパックと演出の合図の置き場（見本のときは見本の側。本物の選びに触れない）
    const perm = demo ? demo.perm : Game.perm;
    const fx = st._gsFx || null; st._gsFx = null;
    const rerender = () => demo ? demo.render() : this.renderPanel();
    const shown = PACK_IDS.filter(pid => pid !== 'relic' || Pack.isUnlocked(perm, pid));   // 遺物パックは初回転生まで存在も見せない
    const n = (pid) => perm.packs[pid] || 0;
    const open = (pid) => Pack.isUnlocked(perm, pid);
    // 選んでいるパック。**無ければ、開けられるもの → 開いているもの → 先頭**
    if (!st.gachaPick || shown.indexOf(st.gachaPick) < 0) {
      st.gachaPick = shown.find(pid => open(pid) && n(pid) > 0) || shown.find(open) || shown[0];
    }
    const pid = st.gachaPick, pk = PACKS[pid], have = n(pid), ok = open(pid);
    // 装置の状態：開けられる／空／未開放
    const state = !ok ? ['LOCKED', '未開放', 'lock'] : have > 0 ? ['READY', '開けられます', 'ready'] : ['EMPTY', '所持なし', 'empty'];

    const gs = Util.el('div', 'gs' + (fx === 'go' ? ' fx-go' : fx === 'tick' ? ' fx-tick' : ''));
    gs.style.setProperty('--pc', pk.color);
    gs.style.setProperty('--best', pk.color);
    // 舞台：後ろの六角の格子・光の柱・六角の台座・浮かぶ箱・状態と所持数の窓
    gs.innerHTML =
      '<div class="gs-stage' + (ok ? '' : ' locked') + '">' +
        '<i class="gs-grid"></i><i class="gs-beam"></i>' +
        '<svg class="gs-dock" viewBox="0 0 220 76" aria-hidden="true">' +
          '<polygon class="ds" points="14,46 60,20 160,20 206,46 160,72 60,72"/>' +
          '<polygon class="d0" points="14,38 60,12 160,12 206,38 160,64 60,64"/>' +
          '<polygon class="d1" points="44,38 76,22 144,22 176,38 144,54 76,54"/>' +
          '<polygon class="d2" points="80,38 94,30 126,30 140,38 126,46 94,46"/>' +
          '<polygon class="dp" points="14,38 60,12 160,12 206,38 160,64 60,64"/></svg>' +
        (fx === 'go' ? '<i class="gs-sweep"></i>' : '') +
        '<div class="gs-box' + (PACK_IMG[pid] ? ' img' : '') + '"' + (PACK_IMG[pid] ? ' style="--pimg:url(' + PACK_IMG[pid] + ')"' : '') + '><div class="pfx-strip"></div>' +
          '<div class="pfx-body"><i class="pfx-rv a"></i><i class="pfx-rv b"></i><i class="pfx-rv c"></i><i class="pfx-rv d"></i>' +
          '<div class="pfx-emb"><div class="pfx-gear">' + Icons.get('gear') + '</div><div class="pfx-logo">' + CardFX.logoSvg() + '</div></div>' +
          '<div class="pfx-name">' + pk.name + '</div><div class="pfx-sub">' + pk.size + ' CARDS</div><i class="pfx-haz"></i></div></div>' +
        '<div class="gs-stat ' + state[2] + '"><em>// ' + state[0] + '</em><span>' + state[1] + '</span></div>' +
        '<div class="gs-have"><em>// DATA PACKAGE</em><div class="gs-vfd"><span>所持</span><b>×' + have + '</b></div></div>' +
        (ok ? '' : '<div class="gs-lock">' + Icons.get('lock') + Pack.lockReason(perm, pid) + '</div>') +
      '</div>' +
      '<div class="gs-info"><i class="gs-lamp"></i><em>// ' + pid.toUpperCase() + ' ／ ' + pk.size + ' CARDS</em><b>' + pk.name + '</b><span>' + pk.desc + '</span></div>';
    // 提供割合（weights は合計100）
    const sysR = Util.el('div', 'gs-sys');
    sysR.innerHTML = '<em>// DROP RATE</em><span>提供割合</span>';
    gs.appendChild(sysR);
    const rates = Util.el('div', 'gs-rates');
    for (const r of BAL.rarityOrder) {
      const w = pk.weights[r] || 0;
      const d = Util.el('div', 'gs-rate');
      d.style.setProperty('--rc', BAL.rarity[r].color);
      d.innerHTML = '<i style="width:' + Math.max(w > 0 ? 3 : 0, w) + '%"></i><span>' + CardFX.RAR_EN[r] + '</span><b>' + w + '%</b>';
      rates.appendChild(d);
    }
    gs.appendChild(rates);
    if (pk.guarantee) {
      const note = Util.el('div', 'gs-note');
      note.innerHTML = '<em>// GUARANTEE</em>' + BAL.rarity[pk.guarantee].name + '以上 1枚確定';
      gs.appendChild(note);
    }

    // 引くボタン：物理スイッチの板（ネジ・LED つき）
    const btns = Util.el('div', 'gs-btns');
    const sysB = Util.el('div', 'gs-sys full');
    sysB.innerHTML = '<em>// OPEN</em><span>開封スイッチ</span>';
    btns.appendChild(sysB);
    const b1 = Util.el('button', 'gs-pull one');
    b1.innerHTML = '<span>1個 開ける</span><b>' + pk.size + '枚</b>';
    b1.disabled = !ok || have <= 0;
    b1.addEventListener('click', () => demo ? demo.open1(pid) : this.openPack(pid));
    const bn = Util.el('button', 'gs-pull all');
    bn.innerHTML = '<span>まとめて開ける</span><b>×' + have + '</b>';
    bn.disabled = !ok || have <= 1;
    bn.addEventListener('click', () => demo ? demo.openAll(pid) : this.openPackBulk(pid));
    btns.appendChild(b1); btns.appendChild(bn);
    gs.appendChild(btns);

    // パックの切り替え（持っているものは LED が灯る）
    const list = Util.el('div', 'gs-list');
    for (const id of shown) {
      const c = Util.el('button', 'gs-tab' + (id === pid ? ' on' : '') + (open(id) ? '' : ' locked') + (open(id) && n(id) > 0 ? ' has' : ''));
      c.style.setProperty('--pc', PACKS[id].color);
      c.innerHTML = CardFX.miniPack(PACKS[id]) + '<b>' + PACKS[id].name + '</b>' +
        (open(id) ? '<em' + (n(id) > 0 ? ' class="has"' : '') + '>×' + n(id) + '</em>' : '<em>' + Icons.get('lock') + '</em>');
      c.addEventListener('click', () => { st.gachaPick = id; st._gsFx = id === pid ? null : 'go'; Snd.ui(); rerender(); });
      list.appendChild(c);
    }
    gs.appendChild(list);
    p.appendChild(gs);

    // 光が昇る／所持数が変わった瞬間に、六角の衝撃波（台座の中心・所持数の窓）
    if (fx) requestAnimationFrame(() => {
      const t = gs.querySelector(fx === 'tick' ? '.gs-vfd' : '.gs-dock');
      if (!t || !t.isConnected) return;
      const q = t.getBoundingClientRect();
      CardFX.hexShock(gs.querySelector('.gs-stage'), q.left + q.width / 2, q.top + q.height / 2, pk.color, 'sm');   // 舞台の中に出す（body 直下だと #app の下に隠れる）
    });

    // パックの入手（ミッション）。畳んでおく
    const det = Util.el('details', 'gs-miss');
    const doneN = MISSIONS.filter(m => perm.missions[m.id]).length;
    det.innerHTML = '<summary><em>// MISSION LOG</em>パックの入手　ミッション <b>' + doneN + ' / ' + MISSIONS.length + '</b></summary>';
    for (const m of MISSIONS) {
      const done = !!perm.missions[m.id];
      const row = Util.el('div', 'mrow' + (done ? ' done' : ''));
      const rw = Object.entries(m.reward).map(([k, v]) => PACKS[k].name + '×' + v).join(' / ');
      row.innerHTML = '<span>' + (done ? Icons.get('check') : '□') + '</span><b>' + m.name + '</b><em>' + rw + '</em>';
      det.appendChild(row);
    }
    p.appendChild(det);
  },

  // ================= 開封（ガチャ画面） =================
  // 持っているぶんを全部いっぺんに開ける。
  //   中身は1個ずつ開けたときと完全に同じ（同じ Pack.open を回数ぶん呼ぶだけ）。見せ方は CardFX.openBulk
  //
  //   **流れ（ユーザー 2026-09-29「ガチャ演出重すぎ」）**：① 読み込み画面（CardFX.loadBulk）でくじを全部確定し、凸も計算する
  //   → ② 最高レア度 → ③ 開封の演出 → ④ カードの演出。**演出が始まってからは、重い計算をしない。**
  //   ① は 1フレームの予算（CardFX.LOAD_BUDGET_MS）で小分けにして回す。**その間は Game に何も書かない**（手元の集計だけ）。
  //   全部確定したら commit で、カードの加算・パックの減算・保存を1回でまとめて行う
  //   ＝ 途中で閉じてもパックもカードも減らず（二重にもならず）、保存のあとは演出を閉じてもカードは失われない
  openPackBulk(pid) {
    if (this._opening) return;
    const n = Game.perm.packs[pid] || 0;
    if (n <= 0) return;
    this._opening = true;
    const luck = Skill.mods(Game.meta, Game.perm).packLuck;
    const got = {};            // cardId -> 枚数
    const before = {};         // 開ける前の枚数（凸が上がったかを見る・初めて手に入れたかもここから）
    CardFX.loadBulk(PACKS[pid], n, {
      total: n,
      // 1パックぶん。**同じ Pack.open を、パックの数だけ呼ぶ**（中身は前と同じ）
      step: () => {
        for (const id of Pack.open(pid, luck)) {
          if (before[id] === undefined) before[id] = Game.own(id);
          got[id] = (got[id] || 0) + 1;
        }
      },
      commit: () => {
        for (const id of Object.keys(got)) Game.grant(id, got[id]);
        Game.perm.packs[pid] = Math.max(0, (Game.perm.packs[pid] || 0) - n);
        Game.save();
        return this.bulkList(got, before, id => Game.own(id));
      },
    }, () => {
      this._opening = false;
      this._gsFx = 'tick';
      this.renderPanel();
    });
  },

  // まとめて開封で並べるカード（種類ごとに1枚）。**凸が上がったカードを先に並べる。**そのあとレア度の高い順
  //   got … cardId → 増えた枚数 ／ before … 開ける前の枚数 ／ countOf(id) … 開けたあとの枚数（確認室の見本は、実セーブに書かないので別の式で渡す）
  bulkList(got, before, countOf) {
    const list = Object.keys(got).map(id => ({
      id, gain: got[id], isNew: before[id] === 0, count: countOf(id),
      t0: Game.totuOf(before[id]), t1: Game.totuOf(countOf(id)),
    }));
    const up = (e) => !CARDS[e.id].noRank && e.t1 > e.t0;
    list.sort((a, b) => up(b) - up(a) ||
      BAL.rarityOrder.indexOf(CARDS[b.id].rarity) - BAL.rarityOrder.indexOf(CARDS[a.id].rarity));
    return list;
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
    // **1枚ごとに「めくる前／めくった後」の枚数を持つ。**同じパックで同じカードが2枚出ても、
    //   1枚目と2枚目で凸が上がる瞬間を別々に見せられるように
    const seen = {};
    const steps = ids.map(id => {
      const n0 = seen[id] !== undefined ? seen[id] : Game.own(id);
      seen[id] = n0 + 1;
      return { n0, n1: n0 + 1 };
    });
    for (const id of ids) Game.grant(id, 1);

    Game.save();

    // **開封は CardFX に任せる。**（ユーザー 2026-09-24「カードの演出そのものを作り直しませんか」）
    CardFX.open(PACKS[pid], ids, steps, isNew, () => {
      this._opening = false;
      this._gsFx = 'tick';
      this.renderPanel();
    });
  },

  burst(color) {
    const b = Util.el('div', 'burst');
    b.style.background = 'radial-gradient(circle,' + color + '88 0%, transparent 70%)';
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 620);
  },

  // ================= 転生 =================
  // ================= アセンション（第30章のあと・src/ascension.js） =================
  //   転生の代わりに出る。**押すボタンは無い**（章を突破すると経験値が入り、勝手にレベルが上がる）。
  //   ここは「いまのレベル・次まで・もらえるもの・敵側の段」を見せるだけ
  panelAscension(p) {
    const perm = Game.perm, a = perm.asc;
    const lv = a.lv, need = Asc.need(lv);
    const reach = Game.endlessReach();
    const next = Math.max(MAIN_CHAPTERS + 1, reach + 1);
    const hero = Util.el('div', 'pz-hero can');
    hero.innerHTML =
      '<div class="pz-emb"><i class="pz-ring"></i>' + Icons.get('cycle') + '</div>' +
      '<div class="pz-title"><b>アセンション Lv' + lv + '</b><span>到達 第' + Math.max(MAIN_CHAPTERS, reach) + '章</span></div>';
    p.appendChild(hero);

    const bar = Util.el('div', 'asc-bar');
    bar.innerHTML = '<div class="asc-exp"><i style="width:' + Math.min(100, 100 * a.exp / need).toFixed(1) + '%"></i></div>' +
      '<span>次のレベルまで ' + Util.fmt(Math.max(0, need - a.exp)) + '（第' + next + '章を初めて突破すると ' + Util.fmt(Asc.expFor(next, true)) + '）</span>';
    p.appendChild(bar);

    const st = Util.el('div', 'pz-stats');
    st.innerHTML =
      '<div><span>恒久の火力</span><b>×' + Util.fmt(Asc.dmgMul(perm)) + '</b></div>' +
      '<div><span>次のレベルでパック</span><b>×' + Asc.packsAt(lv + 1) + '</b></div>' +
      '<div><span>敵側のアセンション</span><b>誘引 ' + Asc.lureLv(perm, MAIN_CHAPTERS) + '段</b></div>' +
      '<div><span>敵の量</span><b>×' + Asc.spawnMul(perm, MAIN_CHAPTERS).toFixed(2) + '</b></div>';
    p.appendChild(st);

    const note = Util.el('div', 'pz-gain');
    note.innerHTML = '<h4>しくみ</h4>' +
      '<p>第31章から先を突破すると経験値が入り、レベルが上がるたびに恒久の火力とパックがもらえます。何も失いません</p>' +
      '<p>奥の章ほど経験値が大きく増えます。同じ章をもう一度突破しても、少しだけ入ります</p>' +
      '<p>第31章から先は敵も強くなり、レベル ' + BAL.ascLurePerLv + ' ごとに敵の量（誘引）が1段上がります</p>';
    p.appendChild(note);
  },

  panelPrestige(p) {
    const perm = Game.perm;
    const cleared = Game.clearedCount();
    const can = Game.canPrestige() && Game.phase !== 'battle';
    // **数は本物の式から出す**（Pack.prestigePreview。前は古い式の案内が残っていた）
    const pv = Pack.prestigePreview(cleared, perm.prestiges, perm.legacyDeep || 0);
    const R = Relic.mods(perm);

    const hero = Util.el('div', 'pz-hero' + (can ? ' can' : ''));
    hero.innerHTML =
      '<div class="pz-emb"><i class="pz-ring"></i>' + Icons.get('cycle') + '</div>' +
      '<div class="pz-title"><b>再起動</b><span>' + (perm.prestiges + 1) + '回目　突破 ' + cleared + ' / ' + STAGES.length + '章</span></div>';
    p.appendChild(hero);

    // 失うもの ／ 残るもの・得るもの
    const cols = Util.el('div', 'pz-cols');
    cols.innerHTML =
      '<div class="pz-col lose"><h4>失う</h4><ul>' +
        '<li>コイン</li><li>スキルツリー</li><li>章の突破（初回報酬は取り直せる）</li><li>盤の配置</li></ul></div>' +
      '<div class="pz-col keep"><h4>残る</h4><ul>' +
        '<li>カード・凸</li><li>持っているパック</li><li>常駐</li><li>到達した深さ</li></ul></div>';
    p.appendChild(cols);

    const gain = Util.el('div', 'pz-gain');
    gain.innerHTML = '<h4>得る</h4>' + (cleared > 0
      ? '<div class="pz-packs">' +
          '<div>' + CardFX.miniPack(PACKS.relic) + '<b>常駐パック</b><em>×' + pv.relic + '</em></div>' +
          '<div>' + CardFX.miniPack(PACKS.basic) + '<b>カードパック</b><em>×' + pv.cards + '</em></div></div>' +
        '<p>奥まで突破してから再起動するほど多い。カードパックの分野は、突破した章の分野から出る</p>' +
        // 前回の到達より浅いときは減る（Pack.prestigePreview）。**減っていることを隠さない**
        ((perm.legacyDeep || 0) > cleared
          ? '<p class="pz-warn">前回は第' + perm.legacyDeep + '章まで進んでいます。そこより浅いところで再起動すると、得られるパックが大きく減ります（今は突破 ' + cleared + ' 章）</p>'
          : '')
      : '<p>まだ何も得られません</p>');
    p.appendChild(gain);

    const btn = Util.el('button', 'pz-go', can ? '再起動する'
      : 'ステージを ' + BAL.prestigeMinStages + ' 個突破すると再起動できます（現在 ' + cleared + ' 個）');
    btn.disabled = !can;
    btn.addEventListener('click', () => this.confirmPrestige());
    p.appendChild(btn);

    // 遺物は「持っているだけで効くカード」。一覧は図鑑の「遺物」の節にある（凸の星つき）
    const st = Util.el('div', 'pz-stats');
    st.innerHTML =
      '<div><span>再起動回数</span><b>' + perm.prestiges + '</b></div>' +
      '<div><span>常駐</span><b>' + R.count + '枚</b></div>' +
      '<div><span>常駐のダメージ</span><b>×' + Util.fmt(R.dmg) + '</b></div>' +
      '<div><span>常駐のコイン</span><b>×' + Util.fmt(R.coin) + '</b></div>';
    p.appendChild(st);
    if (R.count > 0) {
      const link = Util.el('button', 'pz-link');
      link.innerHTML = Icons.get('grid') + '常駐を図鑑で見る';
      link.addEventListener('click', () => {
        this.tab = 'coll'; this.renderTabs(); this.renderPanel();
        const sec = document.querySelector('#panel .csec.k-perm');
        if (sec) sec.scrollIntoView({ block: 'start' });
      });
      p.appendChild(link);
    }

    const reset = Util.el('button', 'linkbtn', 'セーブデータを全消去');
    reset.addEventListener('click', () => {
      if (confirm('全てのデータ（カードコレクション含む）を消去します。よろしいですか？')) {
        Game.hardReset(); Game.run = null; Game.save(); location.reload();
      }
    });
    p.appendChild(reset);
  },

  // demo … 演出の確認室から。見本の数字を出し、押しても再起動せず（セーブは変わらない）、場面と結果の画面だけ見せる
  confirmPrestige(demo) {
    const pv = demo ? { relic: 3, cards: 8 } : Pack.prestigePreview(Game.clearedCount(), Game.perm.prestiges, Game.perm.legacyDeep || 0);
    const body = Util.el('div', 'rs rs-lose');
    body.innerHTML =
      '<div class="rs-ban"><b>再起動</b><span>本当に再起動しますか？</span></div>' +
      '<div class="rs-tip">コイン・スキルツリー・章の突破・盤の配置を失います。カード・パック・常駐は残ります</div>' +
      '<div class="rs-rew">' +
        '<div class="rs-pack">' + CardFX.miniPack(PACKS.relic) + '<b>常駐パック</b><em>×' + pv.relic + '</em></div>' +
        '<div class="rs-pack">' + CardFX.miniPack(PACKS.basic) + '<b>カードパック</b><em>×' + pv.cards + '</em></div></div>';
    const ok = Util.el('button', 'rs-go');
    ok.innerHTML = '<span>失って得る</span><b>再起動する</b>' + Icons.get('cycle');
    ok.addEventListener('click', () => {
      if (demo) {
        this.closeModal();
        Scenes.reboot(() => this.showPrestigeResult({ prestiges: 4, reward: { relic: pv.relic, basic: pv.cards } }));
        return;
      }
      const res = Game.prestige();
      this.closeModal();
      UI.pick = 0;
      Main.toHome();
      // いったん現実の部屋へ視点を引いてから、報酬へ（企画書 §28・約3秒・触れば飛ばせる）
      if (res) Scenes.reboot(() => this.showPrestigeResult(res));
    });
    const no = Util.el('button', 'rs-sub');
    no.innerHTML = Icons.get('close') + 'やめる';
    no.addEventListener('click', () => this.closeModal());
    const subs = Util.el('div', 'rs-subs'); subs.appendChild(no);
    body.appendChild(ok); body.appendChild(subs);
    this.openModal(body);
    this.el.modal.classList.add('rsmodal');
    // 再起動の場面の部屋の絵を、確認を読んでいるあいだに描いておく
    setTimeout(() => { try { Scenes.prepare(); } catch (e) {} }, 60);
  },

  showPrestigeResult(res) {
    // リザルトと同じ形（判定の帯 → 獲得物 → 次へ）
    const body = Util.el('div', 'rs rs-perfect');
    body.innerHTML = '<div class="rs-ban"><i class="rs-sweep"></i><em>// SYSTEM RESTART</em><b>REBOOT</b><span>再起動 ' + res.prestiges + '回目</span></div>';
    const rew = Util.el('div', 'rs-rew');
    for (const k of PACK_IDS.filter(k => res.reward[k] > 0)) {
      const d = Util.el('div', 'rs-pack');
      d.innerHTML = CardFX.miniPack(PACKS[k]) + '<b>' + PACKS[k].name + '</b><em>×' + res.reward[k] + '</em>';
      rew.appendChild(d);
    }
    if (rew.children.length) { body.appendChild(Util.el('div', 'rs-h', '獲得')); body.appendChild(rew); }
    const b = Util.el('button', 'rs-go');
    b.innerHTML = '<span>パックを</span><b>開けにいく</b>' + Icons.get('pack');
    b.addEventListener('click', () => { this.closeModal(); this.tab = 'pack'; this.renderTabs(); this.renderPanel(); });
    body.appendChild(b);
    this.openModal(body);
    this.el.modal.classList.add('rsmodal');
    this._rsFx(body, '#ffd24a', { perfect: true });
    this.burst('#ffd24a');
  },

  // ================= カード選択（ウェーブ突破ごと） =================
  // 抽選の規則は src/draft.js に置いてある（測定器と同じものを使うため）
  eligibleCards() { return Draft.eligible(); },
  rollDraft(n) { return Draft.roll(n); },

  // demo … 演出の確認室（src/debugroom.js）から見本のカードで出すとき。ids の配列。選んでもカードは取らず、戦闘も止めない
  showDraft(demo) {
    const run = Game.run;
    if (!run || (run.over && !demo)) return;
    const ids = demo || this.rollDraft(run.mods.choices);
    if (!ids.length) { if (!demo) run.pendingPicks = 0; return; }

    if (!demo) { this.draftOpen = true; Game.paused = true; }

    // **出方（0929n）**：見出しの板が叩きつけられ、そこから六角の格子が点く。3枚は裏のまま下から順に滑り込み、
    //   1枚ずつ表になる（全部で約0.8秒・触れるのは最初から）。選ぶと六角の衝撃波が出て、カードは上の武器の枠へ吸い込まれる。
    //   動きは CSS の backwards だけ（終わったあとに何も持たない）。ここは順番の遅れ（--dl）と、選んだときの行き先だけ決める
    const body = Util.el('div', 'draft fx');
    // 出た3枚のうち、いちばん高いレア度の色で格子が点く（エピック以上だけ。それ以外はいつもの橙）
    {
      let best = null;
      for (const id of ids) { const r = BAL.rarity[CARDS[id].rarity]; if (r.glow >= 2 && (!best || r.glow > best.glow)) best = r; }
      if (best) body.style.setProperty('--rk', best.color);
    }
    body.appendChild(this.choiceHead('レベルアップ',
      demo ? '見本　選んでも何も変わりません' : 'ウェーブ ' + run.wave + ' 突破　1枚選ぶ' +
      (run.pendingPicks > 1 ? '（あと ' + run.pendingPicks + ' 枚）' : ''), '// UPGRADE SELECT'));
    // **なぜ4択・5択なのか／なぜ何枚も取れるのかを出す。**（ユーザー 2026-09-24
    //   「5択、複数回選択出来るのは一体何の効果なのかわからない」）
    {
      const R = Relic.mods(Game.perm);
      const why = [];
      const sc = Skill.gsum(Game.meta, 'choices'), rc = R.choices || 0;
      const sp = Skill.gsum(Game.meta, 'picks'), rp = R.picks || 0;
      if (sc) why.push('選択肢 +' + sc + '（スキル「選択肢拡張」）');
      if (rc) why.push('選択肢 +' + rc + '（常駐）');
      if (sp) why.push('1ウェーブに +' + sp + '枚（スキル「増設スロット」）');
      if (rp) why.push('1ウェーブに +' + rp + '枚（常駐）');
      if (why.length) body.appendChild(Util.el('div', 'draftwhy', why.join('　')));
    }
    const slots = this.runSlots();
    body.appendChild(slots);

    const row = Util.el('div', 'chrow');
    ids.forEach((id, i) => {
      const c = CARDS[id];
      const glow = BAL.rarity[c.rarity].glow;
      // **新しいカードの見た目で出す。**（ユーザー 2026-09-24「カードをちゃんとデザインして」）
      //   ★はいまの凸（パックで被った枚数から）。**枚数と「あと何枚」は出さない**
      //   （ユーザー 2026-09-23「3択チョイスでは被せて取る意味は残したい」。ここで枚数を出すと
      //    3択で被せると凸が進むように読めてしまう）。下の丸は「この出撃で何枚積んだか」
      const el = Util.el('button', 'chcard pick cfpick' + (BAL.rarity[c.rarity].glow >= 2 ? ' hot' : ''));
      el.style.setProperty('--dl', (0.12 + i * 0.09).toFixed(2) + 's');
      // 絵の面＋伏せた裏面（同じ大きさで重ねる。裏が回って消え、表が回って出る）。エピック以上は後ろに六角の光（CSS）
      const face = Util.el('div', 'ch-face g' + glow);
      face.style.setProperty('--rc', BAL.rarity[c.rarity].color);
      const front = Util.el('div', 'ch-front');
      front.appendChild(CardFX.face(c, { count: Game.own(id), noCount: true }));
      const back = CardFX.back(c.rarity);
      back.classList.add('ch-back');
      face.appendChild(front); face.appendChild(back);
      el.appendChild(face);
      el.insertAdjacentHTML('beforeend',
        this.stackPips({ have: run.cards[id] || 0, limit: Game.stackLimit(id) }) +
        '<div class="chtype">' + (c.kind === 'weapon' ? '武器を編成に追加'
          : c.kind === 'synergy' ? 'シナジー'
          : (c.weapon ? WEAPONS[c.weapon].name + ' 強化' : '全体強化')) + '</div>');
      el.addEventListener('click', () => {
        if (row.classList.contains('done')) return;   // 二度押しで2枚取らせない
        // **選んだ瞬間を目で分からせる。** 選んだ1枚が残り、他が退く
        row.classList.add('done');
        el.classList.add('sel');
        if (!demo) {
          run.cards[id] = (run.cards[id] || 0) + 1;
          Game.applyCard(id, run);
          run.pendingPicks = Math.max(0, run.pendingPicks - 1);
          this.draftOpen = false;
        }
        this._draftTake(slots, face, c);
        setTimeout(() => {
          this.closeModal();
          this.toastMsg((demo ? '見本: ' : '取得: ') + c.name, BAL.rarity[c.rarity].color, 'card');
          if (demo) return;
          if (run.pendingPicks > 0) this.showDraft();
          else Game.paused = false;
        }, 320);
      });
      row.appendChild(el);
    });
    body.appendChild(row);
    this.openModal(body, true);
    // 裏面は表が出たあとは要らない（動きが止まる端末でも、いつまでも表を隠さないように片付ける）
    //   見出しの光の帯（.ch-sweep）も片付ける。動きの終わりに右の外（translateX 420%）で止まったまま残り、
    //   箱が横にスクロールできてしまっていた（375px・エピック／レジェンド入りの3択で 386/345px。0929zd の作業で発見）
    setTimeout(() => { body.querySelectorAll('.ch-back, .ch-sweep').forEach(x => x.remove()); }, 1200);
  },

  // 選んだ瞬間：カードの位置に六角の衝撃波。カードは上の武器の枠（連携は先頭の武器・武器に属さないものは「汎用」）へ吸い込まれ、枠の数が1つ増える
  _draftTake(slots, face, c) {
    const color = BAL.rarity[c.rarity].color;
    const fr = face.getBoundingClientRect();
    CardFX.hexShock(this.el.modal, fr.left + fr.width / 2, fr.top + fr.height / 2, color, true);
    const all = Array.from(slots.querySelectorAll('.chslot'));
    const owners = c.kind === 'synergy' ? (c.requires || []) : (c.weapon ? [c.weapon] : []);
    let tg = all.filter(s => owners.includes(s.dataset.g));
    if (!tg.length) tg = all.filter(s => s.dataset.g === 'gen');
    if (!tg.length) return;
    const tr = tg[0].getBoundingClientRect();
    face.style.setProperty('--fx', (tr.left + tr.width / 2 - fr.left - fr.width / 2).toFixed(0) + 'px');
    face.style.setProperty('--fy', (tr.top + tr.height / 2 - fr.top - fr.height / 2).toFixed(0) + 'px');
    face.classList.add('suck');
    setTimeout(() => {
      for (const s of tg) {
        if (!s.isConnected) continue;
        const u = s.querySelector('u');
        if (u) u.textContent = String((parseInt(u.textContent, 10) || 0) + 1);
        s.classList.remove('empty'); s.classList.add('on', 'hit');
      }
    }, 190);
  },

  // ---- 3択の画面の部品 ----
  choiceHead(title, sub, kicker) {
    const h = Util.el('div', 'chhead');
    h.innerHTML = (kicker ? '<em>' + kicker + '</em>' : '') + '<b>' + title + '</b>' + (sub ? '<span>' + sub + '</span>' : '') +
      (kicker ? '<i class="ch-sweep"></i>' : '');
    return h;
  },

  // 上に並ぶ枠。**今この出撃で何を積んだか**を見せる（空きは ＋）
  // カード3択の上の段：**武器ごとに、この出撃で取ったカードの数**（2026-09-26・ユーザーの理想
  //   「取ったカードを表示するのではなく、武器のアイコンを並べて、この武器に関するスキルを何個取ったかが何となくわかり、
  //    触ったら何を取っていたか見れる」）。前は「最後に取った3枚＋空き1つ」で、1回目は4枠とも空だった
  //   連携カードは関わる武器の両方に数える。武器に属さないカードは「汎用」にまとめる。触るとその下に一覧が開く
  runSlots() {
    const run = Game.run;
    const wrap = Util.el('div', 'chslots');
    const got = run ? (run.cards || {}) : {};
    const groups = Game.loadoutWeapons().map(wid => ({ id: wid, icon: WEAPONS[wid].icon, color: WEAPONS[wid].color, name: WEAPONS[wid].name, cards: [] }));
    const other = { id: 'gen', icon: Icons.get('spark'), color: '#b9c4d6', name: '汎用', cards: [] };
    for (const id of Object.keys(got)) {
      const c = CARDS[id];
      if (!c) continue;
      const owners = c.kind === 'synergy' ? (c.requires || []) : (c.weapon ? [c.weapon] : []);
      let placed = false;
      for (const w of owners) { const g = groups.find(x => x.id === w); if (g) { g.cards.push(id); placed = true; } }
      if (!placed) other.cards.push(id);
    }
    const all = groups.concat([other]);
    const list = Util.el('div', 'chlist');
    let open = null;
    const row = Util.el('div', 'chrow2');
    for (const g of all) {
      const n = g.cards.reduce((a, id) => a + got[id], 0);
      const s = Util.el('button', 'chslot' + (n ? ' on' : ' empty'));
      s.style.color = g.color;
      s.dataset.g = g.id;
      s.innerHTML = '<i>' + g.icon + '</i><u>' + n + '</u>';
      s.title = g.name + '：' + n + '枚';
      s.addEventListener('click', (e) => {
        e.stopPropagation();
        open = (open === g.id) ? null : g.id;
        row.querySelectorAll('.chslot').forEach(x => x.classList.remove('sel'));
        list.innerHTML = '';
        if (!open) return;
        s.classList.add('sel');
        list.appendChild(Util.el('div', 'chl-h', g.name + '　この出撃で取ったカード'));
        if (!g.cards.length) list.appendChild(Util.el('div', 'chl-none', 'まだありません'));
        for (const id of g.cards) {
          const c = CARDS[id];
          const it = Util.el('div', 'chl-it');
          it.innerHTML = '<b style="color:' + BAL.rarity[c.rarity].color + '">' + c.name + '</b><em>×' + got[id] + '</em><span>' + this.shortDesc(c) + '</span>';
          list.appendChild(it);
        }
      });
      row.appendChild(s);
    }
    wrap.appendChild(row);
    wrap.appendChild(list);
    return wrap;
  },

  // アイコン＋文の1行（結果画面の「1体も通さなかった」など）。文は textContent で入れる
  iconLine(cls, icon, text) {
    const d = Util.el('div', cls);
    d.innerHTML = Icons.get(icon) + ' ';
    d.appendChild(document.createTextNode(text));
    return d;
  },

  // カードのアイコン。**どの武器のものかは絵で示し、文からは省く**
  cardIcon(c) {
    if (c.kind === 'perm') return Icons.get('perm');
    if (c.kind === 'key') return Icons.get('key');
    if (c.kind === 'synergy') {
      // シナジーは「関わる武器のアイコン2つ」。これだけで条件が分かる
      return (c.requires || []).map(w => (WEAPONS[w] && WEAPONS[w].icon) || '◆').join('');
    }
    if (c.weapon && WEAPONS[c.weapon]) return WEAPONS[c.weapon].icon;
    return Icons.get('spark');
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

  // この出撃で何枚積んだか（3択のカードの下の丸）。塗り＝積み済み、白抜き＝いま押すと埋まる枠
  stackPips(p) {
    const lim = Math.min(p.limit, 8);
    let s = '<div class="chpip">';
    for (let i = 0; i < lim; i++)
      s += '<i class="' + (i < p.have ? 'f' : i === p.have ? 'n' : '') + '"></i>';
    if (p.limit > lim) s += '<u>+</u>';
    return s + '</div>';
  },

  // ================= カードの見た目 =================
  // カードの見た目は CardFX.face（cardfx.js）。以前の cardEl は 0924o で置き換えた

  // ================= モーダル =================
  openModal(body, noClose) {
    const m = this.el.modal;
    m.innerHTML = '';
    m.classList.remove('rsmodal');
    const box = Util.el('div', 'mbox');
    box.appendChild(body);
    m.appendChild(box);
    m.classList.add('on');
    // 結果の帯の大きな文字（DEFEAT・CLEAR・REBOOT など）も1字ずつの動きに（企画書 §17・2026-09-28）
    const ban = box.querySelector('.rs-ban b');
    if (ban && !ban.children.length) {
      ban.innerHTML = Array.from(ban.textContent).map((ch, i) =>
        '<i class="cc" style="--d:' + (0.05 + i * 0.045).toFixed(3) + 's;--x:' + ((Math.random() - 0.5) * 40 | 0) + 'px">' + ch + '</i>').join('');
      ban.classList.add('split');
    }
    m.dataset.noclose = noClose ? '1' : '';
  },

  closeModal() {
    this.el.modal.classList.remove('on', 'rsmodal');
    this.el.modal.innerHTML = '';
    this._opening = false;          // パックの多重開封の鍵を戻す（openPack）
    if (!this.draftOpen) Game.paused = false;
  },

  // 通知（トースト）。画面の右端から滑り込む細いプレート：左に種類の色のランプ、英日の2段（// 英字の種類 ／ 日本語の文）。
  //   kind が種類（下の TOAST_KINDS）。色は種類ごとに決まる（own の種類だけ、呼び出し側の color＝レア度の色・武器の色を使う）
  //   出た瞬間に小さな六角の衝撃波。**続けて出ても1枚のプレートを差し替える**（重ならない・溜まらない。出ている間の差し替えは滑り込まずに文字だけ点滅）
  //   戦闘中は盤の上端（左上の HUD の下）に出す。盤の真ん中には出さない・触れない（pointer-events:none）
  //   文言・出す場面は変えていない。種類が分からないもの（kind なし）は SYSTEM
  TOAST_KINDS: {
    weapon: ['NEW WEAPON', '#ffb43c', 2.6],
    card:   ['CARD GET', '#ffffff', 1.8, true],
    wave:   ['WAVE CLEARED', '#7ee3a0', 1.3],
    auto:   ['AUTO BUY', '#ff8a1f', 1.6],
    buy:    ['PURCHASED', '#ff8a1f', 1.6],
    skip:   ['BYPASSED', '#7fb2ff', 1.9],
    select: ['SELECTED', '#ff8a1f', 1.3],
    place:  ['PLACE', '#ffffff', 1.6, true],
    warn:   ['WARNING', '#ff5566', 1.9],
    lock:   ['LOCKED', '#ff5566', 1.9],
    limit:  ['LIMIT', '#ff5566', 1.9],
    error:  ['ERROR', '#ff4a66', 2.2],
    demo:   ['DEMO', '#ffc24a', 2.2],
    sys:    ['SYSTEM', '#9fb2c4', 1.5],
  },
  toastMsg(txt, color, kind) {
    const t = this.el.toast;
    if (!t) return;
    const k = this.TOAST_KINDS[kind] || this.TOAST_KINDS.sys;
    const c = (k[3] && color) ? color : k[1];
    const hold = k[2];
    const was = t.classList.contains('on');
    t.innerHTML = '';
    const tp = Util.el('div', 'tp');
    tp.appendChild(Util.el('i', 'tp-lamp'));
    const body = Util.el('div', 'tp-body');
    body.appendChild(Util.el('em', 'tp-k', '// ' + k[0]));
    body.appendChild(Util.el('b', 'tp-t', txt));
    tp.appendChild(body);
    t.appendChild(tp);
    t.style.setProperty('--tc', c);
    t.style.setProperty('--hold', hold + 's');
    t.classList.remove('on', 'swap');
    void t.offsetWidth;
    t.classList.add('on');
    if (was) t.classList.add('swap');
    // 動きが終わったら片付ける（CSS の動きが止まる端末でも出しっぱなしにしない）
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.classList.remove('on', 'swap'); t.innerHTML = ''; }, (hold + 0.3 + 0.15) * 1000);
    // 滑り込みが終わったところ（ランプ）から小さな六角の衝撃波
    clearTimeout(this._toastFx);
    if (!was && typeof CardFX !== 'undefined') {
      this._toastFx = setTimeout(() => {
        const l = t.querySelector('.tp-lamp');
        if (!l || !t.classList.contains('on')) return;
        const r = l.getBoundingClientRect();
        CardFX.hexShock(document.body, r.left + r.width / 2, r.top + r.height / 2, c, 'sm');
      }, 260);
    }
  },

  // ================= 結果 =================

  // スキップの結果。**手で突破したときと同じものが出た**ことを、そのまま並べる
  showSkipResult(res) {
    // リザルトと同じ形。**何も得ていない**ことを短く言う
    //   （前の説明文は、太字のつもりの ** がそのまま画面に出ていた）
    const body = Util.el('div', 'rs rs-skip');
    body.innerHTML =
      '<div class="rs-ban"><i class="rs-sweep"></i><em>// BYPASSED</em><b>SKIP</b><span>' + res.stage.name + '　通過（突破ではない）</span></div>' +
      '<div class="rs-tip">コイン・カード・再起動の評価は増えません。初回突破の報酬は残っているので、あとで自分で突破すれば受け取れます</div>';
    const go = Util.el('button', 'rs-go');
    go.innerHTML = '<span>次へ</span><b>' + (res.next ? res.next.name : 'ホーム') + '</b>' + Icons.get('play');
    go.addEventListener('click', () => { this.closeModal(); this.renderHome(); });
    body.appendChild(go);
    this.openModal(body, true);
    this.el.modal.classList.add('rsmodal');
    this._rsFx(body, '#7fb2ff');
  },

  // ================= 結果画面の出方（0929m） =================
  //   帯が叩きつけられ（CSS）、その位置から六角の衝撃波と背景の格子が広がる。下の段は上から順に滑り込み、
  //   獲得物は1つずつ弾けて出る（出る瞬間に小さな衝撃波）。全部で約1.2秒・ボタンは最初から押せる。
  //   動きは CSS の backwards（終わったあとに何も持たない）。ここは段ごとの遅れ（--dl）と衝撃波の出どころだけ決める
  _rsFx(body, color, opt) {
    opt = opt || {};
    body.classList.add('fx');
    const host = this.el.modal;
    const shock = (el, ms, big) => setTimeout(() => {
      if (!body.isConnected || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      CardFX.hexShock(host, r.left + r.width / 2, r.top + r.height / 2, color, big ? true : 'sm');
    }, ms);
    let t = 0.32;
    for (const c of Array.from(body.children)) {
      if (c.classList.contains('rs-ban')) continue;
      c.style.setProperty('--dl', t.toFixed(2) + 's');
      if (c.classList.contains('rs-rew')) {
        Array.from(c.children).slice(0, 6).forEach((it, i) => {
          const d = t + 0.08 + i * 0.15;
          it.style.setProperty('--dl', d.toFixed(2) + 's');
          shock(it, (d + 0.1) * 1000, false);
        });
        t += 0.12 + Math.min(6, c.children.length) * 0.15;
      } else t += 0.07;
    }
    const ban = body.querySelector('.rs-ban');
    if (ban) {
      shock(ban, 150, true);
      if (opt.perfect) setTimeout(() => { if (ban.isConnected) CardFX.hexShock(host, ban.getBoundingClientRect().left + ban.offsetWidth / 2,
        ban.getBoundingClientRect().top + ban.offsetHeight / 2, '#ffffff', true); }, 480);
    }
  },

  // ================= アセンションの経験値のバー（0929v） =================
  //   結果画面の下の段。経験値が入ったぶんだけバーが VFD 風に伸び、満ちるたびにレベルが1つ上がる（六角の小さな衝撃波・数字が脈打つ）。
  //   **何レベル上がっても、バーは満ちて空になってまた伸びる**（1回の突破で2つ上がるときも同じ流れ）。
  //   最後のレベルに届いた瞬間に「// ASCENSION LEVEL UP」の帯（CardFX.ascLevelUp）を盤の上へ。上がらないときは伸びるだけ。
  //   数値（経験値・レベル・火力・パック）は Asc.gain が返したものをそのまま見せる。動きは JS が描く（CSS のアニメに頼らない）
  //   g … Asc.gain の返り値（exp・exp0・exp1・from・to・packs）。delayMs … 結果画面が出てからバーが動き出すまで
  _rsAscBar(blk, g, delayMs) {
    const host = this.el.modal;
    const bar = blk.querySelector('.ra-bar'), fill = bar.querySelector('i');
    const lvEl = blk.querySelector('.ra-lv'), nx = blk.querySelector('.ra-nx');
    const need = (k) => Asc.need(k);
    const p0 = Math.min(1, g.exp0 / need(g.from));
    const segs = [];
    for (let lv = g.from; lv < g.to; lv++) segs.push({ lv, a: lv === g.from ? p0 : 0, b: 1, up: true });
    segs.push({ lv: g.to, a: g.to > g.from ? 0 : p0, b: Math.min(1, g.exp1 / need(g.to)), up: false });
    // 始まりの状態（1フレーム目から）
    fill.style.width = (100 * p0).toFixed(1) + '%';
    lvEl.textContent = g.from;
    nx.textContent = '次のレベルまで ' + Util.fmt(Math.max(0, need(g.from) - g.exp0));
    const packs = Object.values(g.packs || {}).reduce((s, n) => s + n, 0);
    const shock = () => {
      if (!bar.isConnected) return;
      const r = bar.getBoundingClientRect(), f = fill.getBoundingClientRect();
      CardFX.hexShock(host, Math.max(r.left + 6, f.right), r.top + r.height / 2, '#6fe6ff', 'sm');
    };
    const flash = (el, cls, ms) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); };
    let i = 0, t0 = 0, dur = 0;
    const many = g.to - g.from;
    const startSeg = (t) => {
      const s = segs[i];
      // 1区間の長さ：長く伸びるほど長く（下限つき）。何レベルも上がるときは全体が 2.4 秒あたりに収まるよう縮める
      dur = (260 + 520 * (s.b - s.a)) * (many > 2 ? 2 / many + 0.35 : 1);
      t0 = t;
    };
    const tick = (t) => {
      if (!blk.isConnected) return;
      if (!t0) startSeg(t);
      const s = segs[i];
      const k = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - Math.pow(1 - k, 2);
      const p = s.a + (s.b - s.a) * e;
      fill.style.width = (100 * p).toFixed(1) + '%';
      nx.textContent = '次のレベルまで ' + Util.fmt(Math.max(0, need(s.lv) * (1 - p)));
      if (k < 1) { requestAnimationFrame(tick); return; }
      if (s.up) {
        // 満ちた：レベルが1つ上がる
        lvEl.textContent = s.lv + 1;
        flash(bar, 'full', 320); flash(lvEl, 'pulse', 460); shock(); Snd.ui();
        if (s.lv + 1 === g.to) {
          setTimeout(() => {
            if (!blk.isConnected) return;
            CardFX.ascLevelUp(host, { from: g.from, to: g.to, dmg0: Asc.dmgMulAt(g.from), dmg1: Asc.dmgMulAt(g.to), packs });
            blk.classList.add('up');
            const ln = Util.el('div', 'ra-up', 'レベル ' + g.from + ' → ' + g.to + '　恒久の火力 ×' + Util.fmt(Asc.dmgMulAt(g.from)) + ' → ×' + Util.fmt(Asc.dmgMulAt(g.to)));
            blk.appendChild(ln);
          }, 150);
        }
        i++; t0 = 0;
        setTimeout(() => { fill.style.width = '0%'; requestAnimationFrame(tick); }, 130);
        return;
      }
      // 最後まで伸びた
      nx.textContent = '次のレベルまで ' + Util.fmt(Math.max(0, need(g.to) - g.exp1));
      if (g.to === g.from) { flash(blk, 'done', 500); shock(); }
    };
    setTimeout(() => requestAnimationFrame(tick), delayMs);
  },

  // ================= リザルト =================
  //   **一目で「勝ったか・何を得たか・次へ」だけ分かる形にする。**
  //   （ユーザー 2026-09-25「連続して遊ぶとリザルトがまだ情報量が多く、デザイン性が悪い」）
  //   前は見出し・長い説明・6マスの表・ミッション・ボタン3つが縦に並んでいた。
  //   大きな判定の帯 → 獲得コイン → 報酬（カード・パック） → 次へ、の順。細かい数字は1行に畳む
  showResult(res) {
    const perfect = res.ok && res.perfect;
    const body = Util.el('div', 'rs ' + (perfect ? 'rs-perfect' : res.ok ? 'rs-clear' : 'rs-lose'));
    const word = perfect ? 'PERFECT' : res.ok ? 'CLEAR' : 'DEFEAT';
    const sub = perfect ? '完璧クリア' : res.ok ? '突破' : '防衛線が抜かれた';
    const kicker = perfect ? '// ZERO LEAK' : res.ok ? '// STAGE CLEARED' : '// WARNING　LINE BREACH';
    body.innerHTML =
      '<div class="rs-ban"><i class="rs-sweep"></i><em>' + kicker + '</em><b>' + word + '</b>' +
        '<span>' + res.stage.name + '　' + sub + '</span></div>' +
      '<div class="rs-coin">' + Icons.coin() + '<b>0</b><small>獲得コイン</small></div>' +
      '<div class="rs-line">' +
        '<span>ウェーブ <b>' + res.wave + '/' + BAL.wavesPerStage + '</b></span>' +
        '<span>ライフ <b>' + res.lives + '/' + res.livesMax + '</b></span>' +
        '<span>通した <b>' + Util.fmt(res.leaked) + '</b></span>' +
        '<span>撃破 <b>' + Util.fmt(res.kills) + '</b></span></div>';

    // 火力の内訳（上位3つ）。**有効ダメージ**（敵の残りHPまで）の割合
    if (res.dmg && res.dmg.length) {
      body.appendChild(Util.el('div', 'rs-h', '火力（与えたダメージの割合）'));
      body.appendChild(this.dmgBars(res.dmg, 3));
    }

    // 報酬：初回突破の武器カード・パック・完璧クリアのパック
    const got = res.stageGot;
    const rew = Util.el('div', 'rs-rew');
    if (res.ok && got && got.first && got.cards.length) {
      for (const cid of got.cards) {
        const f = CardFX.face(CARDS[cid], { count: Game.own(cid), isNew: true, tap: true });
        f.classList.add('landed');
        rew.appendChild(f);
      }
    }
    if (got) for (const [k, v] of Object.entries(got.packs)) {
      const d = Util.el('div', 'rs-pack');
      d.innerHTML = CardFX.miniPack(PACKS[k]) + '<b>' + PACKS[k].name + '</b><em>×' + v + '</em>';
      rew.appendChild(d);
    }
    if (rew.children.length) {
      body.appendChild(Util.el('div', 'rs-h', '獲得'));
      body.appendChild(rew);
    }
    // アセンション：第30章を初めて突破した／経験値とレベルアップ（パックは上の「獲得」に入っている）
    if (res.ok && got && got.ascOpened) {
      body.appendChild(Util.el('div', 'rs-tip', 'アセンションが開きました。第31章から先へ進めます（下の「アセンション」で確認）'));
    }
    if (res.ok && got && got.asc) {
      // 経験値のバー（0929v）。最終の状態（レベル・次まで・バーの長さ）を先に組み、_rsAscBar が始まりの状態から伸ばす
      const g = got.asc;
      const blk = Util.el('div', 'rs-asc');
      blk.innerHTML = '<div class="ra-h"><em>// ASCENSION</em><span>アセンション経験値</span><b>+' + Util.fmt(g.exp) + '</b></div>' +
        '<div class="ra-bar"><i style="width:' + Math.min(100, 100 * g.exp1 / Asc.need(g.to)).toFixed(1) + '%"></i></div>' +
        '<div class="ra-row"><span>Lv <b class="ra-lv">' + g.to + '</b></span>' +
        '<span class="ra-nx">次のレベルまで ' + Util.fmt(Math.max(0, Asc.need(g.to) - g.exp1)) + '</span></div>';
      body.appendChild(blk);
    }

    // 完璧クリアの案内は1行だけ（取れるもの／取り済み）
    if (!perfect) {
      const rec = Game.stageRec(res.stage.id);
      const pk = PACKS[Pack.forStage(res.stage.id)];
      body.appendChild(Util.el('div', 'rs-tip', rec.perfect
        ? 'この周の完璧クリアのパックは受け取り済み'
        : '1体も通さずに凌ぐと ' + pk.name + ' ×2（再起動ごとに1回）'));
    }
    if (res.missions && res.missions.length) {
      const ms = Util.el('div', 'rs-miss');
      for (const m of res.missions) ms.appendChild(UI.iconLine('rs-chip', 'check', m.name));
      body.appendChild(ms);
    }

    // ボタン：いちばん押すものを大きく1つ。ほかは小さく横に
    const next = res.ok && got && got.next;
    const main = Util.el('button', 'rs-go');
    if (next) {
      main.innerHTML = '<span>次へ</span><b>' + next.name + '</b>' + Icons.get('play');
      main.addEventListener('click', () => {
        this.closeModal();
        Game.perm.currentStage = next.id;
        UI.pick = STAGES.findIndex(x => x.id === next.id);
        Game.save();
        Main.toBattle();
      });
    } else {
      main.innerHTML = '<span>' + (res.ok ? 'もう一度' : '再挑戦') + '</span><b>' + res.stage.name + '</b>' + Icons.get('cycle');
      main.addEventListener('click', () => { this.closeModal(); Main.toBattle(); });
    }
    body.appendChild(main);
    const subs = Util.el('div', 'rs-subs');
    const home = Util.el('button', 'rs-sub');
    home.innerHTML = Icons.get('close') + 'ホーム';
    home.addEventListener('click', () => { this.closeModal(); Main.toHome(); });
    const up = Util.el('button', 'rs-sub');
    up.innerHTML = Icons.get('tree') + 'スキル';
    up.addEventListener('click', () => {
      this.closeModal(); Main.toHome();
      this.tab = 'skill'; this.renderTabs(); this.renderPanel();
    });
    subs.appendChild(home); subs.appendChild(up);
    body.appendChild(subs);

    this.openModal(body, true);
    this.el.modal.classList.add('rsmodal');
    const fxColor = perfect ? '#ffe27a' : res.ok ? '#ffc24a' : '#ff4a66';
    this._rsFx(body, fxColor, { perfect });
    const ascBlk = body.querySelector('.rs-asc');
    if (ascBlk && got && got.asc) this._rsAscBar(ascBlk, got.asc, (parseFloat(ascBlk.style.getPropertyValue('--dl')) || 0.6) * 1000 + 500);
    // コインは VFD の窓に数え上げる（帯のあと0.4秒から1秒・数え終わりに一度脈打って小さな衝撃波）
    const cw = body.querySelector('.rs-coin'), cb = cw.querySelector('b');
    const total = res.coins || 0;
    const t0 = performance.now() + 400, dur = 1000;
    cb.textContent = Util.fmt(0);
    const tick = (t) => {
      if (!cb.isConnected) return;
      const k = Math.max(0, Math.min(1, (t - t0) / dur));
      cb.textContent = Util.fmt(total * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
      else if (total > 0) {
        cw.classList.add('done');
        const r = cw.getBoundingClientRect();
        CardFX.hexShock(this.el.modal, r.left + r.width / 2, r.top + r.height / 2, fxColor, 'sm');
      }
    };
    requestAnimationFrame(tick);
    if (perfect || (got && got.first && got.cards.length)) this.burst('#ff8a1f');
  },
};
