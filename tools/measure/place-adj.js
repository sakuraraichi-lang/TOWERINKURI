// 置き方「adj」：隣り合う異種で強め合う（Game.updateAdj・六角の隣6つにいる違う種類 ×15%・3種類まで）を狙う上手な置き方。
//   run.js の --place adj で、使うひな形の先頭にこのファイルが付く（sim.html は書き換えない）。直に使うなら node tools/simnode.js --file で先頭に連結する。
//   考え方：'range' と同じ「通り道をよく覆う六角（aimField の w）」を土台にする。
//     ①射程の長い順に1基ずつ取り、まだ組に入っていない最初の1基を「核」にして、よく覆う離れた点へ置く（'range' と同じ選び方）
//     ②残りから「核と違う種類」を最大3種（核＋3＝4種の塊）選び、核の隣6つのうち、その武器がいちばん通り道を覆う空き六角へ置く
//     ③隣に覆える空きが無ければ、その武器は ふつうの 'range' の選び方で置く（覆う量を落とさない）
//   1種だけの編成は ②が空なので、'range' とまったく同じ。
//   診断：globalThis.PADJ = { cover（置いた基の w の合計）, adj（全基の隣の異種の数の分布）} を最後の配置の分で残す
(function () {
  globalThis.PADJ = null;
  function adjDist(run) {
    const d = [0, 0, 0, 0];
    for (const u of run.units) d[Math.min(3, Game.adjTypesAt(u.c, u.r, u.id, run.units, u).length)]++;
    return d;
  }
  function autoPlaceAdj(run) {
    const st = run.stage;
    const mods = Skill.mods(Game.meta, Game.perm);
    const statOf = (wid) => {
      const def = WEAPONS[wid];
      const fake = { def, s: Object.assign({}, def.base) };
      Skill.applyTo(fake, mods);
      return { range: fake.s.range, arc: fake.s.arc, thru: fake.s.thru };
    };
    const want = costWant();
    want.sort((a, b) => statOf(b).range - statOf(a).range);
    const fieldOf = (wid) => { const s = statOf(wid); return aimField(st, s.range, s.arc, s.thru); };
    const taken = {};
    const far = (c, r, min2) => {
      for (const k in taken) {
        const i = k.indexOf(',');
        const dc = (+k.slice(0, i)) - c, dr = (+k.slice(i + 1)) - r;
        if (dc * dc + dr * dr < min2) return false;
      }
      return true;
    };
    const put = (wid, f) => {
      const u = Game.placeUnit(wid, f.c, f.r);
      if (!u) return null;
      taken[u.c + ',' + u.r] = 1;
      Game.aimUnit(u, f.a);
      if (AIM_SMART) smartAim(u, st, aimUsed);
      return u;
    };
    const aimUsed = {};
    // 'range' と同じ：離れた良い点→空いている最良点。置けるまで次の候補へ
    const putFar = (wid) => {
      const open = fieldOf(wid).filter(f => !taken[f.c + ',' + f.r]);
      for (const f of open.filter(f => far(f.c, f.r, 5)).concat(open)) {
        if (!Game.canPlaceAt(f.c, f.r)) continue;
        const u = put(wid, f); if (u) return { u, f };
      }
      return null;
    };
    let cover = 0;
    const rest = want.slice();
    while (rest.length) {
      const core = rest.shift();
      const r0 = putFar(core);
      if (!r0) continue;
      cover += r0.f.w;
      // 核と違う種類を最大3種（同じ種類は塊に入れない）
      const mates = [], seen = { [core]: 1 };
      for (let i = 0; i < rest.length && mates.length < 3; i++) {
        if (seen[rest[i]]) continue;
        seen[rest[i]] = 1; mates.push(rest.splice(i, 1)[0]); i--;
      }
      const nb = MapGen.hexNbr(r0.u.c, r0.u.r);
      for (const wid of mates) {
        const field = fieldOf(wid);
        let best = null;
        for (const q of nb) {
          if (taken[q[0] + ',' + q[1]]) continue;
          const f = field.find(x => x.c === q[0] && x.r === q[1]);
          if (!f || !Game.canPlaceAt(f.c, f.r)) continue;
          if (!best || f.w > best.w) best = f;
        }
        let u = best && put(wid, best);
        if (u) { cover += best.w; continue; }
        const r1 = putFar(wid);          // 隣に空きが無い：'range' と同じ置き方
        if (r1) cover += r1.f.w;
      }
    }
    PADJ = { cover, adj: adjDist(run) };
  }
  globalThis.autoPlaceAdj = autoPlaceAdj;
  autoPlace = function (run) { return autoPlaceAdj(run); };
})();
