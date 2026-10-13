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
    return CARD_IDS.filter(id => CARDS[id].rarity === rar && !CARDS[id].upper && !['weapon', 'perm', 'key', 'fusion'].includes(CARDS[id].kind)).slice(0, n || 1);
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
    for (const x of [sn.unit].concat(sn.extra || [])) { if (run && x) { const i = run.units.indexOf(x); if (i >= 0) run.units.splice(i, 1); } }
    if (sn.card) { if (sn.card.had === undefined) delete Game.perm.collection[sn.card.id]; else Game.perm.collection[sn.card.id] = sn.card.had; }   // 合成の流れの見本（fuseDemo）：借りた札を戻す
    if (sn.capFn) Game.costCap = sn.capFn;
    FusionFX._arm = null;
    Game.perm.placements = sn.placements; Game.perm.lastPlace = sn.lastPlace; Game.perm.tut = sn.tut;
    if (UI.selected === sn.unit) UI.selected = null;
    if (run) run.capUp = false;   // 全撤去を光らせる見本（capDemo）の印
    try { Game.applyMods(); } catch (e) {}
    UI.renderTray();
  },
  // 「隣り合う異種で強め合う」の見本（2026-10-05）：真ん中の武器のまわりに、違う種類を3つ・同じ種類を1つ置く。
  //   線（違う種類の隣どうし）・武器の詳細の内訳「隣の異種 レート+45%」が見える。同じ種類は線も数にも入らない。もう一度押す・片づけるで戻る
  adjDemo() {
    this.dirDemo('mid');
    const run = Game.run;
    if (!this._dirSnap || !run) return;
    const u = this._dirSnap.unit, st = run.stage;
    const ids = Game.loadoutWeapons().filter(w => w !== u.id);
    const order = ids.concat(Object.keys(WEAPONS).filter(w => w !== u.id && ids.indexOf(w) < 0));
    const free = MapGen.hexNbr(u.c, u.r).filter(q => st.hexBuildable(q[0], q[1]) && !Game.unitAt(q[0], q[1]));
    const extra = [];
    const kinds = [order[0], order[1], order[2], u.id];     // 最後は同じ種類（数えない）
    for (let i = 0; i < kinds.length && i < free.length; i++) {
      const o = Game.newUnit(kinds[i], free[i][0], free[i][1], Game.FACES[0]);
      run.units.push(o); extra.push(o);
    }
    this._dirSnap.extra = extra;
    Game.applyMods();
    for (const o of extra) if (Game.usesAimPoint(o.def)) { const ap = Game.defaultAimPoint(o); o.ax = ap.x; o.ay = ap.y; }
    UI.renderTray();
    UI.renderUnitPop();
    console.log('adjDemo', run.units.map(x => x.id + ':' + (x.adjTypes || []).length + ':' + (x.adjAdd || 0).toFixed(2)).join(' '));
  },
  // 「コストの上限が上がった直後」の見本：見本の武器を1基置き、全撤去のボタンを光らせて通知を出す（もう一度押す・片づけるで戻る）。
  //   全撤去を押すと見本の武器も外れる（配置の記録は _dirEnd が書き戻す）
  capDemo() {
    this.dirDemo('mid');
    const run = Game.run;
    if (!this._dirSnap || !run) return;
    run.capUp = true;
    UI.toastMsg('コストの上限アップ', '#ffc24a', 'capup');
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
        ['準備フェーズの帯', cut('準備フェーズ', '', 'prep')],
        ['ウェーブの帯', cut('WAVE 3<em> / ' + W + '</em>', '', 'wave')],
        ['最終ウェーブの帯', cut('WAVE ' + W + '<em> / ' + W + '</em>', '最終ウェーブ', 'last')],
        ['ボスの帯', () => { UI.cutinBoss(W); setTimeout(() => UI.sysWarn('boss'), 2100); }],
        ['BOSS DOWN（あと2体）', () => UI.cutinBossDown(2)],
        ['ボス戦の見本（第10章・2体）', () => me.bossBattle()],
        ['ボス：ワーム（鎖の体・予告→高速移動・動いている間は節が大ダメージ）', () => me.bossBattle('worm')],
        ['ボス：ルートキット（大きい・硬い・防壁は控えめ・予告→直前に削った武器が半分）', () => me.bossBattle('rootkit')],
        ['ボス：ジャマー（機械・沈黙・予告→近い4基へ腕が伸びて止まる。遠くの武器は止まらない）', () => me.bossBattle('jammer')],
        ['上位の敵：トロイ（硬くて遅い・倒すとパケットをこぼす）', () => me.upperBattle('trojan')],
        ['上位の敵：ランサムウェア（南京錠・まわりの敵のダメージを減らす点線の輪）', () => me.upperBattle('ransom')],
        ['上位の敵：ゴースト（物理を無効・弾がすり抜ける・頭の上に「物」の斜線）', () => me.upperBattle('ghost')],
        ['上位の敵：ファラデー（属性を無効・テスラの連鎖が止まる）', () => me.upperBattle('faraday')],
        ['上位の敵：サンドボックス（場を無効・ガスと泡が効かない）', () => me.upperBattle('sandbox')],
        ['上位の敵：ポリモーフ（約4秒ごとに無効の系統が 物理→光学→属性→場 と切り替わる・色と輪）', () => me.upperBattle('polymorph')],
        ['上位の敵：ゼロデイ（弱点以外は半分・頭の上の金の縁の印が弱点）', () => me.upperBattle('zeroday')],
        ['妨害：ジャマー兵（点線の輪の中の武器を2基ずつ止める・金の縁の合成武器は止まらない）', () => me.upperBattle('jamsol')],
        ['妨害：クラッシャー（道の隣の武器に赤い照準→壊す・金の縁の合成武器は狙わない）', () => me.upperBattle('crusher')],
        ['かつてのボス（縮小版）：ワーム', () => me.upperBattle('mini:worm')],
        ['かつてのボス（縮小版）：ルートキット', () => me.upperBattle('mini:rootkit')],
        ['かつてのボス（縮小版）：ジャマー', () => me.upperBattle('mini:jammer')],
        ['ラスボス：フォーマッタ（蛇の節・頭が弱点・視点が頭を追う）', () => me.finalBattle('walk')],
        ['ラスボス：噛みつき（予告で大顎が開く→近い武器が1基壊れて残骸が残る）', () => me.finalBattle('bite')],
        ['ラスボス：レーザー（近い6基へ線→撃てなくなる）', () => me.finalBattle('laser')],
        ['ラスボス：耐性（頭を削った武器の種類が半分・黄色い六角の板）', () => me.finalBattle('resist')],
        ['ラスボス：撃退（ウェーブ1で HP が80%まで減って退く）', () => me.finalBattle('retreat')],
        ['ラスボス：撃破（ウェーブ5・倒したときの演出）', () => me.finalBattle('kill')],
        ['第30章の準備の一言（コストの上限が低いとき・6秒）', () => { UI._lowCostDemo = true; UI.renderTut(); setTimeout(() => { UI._lowCostDemo = false; UI.renderTut(); }, 6000); }],
        ['ラスボスの撃退・撃破の帯', () => { UI.cutinRetreat({ n: 1, wave: 1, left: 0.8 }); setTimeout(() => UI.cutinFinalDown(), 3200); }],
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
        ['スキップ（一括通過）', () => UI.toastMsg('5章 通過', '#ffb43c', 'skip')],
        ['ステージ選択', () => UI.toastMsg('第7章 を選択', '#ff8a1f', 'select')],
        ['置く地面をタップ', () => UI.toastMsg('地面をタップ', '#ff5a3c', 'place')],
        ['注意（編成なし）', () => UI.toastMsg('武器を1つ以上編成してください', '#ff8080', 'warn')],
        ['ロック（開いていない）', () => UI.toastMsg('第10章を突破すると開きます', '#ff8080', 'lock')],
        ['コストが足りない', () => UI.toastMsg('コスト不足', '#ff8080', 'limit')],
        ['コストの上限が上がった（全撤去が光る）', () => me.capDemo()],
        ['隣り合う異種で強め合う（線・レートが上がる・同じ種類は数えない）', () => me.adjDemo()],
        ['システム', () => UI.toastMsg('処理の重さを表示', '#ff8a1f', 'sys')],
        ['エラー', () => UI.toastMsg('出せませんでした：見本', '#ff4a66', 'error')],
        ['連続で6個（差し替わる）', () => ['weapon', 'wave', 'buy', 'warn', 'card', 'lock'].forEach((k, i) => setTimeout(() =>
          UI.toastMsg(['新しい武器 ガトリング', 'ウェーブ ' + (i + 1) + ' 突破', '3件 購入　コイン 900', 'コスト不足', '取得: 見本のカード', '開いていません'][i], '#ffc24a', k), i * 260))],
      ]],
      ['合成武器（A＋B＝C・2026-10-06）', me._fusionButtons()],
      ['合成武器の札（A：その合成武器だけの3択の札24枚／B：合成どうしの連携の札11枚・2026-10-12）', me._fusionCardButtons()],
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
        ['再起動の場面（部屋・タップで次の文へ・SKIP で飛ばす）', () => Scenes.reboot(null)],
        ['パック圧縮のテレビ（待ち画面 → 部屋・タップで進む・初回の3文）', () => Scenes.compress(() => UI.exchFx(PACKS.u_arms, { M: BAL.ascExchPacks, C: 1e6 }), 3)],
        ['パック圧縮のテレビ（2回目から・1文）', () => Scenes.compress(null, 1)],
        ['コストの表示（置いた0 → 6割 → 8割 → 上限・順に5秒）', () => UI.costDemo()],
        ['指揮官の記録', () => UI.openProfile(true)],
        ['パックのタブ（見本の所持数）', () => me.packTab()],
        ['アセンション専用のガチャ画面（交換の窓・上位パック5種）', () => me.packTab(true)],
        ['上位パックへの交換の演出（斜めの帯・100→1）', () => UI.exchFx(PACKS.u_arms, { M: BAL.ascExchPacks, C: Asc.exchangeCoin({ stages: { ch33: { cleared: true } }, exchN: 0 }) })],
        ['上位パックを開ける（上位の連携・見本の中身）', () => me.upperOpen('u_syn')],
        ['上位パックを開ける（上位の常駐）', () => me.upperOpen('u_relic')],
        ['図鑑（種類ごとのタブ・強化と連携は武器ごとのチップ）', () => me.collTab()],
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
  //   asc＝true：アセンション専用の見本（上位の5つ・交換の窓）。基本×120・兵装×100（交換できる）・化学×40・常駐×100（コインが足りない見本にするため、コインは兵装だけ足りる額）・連携×3。
  //   交換は見本の perm・meta の中だけで起きる（本物の Asc.exchange）。実セーブは変わらない
  upperOpen(pid) {
    const ids = Pack.open(pid, 0);
    CardFX.open(PACKS[pid], ids, ids.map(() => ({ n0: 0, n1: 1 })), ids.map(() => true), null);
  },
  packTab(asc) {
    this.packTabClose();
    const perm = JSON.parse(JSON.stringify(Game.perm));
    perm.packs = { basic: 5, arms: 0, chem: 1, syn: 0, relic: 2, u_basic: 0, u_arms: 0, u_chem: 0, u_syn: 0, u_relic: 0 };
    perm.deepest = 12; perm.prestiges = 3; perm.legacyDeep = 9;      // 格3：基本・兵装・化学・常駐が開き、連携（格4）だけ未開放
    let meta = { coins: 0 };
    if (!asc) delete perm.asc;       // 本物のセーブがアセンション中でも、ふつうの見本はアセンション前の形
    if (asc) {
      perm.packs = { basic: 120, arms: 100, chem: 40, syn: 3, relic: 100, u_basic: 1, u_arms: 0, u_chem: 0, u_syn: 2, u_relic: 0 };
      perm.deepest = 33; perm.prestiges = 8; perm.legacyDeep = 30; perm.asc = { lv: 6, exp: 0, total: 0 }; perm.exchN = 2;
      perm.stages = {}; for (let i = 1; i <= 33; i++) perm.stages['ch' + i] = { cleared: true };
      meta = { coins: Asc.exchangeCoin(perm) * 1.6 };
    }
    perm.missions = perm.missions || {};
    const el = Util.el('div', 'rs fx dbgpk');
    el.innerHTML = '<div class="rs-ban"><em>// DEBUG ROOM</em><b>パックのタブ（見本）</b><span>切り替える・開ける・まとめて開ける が押せます（セーブは変わりません）</span></div>';
    const body = Util.el('div', 'dbgpk-b');
    const demo = {
      perm, meta, gachaPick: asc ? 'u_arms' : 'basic', _gsFx: 'go',
      render: () => { body.innerHTML = ''; UI.panelPacks(body, demo); },
      open1: (pid) => PACKS[pid].upper ? this.upperOpen(pid) : CardFX.demo('rare'),
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
    el.innerHTML = '<div class="rs-ban"><em>// DEBUG ROOM</em><b>図鑑（見本）</b><span>タブ（武器・強化・連携・汎用・常駐・鍵・上位・敵）を切り替えて確かめる</span></div>';
    const body = Util.el('div', 'dbgpk-b');
    const draw = () => { body.innerHTML = ''; UI.panelCollection(body, draw); };
    draw();
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
    const pool = (r) => CARD_IDS.filter(id => CARDS[id].rarity === r && !['weapon', 'perm', 'key', 'fusion'].includes(CARDS[id].kind));
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

  // 合成武器の見本（2026-10-06・fusion.js）
  //   fuseDemo … 盤の真ん中に A を置き、隣に B を置く。**合成の札を借りて**（見本が終わったら戻す）合成ボタン「合」が A の左上に光る。本物のボタンを押せる
  //     （1回目のタップで札が開き、2回目で合成）。コストの上限は見本のあいだだけ広げる。セーブは触らない（_dirEnd が配置・札・上限を戻す）
  //   fusionDemo … 合成した武器を1基と、動かない的6体を並べ、本物の戦闘（Combat.update）で約7秒撃たせる（札の見本 cardDemo と同じ作り）
  _fusionButtons() {
    const me = this;
    const out = [
      ['見本の部屋：異界の剣（大きく映す・時刻を止める・前後で24種）', () => me.showroom('voidblade')],
      ['見本の部屋：スターアサルト', () => me.showroom('starassault')],
      ['見本の部屋：プラズマボール', () => me.showroom('resonator')],
      ['合成の流れ：異界の剣（刀＋触手・コスト8）→「合」を2回タップ', () => me.fuseDemo('voidblade')],
      ['合成の流れ：相反の渦（凍結＋火炎・コスト9）', () => me.fuseDemo('vortex')],
      ['合成の流れ：スターアサルト（ガトリング＋手裏剣・コスト4）', () => me.fuseDemo('starassault')],
      ['合成の流れ：コストが足りないとき（「合」が薄い・押すと理由）', () => me.fuseDemo('icefoam', true)],
      ['片づける', () => me._dirEnd()],
    ];
    for (const fid of FUSION_IDS) {
      const f = FUSIONS[fid];
      out.push([f.name + '（' + WEAPONS[f.a].name + '＋' + WEAPONS[f.b].name + '・コスト' + f.cost + '）', () => me.fusionDemo(fid)]);
    }
    return out;
  },
  fuseDemo(fid, poor) {
    const f = FUSIONS[fid];
    this.dirDemo('mid', f.a);
    const run = Game.run;
    if (!this._dirSnap || !run) return;
    const u = this._dirSnap.unit, st = run.stage;
    const free = MapGen.hexNbr(u.c, u.r).filter(q => st.hexBuildable(q[0], q[1]) && !Game.unitAt(q[0], q[1]));
    if (!free.length) { UI.toastMsg('隣に置ける六角がありません', '#ff4a66', 'error'); return; }
    const b = Game.newUnit(f.b, free[0][0], free[0][1], Game.FACES[0]);
    run.units.push(b);
    this._dirSnap.extra = [b];
    this._dirSnap.card = { id: Fusion.cardId(fid), had: Game.perm.collection[Fusion.cardId(fid)] };
    Game.perm.collection[Fusion.cardId(fid)] = 1;
    this._dirSnap.capFn = Game.costCap;
    const used = WEAPONS[f.a].cost + WEAPONS[f.b].cost;
    Game.costCap = poor ? () => Game.costUsed() + 1 : () => 200;
    Game.applyMods();
    for (const o of [u, b]) if (Game.usesAimPoint(o.def)) { const ap = Game.defaultAimPoint(o); o.ax = ap.x; o.ay = ap.y; }
    UI.selected = null;
    UI.renderTray();
    UI.toastMsg('見本：' + f.name, f.color, 'demo');
  },
  fusionDemo(fid) {
    const run = Game.run, f = FUSIONS[fid];
    if (!run || !run.stage || !f) return;
    this._cdEnd();
    const st = run.stage, hx = (st.vec && st.vec.hexes) || [];
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
    const u = Game.newUnit(f.a, best.h.c, best.h.r, best.a);
    u.fuse = fid;
    u.s = Object.assign({}, u.def.base, BAL.fusion[fid].stat);
    u.s.arc = u.arc;
    const keep = {};
    for (const k of this._CDKEEP) keep[k] = run[k];
    const orig = run.units; run.units = [u];
    const t = ENEMY_TYPES.grunt, g = Math.max(Combat.gw(run), 1);
    const enemies = [];
    const L = Math.max(90, best.len), N = 6;
    for (let i = 0; i < N; i++) {
      const dd = 45 + (L - 60) * i / (N - 1);
      const ex = best.h.x + Math.cos(best.a) * dd + Math.sin(best.a) * (i % 2 ? 7 : -7), ey = best.h.y + Math.sin(best.a) * dd - Math.cos(best.a) * (i % 2 ? 7 : -7);
      const en = Combat.makeEnemy(run, t, g, ex, ey, 0, 1e12);
      en.spd = 0; en.lane = null;
      run.enemies.push(en); enemies.push(en);
    }
    if (u.def.aimPoint) { const m = enemies[(N / 2) | 0]; u.ax = m.x; u.ay = m.y; u.aim = { x: m.x, y: m.y }; }
    this._cdState = { run, u, enemies, keep, orig };
    let last = performance.now(), el = 0;
    this._cd = setInterval(() => {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; el += dt;
      if (Game.run !== run || el > 7) { this._cdEnd(); return; }
      Combat.update(run, dt);
    }, 16);
    UI.toastMsg('見本：' + f.name + '（約7秒）', f.color, 'demo');
  },

  // ---------------------------------------------------------------
  // 合成武器の見本の部屋（2026-10-12 段1・設計 docs/FUSION-ART-DIRECTION-2026-10-12.md）
  //   合成武器を1種、盤の真ん中あたりに置き、前に動かない的を並べ、**視点を寄せて大きく映す**（見本のあいだだけ Render.zoom）。
  //   時刻のボタン：t=0 に**1発だけ**撃たせ、その時刻まで 1/60 秒ずつ進めて止める。押すたびに最初から・乱数を固定してやり直すので、
  //     同じ時刻は必ず同じ絵になる（「撃つ瞬間・飛ぶ途中・当たり・余韻」を止めて見比べる）。コマ送りも同じ作り
  //   再生：本物の撃ち方（連射）のまま動かし続ける。止めると、その場で止まる
  //   セーブは変えない：武器は run.units に一時的に置くだけ（配置の記録に書かない）・保存は止める・run 側の値は終わりに戻す。的は倒れない（HP 1e12）
  // ---------------------------------------------------------------
  //   face … 武器の向き（度・Game.FACES のどれか）／ foes … 的の位置 [前へ, 横へ]（盤の px）／ times … 4つの時刻と名前／ look … 映す中心（武器から前へ）／ w … 画面の横幅に映す盤の幅
  //   hold … 吹き続ける武器（爆裂放射器・相反の渦）。時刻で止めるときも1発にせず、本物と同じに撃ち続けたままその時刻まで進める（乱数は固定のまま）
  SR: {
    starassault: { face: -90, foes: [[70, 0], [105, 3], [140, -3], [175, 2], [210, -2], [250, 0]], times: [[0.07, '撃つ'], [0.2, '飛ぶ'], [0.4, '当たり'], [0.75, '余韻']], look: 125, w: 300 },
    voidblade: { face: -30, foes: [[80, -140], [100, -80], [75, -20], [110, 30], [85, 90], [105, 150]], times: [[0.04, '斬撃'], [0.2, '裂ける'], [0.6, '触手'], [2.45, '閉じる']], look: 85, w: 330 },
    resonator: { face: -90, foes: [[150, 0], [128, -48], [176, 44], [196, -30], [112, 40], [226, 10]], times: [[0.05, '出る'], [0.2, '放電'], [0.36, '電撃'], [4.38, '消える']], look: 150, w: 300 },
  },
  SR_DEF: { face: -90, foes: [[60, 0], [95, -14], [130, 12], [165, -10], [200, 8], [240, 0]], times: [[0.05, '撃つ'], [0.2, '飛ぶ'], [0.5, '当たり'], [1.0, '余韻']], look: 120, w: 300 },
  _srRng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  },
  showroom(fid) {
    const run = Game.run;
    if (!run || !run.stage || !FUSIONS[fid]) return;
    this._cdEnd(); this._dirEnd();
    if (!this._sr) {
      const keep = {};
      for (const k of this._CDKEEP.concat(['time'])) keep[k] = run[k];
      this._sr = { run, keep, orig: run.units, enemies: [], fid, T: 0, mode: 'frozen' };
      this._saveHold();
      if (this.el) this.el.style.display = 'none';
      document.body.classList.add('sr-on');   // チュートリアルの札を隠す（style.css）
      this._srBar();
    }
    const S = this._sr;
    S.fid = fid;
    // 置く六角：向きの前がなるべく通路で（的が道の上に並ぶ）、盤の真ん中に近い所
    const cfg = this.SR[fid] || this.SR_DEF, st = run.stage, a = cfg.face * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
    const need = Math.max.apply(null, cfg.foes.map(q => q[0])) + 20;
    let best = null;
    for (const h of (st.vec && st.vec.hexes) || []) {
      let len = 0;
      for (let d = 20; d <= need; d += 10) { if (!st.walkable(((h.x + ux * d) / TILE) | 0, ((h.y + uy * d) / TILE) | 0)) break; len = d; }
      const sc = len - Util.dist(h.x, h.y, st.w / 2, st.h * 0.55) * 0.12;
      if (!best || sc > best.sc) best = { sc, h };
    }
    if (!best) return;
    S.h = best.h;
    Render.zoom = { x: S.h.x + ux * cfg.look, y: S.h.y + uy * cfg.look, s: Render.cssW / cfg.w, cy: 0.4 };
    Render.fit();
    this._srTimes();
    this.srAt(cfg.times[2][0]);
  },
  // 武器と的を最初の状態に作り直す
  _srBuild() {
    const S = this._sr, run = S.run, f = FUSIONS[S.fid], cfg = this.SR[S.fid] || this.SR_DEF;
    clearInterval(this._srPlay);
    run.fields.length = 0; run.bullets.length = 0; run.fx.length = 0; run.nums.length = 0;
    if (run.fzones) run.fzones.length = 0; if (run.later) run.later.length = 0;
    for (const en of S.enemies) en.dead = true;
    run.enemies = run.enemies.filter(en => !S.enemies.includes(en));
    run.time = 0; run.shake = 0;
    const a = cfg.face * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
    const u = Game.newUnit(f.a, S.h.c, S.h.r, a);
    u.fuse = S.fid;
    u.s = Object.assign({}, u.def.base, BAL.fusion[S.fid].stat);
    u.s.arc = u.arc;
    run.units = [u];
    const t = ENEMY_TYPES.grunt, g = Math.max(Combat.gw(run), 1), enemies = [];
    for (const [d, off] of cfg.foes) {
      const en = Combat.makeEnemy(run, t, g, u.x + ux * d - uy * off, u.y + uy * d + ux * off, 0, 1e12);
      en.spd = 0; en.lane = null;
      run.enemies.push(en); enemies.push(en);
    }
    if (u.def.aimPoint) { const m = enemies[(enemies.length / 2) | 0]; u.ax = m.x; u.ay = m.y; u.aim = { x: m.x, y: m.y }; }
    S.u = u; S.enemies = enemies;
  },
  // 1/60 秒を1回。single … 最初の1発のあとは撃たせない（時刻を止めて見るとき）
  _srStep(i, single) {
    const S = this._sr, run = S.run, cfg = this.SR[S.fid] || this.SR_DEF;
    Combat.update(run, 1 / 60);
    run.shake = 0;
    run.nums.length = 0;   // ダメージの数字は出さない（的の HP が 1e12 なので、最大HPの割合で削る効果が「833M」のような数字で演出を覆う）
    if (i === 0) {
      if (single && !cfg.stream) S.u.cd = 1e9;   // stream … 噴きっぱなしの武器（フランベルジュ・ヴォルケイノブラスト）は止めた時刻でも撃ち続ける
      // 撃った弾の線の上に的を並べ直す（散らばりで外れないように）・見本の弾は壁で止めない（盤によっては的の手前が壁なので）
      const b = run.bullets.find(q => q.src === S.u);
      if (b && !cfg.stream) {   // 噴きっぱなしの武器は並べ直さない（射界の外へ的が動き、炎が当たらなくなる）
        const sp = Math.hypot(b.vx, b.vy) || 1, vx = b.vx / sp, vy = b.vy / sp;
        cfg.foes.forEach(([d, off], k) => { const en = S.enemies[k]; if (en) { en.x = b.ox + vx * d - vy * off; en.y = b.oy + vy * d + vx * off; } });
      }
    }
    for (const b of run.bullets) if (b.src === S.u) b.through = true;
  },
  // 時刻 T で止める（最初からやり直し・乱数を固定）
  srAt(T) {
    const S = this._sr;
    if (!S) return;
    T = Math.max(1 / 60, T);
    this._srBuild();
    S.mode = 'frozen';
    const R = Math.random;
    Math.random = this._srRng(20261012);
    try {
      S.u.cd = 0;
      const n = Math.round(T * 60), hold = !!(this.SR[S.fid] || this.SR_DEF).hold;
      for (let i = 0; i < n; i++) this._srStep(i, !hold);
      S.T = n / 60;
    } finally { Math.random = R; }
    this._srLabel();
  },
  srFrame(dir) {
    const S = this._sr;
    if (!S) return;
    if (S.mode === 'frozen') return this.srAt(S.T + dir / 60);
    clearInterval(this._srPlay); S.mode = 'paused';
    if (dir > 0) { this._srStep(-1, false); S.T += 1 / 60; }
    this._srLabel();
  },
  srPlay() {
    const S = this._sr;
    if (!S) return;
    if (S.mode === 'play') { clearInterval(this._srPlay); S.mode = 'paused'; this._srLabel(); return; }
    if (S.mode === 'frozen') { this._srBuild(); S.u.cd = 0; S.T = 0; }
    S.mode = 'play';
    let last = performance.now(), i = S.T > 0 ? -1 : 0;
    this._srPlay = setInterval(() => {
      if (Game.run !== S.run || !this._sr) { clearInterval(this._srPlay); return; }
      const now = performance.now();
      let n = Math.min(4, Math.round((now - last) / (1000 / 60)));
      if (n > 0) last = now;
      while (n-- > 0) { this._srStep(i, false); i = -1; S.T += 1 / 60; }
      if (S.T > 8) { this._srBuild(); S.u.cd = 0; S.T = 0; i = 0; }
      this._srLabel();
    }, 16);
    this._srLabel();
  },
  srNext(d) {
    const S = this._sr;
    if (!S) return;
    const i = FUSION_IDS.indexOf(S.fid), n = FUSION_IDS.length;
    this.showroom(FUSION_IDS[((i + d) % n + n) % n]);
  },
  // 見本の部屋の操作の帯（画面の下）
  _srBar() {
    const bar = Util.el('div', 'srbar');
    bar.id = 'srbar';
    bar.innerHTML = '<div class="sr-top"><button class="dbg-key sr-prev">◀ 前</button><div class="sr-name"></div><button class="dbg-key sr-next">次 ▶</button><button class="dbg-key sr-x">閉じる</button></div>' +
      '<div class="sr-times"></div>' +
      '<div class="sr-ctl"><button class="dbg-key sr-play">▶ 再生</button><button class="dbg-key sr-b">− コマ</button><button class="dbg-key sr-f">+ コマ</button><div class="sr-t"></div></div>';
    const on = (sel, fn) => bar.querySelector(sel).addEventListener('click', () => { try { fn(); } catch (e) { console.error('見本の部屋', e); } });
    on('.sr-prev', () => this.srNext(-1)); on('.sr-next', () => this.srNext(1)); on('.sr-x', () => this.srEnd());
    on('.sr-play', () => this.srPlay()); on('.sr-b', () => this.srFrame(-1)); on('.sr-f', () => this.srFrame(1));
    document.body.appendChild(bar);
    this._srEl = bar;
  },
  _srTimes() {
    const S = this._sr, el = this._srEl;
    if (!S || !el) return;
    const f = FUSIONS[S.fid], cfg = this.SR[S.fid] || this.SR_DEF;
    el.querySelector('.sr-name').innerHTML = '<b style="color:' + f.color + '">' + f.name + '</b><span>' + WEAPONS[f.a].name + '＋' + WEAPONS[f.b].name + '　' + (FUSION_IDS.indexOf(S.fid) + 1) + ' / ' + FUSION_IDS.length + '</span>';
    const row = el.querySelector('.sr-times');
    row.innerHTML = '';
    for (const [t, name] of cfg.times) {
      const b = Util.el('button', 'dbg-key');
      b.innerHTML = name + '<small>' + t.toFixed(2) + 's</small>';
      b.addEventListener('click', () => this.srAt(t));
      row.appendChild(b);
    }
  },
  _srLabel() {
    const S = this._sr, el = this._srEl;
    if (!S || !el) return;
    el.querySelector('.sr-t').textContent = 't = ' + S.T.toFixed(3) + 's' + (S.mode === 'play' ? '' : '　停止');
    el.querySelector('.sr-play').textContent = S.mode === 'play' ? '⏸ 止める' : '▶ 再生';
  },
  // 重さ：いま止めている絵の、合成武器の演出だけを n 回描いた1回あたりの時間（ms）。最後に1回だけ getImageData(1px) で描き終わりを待つ（GPU の分も入る）。
  //   **ページを開いてから1回だけ測る。**getImageData を一度呼ぶと Chrome がこのキャンバスを CPU 描きに切り替え、そのあとの数字は別物になる
  srPerf(n) {
    const run = Game.run, ctx = Render.ctx, k = Render.scale * Render.dpr;
    n = n || 200;
    const fx = run.fx.filter(f => f.type === 'fx'), bl = run.bullets.filter(b => b.fx);
    const one = () => {
      ctx.save(); ctx.setTransform(k, 0, 0, k, Render.offX * Render.dpr, Render.offY * Render.dpr);
      FusionFX.zones(ctx, run); FusionFX.zonesOver(ctx, run);
      if (bl.length) FusionFX.bullets(ctx, bl, run);
      for (const f of fx) FusionFX.draw(ctx, f, f.t / f.life, Render);
      ctx.restore();
    };
    for (let i = 0; i < 5; i++) one();                       // 作り置きの絵とグラデーションを先に作る
    const t0 = performance.now();
    for (let i = 0; i < n; i++) one();
    const js = (performance.now() - t0) / n;
    ctx.getImageData(0, 0, 1, 1);
    const all = (performance.now() - t0) / n;
    return { js: +js.toFixed(4), withGpu: +all.toFixed(4), n, scale: +Render.scale.toFixed(3), dpr: Render.dpr, fx: fx.length, zones: (run.fzones || []).length, bullets: bl.length };
  },
  srEnd() {
    clearInterval(this._srPlay);
    const S = this._sr;
    if (!S) return;
    this._sr = null;
    const run = S.run;
    run.units = S.orig;
    for (const en of S.enemies) en.dead = true;
    run.enemies = run.enemies.filter(en => !S.enemies.includes(en));
    run.fields.length = 0; run.bullets.length = 0; run.fx.length = 0; run.nums.length = 0;
    if (run.fzones) run.fzones.length = 0; if (run.later) run.later.length = 0;
    for (const k of Object.keys(S.keep)) { if (S.keep[k] === undefined) delete run[k]; else run[k] = S.keep[k]; }
    if (run.dmgBy) for (const k of Object.keys(run.dmgBy)) delete run.dmgBy[k];
    if (run.killBy) for (const k of Object.keys(run.killBy)) delete run.killBy[k];
    Render.zoom = null; Render.fit();
    if (this._srEl) { this._srEl.remove(); this._srEl = null; }
    if (this.el) this.el.style.display = '';
    document.body.classList.remove('sr-on');
    this._saveRelease();
  },

  // 札の新しい挙動の見本（2026-09-30 段3b）。裏の準備フェーズの盤に、**その札を掛けた武器を1基**と、**動かない的**を並べ、本物の戦闘（Combat.update）を数秒だけ進める。
  //   的は、武器の向きにまっすぐ通る道の上（見える範囲の上の半分から探す。下半分は確認室のパネルが覆う）。装甲・耐火の札は、それを試せる敵（ファイアウォール・ボット群）にする。
  //   **セーブにも配置にも触らない**：武器は run.units に一時的に足すだけ（placeUnit は通らない）。run 側の値（chillVuln・cageVuln・apen など）・与ダメージの記録は、終わりに元へ戻す。
  _CDKEEP: ['chillVuln', 'cageVuln', 'apen', 'backdraft', 'tntBurn', 'tntMark', 'coinMul', 'livesMax', 'lives', 'livesCard', 'resonanceStep', 'resonanceMax', 'dealt', 'kills', 'coinsEarned'],
  _cdEnd() {
    clearInterval(this._cd);
    this._flViewEnd();           // 連携の札の見本の視点・隠したメニューを戻す（_flView）
    const d = this._cdState; this._cdState = null;
    if (!d) return;
    const run = d.run;
    run.units = d.orig;                // 見本の武器だけを盤に置いていた（本物の配置は退かせてあった）ので、元の配列を返す
    for (const en of d.enemies) en.dead = true;
    run.enemies = run.enemies.filter(en => !d.enemies.includes(en));
    run.fields.length = 0; run.bullets.length = 0; run.fx.length = 0; run.nums.length = 0;
    if (run.fzones) run.fzones.length = 0; if (run.later) run.later.length = 0;      // 合成武器の場・遅れて起きること（fusion.js）
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

  // 合成武器の札の見本（2026-10-12・cards.js の fp_*／fl_*）
  //   3択の見本（UI.showDraft）と、札ごとの戦闘の見本。戦闘の見本は cardDemo と同じ作り：札を掛けた合成武器を1基（連携の札は2つの合成武器）と動かない的6体を並べ、本物の戦闘（Combat.update）で約8秒撃たせる。セーブには触らない
  _fusionCardButtons() {
    const me = this;
    const A = CARD_IDS.filter(id => CARDS[id].fpick), B = CARD_IDS.filter(id => CARDS[id].flink);
    const out = [
      ['3択：合成武器だけの札（エピック3枚）', () => UI.showDraft(A.slice(0, 3))],
      ['3択：合成武器だけの札（別の3枚）', () => UI.showDraft(A.slice(9, 12))],
      ['3択：合成どうしの連携の札（レジェンド3枚）', () => UI.showDraft(B.slice(0, 3))],
      ['3択：連携の札入り（レジェンド・エピック・コモン）', () => UI.showDraft([B[3], A[4], me._cards('common', 1)[0]])],
      ['片づける', () => me._cdEnd()],
    ];
    for (const id of A.concat(B)) {
      const c = CARDS[id], names = (c.flink || [c.fusion]).map(f => FUSIONS[f].name).join('＋');
      out.push([(c.flink ? '連携　' : '合成　') + c.name + '（' + names + '）　' + UI.shortDesc(c), () => me.fusionCardDemo(id)]);
    }
    return out;
  },
  //   札の見本の置き方：A を拠点の六角に、2つ目を「的が並ぶ線の近くの六角」へ同じ向きで置き、的は線の上に6体。指定攻撃（泡・迫撃砲・ミサイル）は的の真ん中へ円。
  //     連携の札11枚すべてで、約7秒のうちにその札の効果が起きることを tools/measure/fusion-cardlayout.js で数えてある（置き方を変えたら回し直す）
  _flBest() {
    const run = Game.run, st = run.stage, hx = (st.vec && st.vec.hexes) || [];
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
    return best;
  },
  // 札の見本の盤を組む（戦闘は回さない）。fusionCardDemo と、測定（tools/measure/fusion-cardlayout.js）が同じものを使う。run.units は見本の武器だけに差し替える（元は返り値の orig）
  _flBuild(cardId) {
    const run = Game.run, c = CARDS[cardId];
    if (!run || !run.stage || !c) return null;
    const hx = (run.stage.vec && run.stage.vec.hexes) || [];
    const best = this._flBest();
    if (!best) return null;
    const ca = Math.cos(best.a), sa = Math.sin(best.a);
    const units = [];
    (c.flink || [c.fusion]).forEach((fid, i) => {
      let h = best.h;
      if (i > 0) {   // 2つ目は、的が並ぶ線の近くの六角へ同じ向きで（射界は固定なので、線から外れると的を狙えない）
        let bd = 1e9;
        for (const q of hx) {
          const dx = q.x - best.h.x, dy = q.y - best.h.y, d = Math.hypot(dx, dy);
          if (d < 20 || d > 150) continue;
          const sc = Math.abs(-sa * dx + ca * dy) * 3 + d * 0.2;
          if (sc < bd) { bd = sc; h = q; }
        }
      }
      const u = Game.newUnit(FUSIONS[fid].a, h.c, h.r, best.a);
      u.fuse = fid;
      u.s = Object.assign({}, u.def.base, BAL.fusion[fid].stat);
      u.s.arc = u.arc;
      units.push(u);
    });
    const keep = {};
    for (const k of this._CDKEEP) keep[k] = run[k];
    const orig = run.units; run.units = units;
    Game.applyCardRun(cardId, run);
    for (const u of units) Game.applyCardUnit(cardId, run, u);
    const t = ENEMY_TYPES.grunt, g = Math.max(Combat.gw(run), 1);
    const enemies = [];
    const L = Math.max(90, best.len), N = 6;
    for (let i = 0; i < N; i++) {
      const dd = 45 + (L - 60) * i / (N - 1);
      const ex = best.h.x + ca * dd + sa * (i % 2 ? 7 : -7), ey = best.h.y + sa * dd - ca * (i % 2 ? 7 : -7);
      const en = Combat.makeEnemy(run, t, g, ex, ey, 0, 1e12);
      en.spd = 0; en.lane = null;
      run.enemies.push(en); enemies.push(en);
    }
    const m = enemies[(N / 2) | 0];
    for (const u of units) if (u.def.aimPoint) { u.ax = m.x; u.ay = m.y; u.aim = { x: m.x, y: m.y }; }
    return { run, u: units[0], units, enemies, keep, orig, best };
  },
  fusionCardDemo(cardId) {
    const c = CARDS[cardId];
    this._cdEnd();
    const d = this._flBuild(cardId);
    if (!d) return;
    const run = d.run;
    this._cdState = d;
    this._flView(cardId, d);
    let last = performance.now(), el = 0;
    this._cd = setInterval(() => {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; el += dt;
      if (Game.run !== run || el > 8) { this._cdEnd(); return; }
      Combat.update(run, dt);
      run.nums.length = 0; run.shake = 0;   // ダメージの数字は出さない（的の HP が 1e12 なので「966M」のような数字が絵を覆う）・揺らさない
    }, 16);
  },
  // 札の見本のあいだの見せ方（見本の部屋 showroom と同じ扱い・2026-10-13）：確認室のメニューを隠す・2基と的が収まるよう視点を寄せて大きく映す・チュートリアルの札を隠す（sr-on）・下に名前と「閉じる」の帯。
  //   終わり（_cdEnd）で全部元に戻す
  _flView(cardId, d) {
    this._flViewEnd();
    const pts = d.units.map(u => ({ x: u.x, y: u.y })).concat(d.enemies.map(e => ({ x: e.x, y: e.y })));
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const pad = 95;     // 氷の嵐・泡・光の刃が2基と的の外へ広がる分
    const s = Math.min(2.4, Render.cssW / (x1 - x0 + 2 * pad), Render.cssH * 0.55 / (y1 - y0 + 2 * pad));
    this._flZ = true;
    Render.zoom = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s, cy: 0.42 };
    Render.fit();
    if (this.el) this.el.style.display = 'none';
    document.body.classList.add('sr-on');
    const c = CARDS[cardId], ids = CARD_IDS.filter(id => CARDS[id].flink), i = ids.indexOf(cardId);
    const bar = Util.el('div', 'srbar');
    bar.id = 'srbar';
    bar.innerHTML = '<div class="sr-top"><button class="dbg-key sr-prev">◀ 前</button><div class="sr-name"><b style="color:' + BAL.rarity[c.rarity].color + '">' + c.name + '</b><span>' +
      c.flink.map(f => FUSIONS[f].name).join('＋') + '　' + (i + 1) + ' / ' + ids.length + '</span></div><button class="dbg-key sr-next">次 ▶</button><button class="dbg-key sr-x">閉じる</button></div>';
    const on = (sel, fn) => bar.querySelector(sel).addEventListener('click', () => { try { fn(); } catch (e) { console.error('札の見本', e); } });
    on('.sr-prev', () => this.fusionCardDemo(ids[((i - 1) % ids.length + ids.length) % ids.length]));
    on('.sr-next', () => this.fusionCardDemo(ids[(i + 1) % ids.length]));
    on('.sr-x', () => this._cdEnd());
    document.body.appendChild(bar);
    this._flBar = bar;
  },
  _flViewEnd() {
    if (!this._flZ) return;
    this._flZ = false;
    Render.zoom = null; Render.fit();
    if (this._flBar) { this._flBar.remove(); this._flBar = null; }
    if (this.el) this.el.style.display = '';
    document.body.classList.remove('sr-on');
  },

  // kind（'worm'|'rootkit'|'jammer'）を渡すと、その個体を1体だけ出し、HP が 75% を割った直後に仕掛けを1回使わせる（見本・記録なし）。
  //   ジャマーは、ボスの近くにガトリング4基と、遠くに狙撃（レーザーライフル）3基を一時的に並べる（run.units に足すだけ。配置の記録には触れない）。近い4基だけに腕が伸びて止まる
  bossBattle(kind) {
    this._btEnd();
    this._dirEnd();     // 向きの花の見本が出ていたら先に片づける（配置の記録の写しが、ボス戦のあとの書き戻しと食い違わないように）
    this._btSnap = { perm: JSON.parse(JSON.stringify(Game.perm)), meta: JSON.parse(JSON.stringify(Game.meta)) };
    this._saveHold();
    const perm = Game.perm, cur = perm.currentStage, orig = Game.stageUnlocked;
    let run;
    try { Game.stageUnlocked = () => true; run = Game.startPrep('ch10'); }
    finally { Game.stageUnlocked = orig; perm.currentStage = cur; }
    this._btRun = run; run.demoGuard = true;     // 見本の武器はダメージを入れない（台本だけが HP を動かす）
    Render.fit(); UI.renderTray();
    run.phase = 'build'; run.wave = BAL.wavesPerStage - 1;
    const kindOrig = Combat.bossKindFor;
    if (kind) Combat.bossKindFor = () => kind;            // 見本のあいだだけ、全部この個体にする
    try { Game.startNextWave(); } finally { Combat.bossKindFor = kindOrig; }
    UI._bossKills = 0;
    UI.cutinWave(run.wave);
    const bosses = run.enemies.filter(e => e.boss);
    if (kind && bosses.length) {
      run.enemies = run.enemies.filter(e => e.boss ? e === bosses[0] : (e.seg ? e.seg === bosses[0] : true));
      bosses.length = 1;
    }
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
      // 個体の見本は、視点をボスに追わせる（1006c・スマホ幅では盤が画面に収まらず、ボスが画面の外の口から出て見えなかった）。
      //   盤が画面に収まるとき（canPan が偽）は何もしない
      if (kind && bosses[0] && !bosses[0].dead && Render.canPan()) {
        const b = bosses[0];
        Render.cam.x += (b.x - Render.viewW / 2 - Render.cam.x) * 0.25;
        Render.cam.y += (b.y - Render.viewH / 2 - Render.cam.y) * 0.25;
        Render.fit();
      }
      const inSh = bosses.some(b => !b.dead && Combat.inShield(run, b));
      const steps = inSh ? 6 : 1;
      let sig = null;
      for (let i = 0; i < steps; i++) sig = Combat.update(run, dt) || sig;
      if (!inSh && tOut === null) tOut = now;
      if (kind && tOut !== null) {
        const b = bosses[0];
        if (!b._demoHit) {
          b._demoHit = true;
          if (kind === 'jammer') {
            const all = run.stage.hexCells().map(h => { const c = run.stage.hexCenter(h.c, h.r); return { h, d: Util.dist(b.x, b.y, c.x, c.y) }; })
              .filter(o => o.d > 50).sort((p, q) => p.d - q.d);
            const used = new Set(run.units.map(u => u.c + ',' + u.r));
            const free = all.filter(o => !used.has(o.h.c + ',' + o.h.r));
            for (const o of free.slice(0, 4)) run.units.push(Game.newUnit('gatling', o.h.c, o.h.r));
            const far = free.filter(o => o.d > 230), step = Math.max(1, Math.floor(far.length / 3));
            for (let i = 0; i < 3 && i * step < far.length; i++) run.units.push(Game.newUnit('sniper', far[i * step].h.c, far[i * step].h.r));
          }
          Combat.damage(run, b, b.hp - b.maxHp * 0.74, { by: 'gatling', src: null, demo: true });
        }
        if (b.ph >= 1 && !b.tele && !b.dead) {
          b._phEnd = b._phEnd || now;
          if (now - b._phEnd > 25000) Combat.damage(run, b, b.maxHp * 2, { by: 'debug' });
        }
      } else if (tOut !== null) {
        const el = (now - tOut) / 1000;
        bosses.forEach((b, i) => { if (!b.dead && el >= 0.8 + i * 2.6) Combat.damage(run, b, b.maxHp * 2, { by: 'debug' }); });
      }
      if (sig === 'stageclear' || sig === 'waveclear') { done = true; UI.toastMsg('ボス戦の見本：全部倒してウェーブ終了（見本・記録なし）', '#ffc24a', 'demo'); doneAt = now; }
      if (now - t0 > 60000) { done = true; doneAt = now; }
    }, 16);
  },

  // 上位の敵（アセンション・UPPER_TYPES）を1体だけ出す見本（記録なし）。口の近くに、物理（ガトリング）・光学（レーザー）・属性（テスラ）・場（毒ガス）を並べて、
  //   どの武器が効くか・すり抜けるかを見せる。視点は敵に追わせる（ボスの見本と同じ）。倒れる／コアに届く／約40秒で終わる
  upperBattle(kind) {
    this._btEnd();
    this._dirEnd();
    this._btSnap = { perm: JSON.parse(JSON.stringify(Game.perm)), meta: JSON.parse(JSON.stringify(Game.meta)) };
    this._saveHold();
    const perm = Game.perm, cur = perm.currentStage, orig = Game.stageUnlocked;
    let run;
    try { Game.stageUnlocked = () => true; run = Game.startPrep('ch10'); }
    finally { Game.stageUnlocked = orig; perm.currentStage = cur; }
    this._btRun = run; run.demoGuard = true;     // 見本の武器はダメージを入れない（台本だけが HP を動かす）
    Render.fit(); UI.renderTray();
    run.phase = 'build'; run.wave = 1;
    const wcOrig = Combat.waveCount;
    Combat.waveCount = () => 0;            // 雑魚は出さない（見本の1体だけ）
    try { Game.startNextWave(); } finally { Combat.waveCount = wcOrig; }
    const mini = kind.indexOf('mini:') === 0 ? kind.slice(5) : null;
    const st = run.stage, t = mini ? { jp: Combat.BOSS_KIND[mini].jp + '（縮小版）', en: Combat.BOSS_KIND[mini].en, color: Combat.BOSS_KIND[mini].col } : UPPER_TYPES[kind];
    const sp = st.spawns[0], p = st.center(sp.c, sp.r);
    // 4つの系統の武器を2基ずつ、**通り道が射界に入る六角と向き**を選んで置く（射界は固定・向きは6方向なので、決め打ちでは当たらない）。
    //   口のバリアの4タイルより先の通り道の点を、武器の射程の中・向きの線から 14px 以内・壁に切られずに見通せる、で数えて多い所
    const rt = st.routes[0] || [];
    const pts = [];
    for (let i = 6; i < rt.length; i++) pts.push(st.center(rt[i] % st.cols, Math.floor(rt[i] / st.cols)));
    const used = new Set(run.units.map(u => u.c + ',' + u.r));
    const cells = st.hexCells();
    const clear = (x0, y0, x1, y1) => {
      const n = Math.max(2, Math.ceil(Util.dist(x0, y0, x1, y1) / 12));
      for (let k = 1; k < n; k++) { const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n; if (!st.walkable((x / TILE) | 0, (y / TILE) | 0)) return false; }
      return true;
    };
    const ids = ['gatling', 'sniper', 'tesla', 'gas', 'gatling', 'tesla', 'gas', 'sniper'];
    for (const id of ids) {
      const range = WEAPONS[id].base.range;
      let best = null;
      for (const h of cells) {
        if (used.has(h.c + ',' + h.r)) continue;
        const c = st.hexCenter(h.c, h.r);
        for (const f of Game.FACES) {
          let n = 0;
          for (const q of pts) {
            const dx = q.x - c.x, dy = q.y - c.y, along = dx * Math.cos(f) + dy * Math.sin(f);
            if (along < 50 || along > range * 0.9) continue;
            if (Math.abs(-dx * Math.sin(f) + dy * Math.cos(f)) > 14) continue;
            if (clear(c.x, c.y, q.x, q.y)) n++;
          }
          if (!best || n > best.n) best = { n, h, f };
        }
      }
      if (best && best.n > 0) { used.add(best.h.c + ',' + best.h.r); run.units.push(Game.newUnit(id, best.h.c, best.h.r, best.f)); }
    }
    // 妨害の見本：最初のガトリングを合成武器（スターアサルト）にして、妨害が効かないことを並べて見せる
    if (t.sab) { const u = run.units.find(x => x.id === 'gatling'); if (u) { u.fuse = 'starassault'; Game.applyMods(); } }
    const g = 1;     // 見本の武器は札なしの素の強さなので、HPは第1ウェーブ並み（倒れる様子まで見えるように）
    let e;
    if (mini) {
      e = Combat.spawnMini(run, mini, 0);           // run.enemies に積まれる（ワームは体の鎖も）
      e.hp = e.maxHp = e.maxHp * 0.1;
      for (const x of run.enemies) if (x.seg === e) x.hp = x.maxHp = e.maxHp;
      e.spd *= 0.5;
    } else {
      e = Combat.makeEnemy(run, t, g, p.x, p.y, 0);
      e.hp = e.maxHp = e.maxHp * 0.1;                 // 見本のHP：本物の1割（見本の武器は札なしの素の強さ）
      e.spd *= 0.3;                                   // 見本なので、ゆっくり歩かせる（武器との関係を見る時間をとる）
      run.enemies.push(e);
    }
    UI.toastMsg('見本：' + t.jp + '（' + t.en + '・約40秒）', t.color, 'demo');
    let t0 = performance.now(), last = t0, doneAt = 0;
    this._bt = setInterval(() => {
      if (!this.el || Game.run !== run) { this._btEnd(); return; }
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (doneAt) {
        Combat.update(run, dt);
        if (!run.fx.length || now - doneAt > 2500) this._btEnd();
        return;
      }
      const lead = (!e.dead && e) || run.enemies.find(x => !x.dead && x.upper) || run.enemies.find(x => !x.dead && !x.seg);
      if (lead && Render.canPan()) {
        Render.cam.x += (lead.x - Render.viewW / 2 - Render.cam.x) * 0.25;
        Render.cam.y += (lead.y - Render.viewH / 2 - Render.cam.y) * 0.25;
        Render.fit();
      }
      const inSh = run.enemies.some(x => !x.dead && Combat.inShield(run, x));
      for (let i = 0; i < (inSh ? 6 : 1); i++) Combat.update(run, dt);
      // 縮小版のボス：4秒ごとに HP を節目の直前まで下げて、仕掛け（跳躍・防壁・腕の沈黙）を本来どおり出させる
      if (mini && !e.dead && (e.ph || 0) < 3 && !e.tele && now - t0 > 4000 * ((e.ph || 0) + 1)) e.hp = Math.min(e.hp, e.maxHp * (BAL.bossPhaseAt[e.ph || 0] - 0.01));
      if (now - t0 > 40000 && !e.dead) Combat.damage(run, e, e.maxHp * 2, { by: 'debug' });   // 倒しきれない見本は、40秒で片づける
      if (!run.enemies.some(x => !x.dead) || now - t0 > 52000) doneAt = now;
    }, 16);
  },

  // ラスボスの見本（第30章の盤・セーブは変えない）。act：walk＝歩くだけ／bite・laser・resist＝その仕掛けを1回／retreat＝ウェーブ1で退く／kill＝ウェーブ5で倒す。
  //   頭の近くにガトリングを足す（run.units に足すだけ・配置の記録には触れない）。HP を節目の直前まで一気に減らして、仕掛けを出させる。視点は頭を追う（スマホ幅）
  finalBattle(act) {
    this._btEnd();
    this._dirEnd();
    this._btSnap = { perm: JSON.parse(JSON.stringify(Game.perm)), meta: JSON.parse(JSON.stringify(Game.meta)) };
    this._saveHold();
    const perm = Game.perm, cur = perm.currentStage, orig = Game.stageUnlocked;
    let run;
    try { Game.stageUnlocked = () => true; run = Game.startPrep('ch30'); }
    finally { Game.stageUnlocked = orig; perm.currentStage = cur; }
    this._btRun = run; run.demoGuard = true;     // 見本の武器はダメージを入れない（台本だけが HP を動かす）
    Render.fit(); UI.renderTray();
    run.phase = 'build'; run.wave = (act === 'kill' || act === 'resist') ? BAL.wavesPerStage - 1 : 0;      // 耐性は HP を71%まで削るので、撃退の線（ウェーブ1〜4）を越えないよう最後のウェーブで出す
    Game.startNextWave();
    UI._bossKills = 0; UI._finalKillSeen = false;
    UI.cutinWave(run.wave);
    const b = run.finalHead;
    if (b && ['walk', 'bite', 'laser', 'resist'].indexOf(act) >= 0) b.spd *= 0.4;     // 見本のあいだだけ遅く歩かせる（仕掛けを見る約25秒のうちにコアへ着いて負けないように）
    if (!b) { UI.toastMsg('ラスボスが出ませんでした（BAL.finalOn）', '#ff4a66', 'error'); this._btEnd(); return; }
    let t0 = performance.now(), tOut = null, done = false, doneAt = 0, last = t0, armed = false, phEnd = 0;
    this._bt = setInterval(() => {
      if (!this.el || Game.run !== run) { this._btEnd(); return; }
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (done) {
        Combat.update(run, dt);
        if (!run.fx.length || now - doneAt > 2500) this._btEnd();
        return;
      }
      if (!b.dead && Render.canPan()) {
        Render.cam.x += (b.x - Render.viewW / 2 - Render.cam.x) * 0.25;
        Render.cam.y += (b.y - Render.viewH / 2 - Render.cam.y) * 0.25;
        Render.fit();
      }
      const inSh = !b.dead && Combat.inShield(run, b);
      let sig = null;
      for (let i = 0; i < (inSh ? 6 : 1); i++) sig = Combat.update(run, dt) || sig;
      if (!inSh && tOut === null) tOut = now;
      if (tOut !== null && !armed) {
        armed = true;
        const all = run.stage.hexCells().map(h => { const c = run.stage.hexCenter(h.c, h.r); return { h, d: Util.dist(b.x, b.y, c.x, c.y) }; })
          .filter(o => o.d > 50).sort((p, q) => p.d - q.d);
        const used = new Set(run.units.map(u => u.c + ',' + u.r));
        for (const o of all.filter(o => !used.has(o.h.c + ',' + o.h.r)).slice(0, 8)) run.units.push(Game.newUnit('gatling', o.h.c, o.h.r));
        const to = (frac) => Combat.damage(run, b, Math.max(0, b.hp - b.maxHp * frac), { by: 'gatling', src: null, demo: true });
        if (act === 'bite') to(0.91);
        else if (act === 'laser') { b.ph = 1; run.finalPh = 1; to(0.85); }
        else if (act === 'resist') { b.ph = 2; run.finalPh = 2; b.rec.gatling = 1; to(0.71); }
        else if (act === 'retreat') to(0.79);
        else if (act === 'kill') { b.ph = 9; run.finalPh = 9; to(0.3); }
      }
      if (armed && ['bite', 'laser', 'resist'].indexOf(act) >= 0 && !b.dead) {
        if (b.ph >= (act === 'bite' ? 1 : act === 'laser' ? 2 : 3) && !b.tele) { phEnd = phEnd || now; if (now - phEnd > 25000) { b.dead = true; } }
      }
      if (armed && act === 'kill' && !b.dead && now - tOut > 2500) Combat.damage(run, b, b.maxHp * 2, { by: 'debug' });
      if (act === 'walk' && !b.dead && tOut !== null && now - tOut > 25000) b.dead = true;
      if (sig === 'stageclear' || sig === 'waveclear') { done = true; UI.toastMsg('ラスボスの見本：終わり（見本・記録なし）', '#ffc24a', 'demo'); doneAt = now; }
      if (now - t0 > 90000) { done = true; doneAt = now; }
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
    this.srEnd();
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
