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
    const lines = ['INKURIMENT 武器の記録（新しい順・' + log.length + '回）',
      '版 章 結果 W 転生 前回到達 最深 漏れ 撃破 置いた数 | 武器 有効ダメージの割合%（有効ダメージ／撃破／基数）'];
    for (const x of log) {
      const tot = x.w.reduce((a, w) => a + w[1], 0) || 1;
      const d = new Date(x.at);
      lines.push([x.build, x.stage, x.ok ? '突破' : '敗北', 'W' + x.wave, '転生' + x.prestiges, '前回' + x.legacyDeep, '最深' + x.deepest,
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
    // 階級＝転生回数。伸び方が一番ゆっくりで、外から見た「格」に近い
    if (e.homeRank) e.homeRank.textContent = Game.perm.prestiges;
    if (e.homeXp) e.homeXp.style.width = (100 * done / all).toFixed(1) + '%';
    e.homeProg.textContent = '突破 ' + done + ' / ' + all +
      '　撃破 ' + Util.fmt(Game.perm.totalKills);

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
        ? 'スキップ<u>報酬なし・転生の評価にも入りません</u>'
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
    // 自動化は開いてから出す（BAL.autoUnlock）
    if (Game.autoOpen('autoPlace')) b.appendChild(row('autoPlace', '自動設置',
      'この周でまだ触っていない章に、前の周の配置を置き直します'));
    if (Game.autoOpen('autoBuy')) b.appendChild(row('autoBuy', '自動購入',
      '出撃するとき、「まとめて購入」と同じ順で買えるだけ買います'));
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

    // **戦闘中に常時出すのは、ウェーブの番号と残りだけ（盤の左上に小さく）。**（2026-09-26 作り直し）
    //   準備フェーズとウェーブの始まりはカットイン（cutin）で見せる。ライフはコアの周りの輪で見える
    let left = '';
    if (Game.phase === 'battle' && r.phase !== 'build') {
      left = 'W' + r.wave + '/' + BAL.wavesPerStage + (Combat.isLastWave(r) ? '★' : '') + '　残り ' + Util.fmt(r.toSpawn + r.enemies.length);
    } else if (Game.phase === 'battle') {
      left = 'W' + r.wave + '/' + BAL.wavesPerStage + '　突破';
    }
    if (this.el.hudLeft && this.el.hudLeft.textContent !== left) this.el.hudLeft.textContent = left;
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
      const b = Util.el('button', 'chip unit' + (this.placingType === wid ? ' on' : '') + (full ? ' full' : ''));
      b.style.borderColor = def.color;
      b.innerHTML = '<i class="uico" style="color:' + def.color + '">' + def.icon + '</i>' +
        '<b style="color:' + def.color + '">' + def.short + '</b>' +
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
  },

  // ================= カットイン =================
  // **準備フェーズとウェーブの始まりは、上の帯ではなくカットインで見せる。**（2026-09-26・ユーザー
  //   「準備フェーズはカットインで見せればいいので上の情報を消せます」「今は何ウェーブかはカットインで出しましょう」）
  //   盤の真ん中を斜めの帯が横切り、1.4秒で消える。触れない（pointer-events: none）
  cutin(title, sub, kind) {
    const c = this.el.cutin;
    if (!c) return;
    c.className = '';
    c.innerHTML = '<div class="ci ci-' + (kind || 'wave') + '"><i class="ci-band"></i>' +
      '<b>' + title + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>';
    void c.offsetWidth;
    c.className = 'on';
  },
  cutinWave(n) {
    const run = Game.run;
    const last = n >= BAL.wavesPerStage;
    const boss = run && Combat.isBossWave(run);
    this.cutin('WAVE ' + n + '<em> / ' + BAL.wavesPerStage + '</em>',
      boss ? 'ボスが現れる' : last ? '最終ウェーブ' : '', last ? 'last' : 'wave');
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
    if (!show) return;
    z.innerHTML = '<div><b class="zt-mud">減速</b>敵が遅くなる</div><div><b class="zt-slope">加速</b>敵が速くなる</div>';
    const x = Util.el('button', 'zt-x');
    x.innerHTML = Icons.get('close');
    x.title = 'この説明を閉じる（⚙ から戻せます）';
    x.addEventListener('click', () => { Game.perm.zoneTipOff = true; Game.save(); Snd.ui(); this._zoneKey = null; this.renderZoneTip(); });
    z.appendChild(x);
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
    //   バー（0〜359度）をやめ、隣の六角へ向かう6つのボタンにした。並びは時計回り（上から）
    const dirs = Util.el('div', 'ubar udirs');
    dirs.appendChild(Util.el('span', null, '向き'));
    const ARROW = ['↑', '↗', '↘', '↓', '↙', '↖'];
    const btns = [];
    Game.FACES.forEach((a, i) => {
      const b = Util.el('button', 'udir', ARROW[i]);
      b.disabled = !build;
      b.addEventListener('click', () => {
        Game.aimUnit(u, a);
        this.tutAimed = true;
        btns.forEach((x, j) => x.classList.toggle('on', j === i));
        Game.save();
      });
      btns.push(b);
      dirs.appendChild(b);
    });
    const cur = Game.FACES.findIndex(a => Math.abs(Math.atan2(Math.sin(a - u.face), Math.cos(a - u.face))) < 0.01);
    if (cur >= 0) btns[cur].classList.add('on');
    p.appendChild(dirs);
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
    { t: '下の列の武器をひとつ選ぶ',    s: 'GAT はガトリング' },
    { t: '光っている地面をタップして置く', s: '置けるのは地面（壁）の上だけ' },
    { t: '調整パネルの矢印で、向きを敵のほうへ', s: '向きは六角の6方向。パネルは上をつまんで好きな場所へ動かせる' },
    { t: '右下の「準備完了」で始まる',    s: '置き直しはウェーブの合間にできる' },
    { t: 'あとは眺めるだけ',            s: '倒すとコインが増える。負けても持ち帰れる' },
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

  // 連なり1本の札
  skillTrack(ch) {
    const perm = Game.perm, meta = Game.meta;
    const col = ch.cat ? CATEGORIES[ch.cat].color : ({ '資源': '#ffd24a', '拠点': '#9fe0c0', 'カード': '#c9a0ff', '危険': '#ff6a7e' })[ch.group] || '#ff8a1f';
    const got = ch.nodes.filter(s => Skill.lv(meta, s.id) > 0).length;
    const next = ch.nodes.find(s => Skill.lv(meta, s.id) <= 0);
    this.skillSel = this.skillSel || {};
    const selId = (this.skillSel[ch.key] && ch.nodes.some(s => s.id === this.skillSel[ch.key])) ? this.skillSel[ch.key] : (next || ch.nodes[ch.nodes.length - 1]).id;

    const tk = Util.el('div', 'tk' + (got === ch.nodes.length ? ' full' : ''));
    tk.style.setProperty('--bc', col);
    tk.innerHTML = '<div class="tk-head"><i class="tk-ic">' + Icons.skill(ch.nodes[0]) + '</i><b>' + ch.name + '</b>' +
      '<span>' + got + ' / ' + ch.nodes.length + '</span></div>';

    // 節の粒（取った／次／まだ）。タップでその節の中身を見る
    const pips = Util.el('div', 'tk-pips');
    for (const s of ch.nodes) {
      const lv = Skill.lv(meta, s.id);
      const can = Game.canBuySkills() && Skill.canBuy(meta, perm, s.id);
      const b = Util.el('button', 'tk-pip' + (lv > 0 ? ' have' : s === next ? ' next' : '') + (can ? ' can' : '') + (s.id === selId ? ' sel' : ''));
      b.addEventListener('click', () => { this.skillSel[ch.key] = s.id; this.refreshTree(); });
      pips.appendChild(b);
      this.skillRows.push({ id: s.id, el: b, can });
    }
    tk.appendChild(pips);

    // 選んだ節の中身と、取るボタン
    const s = SKILL_BY_ID[selId];
    const lv = Skill.lv(meta, s.id);
    const unlocked = Skill.isUnlocked(perm, s.id);
    const can = Game.canBuySkills() && Skill.canBuy(meta, perm, s.id);
    const node = Util.el('div', 'tk-node');
    node.innerHTML =
      '<div class="tk-plate' + (lv > 0 ? ' have' : '') + '"><i class="tplate">' + (unlocked || lv > 0 ? Icons.skill(s) : Icons.get('lock')) + '</i></div>' +
      '<div class="tk-body"><b>' + (unlocked || lv > 0 ? s.name : '？？？') + '</b>' +
        '<span>' + (unlocked || lv > 0 ? Skill.shortDesc(s) : Skill.lockReason(perm, s.id)) + '</span></div>';
    const btn = Util.el('button', 'tk-buy' + (lv > 0 ? ' done' : can ? '' : ' short'));
    if (lv > 0) btn.innerHTML = Icons.get('check') + '取得済';
    else if (!unlocked) btn.innerHTML = Icons.get('lock');
    else btn.innerHTML = '<span>' + (can ? '取得' : !Game.canBuySkills() ? '戦闘中' : '不足') + '</span><b>' + Icons.coin() + Util.fmt(Skill.cost(meta, s.id)) + '</b>';
    btn.disabled = lv > 0 || !can;
    btn.addEventListener('click', () => {
      if (!Game.canBuySkills() || !Skill.buy(Game.meta, Game.perm, s.id)) return;
      Game.applyMods();
      Snd.ui();
      delete this.skillSel[ch.key];       // 取ったら次の節へ
      this.refreshTree();
    });
    node.appendChild(btn);
    tk.appendChild(node);
    return tk;
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
      this.toastMsg(r.n + '件 購入　コイン ' + Util.fmt(r.spent), '#ff8a1f');
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
      d.addEventListener('click', () => this.openModal(CardFX.face(c, { count: Game.own(id), tap: true }), true));
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
    const x = Util.el('button', 'wp-x');
    x.innerHTML = Icons.get('close');
    x.addEventListener('click', () => this.closeModal());
    body.appendChild(x);
    body.appendChild(this.choiceHead('武器を選ぶ', (slot + 1) + '種目の枠に入れる武器'));
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
      { kind: 'perm',    name: '遺物',       sub: '持っているだけで常に効く。凸で強くなる' },
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
  panelPacks(p) {
    const perm = Game.perm;
    const shown = PACK_IDS.filter(pid => pid !== 'relic' || Pack.isUnlocked(perm, pid));   // 遺物パックは初回転生まで存在も見せない
    const n = (pid) => perm.packs[pid] || 0;
    const open = (pid) => Pack.isUnlocked(perm, pid);
    // 選んでいるパック。**無ければ、開けられるもの → 開いているもの → 先頭**
    if (!this.gachaPick || shown.indexOf(this.gachaPick) < 0) {
      this.gachaPick = shown.find(pid => open(pid) && n(pid) > 0) || shown.find(open) || shown[0];
    }
    const pid = this.gachaPick, pk = PACKS[pid], have = n(pid), ok = open(pid);

    const gs = Util.el('div', 'gs');
    gs.style.setProperty('--pc', pk.color);
    gs.style.setProperty('--best', pk.color);
    // 舞台：光の筋と、浮かぶ金属の箱
    gs.innerHTML =
      '<div class="gs-stage' + (ok ? '' : ' locked') + '">' +
        '<i class="gs-rays"></i><i class="gs-floor"></i>' +
        '<div class="gs-box"><div class="pfx-strip"></div>' +
          '<div class="pfx-body"><i class="pfx-rv a"></i><i class="pfx-rv b"></i><i class="pfx-rv c"></i><i class="pfx-rv d"></i>' +
          '<div class="pfx-emb"><div class="pfx-gear">' + Icons.get('gear') + '</div><div class="pfx-logo">' + CardFX.logoSvg() + '</div></div>' +
          '<div class="pfx-name">' + pk.name + '</div><div class="pfx-sub">' + pk.size + ' CARDS</div><i class="pfx-haz"></i></div></div>' +
        '<div class="gs-have"><span>所持</span><b>×' + have + '</b></div>' +
        (ok ? '' : '<div class="gs-lock">' + Icons.get('lock') + Pack.lockReason(perm, pid) + '</div>') +
      '</div>' +
      '<div class="gs-info"><b>' + pk.name + '</b><span>' + pk.desc + '</span></div>';
    // 提供割合（weights は合計100）
    const rates = Util.el('div', 'gs-rates');
    for (const r of BAL.rarityOrder) {
      const w = pk.weights[r] || 0;
      const d = Util.el('div', 'gs-rate');
      d.style.setProperty('--rc', BAL.rarity[r].color);
      d.innerHTML = '<i style="width:' + Math.max(w > 0 ? 3 : 0, w) + '%"></i><span>' + CardFX.RAR_EN[r] + '</span><b>' + w + '%</b>';
      rates.appendChild(d);
    }
    gs.appendChild(rates);
    if (pk.guarantee) gs.appendChild(Util.el('div', 'gs-note', BAL.rarity[pk.guarantee].name + '以上 1枚確定'));

    // 引くボタン
    const btns = Util.el('div', 'gs-btns');
    const b1 = Util.el('button', 'gs-pull one');
    b1.innerHTML = '<span>1個 開ける</span><b>' + pk.size + '枚</b>';
    b1.disabled = !ok || have <= 0;
    b1.addEventListener('click', () => this.openPack(pid));
    const bn = Util.el('button', 'gs-pull all');
    bn.innerHTML = '<span>まとめて開ける</span><b>×' + have + '</b>';
    bn.disabled = !ok || have <= 1;
    bn.addEventListener('click', () => this.openPackBulk(pid));
    btns.appendChild(b1); btns.appendChild(bn);
    gs.appendChild(btns);

    // パックの切り替え
    const list = Util.el('div', 'gs-list');
    for (const id of shown) {
      const c = Util.el('button', 'gs-tab' + (id === pid ? ' on' : '') + (open(id) ? '' : ' locked'));
      c.style.setProperty('--pc', PACKS[id].color);
      c.innerHTML = CardFX.miniPack(PACKS[id]) + '<b>' + PACKS[id].name + '</b>' +
        (open(id) ? '<em' + (n(id) > 0 ? ' class="has"' : '') + '>×' + n(id) + '</em>' : '<em>' + Icons.get('lock') + '</em>');
      c.addEventListener('click', () => { this.gachaPick = id; Snd.ui(); this.renderPanel(); });
      list.appendChild(c);
    }
    gs.appendChild(list);
    p.appendChild(gs);

    // パックの入手（ミッション）。畳んでおく
    const det = Util.el('details', 'gs-miss');
    const doneN = MISSIONS.filter(m => perm.missions[m.id]).length;
    det.innerHTML = '<summary>パックの入手　ミッション <b>' + doneN + ' / ' + MISSIONS.length + '</b></summary>';
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
  openPackBulk(pid) {
    if (this._opening) return;
    const n = Game.perm.packs[pid] || 0;
    if (n <= 0) return;
    this._opening = true;
    const luck = Skill.mods(Game.meta, Game.perm).packLuck;
    const got = {};            // cardId -> 枚数
    const fresh = {};          // 初めて手に入れたか
    const before = {};         // 開ける前の枚数（凸が上がったかを見る）
    for (let k = 0; k < n; k++) {
      for (const id of Pack.open(pid, luck)) {
        if (before[id] === undefined) before[id] = Game.own(id);
        if (Game.own(id) === 0 && !got[id]) fresh[id] = true;
        got[id] = (got[id] || 0) + 1;
        Game.grant(id, 1);
      }
    }
    Game.perm.packs[pid] = 0;
    Game.save();

    // **凸が上がったカードを先に並べる。**そのあとレア度の高い順
    const list = Object.keys(got).map(id => ({
      id, gain: got[id], isNew: !!fresh[id],
      t0: Game.totuOf(before[id]), t1: Game.totuOf(Game.own(id)),
    }));
    const up = (e) => !CARDS[e.id].noRank && e.t1 > e.t0;
    list.sort((a, b) => up(b) - up(a) ||
      BAL.rarityOrder.indexOf(CARDS[b.id].rarity) - BAL.rarityOrder.indexOf(CARDS[a.id].rarity));
    CardFX.openBulk(PACKS[pid], n, list, () => {
      this._opening = false;
      this.renderPanel();
    });
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
      '<div class="pz-title"><b>転生</b><span>' + (perm.prestiges + 1) + '回目　突破 ' + cleared + ' / ' + STAGES.length + '章</span></div>';
    p.appendChild(hero);

    // 失うもの ／ 残るもの・得るもの
    const cols = Util.el('div', 'pz-cols');
    cols.innerHTML =
      '<div class="pz-col lose"><h4>失う</h4><ul>' +
        '<li>コイン</li><li>スキルツリー</li><li>章の突破（初回報酬は取り直せる）</li><li>盤の配置</li></ul></div>' +
      '<div class="pz-col keep"><h4>残る</h4><ul>' +
        '<li>カード・凸</li><li>持っているパック</li><li>遺物</li><li>到達した深さ</li></ul></div>';
    p.appendChild(cols);

    const gain = Util.el('div', 'pz-gain');
    gain.innerHTML = '<h4>得る</h4>' + (cleared > 0
      ? '<div class="pz-packs">' +
          '<div>' + CardFX.miniPack(PACKS.relic) + '<b>遺物パック</b><em>×' + pv.relic + '</em></div>' +
          '<div>' + CardFX.miniPack(PACKS.basic) + '<b>カードパック</b><em>×' + pv.cards + '</em></div></div>' +
        '<p>奥まで突破してから転生するほど多い。カードパックの分野は、突破した章の分野から出る</p>' +
        // 前回の到達より浅いときは減る（Pack.prestigePreview）。**減っていることを隠さない**
        ((perm.legacyDeep || 0) > cleared
          ? '<p class="pz-warn">前回は第' + perm.legacyDeep + '章まで進んでいます。そこより浅いところで転生すると、得られるパックが大きく減ります（今は突破 ' + cleared + ' 章）</p>'
          : '')
      : '<p>まだ何も得られません</p>');
    p.appendChild(gain);

    const btn = Util.el('button', 'pz-go', can ? '転生する'
      : 'ステージを ' + BAL.prestigeMinStages + ' 個突破すると転生できます（現在 ' + cleared + ' 個）');
    btn.disabled = !can;
    btn.addEventListener('click', () => this.confirmPrestige());
    p.appendChild(btn);

    // 遺物は「持っているだけで効くカード」。一覧は図鑑の「遺物」の節にある（凸の星つき）
    const st = Util.el('div', 'pz-stats');
    st.innerHTML =
      '<div><span>転生回数</span><b>' + perm.prestiges + '</b></div>' +
      '<div><span>遺物</span><b>' + R.count + '枚</b></div>' +
      '<div><span>遺物のダメージ</span><b>×' + Util.fmt(R.dmg) + '</b></div>' +
      '<div><span>遺物のコイン</span><b>×' + Util.fmt(R.coin) + '</b></div>';
    p.appendChild(st);
    if (R.count > 0) {
      const link = Util.el('button', 'pz-link');
      link.innerHTML = Icons.get('grid') + '遺物を図鑑で見る';
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

  confirmPrestige() {
    const pv = Pack.prestigePreview(Game.clearedCount(), Game.perm.prestiges, Game.perm.legacyDeep || 0);
    const body = Util.el('div', 'rs rs-lose');
    body.innerHTML =
      '<div class="rs-ban"><b>転生</b><span>本当に転生しますか？</span></div>' +
      '<div class="rs-tip">コイン・スキルツリー・章の突破・盤の配置を失います。カード・パック・遺物は残ります</div>' +
      '<div class="rs-rew">' +
        '<div class="rs-pack">' + CardFX.miniPack(PACKS.relic) + '<b>遺物パック</b><em>×' + pv.relic + '</em></div>' +
        '<div class="rs-pack">' + CardFX.miniPack(PACKS.basic) + '<b>カードパック</b><em>×' + pv.cards + '</em></div></div>';
    const ok = Util.el('button', 'rs-go');
    ok.innerHTML = '<span>失って得る</span><b>転生する</b>' + Icons.get('cycle');
    ok.addEventListener('click', () => {
      const res = Game.prestige();
      this.closeModal();
      UI.pick = 0;
      Main.toHome();
      if (res) this.showPrestigeResult(res);
    });
    const no = Util.el('button', 'rs-sub');
    no.innerHTML = Icons.get('close') + 'やめる';
    no.addEventListener('click', () => this.closeModal());
    const subs = Util.el('div', 'rs-subs'); subs.appendChild(no);
    body.appendChild(ok); body.appendChild(subs);
    this.openModal(body);
    this.el.modal.classList.add('rsmodal');
  },

  showPrestigeResult(res) {
    // リザルトと同じ形（判定の帯 → 獲得物 → 次へ）
    const body = Util.el('div', 'rs rs-perfect');
    body.innerHTML = '<div class="rs-ban"><i class="rs-sweep"></i><b>REBIRTH</b><span>転生 ' + res.prestiges + '回目</span></div>';
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
    this.burst('#ffd24a');
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
    // **なぜ4択・5択なのか／なぜ何枚も取れるのかを出す。**（ユーザー 2026-09-24
    //   「5択、複数回選択出来るのは一体何の効果なのかわからない」）
    {
      const R = Relic.mods(Game.perm);
      const why = [];
      const sc = Skill.gsum(Game.meta, 'choices'), rc = R.choices || 0;
      const sp = Skill.gsum(Game.meta, 'picks'), rp = R.picks || 0;
      if (sc) why.push('選択肢 +' + sc + '（スキル「選択肢拡張」）');
      if (rc) why.push('選択肢 +' + rc + '（遺物）');
      if (sp) why.push('1ウェーブに +' + sp + '枚（スキル「増設スロット」）');
      if (rp) why.push('1ウェーブに +' + rp + '枚（遺物）');
      if (why.length) body.appendChild(Util.el('div', 'draftwhy', why.join('　')));
    }
    body.appendChild(this.runSlots());

    const row = Util.el('div', 'chrow');
    for (const id of ids) {
      const c = CARDS[id];
      // **新しいカードの見た目で出す。**（ユーザー 2026-09-24「カードをちゃんとデザインして」）
      //   ★はいまの凸（パックで被った枚数から）。**枚数と「あと何枚」は出さない**
      //   （ユーザー 2026-09-23「3択チョイスでは被せて取る意味は残したい」。ここで枚数を出すと
      //    3択で被せると凸が進むように読めてしまう）。下の丸は「この出撃で何枚積んだか」
      const el = Util.el('button', 'chcard pick cfpick' + (BAL.rarity[c.rarity].glow >= 2 ? ' hot' : ''));
      el.appendChild(CardFX.face(c, { count: Game.own(id), noCount: true }));
      el.insertAdjacentHTML('beforeend',
        this.stackPips({ have: run.cards[id] || 0, limit: Game.stackLimit(id) }) +
        '<div class="chtype">' + (c.kind === 'weapon' ? '武器を編成に追加'
          : c.kind === 'synergy' ? 'シナジー'
          : (c.weapon ? WEAPONS[c.weapon].name + ' 強化' : '全体強化')) + '</div>');      el.addEventListener('click', () => {
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

  // ---- 3択の画面の部品 ----
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
    m.dataset.noclose = noClose ? '1' : '';
  },

  closeModal() {
    this.el.modal.classList.remove('on', 'rsmodal');
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

  // スキップの結果。**手で突破したときと同じものが出た**ことを、そのまま並べる
  showSkipResult(res) {
    // リザルトと同じ形。**何も得ていない**ことを短く言う
    //   （前の説明文は、太字のつもりの ** がそのまま画面に出ていた）
    const body = Util.el('div', 'rs rs-skip');
    body.innerHTML =
      '<div class="rs-ban"><i class="rs-sweep"></i><b>SKIP</b><span>' + res.stage.name + '　通過（突破ではない）</span></div>' +
      '<div class="rs-tip">コイン・カード・転生の評価は増えません。初回突破の報酬は残っているので、あとで自分で突破すれば受け取れます</div>';
    const go = Util.el('button', 'rs-go');
    go.innerHTML = '<span>次へ</span><b>' + (res.next ? res.next.name : 'ホーム') + '</b>' + Icons.get('play');
    go.addEventListener('click', () => { this.closeModal(); this.renderHome(); });
    body.appendChild(go);
    this.openModal(body, true);
    this.el.modal.classList.add('rsmodal');
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
    body.innerHTML =
      '<div class="rs-ban"><i class="rs-sweep"></i><b>' + word + '</b>' +
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

    // 完璧クリアの案内は1行だけ（取れるもの／取り済み）
    if (!perfect) {
      const rec = Game.stageRec(res.stage.id);
      const pk = PACKS[Pack.forStage(res.stage.id)];
      body.appendChild(Util.el('div', 'rs-tip', rec.perfect
        ? 'この周の完璧クリアのパックは受け取り済み'
        : '1体も通さずに凌ぐと ' + pk.name + ' ×2（転生ごとに1回）'));
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
    // **地形の引き直しはプレイヤーが選ぶ。**（2026-09-26・前は負けが続くと黙って差し替えていた）
    if (!res.ok && Game.canReroll(res.stage.id)) {
      const rr = Util.el('button', 'rs-reroll');
      rr.innerHTML = Icons.get('grid') + '<span>別の地形で挑む</span><small>この章の地形を作り直します（準備フェーズから）</small>';
      rr.addEventListener('click', () => {
        if (!Game.rerollStage(res.stage.id)) return;
        this.closeModal();
        Main.toBattle();
      });
      body.appendChild(rr);
    }

    this.openModal(body, true);
    this.el.modal.classList.add('rsmodal');
    // コインは数え上げる（0.7秒）
    const cb = body.querySelector('.rs-coin b');
    const t0 = performance.now(), total = res.coins || 0;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / 700);
      cb.textContent = Util.fmt(total * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && cb.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    if (perfect || (got && got.first && got.cards.length)) this.burst('#ff8a1f');
  },
};
