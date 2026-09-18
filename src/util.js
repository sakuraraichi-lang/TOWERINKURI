// ---------------------------------------------------------------
// util.js : 数値整形・乱数・ベクトルなどの雑多なヘルパ
// ---------------------------------------------------------------
'use strict';

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc',
                'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg'];

const Util = {
  // 12345678 -> "12.3M" のような短縮表記。インフレしても読める形にする
  fmt(n) {
    if (n === Infinity) return '∞';
    if (!isFinite(n) || isNaN(n)) return '0';
    if (n < 0) return '-' + Util.fmt(-n);
    if (n < 1000) {
      if (n === 0) return '0';
      if (n < 10) return (Math.round(n * 10) / 10).toString();
      return Math.floor(n).toString();
    }
    const tier = Math.floor(Math.log10(n) / 3);
    if (tier < SUFFIX.length) {
      const m = n / Math.pow(1000, tier);
      const s = m < 10 ? m.toFixed(2) : m < 100 ? m.toFixed(1) : m.toFixed(0);
      return s + SUFFIX[tier];
    }
    return n.toExponential(2).replace('e+', 'e');
  },

  // 倍率を "+35%" の形で
  pct(mult) {
    const p = (mult - 1) * 100;
    return (p >= 0 ? '+' : '') + (Math.abs(p) < 10 ? p.toFixed(1) : p.toFixed(0)) + '%';
  },

  rand(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  chance(p) { return Math.random() < p; },
  clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
  lerp(a, b, t) { return a + (b - a) * t; },

  // [{w: 重み, ...}] から重み付き抽選
  weighted(entries, weightOf) {
    let total = 0;
    for (const e of entries) total += Math.max(0, weightOf(e));
    if (total <= 0) return entries[0];
    let r = Math.random() * total;
    for (const e of entries) {
      r -= Math.max(0, weightOf(e));
      if (r <= 0) return e;
    }
    return entries[entries.length - 1];
  },

  dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); },
  dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
  angle(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); },

  // 角度を最短方向に補間（砲塔の旋回用）
  turnToward(cur, target, maxStep) {
    let d = target - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= maxStep) return target;
    return cur + Math.sign(d) * maxStep;
  },

  el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  },
};
