// ---------------------------------------------------------------
// scenes.js : 画面の外（現実の部屋）へ視点を引く場面
//
//   企画書（docs/WORLD-BIBLE-v1.0.md）
//     §28 再起動（転生）のとき、一時的にゲーム画面から視点を引く。CRT テレビや PC の置かれた現実の部屋が見え、
//         テレビや周りからニュースや広告が断片的に流れる（AI競争・AIによるハッキング・AIの求人・社会でのAI利用）。
//         長い説明はしない。見せるだけ。そのあとゲーム画面に戻って報酬を受け取る
//     §19 CRT・走査線は「現実とゲームをつなぐ窓」として、タイトルと再起動の移り変わりでだけ使う
//     §4  違う年代の物が同じ部屋にある（CRT・ベージュのPC・黒電話・新聞・スマートフォン）
//     §30 演出でゲームを止めない ── **飛ばせる**（2026-10-12：ユーザー「滞在時間が短く、読めない。タップして進めるように」→ 自動で進めず、
//         タップで次の文へ。右上の「SKIP」で最後まで飛ばす）
//   ニュースと広告の文はこちらで書いてよい（ユーザー 2026-09-28）。**話しかけてくる人物は出さない**（§26）
// ---------------------------------------------------------------
'use strict';

const Scenes = {
  // テレビと部屋に流す断片。1回の再起動で2〜3個だけ見せる
  NEWS: [
    'AI各社の演算競争　さらに加速',
    '大手銀行にAI経由の不正アクセス　被害は調査中',
    '自治体の窓口　今月からAIが一次受付',
    '次世代演算基盤「MAKINA」稼働へ',
    '深夜のサーバー障害　原因は「外部からの大量の問い合わせ」',
    '子どもの宿題　AI利用のルール作りへ',
    'AI同士の攻防　専門家「人の目では追えない速さ」',
  ],
  ADS: [
    '求人　AIオペレーター　未経験歓迎・在宅OK',
    'しゃべる冷蔵庫　新発売',
    'ブロードバンド　今なら月額1,980円',
    'あなたの家にも、かしこい相棒を。',
    '求人　夜間監視スタッフ　時給1,400円〜',
  ],

  // アセンション（パックの圧縮）のときにテレビへ流す文（2026-10-12・こちらで書いた）。再起動の文と同じ世界。AI の側が人の手を超えていく話
  ASC_NEWS: [
    '上位の侵入、各地で確認　従来の防壁では検知できず',
    '「100の断片を1つに圧縮」　新方式の演算基盤が稼働',
    'AI各社の学習データ、桁が変わる　専門家「もう追えない」',
    '深夜の大規模障害　原因は「人の手を離れた自動更新」',
    '圧縮された指示が、人の知らない場所で動き出す',
    '次世代基盤MAKINA　応答時間は「測定不能」',
    '監視スタッフ不足　夜間の防衛を外部委託へ',
  ],
  ASC_ADS: [
    '求人　上位オペレーター　経験者優遇・夜勤手当あり',
    'データ圧縮サービス　容量を気にせず保存。',
    'あなたの手で守れる、最後のネットワーク。',
  ],

  _pick(list, n) {
    const a = list.slice(), out = [];
    while (a.length && out.length < n) out.push(a.splice((Math.random() * a.length) | 0, 1)[0]);
    return out;
  },

  // ---------------------------------------------------------------
  // 起動：（初めてだけ）オープニング → タイトル → ホーム
  //   タイトルは毎回出す。**「TAP TO START」の1タップが、音を鳴らせるようにするタップを兼ねる**
  //   （ブラウザは最初のタップまで音を出させない）ので、1タップ増えるわけではない
  //   URL に ?packdemo（開封の見本）・?notitle・?debugroom（演出の確認室）があるときは出さない
  // ---------------------------------------------------------------
  boot() {
    setTimeout(() => this.loadRoom(), 4000);   // 再起動の部屋の画像を、起動が落ち着いてから裏で読む
    const q = new URLSearchParams(location.search);
    if (q.get('packdemo') || q.has('notitle') || q.has('debugroom')) return;
    if (!Game.perm.seenOpening) this.opening(() => { Game.perm.seenOpening = 1; Game.save(); this.title(); });
    else this.title();
  },

  // 題字の紋（2026-09-30 ユーザー決定 X1 の C3）：六角に X。タイトルとホームのロゴで使う。
  //   絵ではなく SVG を描き起こす（どの大きさでも滲まない）。色は 黒・オレンジ・黄色・白。回さない・光らせない（数字と同じ可読性の方針）
  //   カードの裏面・パック開封の箱の上は、いまも CardFX.logoSvg()（歯車のロゴ）のまま（替えるかはユーザーの判断・2026-09-30）
  markSvg() {
    return '<svg class="xmark" viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<polygon points="45,0 22.5,39 -22.5,39 -45,0 -22.5,-39 22.5,-39" fill="#0a0a0b" stroke="#ff8a1f" stroke-width="6"/>' +
      '<polygon points="31,0 15.5,27 -15.5,27 -31,0 -15.5,-27 15.5,-27" fill="none" stroke="#ffd21f" stroke-width="2.5" stroke-dasharray="10 6"/>' +
      '<path d="M-17,-19 L17,19 M17,-19 L-17,19" stroke="#fff" stroke-width="9" stroke-linecap="square"/>' +
      '<path d="M-17,-19 L17,19" stroke="#ff8a1f" stroke-width="3"/></svg>';
  },

  // タイトル（2026-09-30 X1）：ブラウン管が点く → 六角の紋が押される → 放送の帯が叩きつけられる → 題字が1字ずつ落ちる（企画書 §19「CRT はタイトルで使う」）。
  //   紋・帯・字の動きは CSS（.ttl.on の間だけ・fill-mode: both）。ふだんの見た目は出そろった状態なので、動きが止まる端末でも題字は出る
  title(done) {
    const el = Util.el('div', 'ttl');
    const name = 'エクスメントマキナ';
    el.innerHTML =
      '<div class="ttl-crt"><div class="ttl-in">' +
        '<i class="ttl-hex"></i><i class="ttl-hz h1"></i><i class="ttl-hz h2"></i>' +
        '<div class="ttl-osd"><i></i>REC ▶ CH-03</div>' +
        '<span class="ttl-emb">' + this.markSvg() + '</span>' +
        '<div class="ttl-band"><span class="ttl-t" role="img" aria-label="' + name + '">' +
          [...name].map((ch, i) => '<b style="--i:' + i + '">' + ch + '</b>').join('') + '</span>' +
          '<span class="ttl-e">RETRO DEFENDER</span></div>' +
        '<div class="ttl-start">TAP TO START</div>' +
        '<div class="ttl-pj">PROJECT MAKINA　ver ' + BUILD + '</div>' +
      '</div><i class="ttl-scan"></i></div>';
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    el.addEventListener('pointerdown', () => {
      if (el.classList.contains('off')) return;
      Snd.resume(); Snd.ui();
      el.classList.add('off');                        // 画面へ吸い込まれるように消える
      setTimeout(() => { el.remove(); done && done(); }, 480);
    });
  },

  // オープニング（初めて起動したときだけ）。**会話はここだけ**（企画書 §26）。
  //   ただし §32-6「他のキャラクターに話しかけられるイベントを入れない」ので、**プレイヤーに話しかけない**。
  //   古いパソコンの画面に、名前の無い2人のやり取り（チャットの記録）が打ち出されていくのを、横から覗くだけ。
  //   長い説明はしない（§7）。触ると飛ばせる
  OPENING: [
    ['23:41', 'sysop', '外からの接続、また増えてる'],
    ['23:41', 'guest02', '防壁は？'],
    ['23:42', 'sysop', '自動のほうは、もう追いつかない'],
    ['23:42', 'guest02', '…じゃあ、手で守るしかないな'],
    ['23:43', 'sysop', '起動する。　MAKINA / CORE'],
  ],
  opening(done) {
    const el = Util.el('div', 'opn');
    el.innerHTML = '<div class="opn-crt"><div class="opn-log"></div><i class="ttl-scan"></i></div><div class="rb-skip">タップで飛ばす</div>';
    document.body.appendChild(el);
    const log = el.querySelector('.opn-log');
    let ended = false, timer = 0;
    const end = () => {
      if (ended) return; ended = true; clearTimeout(timer);
      el.classList.add('off');
      setTimeout(() => { el.remove(); done && done(); }, 420);
    };
    el.addEventListener('pointerdown', () => { Snd.resume(); end(); });
    // 1行ずつ、1文字ずつ打ち出す
    let li = 0, ci = 0, cur = null;
    const step = () => {
      if (ended) return;
      if (li >= this.OPENING.length) { timer = setTimeout(end, 1300); return; }
      const [t, who, msg] = this.OPENING[li];
      if (!cur) {
        cur = Util.el('div', 'opn-line' + (who === 'sysop' ? ' a' : ' b'));
        cur.innerHTML = '<em>[' + t + ']</em> <b>' + who + '</b>: <span></span><i class="opn-cur"></i>';
        log.appendChild(cur); ci = 0;
      }
      const sp = cur.querySelector('span');
      sp.textContent = msg.slice(0, ++ci);
      if (ci % 2 === 0 && Snd.ctx && Snd.ctx.state === 'running') try { Snd.tone({ type: 'square', f0: 1200, f1: 1200, dur: 0.012, vol: 0.02 }); } catch (e) {}
      if (ci >= msg.length) { cur.querySelector('.opn-cur').remove(); cur = null; li++; timer = setTimeout(step, 520); }
      else timer = setTimeout(step, 55);
    };
    timer = setTimeout(step, 700);
  },

  // ---------------------------------------------------------------
  // 部屋の絵（2026-09-28・ユーザーが用意した画像）
  //   ユーザー「転生の時のブラウン管や冷蔵庫などは…現実世界に相当するため、リアル寄りの生成にしてください」→
  //   コードで描く絵では写真の質に届かないので、**文字を抜いた画像（assets/room.jpg・688×1504）を背景にし、
  //   文字（テレビのニュース・新聞の見出し・広告・メモ・スマートフォンの通知）だけをゲームが毎回重ねる。**
  //   画像ファイルを持たない決まりは、この1枚についてだけ外した（ユーザー了承）。
  //   **読み込めていないとき・読み込みに失敗したときは、コードで描く部屋（src/room.js）に戻る**ので、場面が壊れることはない。
  //   画像は起動してしばらくしてから、裏で読んでおく（起動を遅くしない）
  // ---------------------------------------------------------------
  ROOM_IMG: 'assets/room.jpg',
  MEMO: ['牛乳', '電池', '火曜 ゴミ'],
  loadRoom() {
    if (this._img) return;
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => { if (im.decode) im.decode().catch(() => {}); };
    im.src = this.ROOM_IMG;
    this._img = im;
  },
  roomReady() { return !!(this._img && this._img.complete && this._img.naturalWidth > 0); },

  // 部屋を先に用意しておく（再起動の確認を開いたとき・UI.confirmPrestige）。
  //   画像が使えるときは画像＋文字、使えないときはコードで描く（PC で約12〜100ミリ秒）
  prepare(kind) {
    this.loadRoom();
    const asc = kind === 'asc';
    const pick = this._pick(asc ? this.ASC_NEWS : this.NEWS, 4);   // [1]＝部屋の新聞／ほかの3つ＝テレビに順に流す
    const ad = this._pick(asc ? this.ASC_ADS : this.ADS, 2);
    let room;
    if (this.roomReady()) {
      room = document.createElement('div');
      room.className = 'rb-room rb-photo';
      const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
      room.innerHTML = '<img src="' + this.ROOM_IMG + '" alt="">' +
        '<div class="rbt rbt-poster">' + esc(ad[0]) + '</div>' +
        '<div class="rbt rbt-memo">' + this.MEMO.map(esc).join('<br>') + '</div>' +
        '<div class="rbt rbt-paper">' + esc(pick[1]) + '</div>' +
        '<div class="rbt rbt-phone"><b>23:44</b><div><i>通知</i>' + esc(ad[1]) + '</div></div>';
    } else {
      room = document.createElement('canvas');
      room.className = 'rb-room';
      Room.paint(room, { ad: ad[0], paper: pick[1], phone: ad[1], memo: this.MEMO });
    }
    this._prep = { pick, cv: room, kind: asc ? 'asc' : 'reboot' };
  },

  // 再起動の場面。終わったら（または SKIP したら）done を呼ぶ
  reboot(done) { this.tv('reboot', done); },
  // アセンション後のパックの圧縮（2026-10-12）：「パック圧縮中　しばらくお待ちください」の画面が引いて、再起動と同じ部屋のテレビへ。
  //   n … 流す文の数（初回は3つ・2回目から1つ。何度も交換する人を足止めしない）
  compress(done, n) { this.tv('asc', done, n); },

  // 前後のつなぎ（0929o）：ゲームの画面がブラウン管のように横一線に潰れて消え（0.3秒）→ ゲームの画面が点いて部屋へ縮む →
  //   部屋を出るときはまた横一線に潰れて消え（0.3秒）。動きは CSS（body.rb-off ／ .rbscene の crton・rbOff）
  // **進め方（2026-10-12・ユーザー「滞在時間が短く、読めない。タップして進めるように」）**：自動では進まない。
  //   テレビに最初の文が出たら、タップするたびに次の文へ。最後の文のあとのタップで、テレビの中へ入って閉じる。
  //   右上の「SKIP ▶▶」で最後まで飛ばす。60秒触られなければ閉じる（固まらないための保険）
  tv(kind, done, nLines) {
    if (!this._prep || this._prep.kind !== kind) this.prepare(kind);
    const { pick, cv } = this._prep;
    this._prep = null;
    const asc = kind === 'asc';
    const lines = [pick[0], pick[2], pick[3]].slice(0, asc && nLines ? nLines : 3);
    const n = lines.length;
    document.body.classList.add('rb-off');
    try { Snd.noise({ dur: 0.18, vol: 0.08, f: 3200, q: 0.5 }); } catch (e) {}   // 画面が切れる「ブツッ」
    setTimeout(() => {
      document.body.classList.remove('rb-off');
      const el = Util.el('div', 'rbscene' + (asc ? ' asc' : ''));
      const game = asc
        ? '<div class="rb-wait"><em>// PACK COMPRESSION</em><b>パック圧縮中</b><span>しばらくお待ちください</span><i class="rb-wbar"><u></u></i></div>'
        : '<b>エクスメントマキナ</b>';
      el.innerHTML = '<div class="rb-box">' +
        '<div class="rb-screen"><div class="rb-game">' + game + '</div><div class="rb-news"><b>NEWS</b><span></span></div><i class="rb-scan"></i></div></div>' +
        '<button class="rb-skipbtn" type="button">SKIP ▶▶</button>' +
        '<div class="rb-skip"><i class="rb-next">タップで次へ ▶</i><em class="rb-cnt"></em></div>';
      el.querySelector('.rb-box').prepend(cv);
      document.body.appendChild(el);
      const tx = el.querySelector('.rb-news span'), cnt = el.querySelector('.rb-cnt'), nxt = el.querySelector('.rb-next');
      const gameEl = el.querySelector('.rb-game');
      let phase = 'pre', idx = 0, ended = false, idle = 0;
      const timers = [];
      const later = (fn, ms) => timers.push(setTimeout(fn, ms));
      const end = () => {
        if (ended) return; ended = true;
        clearTimeout(idle); timers.forEach(clearTimeout);
        el.classList.add('out');                       // 横一線に潰れて消える（.3秒）
        setTimeout(() => { el.remove(); done && done(); }, 320);
      };
      const arm = () => { clearTimeout(idle); idle = setTimeout(end, 60000); };
      const show = (i) => {
        tx.textContent = lines[i];
        tx.classList.remove('sw'); void tx.offsetWidth; tx.classList.add('sw');   // 切り替わりに一瞬ぶれる（終わったら元の見た目）
        cnt.textContent = (i + 1) + ' / ' + n;
        nxt.textContent = i < n - 1 ? 'タップで次へ ▶' : 'タップで閉じる ▶';
        if (i > 0) { try { Snd.tone({ type: 'square', f0: 900, f1: 700, dur: 0.05, vol: 0.03 }); } catch (e) {} }
      };
      const pull = () => {                             // ゲームの画面がテレビの中へ縮み、文が出る
        if (phase !== 'pre') return;
        phase = 'pull'; el.classList.add('pull');
        later(() => { if (ended) return; phase = 'news'; el.classList.add('news', 'ready'); show(0); }, 820);
      };
      const dive = () => {                             // もう一度テレビの中へ入っていく
        phase = 'dive'; el.classList.add('dive'); el.classList.remove('ready');
        if (asc) gameEl.innerHTML = '<div class="rb-wait done"><em>// COMPLETE</em><b>圧縮完了</b></div>';
        try { Snd.tone({ type: 'sine', f0: 180, f1: 900, dur: 0.45, vol: 0.05 }); } catch (e) {}
        later(end, 900);
      };
      el.addEventListener('pointerdown', (ev) => {
        arm();
        if (ev.target.closest && ev.target.closest('.rb-skipbtn')) { ev.stopPropagation(); end(); return; }
        if (phase === 'pre') { if (asc) pull(); return; }          // 再起動は自動で縮む。圧縮の待ち画面は、触れば縮む
        if (phase === 'news') { if (idx < n - 1) show(++idx); else dive(); return; }
        if (phase === 'dive') end();
      });
      arm();
      later(pull, asc ? 1700 : 330);
    }, 300);
  },
};
