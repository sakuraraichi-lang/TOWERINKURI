// ---------------------------------------------------------------
// sortie.js : 出撃の瞬間の切り替え演出（0929s）
//
//   ホームの「出撃」を押してから、盤が出て準備フェーズに入るまで（約0.9秒）。
//     0.00  出撃ボタンが押し込まれて光る
//     0.00〜0.25  画面の縁から中心へ、暗い幕が閉じる（縁に六角の格子が点く）
//     0.13〜  斜めの帯が叩きつけられ、「SORTIE」が赤と青に割れて1字ずつ落ちる ／「// …」の英日の行 ／ 六角の衝撃波
//     0.33  幕が閉じきったところで、本当の切り替え（go）。盤を出し、準備フェーズを始める（出撃の処理そのものは変えない）
//     0.36〜0.86  中心から外へ、幕が開く（開く縁に六角の格子）。盤が点いて現れる
//     0.62  準備フェーズの帯（Main.toPrep に遅らせて頼む）
//   幕・帯は触れない（pointer-events:none）。盤は 0.36秒から触れる。二重に押されても1回だけ（_busy）。
//   動きが止まる端末でも幕は見えないのが元の状態（--sr の初期値＝開ききり）で、JS が 1.1秒で片付ける。
// ---------------------------------------------------------------
'use strict';

const Sortie = {
  _busy: false,
  T_GO: 330,        // 切り替えを行う時刻（幕が閉じきったあと）
  T_CUT: 640,       // 準備フェーズの帯を出す時刻（出撃の帯が抜けたあと）
  T_END: 1100,      // 片付ける時刻

  // st … 出撃する章（STAGES の要素）／ go … 切り替えの本体（Main.toBattle）
  play(st, go) {
    if (this._busy) return;
    this._busy = true;
    const btn = document.getElementById('homeStart');
    if (btn) {
      btn.classList.remove('srt-press'); void btn.offsetWidth;
      btn.classList.add('srt-press');
    }
    try { Snd.resume(); Snd.ui(); } catch (e) {}

    let n = 0;
    const title = Array.from('SORTIE').map(ch =>
      '<i class="cc" style="--d:' + (0.1 + n++ * 0.025).toFixed(3) + 's;--y:' + (-30 - ((n * 13) % 26)) + 'px">' + ch + '</i>').join('');
    const ov = Util.el('div', 'srt');
    ov.innerHTML = '<i class="srt-cover"></i><i class="srt-lat"></i>' +
      '<div class="srt-band"><i class="srt-bg"></i>' +
      '<div class="srt-kick">// LAUNCH SEQUENCE　出撃</div>' +
      '<b>' + title + '</b>' +
      '<span>' + (st && st.name ? st.name : '') + '　出撃</span></div>';
    document.body.appendChild(ov);

    // 叩きつけた瞬間の音と、帯の真ん中からの六角の衝撃波
    setTimeout(() => {
      try { Snd.waveStart(); } catch (e) {}
      const band = ov.querySelector('.srt-band');
      if (band && band.isConnected) {
        const r = band.getBoundingClientRect();
        CardFX.hexShock(ov, r.left + r.width / 2, r.top + r.height / 2, '#ff8a1f', true);
      }
    }, 140);

    // 本当の切り替え。準備フェーズの帯は、出撃の帯が抜けるまで待たせる
    setTimeout(() => {
      if (btn) btn.classList.remove('srt-press');
      UI._quiet = true;   // 既定の画面切り替えの光の線（.scrx）は出さない（この演出が代わりをする）
      try { go(this.T_CUT - this.T_GO); }
      finally { UI._quiet = false; }
    }, this.T_GO);

    setTimeout(() => { ov.remove(); this._busy = false; }, this.T_END);
  },

  // 確認室から：いま出ている画面の上に、幕と帯だけを出す（切り替えは行わない・セーブは変わらない）
  demo() {
    const st = STAGES[6];
    this.play(st, () => {});
  },
};
