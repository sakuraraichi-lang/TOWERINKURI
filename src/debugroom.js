// ---------------------------------------------------------------
// debugroom.js : 演出の確認室（2026-09-29・ユーザー「更新した演出を見れるデバッグルームが欲しいです」）
//
//   URL に ?debugroom を付けて開く（タイトルは出さない）。⚙ の設定の一番下にも入口がある。
//   ボタンを押すと、その演出が**見本のデータで**その場に出る。**セーブは変わらない**：
//     ・パックは CardFX.demo / openBulk（中身は見本。パックの数は減らない）。まとめて開封の「読み込みから」は本物の loadBulk を通す（Pack.open は本物・実セーブには書かない）
//     ・結果画面・再起動の結果は見本の数字。押すボタンは「閉じる」だけにつなぎ替える（次の章へ進まない・再起動しない）
//     ・再起動の確認は demo 付き（UI.confirmPrestige(true)）。押しても Game.prestige() は呼ばれない
//     ・3択は demo 付き（UI.showDraft(ids)）。選んでもカードを取らず、戦闘も止めない
//   帯（カットイン）と3択は盤の上に出るので、裏で戦闘の画面（準備フェーズ）を開いておき、下半分を確認室のパネルにする。
//   パックのタブは UI.panelPacks(見本の入れ物, demo)：見本の perm・見本の選びで台を見せる（packTab）。
//   凸・覚醒は CardFX.demoTotu(凸の数)（カード1枚のパックで、その凸に届く1枚を捲る）と、まとめて開封（覚醒あり）
//     ・スキルツリーは見本のセーブ（Game.meta / Game.perm の写し）に読み出しのあいだだけ差し替えて、本物の札（UI.skillTrack）と買う処理（UI.skillBuy）をそのまま通す。実セーブは変わらない
//     ・向きの指定（六角の花）は、裏の準備フェーズの盤に見本の武器を1基置いて選ぶ（dirDemo）。花は本物を押せる。片づけるとき配置の記録とチュートリアルの進みを書き戻す
//   演出そのものは本物の関数を呼ぶだけ（見本のために別の絵を作らない）。演出を作り直したら、ここに並べる
// ---------------------------------------------------------------
'use strict';

const DebugRoom = {
  el: null,

  // 手札に依らない見本のカード（種類ごとに先頭のもの）
  _cards(rar, n) {
    return CARD_IDS.filter(id => CARDS[id].rarity === rar && !CARDS[id].upper && !['weapon', 'perm', 'key'].includes(CARDS[id].kind)).slice(0, n || 1);
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

  // アセンションのレベルアップの見本：本物の結果画面（UI.showResult）に、見本の経験値の入り方（Asc.gain の返り値と同じ形）を載せる。
  //   perm.asc には触れない（数値はこの関数の中だけ）。up … 上がるレベルの数（0なら経験値が入るだけ）
  asc(up) {
    const from = 6, exp0 = Asc.need(from) * 0.55;
    const to = from + up;
    let exp = up ? Asc.need(from) * 0.45 : Asc.need(from) * 0.2;
    for (let k = from + 1; k < to; k++) exp += Asc.need(k);
    const exp1 = up ? Asc.need(to) * 0.3 : exp0 + exp;
    if (up) exp += exp1;
    const packs = {};
    for (let k = from + 1; k <= to; k++) packs.basic = (packs.basic || 0) + Asc.packsAt(k);
    const stage = STAGES[MAIN_CHAPTERS] || STAGES[STAGES.length - 1];
    const res = this._res({ stage, stageGot: { first: true, perfect: false, cards: [], packs, stage, next: stage, asc: { exp, from, to, exp0, exp1, packs } } });
    UI.showResult(res); this._safe();
  },

  // 向きの指定（六角の花）の見本：裏の戦闘の画面（準備フェーズ）に見本の武器を1基置いて選ぶ。**花の六角は本物を押せる**（押した向きに武器が回り、射界の扇が回る）。
  //   where … mid（見える範囲の真ん中）／left・right（左右の縁の真ん中）／tl・tr（上の角）。下半分は確認室のパネルが覆うので、上の半分から選ぶ。
  //   **セーブを守る**：置く・向きを変えると配置の記録（perm.placements）とチュートリアルの進みが動くので、始める前の値を写し取り、片づけるとき（もう一度押す・片づける・部屋を閉じる）に書き戻す。
  //   演出中は Game.save を止める。コストの上限には数えない（見本の1基は run.units に直接足す）
  // 保存の差し替え：**本物の Game.save は最初の1回だけ控え、戻すのは差し替えを頼んだものが全部終わったとき。**
  //   （2026-09-29・前は見本ごとに「そのとき見えている Game.save」を控えていた。ボス戦の見本の途中で向きの花を出すと、
  //    花が控えたのは差し替え後の空の関数で、片づけたあとも保存が止まったままになり、記憶のセーブも見本の前と食い違った）
  _saveHold() {
    if (!this._holds) { this._realSave = Game.save; Game.save = () => {}; }
    this._holds = (this._holds || 0) + 1;
  },
  _saveRelease() {
    if (!this._holds) return;
    if (--this._holds > 0) return;
    Game.save = this._realSave; this._realSave = null;
  },
  _dirEnd() {
    if (!this._dirSnap) return;
    const sn = this._dirSnap; this._dirSnap = null;
    this._saveRelease();
    const run = Game.run;
    if (run && sn.unit) { const i = run.units.indexOf(sn.unit); if (i >= 0) run.units.splice(i, 1); }
    Game.perm.placements = sn.placements; Game.perm.lastPlace = sn.lastPlace; Game.perm.tut = sn.tut;
    if (UI.selected === sn.unit) UI.selected = null;
    if (run) run.capUp = false;   // 全撤去を光らせる見本（capDemo）の印
    try { Game.applyMods(); } catch (e) {}
    UI.renderTray();
  },
  // 「コストの上限が上がった直後」の見本：見本の武器を1基置き、全撤去のボタンを光らせて通知を出す（もう一度押す・片づけるで戻る）。
  //   全撤去を押すと見本の武器も外れる（配置の記録は _dirEnd が書き戻す）
  capDemo() {
    this.dirDemo('mid');
    const run = Game.run;
    if (!this._dirSnap || !run) return;
    run.capUp = true;
    UI.toastMsg('全撤去して置き直せます', '#ffc24a', 'capup');
  },
  //   wid … 見本の武器（省くと編成の1つ目＝ふつうはガトリング）。0930：**向きが効かない武器（指定攻撃・凍結）は花が出ない**ので、その見本もここから出す
  dirDemo(where, wid) {
    this._dirEnd();
    // ボス戦の見本の途中なら、先にそちらを片づける（perm と meta を書き戻す）。裏の盤はふつうの準備フェーズに戻す
    if (this._btSnap) { const bt = this._btRun; this._btEnd(); if (bt && Game.run === bt) { Main.toPrep(); Render.fit(); } }
    const run = Game.run;
    if (!run || run.over || !Game.canBuild()) { UI.toastMsg('準備フェーズの盤がありません', '#ff4a66', 'error'); return; }
    this._dirSnap = { placements: JSON.parse(JSON.stringify(Game.perm.placements)), lastPlace: JSON.parse(JSON.stringify(Game.perm.lastPlace || {})), tut: Game.perm.tut, unit: null };
    this._saveHold();
    // 見える範囲（盤の画面の上から、確認室のパネルの上まで）を盤の座標にして、その中の目標に一番近い置ける六角を選ぶ
    const cv = Render.canvas.getBoundingClientRect();
    const panelTop = window.innerHeight - Math.min(window.innerHeight * 0.5, 440);
    const a = Render.toStage(cv.left, cv.top), b = Render.toStage(cv.right, Math.min(cv.bottom, panelTop));
    const st = run.stage, R = MapGen.HEX_R;
    const x0 = Math.max(0, a.x), x1 = Math.min(st.w, b.x), y0 = Math.max(0, a.y), y1 = Math.min(st.h, b.y);
    const goal = { mid: [(x0 + x1) / 2, (y0 + y1) / 2], left: [x0, (y0 + y1) / 2], right: [x1, (y0 + y1) / 2], tl: [x0, y0], tr: [x1, y0] }[where] || [(x0 + x1) / 2, (y0 + y1) / 2];
    let best = null, bd = 1e18;
    for (const h of st.hexCells()) {
      const p = st.hexCenter(h.c, h.r);
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1 || Game.unitAt(h.c, h.r)) continue;
      const d = (p.x - goal[0]) ** 2 + (p.y - goal[1]) ** 2;
      if (d < bd) { bd = d; best = h; }
    }
    if (!best) { this._dirEnd(); UI.toastMsg('見える範囲に置ける六角がありません', '#ff4a66', 'error'); return; }
    const u = Game.newUnit(wid || Game.loadoutWeapons()[0] || Object.keys(WEAPONS)[0], best.c, best.r, Game.FACES[0]);
    run.units.push(u);
    Game.applyMods();
    // 指定攻撃は、置いた瞬間に既定の着弾円を持つ（Game.placeUnit と同じ）。盤をタップするとそこへ動く（Game.setAimPoint・本物の操作）
    if (Game.usesAimPoint(u.def)) { const ap = Game.defaultAimPoint(u); u.ax = ap.x; u.ay = ap.y; }
    this._dirSnap.unit = u;
    UI.placingType = null; UI.moving = null;
    UI.selected = u;
    UI.renderTray();
  },

  // 一覧：[グループ名, [[ボタンの字, 押したときの関数], …]]
  groups() {
    const me = this;
    const cut = (t, s, k) => () => UI.cutin(t, s, k);
    const W = BAL.wavesPerStage;
    return [
      ['題字（2026-09-30 X1）', [
        ['タイトル画面（紋 → 帯 → 字の順に出る・タップで閉じる）', () => Scenes.title()],
      ]],
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
        ['まとめて開封（10パック・読み込みから）', () => me.bulkFlow(10)],
        ['まとめて開封（30パック・読み込みから）', () => me.bulkFlow(30)],
      ]],
      ['結果画面', [
        ['CLEAR', () => { UI.showResult(me._res()); me._safe(); }],
        ['PERFECT', () => { UI.showResult(me._res({ perfect: true, leaked: 0, lives: 24 })); me._safe(); }],
        ['DEFEAT', () => { UI.showResult(me._res({ ok: false, wave: 3, lives: 0, leaked: 24, coins: 6400, missions: [], stageGot: null })); me._safe(); }],
        ['SKIP', () => { UI.showSkipResult({ stage: STAGES[2], next: STAGES[3] }); me._safe(); }],
        ['REBOOT', () => { UI.showPrestigeResult({ prestiges: 3, reward: { relic: 6, basic: 8, arms: 2 } }); me._safe(); }],
        ['再起動の確認', () => UI.confirmPrestige(true)],
      ]],
      ['アセンション（レベルアップ）', [
        ['経験値だけ入る（上がらない）', () => me.asc(0)],
        ['1レベル上がる', () => me.asc(1)],
        ['一度に3レベル上がる', () => me.asc(3)],
      ]],
      ['戦闘の上に出るもの', [
        ['カード3択', () => UI.showDraft(me._cards('rare', 1).concat(me._cards('common', 2)))],
        ['3択（エピック・レジェンド入り）', () => UI.showDraft(me._cards('rare', 1).concat(me._cards('epic', 1), me._cards('legendary', 1)))],
        ['3択（上位札・連携の上位札入り）', () => UI.showDraft(['up_gat_mount', 'up_syn_conduct'].concat(me._cards('common', 1)))],
        ['3択（連携の上位札3枚・前提の行が長い）', () => UI.showDraft(['up_syn_resonate', 'up_syn_venomfire', 'up_syn_conduct'])],
        ['準備フェーズの帯', cut('準備フェーズ', '武器を置いて「準備完了」', 'prep')],
        ['ウェーブの帯', cut('WAVE 3<em> / ' + W + '</em>', '', 'wave')],
        ['最終ウェーブの帯', cut('WAVE ' + W + '<em> / ' + W + '</em>', '最終ウェーブ', 'last')],
        ['ボスの帯', () => { UI.cutinBoss(W); setTimeout(() => UI.sysWarn('boss'), 2100); }],
        ['BOSS DOWN（あと2体）', () => UI.cutinBossDown(2)],
        ['ボス戦の見本（第10章・2体）', () => me.bossBattle()],
        ['レーザーライフルの光線（壁で2回はね返る）', () => me.laserDemo()],
        ['触手の6種の攻撃（順番に出す）', () => me.tentacleDemo()],
        ['触手：引き寄せ', () => me.tentacleDemo('pull')],
        ['触手：突き刺し', () => me.tentacleDemo('stab')],
        ['触手：薙ぎ払い', () => me.tentacleDemo('sweep')],
        ['触手：触手の壁', () => me.tentacleDemo('wall')],
        ['触手：タコ墨', () => me.tentacleDemo('ink')],
        ['触手：一閃', () => me.tentacleDemo('cut')],
        ['敵の耐性の輪（盤に8種を並べる・もう一度押すと片づく）', () => me.resDemo()],
      ]],
      ['札の新しい挙動（見本の的に、その札を掛けた武器で数秒撃つ・本物の戦闘）', [
        ['曳光弾（ガトリング・装甲の的）', () => me.cardDemo('gat_barrels')],
        ['掃射（ガトリング）', () => me.cardDemo('gat_loose')],
        ['粘着燃料（火炎・燃え移り）', () => me.cardDemo('flm_wide')],
        ['青い炎（火炎・耐火の的）', () => me.cardDemo('flm_inferno')],
        ['腐蝕の雲（毒ガス・装甲の的）', () => me.cardDemo('gas_toxic')],
        ['重い霧（毒ガス・流れる雲）', () => me.cardDemo('gas_fog')],
        ['氷の棺（凍結）', () => me.cardDemo('cry_permafrost')],
        ['砕氷（凍結）', () => me.cardDemo('cry_shatter')],
        ['返し刃（刀・逆向きの斬撃）', () => me.cardDemo('ktn_swallow')],
        ['追尾刃（手裏剣）', () => me.cardDemo('shk_sweep')],
        ['影分身（手裏剣）', () => me.cardDemo('shu_sakura')],
        ['弾む泡（泡）', () => me.cardDemo('bbl_bounce')],
        ['泡の檻（泡）', () => me.cardDemo('bbl_sea')],
        ['徹甲榴弾（迫撃砲・装甲の的）', () => me.cardDemo('mtr_wide')],
        ['焼夷弾（迫撃砲）', () => me.cardDemo('mtr_barrage')],
        ['装甲貫通（全武器・装甲の的）', () => me.cardDemo('gen_ap')],
        ['貫通弾頭（ミサイル・装甲の的）', () => me.cardDemo('msl_multi')],
        ['クラスター弾（ミサイル・3発に1発子を撒く）', () => me.cardDemo('msl_cluster')],
        ['戦術核（ミサイル・被爆の輪）', () => me.cardDemo('msl_nuke')],
        ['吊るし上げ（触手＋ミサイル・印の十字）', () => me.cardDemo('syn_hangman')],
        ['照準固定（触手＋迫撃砲・印の十字）', () => me.cardDemo('syn_fixfire')],
        ['焼き印（触手＋火炎・印の十字）', () => me.cardDemo('syn_searbind')],
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
        ['コストが足りない', () => UI.toastMsg('コストが足りません（ミサイルはコスト4・残り 2）', '#ff8080', 'limit')],
        ['コストの上限が上がった（全撤去が光る）', () => me.capDemo()],
        ['システム', () => UI.toastMsg('処理の重さを表示', '#ff8a1f', 'sys')],
        ['エラー', () => UI.toastMsg('出せませんでした：見本', '#ff4a66', 'error')],
        ['連続で6個（差し替わる）', () => ['weapon', 'wave', 'buy', 'warn', 'card', 'lock'].forEach((k, i) => setTimeout(() =>
          UI.toastMsg(['新しい武器 ガトリング', 'ウェーブ ' + (i + 1) + ' 突破', '3件 購入　コイン 900', 'コストが足りません', '取得: 見本のカード', '開いていません'][i], '#ffc24a', k), i * 260))],
      ]],
      ['スキルツリー（ノードを取った瞬間）', [
        ['1つ取る（火力の連なり）', () => me.skill('normal')],
        ['コストの上限を取る（増設完了の帯）', () => me.skill('units')],
        ['取り切る（系統完了の帯）', () => me.skill('done')],
        ['連打（5つ続けて取る）', () => me.skill('rapid')],
      ], () => me._skHostEl()],
      ['向きの指定（六角の花）', [
        ['指定攻撃（ミサイル：花なし・盤をタップで着弾円）', () => me.dirDemo('mid', 'missile')],
        ['指定攻撃（迫撃砲：花なし・盤をタップで着弾円）', () => me.dirDemo('mid', 'mortar')],
        ['凍結装置（射程の円・花なし）', () => me.dirDemo('mid', 'cryo')],
        ['盤の真ん中に置く（ガトリング：花あり）', () => me.dirDemo('mid')],
        ['左の縁に置く', () => me.dirDemo('left')],
        ['右の縁に置く', () => me.dirDemo('right')],
        ['左上の角に置く', () => me.dirDemo('tl')],
        ['右上の角に置く', () => me.dirDemo('tr')],
        ['片づける', () => me._dirEnd()],
      ]],
      ['場面・画面', [
        ['出撃の瞬間（幕・帯・衝撃波）', () => Sortie.demo()],
        ['出撃の瞬間（ボス章）', () => Sortie.demo(true)],
        ['出撃の瞬間＋自動購入の通知', () => Sortie.demo(false, true)],
        ['再起動の場面（部屋）', () => Scenes.reboot(null)],
        ['指揮官の記録', () => UI.openProfile(true)],
        ['パックのタブ（見本の所持数）', () => me.packTab()],
        ['図鑑（下へ送ると「敵」「上位札」の節）', () => me.collTab()],
        ['カードのレア度の見比べ（4種を並べる）', () => me.rarityView()],
      ]],
    ];
  },

  // スキルツリーの見本：見本の札を置く場所
  _skHostEl() {
    this._skHost = Util.el('div', 'dbg-sk');
    return this._skHost;
  },
  // 見本のセーブ：実セーブの浅い写し。第1章突破・全武器所持にして、どの連なりも開けておく（Game.meta / Game.perm は UI._demoView が読み出しのあいだだけ差し替える）
  //   skills … 取り済みの節。コインは尽きない。**実セーブには書かない**（写しの meta.skills だけを変える）
  _skDemo(skills) {
    const perm = Object.assign({}, Game.perm);
    perm.stages = Object.assign({}, Game.perm.stages);
    perm.stages[STAGES[0].id] = Object.assign({}, perm.stages[STAGES[0].id], { cleared: true });
    perm.collection = Object.assign({}, Game.perm.collection);
    for (const w of Object.keys(WEAPONS)) perm.collection['wc_' + w] = Math.max(1, perm.collection['wc_' + w] || 0);
    return { host: this._skHost, sel: {}, meta: { coins: 1e30, skills: Object.assign({}, skills) }, perm, rerender: null, chain: null };
  },
  // kind … normal（火力の連なりの1つ目）／units（設置枠・3つ取り済みから4つ目）／done（資源の連なり・最後の1つ）／rapid（火力の連なりを5つ続けて）
  skill(kind) {
    if (!this._skHost) return;
    UI.skillFxClear();
    clearInterval(this._skRapid);
    const pre = { normal: {}, rapid: {}, units: { units1: 1, units2: 1, units3: 1 }, done: { coin1: 1, coin2: 1, coin3: 1 } }[kind];
    const key = { normal: 'short_main', rapid: 'short_main', units: 'units', done: 'coin' }[kind];
    const dm = this._skDemo(pre);
    const ch = UI.skillChains(['短射程', '拠点', '資源']).find(c => c.key === key);
    if (!ch) { UI.toastMsg('見本の連なりが見つかりません：' + key, '#ff4a66'); return; }
    dm.chain = ch;
    dm.rerender = () => { this._skHost.replaceChildren(UI.skillTrack(ch, dm)); };
    UI._demoView(dm, dm.rerender);
    this._skHost.scrollIntoView({ block: 'nearest' });
    // 見本の札の「取得」を、本物と同じ押し方で押す（見せるための少しの間のあと）
    const press = () => { const b = this._skHost.querySelector('.tk-buy:not(:disabled)'); if (b) b.click(); return !!b; };
    if (kind === 'rapid') {
      let n = 0;
      this._skRapid = setInterval(() => { if (!this._skHost.isConnected || !press() || ++n >= 5) clearInterval(this._skRapid); }, 180);
    } else setTimeout(press, 450);
  },
  // パックのタブの見本：本物の perm の写しに、見本の所持数と再起動の格を入れて、台を全画面の板に出す（セーブは変わらない）。
  //   基本×5（開けられる）・兵装×0（空）・化学×1（まとめては開けられない）・常駐×2・連携（未開放）。
  //   切り替え（台座から光が昇る）・開ける（見本の開封）・まとめて開ける（見本のまとめ開封）が押せる。開けても所持数は減らない
  packTab() {
    this.packTabClose();
    const perm = JSON.parse(JSON.stringify(Game.perm));
    perm.packs = { basic: 5, arms: 0, chem: 1, syn: 0, relic: 2 };
    perm.deepest = 12; perm.prestiges = 3; perm.legacyDeep = 9;      // 格3：基本・兵装・化学・常駐が開き、連携（格4）だけ未開放
    perm.missions = perm.missions || {};
    const el = Util.el('div', 'rs fx dbgpk');
    el.innerHTML = '<div class="rs-ban"><em>// DEBUG ROOM</em><b>パックのタブ（見本）</b><span>切り替える・開ける・まとめて開ける が押せます（セーブは変わりません）</span></div>';
    const body = Util.el('div', 'dbgpk-b');
    const demo = {
      perm, gachaPick: 'basic', _gsFx: 'go',
      render: () => { body.innerHTML = ''; UI.panelPacks(body, demo); },
      open1: () => CardFX.demo('rare'),
      openAll: () => this.bulk(),
    };
    demo.render();
    el.appendChild(body);
    const subs = Util.el('div', 'rs-subs');
    const close = Util.el('button', 'rs-sub');
    close.innerHTML = Icons.get('close') + '閉じる';
    close.addEventListener('click', () => this.packTabClose());
    subs.appendChild(close);
    el.appendChild(subs);
    document.body.appendChild(el);
    this.pk = el;
  },
  packTabClose() { if (this.pk) { this.pk.remove(); this.pk = null; } },

  // 図鑑の見本（0929zq）：本物のカード図鑑（UI.panelCollection）を全画面の板に出す。見るだけ（セーブは変わらない）。下へ送ると「敵」「上位札」の節がある
  collTab() {
    this.collTabClose();
    const el = Util.el('div', 'rs fx dbgpk dbgcoll');
    el.innerHTML = '<div class="rs-ban"><em>// DEBUG ROOM</em><b>図鑑（見本）</b><span>上位札の節・敵の節まで下へ送って確かめる</span></div>';
    const body = Util.el('div', 'dbgpk-b');
    UI.panelCollection(body);
    el.appendChild(body);
    const subs = Util.el('div', 'rs-subs');
    const close = Util.el('button', 'rs-sub');
    close.innerHTML = Icons.get('close') + '閉じる';
    close.addEventListener('click', () => this.collTabClose());
    subs.appendChild(close);
    el.appendChild(subs);
    document.body.appendChild(el);
    this.cl = el;
  },
  collTabClose() { if (this.cl) { this.cl.remove(); this.cl = null; } },

  // 敵の耐性の輪の見本（0929zq）：盤の上に8種の敵を1列に並べ、耐性の輪（縁の色の切れた輪）を全部付ける。もう一度押すと片づく。
  //   本物の敵（Combat.makeEnemy）を作って run.enemies に足すだけ（動かない・戦闘は始めない）。耐性は「その種類が持つもの全部」を付ける（章に関係なく）
  resDemo() {
    const run = Game.run;
    if (!run || !run.stage) return;
    if (this._resEn) { run.enemies = run.enemies.filter(e => !this._resEn.includes(e)); this._resEn = null; return; }
    const st = run.stage, hx = (st.vec && st.vec.hexes) || [], cx = st.w / 2;
    let h = null;
    for (const c of hx) { if (c.y > st.h * 0.5 || c.y < 90) continue; if (!h || Math.abs(c.x - cx) < Math.abs(h.x - cx)) h = c; }
    if (!h) return;
    const types = Object.values(ENEMY_TYPES);
    this._resEn = [];
    types.forEach((t, i) => {
      const e = Combat.makeEnemy(run, t, 30, h.x - 110 + (i % 4) * 70, h.y + 20 + Math.floor(i / 4) * 46, 0);
      e.res = {}; for (const k in (t.res || {})) e.res[k] = true;
      if (t.armor) e.armor = BAL.armorCut;
      run.enemies.push(e); this._resEn.push(e);
    });
  },

  // カードのレア度の見比べ（0929zb・ユーザー「全てのカードが同じ枠組みで見分けがつかなくなってる」）：
  //   4種（コモン・レア・エピック・レジェンド）を、表（1枚ずつの大きさ）・小さい表示（図鑑や装備の大きさ）・説明が長い札・凸つき・裏面で並べる。セーブは変わらない
  rarityView() {
    this.rarityClose();
    const el = Util.el('div', 'rs fx dbgpk dbgrar');
    el.innerHTML = '<div class="rs-ban"><em>// DEBUG ROOM</em><b>カードのレア度の見比べ</b><span>色と明るさで4種が見分けられるか（セーブは変わりません）</span></div>';
    const body = Util.el('div', 'dbgpk-b');
    const RO = BAL.rarityOrder;
    const pool = (r) => CARD_IDS.filter(id => CARDS[id].rarity === r && !['weapon', 'perm', 'key'].includes(CARDS[id].kind));
    // 説明がいちばん長い札を種類ごとに1枚（3行になるものが、下の★の帯に隠れないかを見る）
    const longest = (r) => pool(r).sort((a, b) => UI.shortDesc(CARDS[b]).length - UI.shortDesc(CARDS[a]).length)[0];
    const section = (title, cls, mk) => {
      body.appendChild(Util.el('div', 'rs-h', title));
      const row = Util.el('div', 'dbgrar-row ' + cls);
      RO.forEach((r, i) => { const c = mk(r, i); if (c) row.appendChild(c); });
      body.appendChild(row);
    };
    section('表（1枚ずつの大きさ）', 'big', (r) => CardFX.face(CARDS[pool(r)[0]], { count: 1 }));
    section('説明がいちばん長い札', 'big', (r) => CardFX.face(CARDS[longest(r)], { count: 1 }));
    section('小さい表示（図鑑・装備の大きさ）', 'small', (r) => CardFX.face(CARDS[pool(r)[0]], { count: 1 }));
    section('凸（星が増える・覚醒）', 'small', (r, i) => CardFX.face(CARDS[pool(r)[0]], { count: [4, 8, 16, 32][i] }));
    section('裏面', 'small', (r) => CardFX.back(r));
    el.appendChild(body);
    const subs = Util.el('div', 'rs-subs');
    const close = Util.el('button', 'rs-sub');
    close.innerHTML = Icons.get('close') + '閉じる';
    close.addEventListener('click', () => this.rarityClose());
    subs.appendChild(close);
    el.appendChild(subs);
    document.body.appendChild(el);
    this.rv = el;
  },
  rarityClose() { if (this.rv) { this.rv.remove(); this.rv = null; } },

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

  // まとめて開封の流れ全体の見本（0929x）：① 読み込み画面（くじ確定・凸）→ ② 最高レア度 → ③ 開封 → ④ カード。
  //   本物の Pack.open を n 回呼び、本物の読み込み（CardFX.loadBulk）と並びの組み立て（UI.bulkList）を通す。
  //   **実セーブには書かない**（パックも減らず、カードも増えず、保存もしない）。枚数は手元の集計（いまの所持＋出た枚数）で出す
  bulkFlow(n) {
    const pid = 'arms', luck = Skill.mods(Game.meta, Game.perm).packLuck;
    const got = {}, before = {};
    CardFX.loadBulk(PACKS[pid], n, {
      total: n,
      step: () => {
        for (const id of Pack.open(pid, luck)) {
          if (before[id] === undefined) before[id] = Game.own(id);
          got[id] = (got[id] || 0) + 1;
        }
      },
      commit: () => UI.bulkList(got, before, id => before[id] + got[id]),
    }, null);
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
    this._saveRelease();
    try { Relic.invalidate(); } catch (e) {}
  },
  // レーザーライフルの光線の見本（2026-09-30 段3）。裏の準備フェーズの盤で、**本物の光線の経路（Combat.laserPath）**を引いて見せる。
  //   敵にも盤にも触らない（fx を足して、消えるまでの時間だけ進める）。撃ち口は「壁の上で、隣に通路があるタイル」のうち、
  //   2回折り返して長く伸びる所を選ぶ（見える範囲の上の半分から。下半分は確認室のパネルが覆う）
  laserDemo() {
    const run = Game.run;
    if (!run || !run.stage) return;
    const st = run.stage;
    const w = { x: 0, y: 0, s: { range: WEAPONS.sniper.base.range, reflect: WEAPONS.sniper.base.reflect } };
    let best = null;
    for (let r = 1; r < Math.floor(st.rows * 0.55); r++) for (let c = 1; c < st.cols - 1; c++) {
      if (st.walkable(c, r)) continue;
      if (!(st.walkable(c + 1, r) || st.walkable(c - 1, r) || st.walkable(c, r + 1) || st.walkable(c, r - 1))) continue;
      w.x = (c + 0.5) * TILE; w.y = (r + 0.5) * TILE;
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2 + 0.2;
        const p = Combat.laserPath(w, run, a);
        if (!p) continue;
        let len = 0;
        for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
        const sc = (p.length - 2) * 1000 + len;
        if (!best || sc > best.sc) best = { sc, x: w.x, y: w.y, a };
      }
    }
    if (!best) return;
    w.x = best.x; w.y = best.y;
    const color = WEAPONS.sniper.color;
    let n = 0;
    const shoot = () => {
      const p = Combat.laserPath(w, run, best.a + (n % 2 ? 0.03 : 0));
      if (p) run.fx.push({ type: 'laser', pts: p, w: WEAPONS.sniper.base.bulletR, n: 3, color, life: 0.26, t: 0 });
      n++;
    };
    shoot();
    clearInterval(this._lz);
    let last = performance.now(), t = 0;
    this._lz = setInterval(() => {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      if (Game.run !== run) { clearInterval(this._lz); return; }
      if (n < 4 && t > n * 0.7) shoot();
      for (let i = run.fx.length - 1; i >= 0; i--) {
        const f = run.fx[i];
        if (f.type !== 'laser') continue;
        f.t += dt;
        if (f.t >= f.life) run.fx.splice(i, 1);
      }
      if (n >= 4 && !run.fx.some(f => f.type === 'laser')) clearInterval(this._lz);
    }, 16);
  },

  // 触手の6種の攻撃の見本（2026-09-30 段3）。**本物の攻撃（Combat.tentacleAttack）を順番に呼ぶ。**
  //   盤に敵はいないので当たりは出ない（形・場・名前の表示だけ見える）。狙いの敵は「倒れている見本」を渡すので、
  //   引き寄せの掴み（Combat.grab）は何もしない。代わりに腕の絵だけを同じ fx で出す。セーブにも盤にも触らない（場と fx は消えるまで進めて片づける）
  tentacleDemo(only) {
    const run = Game.run;
    if (!run || !run.stage) return;
    const st = run.stage, hx = (st.vec && st.vec.hexes) || [];
    const cx = st.w / 2;
    let h = null;
    for (const c of hx) { if (c.y > st.h * 0.5 || c.y < 90) continue; if (!h || Math.abs(c.x - cx) < Math.abs(h.x - cx)) h = c; }
    if (!h) return;
    const def = WEAPONS.tentacle;
    const w = { id: 'tentacle', def, x: h.x, y: h.y - 95, angle: Math.PI / 2, s: Object.assign({}, def.base), dyn: {}, flags: {} };
    const t = { x: h.x, y: h.y + 20, r: 10, dead: true, ang: Math.PI / 2 };   // ang … 敵の進む向き（触手の壁の向き）。見本は下向き
    const order = only ? [only] : ['pull', 'stab', 'sweep', 'wall', 'ink', 'cut'];
    let n = 0, last = performance.now(), el = 0;
    const fire = () => {
      const k = order[n++];
      Combat.tentacleAttack(w, run, t, k, 0);
      if (k === 'pull') run.fx.push({ type: 'tentacle', x1: w.x, y1: w.y, e: { x: t.x, y: t.y + 70, r: 10, dead: false }, color: def.color, ph: 0, life: 0.6, t: 0 });   // 掴まれた敵に見立てた点（遠めに置く）
    };
    fire();
    clearInterval(this._tn);
    this._tn = setInterval(() => {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; el += dt;
      if (Game.run !== run) { clearInterval(this._tn); return; }
      if (n < order.length && el > n * 1.1) fire();
      for (let i = run.fx.length - 1; i >= 0; i--) { const f = run.fx[i]; f.t += dt; if (f.t >= f.life) run.fx.splice(i, 1); }
      for (let i = run.fields.length - 1; i >= 0; i--) { const f = run.fields[i]; if (f.kind !== 'tentwall' && f.kind !== 'ink') continue; f.t += dt; if (f.t >= f.dur) run.fields.splice(i, 1); }
      for (let i = run.nums.length - 1; i >= 0; i--) { const q = run.nums[i]; q.t += dt; q.y -= dt * 34; if (q.t >= q.life) run.nums.splice(i, 1); }
      if (n >= order.length && !run.fx.length && !run.fields.some(f => f.kind === 'tentwall' || f.kind === 'ink') && !run.nums.length) clearInterval(this._tn);
    }, 16);
  },

  // 札の新しい挙動の見本（2026-09-30 段3b）。裏の準備フェーズの盤に、**その札を掛けた武器を1基**と、**動かない的**を並べ、本物の戦闘（Combat.update）を数秒だけ進める。
  //   的は、武器の向きにまっすぐ通る道の上（見える範囲の上の半分から探す。下半分は確認室のパネルが覆う）。装甲・耐火の札は、それを試せる敵（ファイアウォール・ボット群）にする。
  //   **セーブにも配置にも触らない**：武器は run.units に一時的に足すだけ（placeUnit は通らない）。run 側の値（chillVuln・cageVuln・apen など）・与ダメージの記録は、終わりに元へ戻す。
  _CDKEEP: ['chillVuln', 'cageVuln', 'apen', 'backdraft', 'tntBurn', 'tntMark', 'coinMul', 'livesMax', 'lives', 'livesCard', 'resonanceStep', 'resonanceMax', 'dealt', 'kills', 'coinsEarned'],
  _cdEnd() {
    clearInterval(this._cd);
    const d = this._cdState; this._cdState = null;
    if (!d) return;
    const run = d.run;
    run.units = d.orig;                // 見本の武器だけを盤に置いていた（本物の配置は退かせてあった）ので、元の配列を返す
    for (const en of d.enemies) en.dead = true;
    run.enemies = run.enemies.filter(en => !d.enemies.includes(en));
    run.fields.length = 0; run.bullets.length = 0; run.fx.length = 0; run.nums.length = 0;
    for (const k of this._CDKEEP) { if (d.keep[k] === undefined) delete run[k]; else run[k] = d.keep[k]; }
    if (run.dmgBy) for (const k of Object.keys(run.dmgBy)) delete run.dmgBy[k];
    if (run.killBy) for (const k of Object.keys(run.killBy)) delete run.killBy[k];
  },
  cardDemo(cardId) {
    const run = Game.run, c = CARDS[cardId];
    if (!run || !run.stage || !c) return;
    this._cdEnd();
    const st = run.stage, hx = (st.vec && st.vec.hexes) || [];
    // 連携の札（requires）は、相手の武器と触手を並べて見せる（触手が印を付け、相手の武器がその敵を打つ）
    const syn = c.kind === 'synergy' && c.requires ? c.requires : null;
    const wid = syn ? syn.find(x => x !== 'tentacle') : (c.weapon || 'gatling');
    const def = WEAPONS[wid];
    // 置き場所と向き：上の半分の通路の六角のうち、6方向のどれかへ 200px まっすぐ歩ける所（長いほど良い・真ん中に近いほど良い）
    let best = null;
    for (const h of hx) {
      if (h.y > st.h * 0.5 || h.y < 80) continue;
      for (const a of Game.FACES) {
        let len = 0;
        for (let d = 10; d <= 220; d += 10) {
          if (!st.walkable(((h.x + Math.cos(a) * d) / TILE) | 0, ((h.y + Math.sin(a) * d) / TILE) | 0)) break;
          len = d;
        }
        const sc = len - Math.abs(h.x - st.w / 2) * 0.05;
        if (!best || sc > best.sc) best = { sc, h, a, len };
      }
    }
    if (!best) return;
    const u = Game.newUnit(wid, best.h.c, best.h.r, best.a);
    const keep = {};
    for (const k of this._CDKEEP) keep[k] = run[k];
    // 札を掛ける（最大の重ねまで・凸は 0）。ラン側の値は applyCardRun が書く
    const n = c.maxStack || 1;
    const orig = run.units; run.units = [u];
    if (syn) {   // 触手を、的が並ぶ線の上の近い六角へ同じ向きで置く（射界は固定なので、線から外れると的を狙えない）
      let h2 = null, bd = 1e9;
      for (const h of hx) {
        const dx = h.x - best.h.x, dy = h.y - best.h.y, d = Math.hypot(dx, dy);
        if (d < 20 || d > 150) continue;
        const perp = Math.abs(-Math.sin(best.a) * dx + Math.cos(best.a) * dy);
        const sc = perp * 3 + d * 0.2;
        if (sc < bd) { bd = sc; h2 = h; }
      }
      if (h2) run.units.push(Game.newUnit('tentacle', h2.c, h2.r, best.a));
    }
    for (let i = 0; i < n; i++) { Game.applyCardRun(cardId, run); Game.applyCardUnit(cardId, run, u); }
    // 的
    const armor = ['gat_barrels', 'gas_toxic', 'mtr_wide', 'gen_ap', 'msl_multi'].includes(cardId), fire = cardId === 'flm_inferno';
    const t = armor ? ENEMY_TYPES.shield : fire ? ENEMY_TYPES.swarm : ENEMY_TYPES.grunt;
    const g = Math.max(Combat.gw(run), fire ? 26 : armor ? 16 : 1);
    const enemies = [];
    const L = Math.max(90, best.len), N = 6;
    for (let i = 0; i < N; i++) {
      const dd = 45 + (L - 60) * i / (N - 1);
      const ex = best.h.x + Math.cos(best.a) * dd + Math.sin(best.a) * (i % 2 ? 7 : -7), ey = best.h.y + Math.sin(best.a) * dd - Math.cos(best.a) * (i % 2 ? 7 : -7);
      const en = Combat.makeEnemy(run, t, g, ex, ey, 0, 1e12);
      en.spd = 0; en.lane = null; en.res = fire ? { fire: true } : en.res;
      if (armor) en.armor = BAL.armorCut;   // 装甲の見本（割合カット）
      run.enemies.push(en); enemies.push(en);
    }
    // 指定攻撃（泡・迫撃砲）は、的の真ん中へ円を置く
    if (def.aimPoint) { const m = enemies[(N / 2) | 0]; u.ax = m.x; u.ay = m.y; u.aim = { x: m.x, y: m.y }; }
    this._cdState = { run, u, enemies, keep, orig };
    let last = performance.now(), el = 0;
    this._cd = setInterval(() => {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; el += dt;
      if (Game.run !== run || el > 7) { this._cdEnd(); return; }
      Combat.update(run, dt);
    }, 16);
    UI.toastMsg('見本：' + c.name + '（約7秒）', BAL.rarity[c.rarity].color, 'demo');
  },

  bossBattle() {
    this._btEnd();
    this._dirEnd();     // 向きの花の見本が出ていたら先に片づける（配置の記録の写しが、ボス戦のあとの書き戻しと食い違わないように）
    this._btSnap = { perm: JSON.parse(JSON.stringify(Game.perm)), meta: JSON.parse(JSON.stringify(Game.meta)) };
    this._saveHold();
    const perm = Game.perm, cur = perm.currentStage, orig = Game.stageUnlocked;
    let run;
    try { Game.stageUnlocked = () => true; run = Game.startPrep('ch10'); }
    finally { Game.stageUnlocked = orig; perm.currentStage = cur; }
    this._btRun = run;
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
    for (const [name, keys, extra] of this.groups()) {
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
      if (extra) el.appendChild(extra());
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
    this._cdEnd();
    this._btEnd();
    this._dirEnd();
    clearInterval(this._skRapid);
    UI.skillFxClear();
    this._skHost = null;
    this.packTabClose();
    this.rarityClose();
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    UI.closeModal();
    Main.toHome();
  },
};
