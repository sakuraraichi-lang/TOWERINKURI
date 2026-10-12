# 合成武器の札あり・なしの強さ（ver 1012i・第31章・コストの上限48）

測定者：風紀委員（test）。2026-10-12。**測っただけで、判定はしていない。** src は触っていない。

## 【回した検証】

| # | 検証 | 状態 |
|---|---|---|
| 1 | 札なし（C0）24種 × 4本 | 成功（24種すべて 4/4 完走・res はすべて clear） |
| 2 | その合成武器の札 fp_*（エピック）1枚（C1）24種 × 4本 | 成功（同上） |
| 3 | fp_* ＋ 元の武器 A の札 3〜4枚（C2）24種 × 4本 | 成功（同上） |
| 4 | 参照：A と B の混成・札なし（AB）24種 × 4本 | 成功（同上） |
| 5 | 札が乗ったかの確認（C1/C2 の最後の出撃で `u.flags.fc` を読む） | 成功（22種は flags.fc に値。plasmachain・convergence は flags が空の札なので `u.s.chain`／`u.s.reflect` を別に確認：chain 2→4・reflect 2→4） |
| 6 | 置いたコストの記録（全出撃） | 成功（下の「コスト」の節） |
| 7 | 前回（fusion.js・札なし）との比較 | **比較材料なし**（前回の数字そのものはリポジトリに無い。依頼文の「強い側／弱い側」の名前だけと突き合わせた） |
| 8 | 12本以上での確かめ | **未実行**（依頼は各4本以上。4本で回した） |

## 条件

- 第31章（`ch31`）・深さ 33（章＋2）・コストの上限 48（`Game.costCap` を 48 に固定）・`prestiges: 2`・コイン 1e12・ライフ 1e6（5ウェーブ最後まで回す）・`AIM_SMART = true`・置き方は測定器の 'range'
- 測定ごとに `Game.newSave()`。**シード 1〜4 の 4本ずつ**（C0→C1→C2→AB の順にシードごと交互）。中央値で表す。4本とも同じ条件・同じシードで、本数は 24種×4条件×4 = 384 出撃。並べたのは 6 プロセス（依頼の「4本まで」は、この測定が終わったあとに受け取った。残りの測定はこの報告のとおり全部終わっている）
- 実行：`tools/measure/fusion-cardrun.js`（新規・未コミット）。置き換え値 `__CH__=31 __D__=33 __CAP__=48 __SEEDS__=[1,2,3,4] __CONDS__=["C0","C1","C2","AB"]`
- C0：合成武器だけ（noPlain）を、コストの上限まで（同じ武器は 15 基まで）／C1：C0 ＋ `fp_<合成>` 1枚／C2：C1 ＋ 元の武器 A の札 4枚（コモン2・レア1・エピック1。上位札・レジェンド・コインの札は除く。各1枚。下の表の「A の札」列）／AB：A と B を同じコストずつ（札なし）
- 札は `opts.preCards` で戦闘開始時に掛け、ウェーブ間の3択は止めた（`noDraft`）。**実プレイの3択（ランダムに出る）とは違い、札は決め打ち**
- **強さの指標は漏れ（小さいほど強い）。** 与ダメージは使っていない

## 【落ちたもの】

0 件（384 出撃すべて完走・res=clear）。測定エラー 0。

## 【目標帯との突き合わせ】

目標帯の出典：依頼文の「A と B を同じコストずつ置いた混成の ×(1.15−0.075×コスト)」。漏れが少ないほど強いので、**C0 の漏れ ÷ 混成の漏れ が、この係数に近いか**で並べた（係数は依頼文の式をそのまま使った。ここで目標と呼んでよいかは校長／ギャルの判断）。

### 24種の表（漏れの中央値・4本）

| 合成 | A+B | コスト | 札なし C0 | A の札 C1 | A＋元の札 C2 | C1/C0 | C2/C0 | 混成 AB(参照) |
|---|---|---|---|---|---|---|---|---|
| starassault | gatling+shuriken | 4 | 8312.5 | 8011.5 | 5126.5 | 0.96 | 0.62 | 9732.5 |
| plasmachain | gatling+tesla | 5 | 2250 | 2242.5 | 1408 | 1.00 | 0.63 | 2821 |
| chakram | shuriken+katana | 6 | 7075 | 2879.5 | 1.5 | 0.41 | 0.00 | 10180.5 |
| toxblade | shuriken+gas | 5 | 588.5 | 194 | 18 | 0.33 | 0.03 | 741 |
| voidblade | katana+tentacle | 8 | 714 | 118.5 | 0 | 0.17 | 0.00 | 999 |
| flameblade | katana+flame | 8 | 990 | 478.5 | 75.5 | 0.48 | 0.08 | 3825.5 |
| abyssnet | tentacle+bubble | 9 | 22.5 | 20.5 | 29 | 0.91 | 1.29 | 98 |
| thunderwhip | tentacle+tesla | 7 | 196 | 21 | 15 | 0.11 | 0.08 | 650.5 |
| hellmist | flame+gas | 7 | 326 | 108.5 | 53 | 0.33 | 0.16 | 766.5 |
| napalm | flame+mortar | 8 | 1333 | 991.5 | 655 | 0.74 | 0.49 | 2843 |
| vortex | cryo+flame | 9 | 1450 | 1378.5 | 653 | 0.95 | 0.45 | 2184 |
| icefoam | cryo+bubble | 10 | 162 | 53.5 | 0 | 0.33 | 0.00 | 206.5 |
| cryobeam | sniper+cryo | 8 | 970.5 | 221 | 34 | 0.23 | 0.04 | 2014.5 |
| convergence | sniper+missile | 8 | 1654 | 1611 | 566 | 0.97 | 0.34 | 3368.5 |
| carpet | missile+mortar | 9 | 2343 | 1677 | 1324.5 | 0.72 | 0.57 | 10288 |
| chainstrike | missile+tesla | 8 | 1726.5 | 737 | 301.5 | 0.43 | 0.17 | 3279.5 |
| stormcloud | tesla+gas | 6 | 360.5 | 80.5 | 27 | 0.22 | 0.07 | 636.5 |
| resonator | tesla+bubble | 8 | 188 | 70 | 33.5 | 0.37 | 0.18 | 347 |
| acidfoam | gas+bubble | 8 | 80 | 81 | 44.5 | 1.01 | 0.56 | 157.5 |
| toxmortar | gas+mortar | 7 | 426.5 | 247.5 | 103.5 | 0.58 | 0.24 | 422 |
| bubblegun | bubble+gatling | 7 | 49.5 | 0 | 0 | 0.00 | 0.00 | 267 |
| scattergun | mortar+gatling | 6 | 4182 | 1471.5 | 402.5 | 0.35 | 0.10 | 4944.5 |
| bubbleblade | bubble+shuriken | 7 | 70.5 | 67 | 6 | 0.95 | 0.09 | 285.5 |
| icebomb | mortar+cryo | 9 | 1799.5 | 1336.5 | 458.5 | 0.74 | 0.25 | 5282 |

A の札（C1 で足した fp_*）と C2 で足した元の武器の札、各出撃の漏れ4本ぶんは付録に載せた。

### 混成との比（C0÷AB）と、依頼文の係数

| 合成 | コスト | 係数 1.15−0.075c | C0/AB | 差（C0/AB − 係数） |
|---|---|---|---|---|
| toxmortar | 7 | 0.625 | 1.01 | +0.39 |
| icefoam | 10 | 0.400 | 0.78 | +0.38 |
| vortex | 9 | 0.475 | 0.66 | +0.19 |
| voidblade | 8 | 0.550 | 0.71 | +0.16 |
| scattergun | 6 | 0.700 | 0.85 | +0.15 |
| plasmachain | 5 | 0.775 | 0.80 | +0.02 |
| toxblade | 5 | 0.775 | 0.79 | +0.02 |
| starassault | 4 | 0.850 | 0.85 | +0.00 |
| chakram | 6 | 0.700 | 0.69 | -0.01 |
| resonator | 8 | 0.550 | 0.54 | -0.01 |
| chainstrike | 8 | 0.550 | 0.53 | -0.02 |
| acidfoam | 8 | 0.550 | 0.51 | -0.04 |
| convergence | 8 | 0.550 | 0.49 | -0.06 |
| cryobeam | 8 | 0.550 | 0.48 | -0.07 |
| napalm | 8 | 0.550 | 0.47 | -0.08 |
| stormcloud | 6 | 0.700 | 0.57 | -0.13 |
| icebomb | 9 | 0.475 | 0.34 | -0.13 |
| hellmist | 7 | 0.625 | 0.43 | -0.20 |
| abyssnet | 9 | 0.475 | 0.23 | -0.25 |
| carpet | 9 | 0.475 | 0.23 | -0.25 |
| flameblade | 8 | 0.550 | 0.26 | -0.29 |
| thunderwhip | 7 | 0.625 | 0.30 | -0.32 |
| bubbleblade | 7 | 0.625 | 0.25 | -0.38 |
| bubblegun | 7 | 0.625 | 0.19 | -0.44 |

（上ほど「札なしで混成より弱い側」＝係数より漏れが多い。下ほど係数より強い側。係数＝依頼文の式。）

### 極端なもの（札なし C0）

- **強い側（漏れが少ない）**：abyssnet（狂気の海底）22.5・bubblegun（ファンシーバブルガン）49.5・bubbleblade（ポッピングスター）70.5・acidfoam（王水）80。前回の「強い側」3種（バブルガン・狂気の海底・ポッピングスター）と同じ顔ぶれ。
- **弱い側（漏れが多い）**：starassault 8312.5・chakram 7075・scattergun 4182・carpet 2343・plasmachain 2250・icebomb 1799.5。**依頼文の前回の弱い側の永久凍土（icefoam）は 162 で下から数えて 8 番目の強さ、破滅の雨（toxmortar）は 426.5 で中ほど**。前回の数字が手元に無いので、この食い違いが版（1012g→1012i）によるのか本数・測り方によるのかは分からない。
- **混成より弱い（C0/AB が 1 付近）**：toxmortar 1.01（混成 422 に対し C が 426.5。コスト7の係数は 0.625）。ほかに係数を 0.15 以上上回るのは voidblade（0.71 対 0.55）・vortex（0.66 対 0.475）・icefoam（0.78 対 0.40）・scattergun（0.85 対 0.70）・toxmortar（1.01 対 0.625）。
- **混成よりずっと強い（C0/AB が 0.3 未満）**：bubblegun 0.19・abyssnet 0.23・carpet 0.23・bubbleblade 0.25・flameblade 0.26・thunderwhip 0.30（係数との差 −0.25 〜 −0.44）。
  - ただし AB は同じ武器 15 基までの上限で伸び切らない出撃があり（starassault の AB はコスト 30 までしか置けない）、また A と B を隣り合わせには置いていない（連携なし）ので、混成が低く出ている可能性がある。

### 札の効き（C1/C0 と C2/C0）

- **A の札 1枚（C1）がほぼ効いていない（C1/C0 ≥ 0.90）**：plasmachain 1.00（札は chain 2→4 を乗せている。確認済み）・acidfoam 1.01・convergence 0.97（reflect 2→4 確認済み）・starassault 0.96・vortex 0.95・bubbleblade 0.95・abyssnet 0.91。abyssnet は元から漏れ 22 で床に近い。
- **A の札 1枚で漏れが 1/3 以下（C1/C0 ≤ 0.35）**：bubblegun 0.00（49.5→0）・thunderwhip 0.11・voidblade 0.17・stormcloud 0.22・cryobeam 0.23・hellmist 0.33・toxblade 0.33・icefoam 0.33・scattergun 0.35。
- **chakram は C1 で 7075→2879.5（0.41）、C2 で 1.5。** 札2層の差が大きい（C1→C2 で 2000 倍近く）。voidblade・icefoam・bubblegun も C2 で 0。
- **C2（A の札4枚も足す）で漏れ 10 以下**：chakram 1.5・voidblade 0・icefoam 0・bubblegun 0・bubbleblade 6。
- **C2 が C0 より悪い**：abyssnet 29 対 22.5（C2/C0 1.29。4本の漏れは C0 22,34,23,16／C2 38,31,27,24 で、床に近い値の揺れの範囲か差かは4本では言えない）。
- **C2 でも漏れが 1000 超**：starassault 5126.5・plasmachain 1408・carpet 1324.5（napalm 655・vortex 653 は 600 台）。

### 注意（読み方）

- **C2 の落ち幅には、元の武器 A の札そのものの効きが混ざっている。** C2 − C1 は「A の札を足した分」で、合成武器固有の札ではない。A の札だけを plain の A に乗せた対照は測っていない。**C1 の列が「合成武器だけの札 fp_*」の寄与**。
- fp_* は 1 枚（maxStack 1）。凸（所持枚数）は 1 枚＝凸なし。
- 漏れの中央値は 4 本。漏れの小さい種（abyssnet・bubblegun・icefoam など、0〜100 台）は 4 本では順序を決めきれない。

## コスト（上限−2＝46 以上を置けたか）

CLAUDE.md「全ての章でコストの上限まで武器を置く（上限−2 以上）」に対する、出撃ごとの記録（384 出撃）。

- **上限−2（46）未満の出撃：C0/C1/C2 で 12 種 × 3 条件 × 4 本 = 144 出撃、AB で 1 種 × 4 本 = 4 出撃（合計 148 出撃）。** 理由はコスト粒度：合成のコストが 5・7・9・10 などで、次の1基が入らない。
  - 45（上限−3）：plasmachain（5）・toxblade（5）・abyssnet（9）・vortex（9）・carpet（9）・icebomb（9）
  - 42（上限−6）：thunderwhip（7）・hellmist（7）・toxmortar（7）・bubblegun（7）・bubbleblade（7）
  - 40（上限−8）：icefoam（10）
  - AB：starassault だけ 30（gatling 15 基＋shuriken 15 基＝同じ武器 15 基の上限で止まる）。bubblegun・bubbleblade の AB は 47
- 48 まで置けたのは starassault・chakram・voidblade・flameblade・napalm・cryobeam・convergence・chainstrike・stormcloud・resonator・acidfoam・scattergun（C 条件）。
- **この測定器の自動配置は、残りコストに入る別の武器を足さない**（noPlain で合成1種だけを置くため）。コストの余りは測定器の都合で、本体の遊びで「余る」かどうかとは別。判定は校長／ギャルに任せる。

## 【前回からの変化】

比較材料なし。前回の数字（`tools/measure/fusion.js` の出力）は保存されていない。依頼文の「強い側＝バブルガン・狂気の海底・ポッピングスター」は今回も強い側（上の節）。「弱い側＝永久凍土・破滅の雨」は今回は弱い側ではない（上の節）。悪化として確認できたものは無し。

## 【未実行と、その理由】

- 12本以上での確かめ：未実行（依頼は4本以上。漏れが小さい種は順序が決まらない）
- 実プレイの3択（ランダム）で札が出る確率を含めた測定：未実行（決め打ちの `preCards`）
- 合成武器の札（B の連携札 fl_*）：依頼外のため未実行
- A の札だけを plain の A に乗せた対照：未実行
- 合成を盤の上で実際に隣り合わせから作る操作（合成ボタン）：未実行（`placeFusedUnit` 経由で最初から合成武器を置いた）
- 並べる本数：途中で「4本まで」の指示を受けた時点で 6 プロセスはすべて完走済みだった。以降の追加の実行は 1 プロセス（札の確認 4 出撃）のみ

## 付録：A の札の値と各出撃の漏れ

| 合成 | A の札 C1 の値（flags.fc） | C2 で足した元の武器の札 | C0 4本 | C1 4本 | C2 4本 |
|---|---|---|---|---|---|
| starassault | {"frag":3} | gat_belt gat_cool gat_ap gat_heat | 8188,8342,8283,9545 | 7964,8009,8014,8070 | 5098,5190,5139,5114 |
| plasmachain | {} | gat_belt gat_cool gat_ap gat_heat | 2161,2331,2169,2397 | 2247,2180,2296,2238 | 1373,1440,1379,1437 |
| chakram | {"back":2} | shu_multi shu_bounce shu_poison | 7071,7079,6960,7144 | 2857,2902,2960,2857 | 1,2,1,2 |
| toxblade | {"sure":1,"dr":16,"dpsK":0.8} | shu_multi shu_bounce shu_poison | 596,585,592,583 | 190,190,198,213 | 17,11,19,20 |
| voidblade | {"durK":0.6,"tent":2} | ktn_edge ktn_iai ktn_swallow | 718,726,702,710 | 102,119,118,140 | 0,0,0,0 |
| flameblade | {"fin":2.5} | ktn_edge ktn_iai ktn_swallow | 958,1011,1010,970 | 480,480,477,454 | 81,86,70,66 |
| abyssnet | {"echo":0.8} | tnt_grip tnt_long tnt_many | 22,34,23,16 | 23,28,18,15 | 38,31,27,24 |
| thunderwhip | {"twin":1} | tnt_grip tnt_long tnt_many | 189,223,203,175 | 21,21,23,16 | 12,17,14,16 |
| hellmist | {"blasts":2} | flm_fuel flm_spread flm_wide | 315,326,326,330 | 116,99,114,103 | 52,54,55,52 |
| napalm | {"bombs":4} | flm_fuel flm_spread flm_wide | 1324,1342,1357,1292 | 1013,1000,983,981 | 686,636,640,670 |
| vortex | {"shatter":3} | cry_deep cry_wide cry_shatter | 1427,1473,1422,1531 | 1360,1368,1439,1389 | 613,676,667,639 |
| icefoam | {"chain":2} | cry_deep cry_wide cry_shatter | 167,152,157,188 | 55,75,52,45 | 0,0,0,0 |
| cryobeam | {"along":4} | snp_scope snp_he snp_weak snp_rail | 967,951,974,1005 | 202,226,216,252 | 31,41,37,30 |
| convergence | {} | snp_scope snp_he snp_weak snp_rail | 1658,1782,1650,1618 | 1573,1622,1615,1607 | 569,589,519,563 |
| carpet | {"whirls":2} | msl_warhead msl_guide msl_multi msl_cluster | 2249,2304,2382,2444 | 1504,1699,1678,1676 | 1297,1351,1298,1354 |
| chainstrike | {"bolts":3} | msl_warhead msl_guide msl_multi msl_cluster | 1865,1684,1745,1708 | 714,747,736,738 | 306,298,301,302 |
| stormcloud | {"strikes":2} | tsl_coil tsl_chain tsl_shock tsl_over | 331,396,368,353 | 85,102,75,76 | 22,23,31,31 |
| resonator | {"zaps":2} | tsl_coil tsl_chain tsl_shock tsl_over | 177,198,181,195 | 79,61,85,57 | 34,33,27,45 |
| acidfoam | {"linger":2} | gas_dense gas_wide gas_toxic | 92,70,78,82 | 85,77,101,72 | 53,42,37,47 |
| toxmortar | {"shells":4} | gas_dense gas_wide gas_toxic | 439,414,446,340 | 259,236,223,262 | 101,106,113,100 |
| bubblegun | {"kids":2} | bbl_big bbl_rapid bbl_acid | 56,43,20,89 | 1,0,0,0 | 0,0,0,0 |
| scattergun | {"pel":6} | mtr_shell mtr_rapid mtr_wide | 4174,4197,4190,4129 | 1437,1506,1411,1511 | 378,399,426,406 |
| bubbleblade | {"rays":3} | bbl_big bbl_rapid bbl_acid | 67,69,72,80 | 58,76,58,89 | 2,5,12,7 |
| icebomb | {"storms":1} | mtr_shell mtr_rapid mtr_wide | 1801,1842,1795,1798 | 1407,1245,1306,1367 | 491,441,393,476 |
