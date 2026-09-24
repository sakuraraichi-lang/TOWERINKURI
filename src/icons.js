// アイコン（SVG）。**絵文字は使わない**（ユーザー 2026-09-24「絵文字を廃止してみても良い」）。
//   端末ごとに絵文字の絵柄が違い、黒×橙の金属の画面から浮いていたため。
//   線は currentColor なので、置いた場所の色になる。大きさは 1em（文字と並べて使える）
const Icons = (() => {
  // 24×24 の中に描く。p … <path> の d ／ 他の要素はそのまま書く
  const P = (d) => '<path d="' + d + '"/>';
  const wrap = (body, cls) =>
    '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';

  const src = {
    // ---- 武器（盤面の砲の形に寄せてある） ----
    gatling: P('M3 9h11M3 12h11M3 15h11') + '<rect x="13" y="7" width="6" height="10" rx="1.5"/>' + P('M19 12h2'),
    sniper: P('M2 13h16l3-1') + '<rect x="8" y="7.5" width="6" height="3" rx="1"/>' + P('M10 13l-2 6M15 13l2 6'),
    missile: P('M5 19l4-4M12 3c4 1 8 5 9 9l-7 7-9-9z') + '<circle cx="15" cy="9" r="1.6"/>' + P('M7 13l-4 1 2 2M11 17l-1 4-2-2'),
    tesla: P('M8 21h8M10 21v-4h4v4M9 17l-1-3h8l-1 3') + '<ellipse cx="12" cy="10" rx="5" ry="1.6"/><ellipse cx="12" cy="7" rx="3.6" ry="1.2"/>' + P('M12 5V3M17 3l-2 3h3l-2 3'),
    flame: P('M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 2 1 3 3 3 5 1-1 1-3 0-5z'),
    gas: '<rect x="4" y="9" width="7" height="12" rx="2"/>' + P('M6 9V6h3v3M11 12h2') + '<circle cx="16" cy="9" r="3"/><circle cx="19" cy="14" r="2.4"/><circle cx="15" cy="15" r="1.8"/>',
    cryo: P('M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M12 5l-2-2M12 5l2-2M12 19l-2 2M12 19l2 2'),
    katana: P('M20 4L8 16M20 4l-1 4-10 10M6 14l4 4M5 19l2-2M4 20l1-1'),
    shuriken: P('M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2z') + '<circle cx="12" cy="12" r="1.5"/>',
    tentacle: P('M7 21c0-6 2-9 5-10s4-4 2-6-5 0-4 2 3 2 3 0M12 21c0-4 2-6 5-7M17 21c0-2 1-3 3-3'),
    bubble: '<circle cx="9" cy="14" r="5.5"/><circle cx="17" cy="7" r="3"/><circle cx="18.5" cy="15.5" r="2"/>' + P('M6.5 12a3 3 0 0 1 2.5-2'),
    mortar: P('M8 17l6-12h4l-5 12') + '<rect x="3" y="17" width="18" height="3" rx="1"/>' + P('M15 3l2-1M19 4l1-2'),

    // ---- 分類 ----
    short: '<circle cx="12" cy="12" r="3"/>' + P('M12 3v3M12 18v3M3 12h3M18 12h3'),
    mid: P('M12 3l8 9-8 9-8-9z') + '<circle cx="12" cy="12" r="2.5"/>',
    long: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.5"/>' + P('M12 2v5M12 17v5M2 12h5M17 12h5'),
    area: P('M12 3l9 17H3z') + P('M12 10v4M12 17v.5'),
    target: P('M12 2v7M12 15v7M2 12h7M15 12h7') + '<circle cx="12" cy="12" r="5"/>',
    support: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>',

    // ---- 画面の部品 ----
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/>' + P('M8 10V7a4 4 0 0 1 8 0v3M12 14v3'),
    sound: P('M4 9h4l5-4v14l-5-4H4z') + P('M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11'),
    mute: P('M4 9h4l5-4v14l-5-4H4z') + P('M16 9l5 6M21 9l-5 6'),
    pause: P('M8 5v14M16 5v14'),
    play: P('M7 4l13 8-13 8z'),
    close: P('M6 6l12 12M18 6L6 18'),
    check: P('M4 12l5 5L20 6'),
    trophy: P('M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5M12 14v4M8 21h8M9 18h6'),
    gear: '<circle cx="12" cy="12" r="3"/>' +
      P('M12 2l1.5 2.6 2.9-.8.8 2.9L20 8l-.8 2.9L22 12l-2.6 1.5.8 2.9-2.9.8L16 20l-2.9-.8L12 22l-1.5-2.6-2.9.8-.8-2.9L4 16l.8-2.9L2 12l2.6-1.5L3.8 7.6l2.9-.8L8 4l2.9.8z'),
    blades: P('M4 4l10 10M20 4L10 14M14 14l2 2-2 2-2-2M10 14l-2 2 2 2 2-2M5 21l3-3M19 21l-3-3'),
    tree: '<circle cx="12" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><circle cx="12" cy="13" r="2"/>' + P('M12 7v4M11 14.7L7 17.4M13 14.7l4 2.7'),
    card: '<rect x="5" y="3" width="14" height="18" rx="2"/>' + P('M12 8l1.2 2.6 2.8.3-2.1 1.9.6 2.8L12 14.2l-2.5 1.4.6-2.8L8 10.9l2.8-.3z'),
    key: '<circle cx="8" cy="8" r="4"/>' + P('M11 11l9 9M16 16l2-2M18 18l2-2'),
    perm: P('M12 2l9 5v10l-9 5-9-5V7z') + P('M12 7l4.5 2.5v5L12 17l-4.5-2.5v-5z'),
    deck: '<rect x="7" y="5" width="12" height="16" rx="2"/>' + P('M5 17V5a2 2 0 0 1 2-2h9'),
    grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    cycle: P('M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M6 21v-4h4'),
    spark: P('M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z'),
    // ---- スキルの効き方（ツリーの節）。**効き方ごとに絵を分ける**（2026-09-25。前は ▲◈◎◤ の記号の使い回しで、
    //      違う効果が同じ見た目だった） ----
    sk_dmg: P('M12 2l2.2 5.6 5.8-1.8-3.2 5.2 5.2 3.2-6 .8.4 6-4.4-4-4.4 4 .4-6-6-.8 5.2-3.2L4 5.8l5.8 1.8z'),
    sk_rate: P('M5 6l6 6-6 6M13 6l6 6-6 6'),
    sk_dur: P('M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9'),
    sk_pierce: P('M3 12h15M14 7l5 5-5 5M8 4v16'),
    sk_crit: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>' + P('M12 1v5M12 18v5M1 12h5M18 12h5'),
    sk_count: P('M4 7h9M4 12h13M4 17h9') + '<circle cx="18" cy="7" r="1.6"/><circle cx="21" cy="12" r="1.2"/><circle cx="18" cy="17" r="1.6"/>',
    sk_range: '<circle cx="5" cy="19" r="1.8"/>' + P('M5 12a7 7 0 0 1 7 7M5 7a12 12 0 0 1 12 12M5 2a17 17 0 0 1 17 17'),
    sk_size: P('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5') + '<circle cx="12" cy="12" r="3"/>',
    sk_units: P('M12 3l6 3.5v7L12 17l-6-3.5v-7z') + P('M6 16.5L12 20l6-3.5'),
    sk_coin: '<circle cx="12" cy="12" r="9"/>' + P('M12 7l4.3 2.5v5L12 17l-4.3-2.5v-5z'),
    sk_regen: P('M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z') + P('M12 8v8M8 12h8'),
    sk_picks: '<rect x="4" y="5" width="11" height="15" rx="2"/>' + P('M19 3v6M16 6h6'),
    sk_choices: '<rect x="2.5" y="7" width="8" height="12" rx="1.5" transform="rotate(-12 6.5 13)"/>' +
      '<rect x="8" y="5" width="8" height="12" rx="1.5"/><rect x="13.5" y="7" width="8" height="12" rx="1.5" transform="rotate(12 17.5 13)"/>',
    sk_luck: P('M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z') + P('M19 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2L16 18l2.2-.8z'),
    sk_pack: P('M5 5l1.4-1.5L7.8 5l1.4-1.5L10.6 5 12 3.5 13.4 5l1.4-1.5L16.2 5l1.4-1.5L19 5v16H5z') + P('M9 12l2 2 4-4'),
    sk_lure: '<circle cx="12" cy="13" r="2"/>' + P('M8 9a6 6 0 0 0 0 8M16 9a6 6 0 0 1 0 8M5 6a10 10 0 0 0 0 14M19 6a10 10 0 0 1 0 14'),
    root: P('M12 2l8.7 5v10L12 22l-8.7-5V7z') + '<circle cx="12" cy="12" r="3.5"/>',

    // パック：箔の袋。上端にギザの切り口
    pack: P('M5 5l1.4-1.5L7.8 5l1.4-1.5L10.6 5 12 3.5 13.4 5l1.4-1.5L16.2 5l1.4-1.5L19 5v16H5z') + P('M5 8h14') + '<circle cx="12" cy="14" r="3"/>',
  };

  // **コイン：歯車の縁の硬貨。**（ユーザー 2026-09-24「ギアのようなコイン」）
  //   塗りのある絵なので、線の絵とは別に作る。色は金で固定
  const coinBody = (() => {
    const n = 12, ro = 11, ri = 9.2, pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? ri : ro;
      // 歯を台形にする：外周の点を2つずつ
      const w = (Math.PI / n) * 0.42;
      if (i % 2 === 0) {
        pts.push([12 + Math.cos(a - w) * r, 12 + Math.sin(a - w) * r], [12 + Math.cos(a + w) * r, 12 + Math.sin(a + w) * r]);
      } else pts.push([12 + Math.cos(a) * r, 12 + Math.sin(a) * r]);
    }
    const d = 'M' + pts.map(p => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z';
    return '<path d="' + d + '" fill="#8a5a12"/>' +
      '<circle cx="12" cy="12" r="8.4" fill="url(#coinG)"/>' +
      '<circle cx="12" cy="12" r="6" fill="none" stroke="#7a4c0c" stroke-width="1.1"/>' +
      '<path d="M12 7.6l3.8 2.2v4.4L12 16.4l-3.8-2.2V9.8z" fill="#ffe7a0" stroke="#7a4c0c" stroke-width="1"/>' +
      '<circle cx="12" cy="12" r="1.4" fill="#7a4c0c"/>';
  })();
  const coinDefs = '<defs><radialGradient id="coinG" cx="0.35" cy="0.3" r="0.8">' +
    '<stop offset="0" stop-color="#fff2b8"/><stop offset="0.5" stop-color="#ffc234"/><stop offset="1" stop-color="#b87412"/></radialGradient></defs>';

  return {
    get(name, cls) { return src[name] ? wrap(src[name], cls) : ''; },
    // スキルの節の絵。**効き方（連なりなら gkey、節なら key）で決める**
    skill(s) {
      const k = s.gkey && src['sk_' + s.gkey] ? s.gkey : s.key;
      return wrap(src['sk_' + k] || src.sk_dmg);
    },
    coin(cls) {
      return '<svg class="ico coin' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + coinDefs + coinBody + '</svg>';
    },
  };
})();
