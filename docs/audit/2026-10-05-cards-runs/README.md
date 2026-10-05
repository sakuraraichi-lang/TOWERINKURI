# カードの作り直し（0929zs）の測定の生データ（2026-10-05）
- `base_*`：作り直す前（ブランチ先頭）の第25章 D22・単独・12本（札なし／全部積む）。`job_fin_*`：作り直したあとの同じ測定（濃縮ガスを戻す前の版）。`job_d19*`・`job_e_*`：D19。
- `scan_*`：札を1枚ずつ（12本）。`job_fz_*`・`job_x_*`・`job_y_*`・`job_z_*`・`job_w_*`・`job_s_*`・`job_m_*`・`job_g_*`：値を決めるための変種・支援の札（強い武器と組む）・装甲／耐火の混成・汎用の札。
- `camp/`：通し（シード1〜4・前後）。`base_t*`・`fin_t*`：凸の伸び（`tools/measure/cardaxis.js`）。`trigger2.json`：新しい挙動が起きた回数。
- スクリプト：`cards_meas.js`（`tools/measure/card.js` の元）・`cards_jobs.js`・`cards_trigger.js`・`cards_dead.js`
