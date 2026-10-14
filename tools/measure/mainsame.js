// 本編（第30章まで）が変わっていないことの確かめ（2026-10-14）。同じ種で回し、run.js の --dir で別の版と出力を突き合わせる
//   置き換え：__SEED__・__CH__
Game.newSave(); seedRng(__SEED__);
const r = runStage('ch__CH__', LOADOUTS['ch__CH__'], 60, { coins: 1e12, deep: { prestiges: 2, deepest: 29 }, lives: 1e6 });
({ res: r.res, lost: r.livesLost, kills: r.kills, dealt: Math.round(r.dealt || 0), sec: +r.sec.toFixed(2), used: r.used, cap: r.cap })
