// ---------------------------------------------------------------
// scenes.js : 画面の外（現実の部屋）へ視点を引く場面
//
//   企画書（docs/WORLD-BIBLE-v1.0.md）
//     §28 再起動（転生）のとき、一時的にゲーム画面から視点を引く。CRT テレビや PC の置かれた現実の部屋が見え、
//         テレビや周りからニュースや広告が断片的に流れる（AI競争・AIによるハッキング・AIの求人・社会でのAI利用）。
//         長い説明はしない。見せるだけ。そのあとゲーム画面に戻って報酬を受け取る
//     §19 CRT・走査線は「現実とゲームをつなぐ窓」として、タイトルと再起動の移り変わりでだけ使う
//     §4  違う年代の物が同じ部屋にある（CRT・ベージュのPC・黒電話・新聞・スマートフォン）
//     §30 演出でゲームを止めない ── **約3秒・どこを触っても飛ばせる**
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

  _pick(list, n) {
    const a = list.slice(), out = [];
    while (a.length && out.length < n) out.push(a.splice((Math.random() * a.length) | 0, 1)[0]);
    return out;
  },

  // ---------------------------------------------------------------
  // 起動：（初めてだけ）オープニング → タイトル → ホーム
  //   タイトルは毎回出す。**「TAP TO START」の1タップが、音を鳴らせるようにするタップを兼ねる**
  //   （ブラウザは最初のタップまで音を出させない）ので、1タップ増えるわけではない
  //   URL に ?packdemo（開封の見本）や ?notitle があるときは出さない
  // ---------------------------------------------------------------
  boot() {
    setTimeout(() => this.loadRoom(), 4000);   // 再起動の部屋の画像を、起動が落ち着いてから裏で読む
    const q = new URLSearchParams(location.search);
    if (q.get('packdemo') || q.has('notitle')) return;
    if (!Game.perm.seenOpening) this.opening(() => { Game.perm.seenOpening = 1; Game.save(); this.title(); });
    else this.title();
  },

  // タイトル：ブラウン管が点いて、題字が出る（企画書 §19「CRT はタイトルで使う・現実とゲームをつなぐ窓」）
  title(done) {
    const el = Util.el('div', 'ttl');
    el.innerHTML =
      '<div class="ttl-crt"><div class="ttl-in">' +
        '<div class="ttl-mark">' + (typeof CardFX !== 'undefined' ? CardFX.logoSvg() : '') + '</div>' +
        '<div class="ttl-name">エクスメントマキナ</div>' +
        '<div class="ttl-sub">RETRO DEFENDER</div>' +
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
  prepare() {
    this.loadRoom();
    const pick = this._pick(this.NEWS, 3);
    const ad = this._pick(this.ADS, 2);
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
    this._prep = { pick, cv: room };
  },

  // 再起動の場面。終わったら（または触って飛ばしたら）done を呼ぶ
  reboot(done) {
    if (!this._prep) this.prepare();
    const { pick, cv } = this._prep;
    this._prep = null;
    const el = Util.el('div', 'rbscene');
    el.innerHTML = '<div class="rb-box">' +
      '<div class="rb-screen"><div class="rb-game"><b>エクスメントマキナ</b></div><div class="rb-news"><b>NEWS</b><span>' + pick[2] + '</span></div><i class="rb-scan"></i></div></div>' +
      '<div class="rb-skip">タップで飛ばす</div>';
    // 現実の部屋は写実寄り（src/room.js・ユーザー 2026-09-28「リアル寄りの生成に」・参考画像の暗さと汚れ）
    el.querySelector('.rb-box').prepend(cv);
    document.body.appendChild(el);
    let ended = false;
    const end = () => {
      if (ended) return; ended = true;
      el.classList.add('out');
      setTimeout(() => { el.remove(); done && done(); }, 260);
    };
    el.addEventListener('pointerdown', end);
    try { Snd.noise({ dur: 0.18, vol: 0.08, f: 3200, q: 0.5 }); } catch (e) {}   // 画面が切れる「ブツッ」
    requestAnimationFrame(() => el.classList.add('pull'));          // ゲームの画面がテレビの中へ縮む
    setTimeout(() => { if (!ended) el.classList.add('news'); }, 900);
    setTimeout(() => {                                               // もう一度テレビの中へ入っていく
      if (ended) return;
      el.classList.add('dive');
      try { Snd.tone({ type: 'sine', f0: 180, f1: 900, dur: 0.45, vol: 0.05 }); } catch (e) {}
    }, 2350);
    setTimeout(end, 2950);
  },
};
