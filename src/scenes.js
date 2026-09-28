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

  // 部屋の絵（SVG）。暗い部屋を、テレビの光だけが照らしている
  _roomSvg(news, ad, paper, phone) {
    return '<svg class="rb-room" viewBox="0 0 375 812" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs>' +
        '<radialGradient id="rbGlow" cx="50%" cy="34%" r="60%"><stop offset="0" stop-color="#ff9a3c" stop-opacity=".30"/><stop offset=".55" stop-color="#ff6a1a" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="rbWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#15161c"/><stop offset="1" stop-color="#0b0b0f"/></linearGradient>' +
        '<linearGradient id="rbDesk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1d14"/><stop offset=".08" stop-color="#1c140e"/><stop offset="1" stop-color="#0a0806"/></linearGradient>' +
        '<linearGradient id="rbTv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3a40"/><stop offset="1" stop-color="#1b1b20"/></linearGradient>' +
        '<linearGradient id="rbBeige" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7d7565"/><stop offset="1" stop-color="#4c473d"/></linearGradient>' +
      '</defs>' +
      '<rect width="375" height="812" fill="url(#rbWall)"/>' +
      // 壁の広告（古い印刷物の色）
      '<g transform="translate(20 40) rotate(-3)"><rect width="104" height="136" fill="#d8cfb8"/><rect x="6" y="6" width="92" height="58" fill="#e0632a"/>' +
        '<text x="52" y="40" text-anchor="middle" class="rb-ad-big">NEW!</text>' +
        '<foreignObject x="6" y="70" width="92" height="62"><div xmlns="http://www.w3.org/1999/xhtml" class="rb-ad-txt">' + ad.split('　').join('<br/>') + '</div></foreignObject></g>' +
      // 机
      '<rect y="468" width="375" height="344" fill="url(#rbDesk)"/>' +
      '<rect y="466" width="375" height="3" fill="#4a3526"/>' +
      // ベージュのPC（右奥）
      '<g transform="translate(286 300)"><rect width="74" height="170" rx="3" fill="url(#rbBeige)"/><rect x="10" y="18" width="54" height="10" rx="1" fill="#2c2923"/>' +
        '<rect x="10" y="36" width="54" height="10" rx="1" fill="#2c2923"/><circle cx="54" cy="150" r="4" fill="#3a352c"/><rect x="12" y="148" width="14" height="4" fill="#7fe38a" class="rb-led"/></g>' +
      // CRT テレビ（中央）。画面は .rb-screen として別に重ねる（ゲームの画面がここに縮んでいく）
      '<g transform="translate(58 190)"><rect width="259" height="236" rx="18" fill="url(#rbTv)"/><rect x="8" y="8" width="243" height="220" rx="14" fill="none" stroke="#4a4a52" stroke-width="2"/>' +
        '<rect x="22" y="22" width="185" height="150" rx="16" fill="#050506"/>' +
        '<circle cx="229" cy="56" r="9" fill="#141418" stroke="#55555e"/><circle cx="229" cy="86" r="9" fill="#141418" stroke="#55555e"/>' +
        '<rect x="219" y="112" width="20" height="44" rx="2" fill="#121216"/><rect x="221" y="116" width="16" height="3" fill="#2a2a30"/><rect x="221" y="124" width="16" height="3" fill="#2a2a30"/><rect x="221" y="132" width="16" height="3" fill="#2a2a30"/>' +
        '<rect x="22" y="186" width="185" height="30" rx="4" fill="#111114"/><circle cx="194" cy="201" r="3" fill="#ff4a3c" class="rb-led"/></g>' +
      '<rect x="100" y="426" width="175" height="42" fill="#15151a"/>' +
      // 黒電話（左）
      '<g transform="translate(20 510)"><path d="M6 60 Q10 18 58 16 Q106 18 110 60 Z" fill="#121214"/><rect x="0" y="58" width="116" height="16" rx="6" fill="#18181b"/>' +
        '<circle cx="58" cy="44" r="18" fill="#0c0c0e" stroke="#2c2c31" stroke-width="2"/><circle cx="58" cy="44" r="5" fill="#2c2c31"/>' +
        '<path d="M8 12 Q58 -8 108 12 L102 22 Q58 6 14 22 Z" fill="#1c1c20"/></g>' +
      // 新聞（手前左・少し傾けて）
      '<g transform="translate(40 640) rotate(-8)"><rect width="190" height="120" fill="#cfc8b4"/><rect x="8" y="8" width="174" height="4" fill="#4a4538"/>' +
        '<foreignObject x="8" y="16" width="174" height="44"><div xmlns="http://www.w3.org/1999/xhtml" class="rb-paper">' + paper + '</div></foreignObject>' +
        '<rect x="8" y="66" width="80" height="46" fill="#a9a290"/><g fill="#7c7667"><rect x="96" y="68" width="86" height="3"/><rect x="96" y="76" width="86" height="3"/><rect x="96" y="84" width="70" height="3"/><rect x="96" y="92" width="86" height="3"/><rect x="96" y="100" width="60" height="3"/></g></g>' +
      // スマートフォン（手前右・画面が光っている）
      '<g transform="translate(246 600) rotate(10)"><rect width="84" height="160" rx="12" fill="#0b0b0e" stroke="#2a2a30" stroke-width="2"/><rect x="6" y="14" width="72" height="132" rx="6" fill="#141824"/>' +
        '<foreignObject x="10" y="24" width="64" height="80"><div xmlns="http://www.w3.org/1999/xhtml" class="rb-phone"><i>通知</i>' + phone + '</div></foreignObject></g>' +
      '<rect width="375" height="812" fill="url(#rbGlow)"/>' +
    '</svg>';
  },

  // ---------------------------------------------------------------
  // 起動：（初めてだけ）オープニング → タイトル → ホーム
  //   タイトルは毎回出す。**「TAP TO START」の1タップが、音を鳴らせるようにするタップを兼ねる**
  //   （ブラウザは最初のタップまで音を出させない）ので、1タップ増えるわけではない
  //   URL に ?packdemo（開封の見本）や ?notitle があるときは出さない
  // ---------------------------------------------------------------
  boot() {
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

  // 再起動の場面。終わったら（または触って飛ばしたら）done を呼ぶ
  reboot(done) {
    const pick = this._pick(this.NEWS, 3);
    const ad = this._pick(this.ADS, 2);
    const el = Util.el('div', 'rbscene');
    el.innerHTML = '<div class="rb-box">' + this._roomSvg(pick[0], ad[0], pick[1], ad[1]) +
      '<div class="rb-screen"><div class="rb-game"><b>エクスメントマキナ</b></div><div class="rb-news"><b>NEWS</b><span>' + pick[2] + '</span></div><i class="rb-scan"></i></div></div>' +
      '<div class="rb-skip">タップで飛ばす</div>';
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
