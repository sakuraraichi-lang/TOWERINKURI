// ---------------------------------------------------------------
// skilltree.js : インクリメンタル側。ここは「数字を大きくする」だけ
//   武器の挙動は一切変えない（それはカードの担当）
//
//   火力系は武器カテゴリ単位で上げる。武器が増えても
//   「短射程を伸ばすビルド」「支援を伸ばすビルド」という選択が残るようにするため
//
//   **効果量はこのファイルの eff だけが持つ。**
//   表示文（desc）も mods() の計算も、どちらも eff から作る。
//   以前は説明文と計算式の両方に倍率がベタ書きされていて、
//   片方だけ直すと表示と実効果がズレる状態だった
// ---------------------------------------------------------------
'use strict';

// mode: 'mul' … レベルごとに eff 倍（累乗）
//       'add' … レベルごとに eff を加算
// tmpl の {e} が eff に置き換わる
const SKILLS = [
  // ============ 資源・拠点 ============
  // **累乗をやめた。** ×1.11 の上限無しだと、安いので延々買われて
  // 実測で Lv39・×153倍まで伸び、これが収入爆発の本体だった
  // （1面あたりの稼ぎが ×25.7 / ×6.4 / ×38.1 と暴れていた原因）。
  // 加算なら、レベルを積んでも収入の「次数」が上がらない
  { id: 'coin', name: '集金効率', icon: '◈', group: '資源',
    eff: 0.14, mode: 'add', tmpl: '敵から得るコイン +{e}倍',
    cost0: 15, costG: 1.33, max: Infinity, unlock: 0 },
  // **【撤去 2026-09-21・ユーザー決定】「防衛線」（ライフ +3/段・上限なし）を外した。**
  //   > 「基本タワーのHP鍛えるスキルツリーはノーサンキュー、せめてカードで固定値上昇」
  //   漏れの重さは章によらず1体＝ライフ1のまま据え置くので、
  //   ライフを無限に買えると**難易度そのものを買って消せてしまう**。
  //   実測では Lv62（+186）まで積まれていた。
  //   ライフを増やす手段はカードの固定値（`gen_armor` 増設装甲 ライフ+6）に残してある。
  //   **`regen`（応急修理班）は残した。** 上限10段の回復で、HPの天井を上げるものではないため
  { id: 'regen', name: '応急修理班', icon: '✚', group: '拠点',
    eff: 1, mode: 'add', tmpl: 'ウェーブを1つ突破するごとにライフ +{e}（上限まで）',
    cost0: 90, costG: 1.55, max: 10, unlock: 1 },
  //   **設置枠は「値段の跳ね上がり」で間隔を作る。**（ユーザー指示 2026-09-21）
  //
  //   > 「無尽蔵に増やしまくれるか章毎に絞るかじゃなくて、スキルツリーの深さとかで
  //   >  対応しなよ、1基増やしたら次増やすコストめちゃくちゃ跳ね上がって、
  //   >  実質5章後ぐらいにしか取れないとかさ」
  //
  //   逆算：収入は実測で **×4.8/章**（3シード）。等比コストなら
  //   **1段あたりの間隔 ＝ log(costG) ÷ log(4.8)** 章。
  //
  //     costG      1段あける章数
  //        5         1章
  //       23         2章
  //      111         3章
  //      531         4章
  //    2,548         5章
  //   12,231         6章
  //
  //   **以前は costG 7.5 ＝ 1.28章に1段**で、実質お金だけで全部解放になっていた。
  //   全武器に効くぶんは**6章に1段**（30章でちょうど5段）に置く
  //   **全武器に効くぶんは、後半の贅沢品として置く。**
  //   カテゴリ別のノードと同じ時期に開くと、1つの武器が一度に +2 されて
  //   「1基ずつ増える」感触にならない（実測：第4章と第8章で両方が同時に開いた）。
  //   cost0 を大きく取って、開き始めを中盤以降にずらす
  //   **盤に置ける総数を増やす、唯一の節。**（2026-09-22）
  //   以前は「どの武器も +1」だったので、編成4種ぶん ＝ 盤の上では +4 になっていた。
  //   いまは盤の総数（Game.slotsTotal）に +1。6基から始まって最大11基。
  //   costG は 2,548 ＝ 収入の伸び（×4.8/章）で **1段あけるのに約5章**
  //   （ユーザー「1基増やしたら次増やすコストめちゃくちゃ跳ね上がって、
  //     実質5章後ぐらいにしか取れないとかさ」）
  { id: 'units', name: '増設基盤', icon: '⛁', group: '拠点',
    eff: 1, mode: 'add', tmpl: '盤に置ける数が +{e} 基（全体）',
    cost0: 3e4, costG: 2548, max: 5, unlock: 1 },
  // 拠点の枝は「防衛線」を外したぶん浅いので、**HP以外**で深くする
  { id: 'turn', name: '旋回機構', icon: '⛁', group: '拠点',
    eff: 1.08, mode: 'mul', tmpl: 'どの武器も首を振る速さ ×{e}',
    cost0: 70, costG: 1.30, max: Infinity, unlock: 1 },
  { id: 'build', name: '前倒し配備', icon: '⛁', group: '拠点',
    eff: 1, mode: 'add', tmpl: 'ウェーブを凌ぐごとにコイン +{e}%（凌いだ時点の残りライフに比例）',
    cost0: 300, costG: 1.45, max: 20, unlock: 2 },

  // ============ カテゴリ別：**取り切りで1段ずつ開く**（2026-09-21 作り直し）============
  //
  //   > 「同じスキルのレベルをずっと強化し続けるから開放していく感じがない、
  //   >  取り切りで次のツリーに進んで、コスト曲線で目指すところをつけようや、
  //   >  そしたらインフレも制御しやすいし、スキル一個取っただけで激変！が味わえるし」
  //
  //   **1ノードは `max: 1`。取ると `needs` で次が開く。** 効果は1回で体感できる大きさにする。
  //
  //   **天井が設計で決まるのが、この形のいちばんの利点。**
  //   1カテゴリを全部取ると ダメージ ×3.5 → ×3.5 → ×3.5 ＝ **×43**、
  //   レート ×2.2、射程 ×1.6 で、実効 **×151**。
  //
  //   **この数字は「1周で進む章数」から逆算している。**
  //     1周で進む章数 = log(土台の余裕 × ツリーの天井) / log(敵の重さ/章)
  //     周1で進む章数 = log(ツリーの天井)              / log(敵の重さ/章)
  //   敵 ×6.54/章・土台の余裕 ×2 のとき、ツリー ×151 で **周1が2.7章・1周あたり3.0章**。
  //   ユーザーの狙い「13章に行くのに転生4回」に合う（→ docs/DESIGN-CORE-2026-09-21.md §5）
  //   敵は 0921h 以降 ウェーブ全体の重さが **×3.71/章** なので、6章ぶんが ×706。
  //   **ツリーを取り切ると、だいたい6章ぶん進める**計算（残りはカードが埋める）。
  //   周1で6章＝転生4回で第13章、というユーザーの狙いに合わせてある。
  //
  //   値段は収入の伸び（実測 ×4.8/章）に合わせて1段ごとに ×4.8。
  //   **1段＝およそ1章**のペース。`costG` は使わない（取り切りなので意味がない）

  { id: 'short_dmg', name: '近接兵装', icon: '◤', group: '短射程', cat: 'short', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '短射程カテゴリのダメージ ×{e}',
    cost0: 100, costG: 1, max: 1, unlock: 0 },
  { id: 'short_rate', name: '近接機構', icon: '◤', group: '短射程', cat: 'short', key: 'rate',
    eff: 2.2, mode: 'mul', tmpl: '短射程カテゴリの発射レート ×{e}',
    cost0: 480, costG: 1, max: 1, unlock: 0, needs: 'short_dmg' },
  { id: 'short_dmg2', name: '近接増幅', icon: '◤', group: '短射程', cat: 'short', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '短射程カテゴリのダメージ ×{e}',
    cost0: 2304, costG: 1, max: 1, unlock: 0, needs: 'short_rate' },
  { id: 'short_rng', name: '近接観測', icon: '◤', group: '短射程', cat: 'short', key: 'range',
    eff: 1.6, mode: 'mul', tmpl: '短射程カテゴリの射程 ×{e}',
    cost0: 11059, costG: 1, max: 1, unlock: 0, needs: 'short_dmg2' },
  { id: 'short_util', name: '粘着処理', icon: '◤', group: '短射程', cat: 'short', key: 'dur',
    eff: 1.8, mode: 'mul', tmpl: '短射程カテゴリの状態異常の持続 ×{e}',
    cost0: 53084, costG: 1, max: 1, unlock: 0, needs: 'short_rng' },
  { id: 'short_dmg3', name: '近接極大', icon: '◤', group: '短射程', cat: 'short', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '短射程カテゴリのダメージ ×{e}',
    cost0: 254804, costG: 1, max: 1, unlock: 0, needs: 'short_util' },
  { id: 'short_unit', name: '前線基盤', icon: '◤', group: '短射程', cat: 'short', key: 'units',
    eff: 1, mode: 'add', tmpl: '短射程の武器1種あたりの上限 +{e} 基（盤の総数は増えない）',
    cost0: 1320, costG: 2548, max: 4, unlock: 0 },

  { id: 'mid_dmg', name: '汎用兵装', icon: '◈', group: '中射程', cat: 'mid', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '中射程カテゴリのダメージ ×{e}',
    cost0: 100, costG: 1, max: 1, unlock: 0 },
  { id: 'mid_rate', name: '汎用機構', icon: '◈', group: '中射程', cat: 'mid', key: 'rate',
    eff: 2.2, mode: 'mul', tmpl: '中射程カテゴリの発射レート ×{e}',
    cost0: 480, costG: 1, max: 1, unlock: 0, needs: 'mid_dmg' },
  { id: 'mid_dmg2', name: '汎用増幅', icon: '◈', group: '中射程', cat: 'mid', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '中射程カテゴリのダメージ ×{e}',
    cost0: 2304, costG: 1, max: 1, unlock: 0, needs: 'mid_rate' },
  { id: 'mid_rng', name: '汎用観測', icon: '◈', group: '中射程', cat: 'mid', key: 'range',
    eff: 1.6, mode: 'mul', tmpl: '中射程カテゴリの射程 ×{e}',
    cost0: 11059, costG: 1, max: 1, unlock: 0, needs: 'mid_dmg2' },
  { id: 'mid_util', name: '硬芯弾', icon: '◈', group: '中射程', cat: 'mid', key: 'pierce',
    eff: 3, mode: 'add', tmpl: '中射程カテゴリの貫通 +{e}',
    cost0: 53084, costG: 1, max: 1, unlock: 0, needs: 'mid_rng' },
  { id: 'mid_dmg3', name: '汎用極大', icon: '◈', group: '中射程', cat: 'mid', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '中射程カテゴリのダメージ ×{e}',
    cost0: 254804, costG: 1, max: 1, unlock: 0, needs: 'mid_util' },
  { id: 'mid_unit', name: '量産設備', icon: '◈', group: '中射程', cat: 'mid', key: 'units',
    eff: 1, mode: 'add', tmpl: '中射程の武器1種あたりの上限 +{e} 基（盤の総数は増えない）',
    cost0: 1290, costG: 2548, max: 4, unlock: 0 },

  { id: 'long_dmg', name: '徹甲兵装', icon: '◎', group: '長射程', cat: 'long', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '長射程カテゴリのダメージ ×{e}',
    cost0: 100, costG: 1, max: 1, unlock: 0 },
  { id: 'long_rate', name: '徹甲機構', icon: '◎', group: '長射程', cat: 'long', key: 'rate',
    eff: 2.2, mode: 'mul', tmpl: '長射程カテゴリの発射レート ×{e}',
    cost0: 480, costG: 1, max: 1, unlock: 0, needs: 'long_dmg' },
  { id: 'long_dmg2', name: '徹甲増幅', icon: '◎', group: '長射程', cat: 'long', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '長射程カテゴリのダメージ ×{e}',
    cost0: 2304, costG: 1, max: 1, unlock: 0, needs: 'long_rate' },
  { id: 'long_rng', name: '徹甲観測', icon: '◎', group: '長射程', cat: 'long', key: 'range',
    eff: 1.6, mode: 'mul', tmpl: '長射程カテゴリの射程 ×{e}',
    cost0: 11059, costG: 1, max: 1, unlock: 0, needs: 'long_dmg2' },
  { id: 'long_util', name: '照準計算機', icon: '◎', group: '長射程', cat: 'long', key: 'crit',
    eff: 0.25, mode: 'add', tmpl: '長射程カテゴリの会心率 +{e}（会心倍率も上がる）',
    cost0: 53084, costG: 1, max: 1, unlock: 0, needs: 'long_rng' },
  { id: 'long_dmg3', name: '徹甲極大', icon: '◎', group: '長射程', cat: 'long', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '長射程カテゴリのダメージ ×{e}',
    cost0: 254804, costG: 1, max: 1, unlock: 0, needs: 'long_util' },
  { id: 'long_unit', name: '狙撃陣地', icon: '◎', group: '長射程', cat: 'long', key: 'units',
    eff: 1, mode: 'add', tmpl: '長射程の武器1種あたりの上限 +{e} 基（盤の総数は増えない）',
    cost0: 1140, costG: 2548, max: 4, unlock: 0 },

  { id: 'area_dmg', name: '高熱兵装', icon: '▲', group: '範囲攻撃', cat: 'area', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '範囲攻撃カテゴリのダメージ ×{e}',
    cost0: 100, costG: 1, max: 1, unlock: 0 },
  { id: 'area_rate', name: '高熱機構', icon: '▲', group: '範囲攻撃', cat: 'area', key: 'rate',
    eff: 2.2, mode: 'mul', tmpl: '範囲攻撃カテゴリの発射レート ×{e}',
    cost0: 480, costG: 1, max: 1, unlock: 0, needs: 'area_dmg' },
  { id: 'area_dmg2', name: '高熱増幅', icon: '▲', group: '範囲攻撃', cat: 'area', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '範囲攻撃カテゴリのダメージ ×{e}',
    cost0: 2304, costG: 1, max: 1, unlock: 0, needs: 'area_rate' },
  { id: 'area_rng', name: '高熱観測', icon: '▲', group: '範囲攻撃', cat: 'area', key: 'range',
    eff: 1.6, mode: 'mul', tmpl: '範囲攻撃カテゴリの射程 ×{e}',
    cost0: 11059, costG: 1, max: 1, unlock: 0, needs: 'area_dmg2' },
  { id: 'area_util', name: '拡散増幅', icon: '▲', group: '範囲攻撃', cat: 'area', key: 'size',
    eff: 1.8, mode: 'mul', tmpl: '範囲攻撃カテゴリの効果範囲 ×{e}',
    cost0: 53084, costG: 1, max: 1, unlock: 0, needs: 'area_rng' },
  { id: 'area_dmg3', name: '高熱極大', icon: '▲', group: '範囲攻撃', cat: 'area', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '範囲攻撃カテゴリのダメージ ×{e}',
    cost0: 254804, costG: 1, max: 1, unlock: 0, needs: 'area_util' },
  { id: 'area_unit', name: '散布基盤', icon: '▲', group: '範囲攻撃', cat: 'area', key: 'units',
    eff: 1, mode: 'add', tmpl: '範囲攻撃の武器1種あたりの上限 +{e} 基（盤の総数は増えない）',
    cost0: 480, costG: 2548, max: 4, unlock: 0 },

  { id: 'target_dmg', name: '成形兵装', icon: '✛', group: '指定攻撃', cat: 'target', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '指定攻撃カテゴリのダメージ ×{e}',
    cost0: 100, costG: 1, max: 1, unlock: 0 },
  { id: 'target_rate', name: '成形機構', icon: '✛', group: '指定攻撃', cat: 'target', key: 'rate',
    eff: 2.2, mode: 'mul', tmpl: '指定攻撃カテゴリの発射レート ×{e}',
    cost0: 480, costG: 1, max: 1, unlock: 0, needs: 'target_dmg' },
  { id: 'target_dmg2', name: '成形増幅', icon: '✛', group: '指定攻撃', cat: 'target', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '指定攻撃カテゴリのダメージ ×{e}',
    cost0: 2304, costG: 1, max: 1, unlock: 0, needs: 'target_rate' },
  { id: 'target_rng', name: '成形観測', icon: '✛', group: '指定攻撃', cat: 'target', key: 'range',
    eff: 1.6, mode: 'mul', tmpl: '指定攻撃カテゴリの射程 ×{e}',
    cost0: 11059, costG: 1, max: 1, unlock: 0, needs: 'target_dmg2' },
  { id: 'target_util', name: '多連装', icon: '✛', group: '指定攻撃', cat: 'target', key: 'count',
    eff: 2, mode: 'add', tmpl: '指定攻撃カテゴリの同時発射 +{e} 発',
    cost0: 53084, costG: 1, max: 1, unlock: 0, needs: 'target_rng' },
  { id: 'target_dmg3', name: '成形極大', icon: '✛', group: '指定攻撃', cat: 'target', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '指定攻撃カテゴリのダメージ ×{e}',
    cost0: 254804, costG: 1, max: 1, unlock: 0, needs: 'target_util' },
  { id: 'target_unit', name: '支持架台', icon: '✛', group: '指定攻撃', cat: 'target', key: 'units',
    eff: 1, mode: 'add', tmpl: '指定攻撃の武器1種あたりの上限 +{e} 基（盤の総数は増えない）',
    cost0: 1500, costG: 2548, max: 4, unlock: 0 },

  { id: 'support_dmg', name: '制圧兵装', icon: '❉', group: '支援', cat: 'support', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '支援カテゴリのダメージ ×{e}',
    cost0: 100, costG: 1, max: 1, unlock: 0 },
  { id: 'support_rate', name: '制圧機構', icon: '❉', group: '支援', cat: 'support', key: 'rate',
    eff: 2.2, mode: 'mul', tmpl: '支援カテゴリの発射レート ×{e}',
    cost0: 480, costG: 1, max: 1, unlock: 0, needs: 'support_dmg' },
  { id: 'support_dmg2', name: '制圧増幅', icon: '❉', group: '支援', cat: 'support', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '支援カテゴリのダメージ ×{e}',
    cost0: 2304, costG: 1, max: 1, unlock: 0, needs: 'support_rate' },
  { id: 'support_rng', name: '制圧観測', icon: '❉', group: '支援', cat: 'support', key: 'range',
    eff: 1.6, mode: 'mul', tmpl: '支援カテゴリの射程 ×{e}',
    cost0: 11059, costG: 1, max: 1, unlock: 0, needs: 'support_dmg2' },
  { id: 'support_util', name: '拡張リング', icon: '❉', group: '支援', cat: 'support', key: 'size',
    eff: 1.8, mode: 'mul', tmpl: '支援カテゴリの効果範囲 ×{e}',
    cost0: 53084, costG: 1, max: 1, unlock: 0, needs: 'support_rng' },
  { id: 'support_dmg3', name: '制圧極大', icon: '❉', group: '支援', cat: 'support', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '支援カテゴリのダメージ ×{e}',
    cost0: 254804, costG: 1, max: 1, unlock: 0, needs: 'support_util' },
  { id: 'support_unit', name: '支援拠点', icon: '❉', group: '支援', cat: 'support', key: 'units',
    eff: 1, mode: 'add', tmpl: '支援の武器1種あたりの上限 +{e} 基（盤の総数は増えない）',
    cost0: 1860, costG: 2548, max: 4, unlock: 0 },

  // ============ カード側の枠を増やす ============
  { id: 'picks', name: '増設スロット', icon: '★', group: 'カード',
    eff: 1, mode: 'add', tmpl: 'ウェーブ突破ごとに取れるカードが +{e} 枚',
    cost0: 900, costG: 6.0, max: 3, unlock: 2 },
  { id: 'choices', name: '選択肢拡張', icon: '✧', group: 'カード',
    eff: 1, mode: 'add', tmpl: 'カード選択の提示枚数 +{e}（3択 → 4択 …）',
    cost0: 500, costG: 4.2, max: 3, unlock: 2 },
  { id: 'luck', name: '幸運回路', icon: '✧', group: 'カード',
    eff: 1, mode: 'add', tmpl: 'カード選択で高レアリティが出やすくなる',
    cost0: 120, costG: 1.55, max: Infinity, unlock: 1 },
  { id: 'pack', name: '解析装置', icon: '⬢', group: 'カード',
    eff: 1, mode: 'add', tmpl: '転生で得るカードパックの等級が上がりやすくなる',
    cost0: 300, costG: 1.80, max: 12, unlock: 3 },

  // ============ 危険と引き換え ============
  { id: 'lure', name: '敵誘引', icon: '◌', group: '危険',
    eff: 0.12, mode: 'add', tmpl: '敵の出現数 +{e}倍 / コイン獲得 +6%（危険だが儲かる）',
    cost0: 40, costG: 1.45, max: 60, unlock: 1 },
];

const SKILL_BY_ID = {};
for (const s of SKILLS) SKILL_BY_ID[s.id] = s;

// ============ 換装 ============
//
//   【何と何を入れ替えるのか】
//     スキルツリーの**特定の1ノードだけ**を、別の効き方に差し替える。
//     どのノードに刺さるかは `base` が持っている（1つの部品は1つのノード専用）。
//     例：`sw_short_rate 速振り` は `short_rng 突破力` にしか刺さらない。
//
//   【何が変わって、何が変わらないか】
//     変わる   … 名前・アイコン・効き方（key / eff / mode）
//     変わらない … 値段・上限・解放条件・カテゴリ・**買ったレベル**
//     つまり強くなるのではなく、**伸ばす方向が変わる**だけ。
//
//   【どこで手に入り、どこで付け替えるのか】
//     手に入る … パック開封の3択（`Pack.swapChance` の確率で出る）。
//                **選んだ1つだけが手持ちになる。選ばなかった2つは手に入らない。**
//     付け替え … 一度手に入れた部品は `perm.swapsOwned` に残り、
//                **スキルツリーで、そのノードをタップすればいつでも付け替えられる。**
//                元の効き方にも、いつでも戻せる（`Skill.setSwap(perm, base, null)`）。
//     → だからパックで「今は換えない」を選んでも、**あとから直せる**。
//        ただし部品そのものは、選ばなければ手に入らない。
//
//   eff は、同じ key を持つ既存ノードから写している（新しい数字を作らない）。
//     rate 1.07 = mid_rate / rate 1.08 = target_rate
//     crit 0.04 = long_crit / range 1.09 = short_rng / size 1.10 = area_size
const SWAPS = [
  { id: 'sw_mid_crit', base: 'mid_rate', name: '収束照準', icon: '◈', key: 'crit',
    eff: 0.04, mode: 'add', tmpl: '中射程カテゴリの会心率 +{e}（会心倍率も上がる）' },
  { id: 'sw_short_rate', base: 'short_rng', name: '速振り', icon: '◤', key: 'rate',
    eff: 1.07, mode: 'mul', tmpl: '短射程カテゴリの発射レート ×{e}' },
  { id: 'sw_long_rate', base: 'long_crit', name: '速射砲身', icon: '◎', key: 'rate',
    eff: 1.08, mode: 'mul', tmpl: '長射程カテゴリの発射レート ×{e}' },
  { id: 'sw_area_crit', base: 'area_size', name: '起爆同調', icon: '▲', key: 'crit',
    eff: 0.04, mode: 'add', tmpl: '範囲攻撃カテゴリの会心率 +{e}（会心倍率も上がる）' },
  { id: 'sw_target_rng', base: 'target_rate', name: '遠隔観測', icon: '✛', key: 'range',
    eff: 1.09, mode: 'mul', tmpl: '指定攻撃カテゴリの射程 ×{e}' },
  { id: 'sw_sup_dmg', base: 'sup_pow', name: '過負荷回路', icon: '❉', key: 'dmg',
    eff: 1.12, mode: 'mul', tmpl: '支援カテゴリのダメージ ×{e}' },
];

const SWAP_BY_ID = {};
const SWAPS_FOR = {};
for (const s of SWAPS) {
  SWAP_BY_ID[s.id] = s;
  (SWAPS_FOR[s.base] || (SWAPS_FOR[s.base] = [])).push(s);
}

const Skill = {
  // 買ったレベル ＋ 遺物「初期投資」がくれる下駄。
  // **下駄のぶんは値段にも乗る**（安いレベルを飛ばして始める、という意味）
  lv(meta, id) {
    const p = (typeof Game !== 'undefined' && Game.perm) ? Game.perm : null;
    const s = SKILL_BY_ID[id];
    // **設置枠には遺物の下駄を履かせない。**
    //   遊んでもらった結果「転生エピックの基数追加で無強化プレイができる、
    //   転生2回でゲームが崩壊する」という報告が出た。
    //   設置枠は火力・カバー範囲・漏れにくさが同時に増えて他の全強化と掛け算になるので、
    //   **判定は key で行う。** 以前は `maxPerClear` の有無で見ていたが、
    //   2026-09-21 に設置枠を「進行の縛り」から「値段の跳ね上がり」へ変えたときに
    //   maxPerClear を外したので、その条件だと**下駄が復活してしまう。**
    //   設置枠かどうかは `key === 'units'` で直接見る
    const isUnitNode = s && (s.key === 'units' || s.id === 'units');
    const base = (p && typeof Relic !== 'undefined' && !isUnitNode)
      ? Relic.mods(p).startLv : 0;
    const lv = (meta.skills[id] || 0) + base;
    return s ? Math.min(lv, Skill.maxOf(p, id)) : lv;
  },

  // 換装を当てはめたあとのノード定義。**ここ以外で SKILL_BY_ID を直に見ない**
  node(id, perm) {
    const base = SKILL_BY_ID[id];
    const p = perm || ((typeof Game !== 'undefined' && Game.perm) ? Game.perm : null);
    const sw = p && p.swaps && SWAP_BY_ID[p.swaps[id]];
    if (!sw) return base;
    return {
      id: base.id, cat: base.cat, group: base.group,
      cost0: base.cost0, costG: base.costG, max: base.max, unlock: base.unlock,
      name: sw.name, icon: sw.icon, tmpl: sw.tmpl, eff: sw.eff, mode: sw.mode, key: sw.key,
      swappedFrom: base.name, swapId: sw.id,
    };
  },

  // 表示文は eff から作る。計算式と同じ値を見ているので、ズレようがない
  desc(s) { return s.tmpl.split('{e}').join(String(s.eff)); },

  // 短い表示。**カテゴリ名は枝の色と見出しが示すので、文からは落とす。**
  //   「短射程カテゴリのダメージ ×1.15」→「ダメージ ×1.15」
  shortDesc(s) {
    return Skill.desc(s)
      .replace(/^[^のカ]*カテゴリの/, '')
      .replace(/（[^）]*）/g, '')
      .trim();
  },

  // 値段は「レベル」だけでなく「どこまで進んだか」でも上がる。
  //
  //   **これが無いと、コインに重みが戻らない。**
  //   収入は1ステージで ×40〜70 に伸びるのに、段の値上がりは ×1.3 しかない。
  //   実測：1面終了時に残高が次の1段の108倍、5面では162万倍。
  //   costG を ×1.45 まで上げても 4,179倍のままで、先に突破できなくなった
  //   （＝値上がりの「次数」が収入と違うので、係数では追いつかない）。
  //   ステージを踏むたびに値段の桁も上がる形にして、次数を揃える
  cost(meta, id, perm) {
    const s = SKILL_BY_ID[id];
    const p = perm || ((typeof Game !== 'undefined' && Game.perm) ? Game.perm : null);
    const cleared = p ? MAIN_STAGES.filter(x => (p.stages[x.id] || {}).cleared).length : 0;
    return Math.ceil(s.cost0
      * Math.pow(s.costG, Skill.lv(meta, id))
      * Math.pow(BAL.costPerStage, cleared));
  },

  // レベルぶんの効果量。mul なら累乗、add なら加算
  amount(meta, id) {
    const s = Skill.node(id);
    const lv = Skill.lv(meta, id);
    return s.mode === 'mul' ? Math.pow(s.eff, lv) : s.eff * lv;
  },

  // カテゴリのノードは、そのカテゴリの武器を1つでも持っていれば解放される
  isUnlocked(perm, id) {
    const s = SKILL_BY_ID[id];
    // **前のノードを取っていないと開かない。**（取り切り型ツリー・2026-09-21）
    //   `needs` に前のノードのIDを書く。枝が「順に開いていく」形になる
    if (s.needs) {
      const meta = (typeof Game !== 'undefined' && Game.meta) ? Game.meta : null;
      if (!meta || (meta.skills[s.needs] || 0) <= 0) return false;
    }
    if (s.cat) {
      return WEAPON_IDS.some(wid => WEAPONS[wid].cat === s.cat && (perm.collection['wc_' + wid] || 0) > 0);
    }
    const cleared = MAIN_STAGES.filter(x => (perm.stages[x.id] || {}).cleared).length;
    return cleared >= s.unlock;
  },

  lockReason(perm, id) {
    const s = SKILL_BY_ID[id];
    if (s.needs) {
      const meta = (typeof Game !== 'undefined' && Game.meta) ? Game.meta : null;
      if (!meta || (meta.skills[s.needs] || 0) <= 0) {
        const prev = SKILL_BY_ID[s.needs];
        return '「' + (prev ? prev.name : s.needs) + '」を取ると開放';
      }
    }
    if (s.cat) return CATEGORIES[s.cat].name + 'の武器を手に入れると解放';
    return 'ステージを ' + s.unlock + ' 個突破すると解放';
  },

  // そのノードの今の上限。
  //
  //   **設置枠だけは「お金では前借りできない」。**
  //   コインは終盤に余るので、値段をいくら上げても止まらない。
  //   実測：1面終了時に既に残高が次の1段の70倍、5面で78万倍あった。
  //   設置枠は火力・カバー範囲・漏れにくさが同時に増えて他の全強化と掛け算になるので、
  //   ここだけは**踏破したステージ数**という、お金で買えないもので止める
  maxOf(perm, id) {
    const s = SKILL_BY_ID[id];
    if (!s.maxPerClear) return s.max;
    const p = perm || ((typeof Game !== 'undefined' && Game.perm) ? Game.perm : null);
    const cleared = p ? MAIN_STAGES.filter(x => (p.stages[x.id] || {}).cleared).length : 0;
    // **切り捨てる。** maxPerClear が 1/6 のような分数だと、
    //   6章突破で 1.0、7章で 1.166… になり、切り捨てないと1段多く買えてしまう
    return Math.min(s.max, Math.floor(cleared * s.maxPerClear));
  },

  // 上限に届いていて、その理由が進行なら、そう言う（値段のせいだと誤解させない）
  capReason(perm, id) {
    const s = SKILL_BY_ID[id];
    if (!s.maxPerClear) return '';
    if (Skill.maxOf(perm, id) >= s.max) return '';
    return 'ステージを突破すると、あと ' + Math.round(s.max - Skill.maxOf(perm, id)) + ' 段まで伸ばせます';
  },

  canBuy(meta, perm, id) {
    if (!Skill.isUnlocked(perm, id)) return false;
    if (Skill.lv(meta, id) >= Skill.maxOf(perm, id)) return false;
    return meta.coins >= Skill.cost(meta, id);
  },

  buy(meta, perm, id) {
    if (!Skill.canBuy(meta, perm, id)) return false;
    meta.coins -= Skill.cost(meta, id);
    // **買った数だけを数える。** ここで Skill.lv を使うと遺物の下駄が二重に乗る
    meta.skills[id] = (meta.skills[id] || 0) + 1;
    return true;
  },

  // そのカテゴリの「置ける数」の加算ぶん。
  // **設置数は倍率ではなく加算なので、mods を通さず直接引けるようにしておく**
  unitBonusFor(meta, cat) {
    const node = SKILLS.find(s => s.cat === cat && s.key === 'units');
    return node ? Skill.amount(meta, node.id) : 0;
  },

  // 安い順にまとめ買いする。**周回のたびに同じ買い物を手で繰り返させないため。**
  //   測定器が1周を回すときと同じ買い方（安い順）なので、
  //   実測の数字と、プレイヤーが押したときの結果がずれない。
  //   **敵誘引だけは買わない。** 敵の数が増えるノードなので、勝手に押されると事故になる
  // **取り切りの節を先に買う。**（2026-09-21）
  //   ツリーを取り切り型にしたら、「安い順」だと
  //   **安い繰り返し節（幸運・パック運・首振り）に使い切って、
  //   主力のダメージ節（5万コイン）を買わないまま詰む**ようになった。
  //   実測：コイン105万を持ちながら 53,084 の節を取っていなかった。
  //   取り切り（max 1）＝枝を進める節なので、こちらを優先する
  buyOrder(meta, perm) {
    return SKILLS.map(s => s.id)
      .filter(id => id !== 'lure' && Skill.canBuy(meta, perm, id))
      .sort((a, b) => {
        const sa = SKILL_BY_ID[a], sb = SKILL_BY_ID[b];
        const oa = sa.max === 1 ? 0 : 1, ob = sb.max === 1 ? 0 : 1;
        if (oa !== ob) return oa - ob;
        return Skill.cost(meta, a) - Skill.cost(meta, b);
      });
  },

  buyAll(meta, perm, cap) {
    let n = 0, spent = 0;
    for (let i = 0; i < (cap || 500); i++) {
      const ids = Skill.buyOrder(meta, perm);
      if (!ids.length) break;
      const c = Skill.cost(meta, ids[0]);
      if (!Skill.buy(meta, perm, ids[0])) break;
      spent += c; n++;
    }
    return { n, spent };
  },

  // まとめ買いで1つでも買えるか
  canBuyAny(meta, perm) {
    return SKILLS.some(s => s.id !== 'lure' && Skill.canBuy(meta, perm, s.id));
  },

  // パックで出す換装の候補。**買っていないノードは換えられない**（換える意味が無い）。
  // すでに持っている部品は出さない（持っているものはツリーで付け替えられるため）
  swapChoices(meta, perm, n) {
    const pool = SWAPS.filter(sw =>
      Skill.isUnlocked(perm, sw.base) &&
      Skill.lv(meta, sw.base) > 0 &&
      !(perm.swapsOwned && perm.swapsOwned[sw.id]));
    Util.shuffle(pool);
    return pool.slice(0, n || 3);
  },

  // 部品を持っているか／そのノード用に持っている部品は何か
  ownsSwap(perm, swapId) { return !!(perm.swapsOwned && perm.swapsOwned[swapId]); },
  ownedSwapsFor(perm, baseId) {
    return (SWAPS_FOR[baseId] || []).filter(sw => Skill.ownsSwap(perm, sw.id));
  },
  // そのノードに刺さりうる部品が、そもそも世の中に在るか（説明に使う）
  hasSwapFor(baseId) { return !!(SWAPS_FOR[baseId] || []).length; },

  // パックで選んだ＝**手に入れて、そのまま付ける**
  applySwap(perm, swapId) {
    const sw = SWAP_BY_ID[swapId];
    if (!sw) return false;
    if (!perm.swapsOwned) perm.swapsOwned = {};
    perm.swapsOwned[sw.id] = 1;
    return Skill.setSwap(perm, sw.base, sw.id);
  },

  // ツリーから付け替える。swapId に null を渡すと元の効き方へ戻る。
  // **持っていない部品は付けられない**
  setSwap(perm, baseId, swapId) {
    if (!perm.swaps) perm.swaps = {};
    if (!swapId) { delete perm.swaps[baseId]; return true; }
    const sw = SWAP_BY_ID[swapId];
    if (!sw || sw.base !== baseId || !Skill.ownsSwap(perm, swapId)) return false;
    perm.swaps[baseId] = swapId;
    return true;
  },

  // アップグレード＋転生ボーナスを、出撃時の倍率一式にまとめる
  mods(meta, perm) {
    const A = (id) => Skill.amount(meta, id);
    // 転生で残る層。**以前は prestigePower^回数 の ×1.35 一本だった。**
    // それだと1周で積む ×133 に対して 1% しかなく、実測で 2周目が 0.99〜1.10倍の速さ
    // ＝ ほとんど楽にならなかったので、遺物カードに置き換えた
    const R = Relic.mods(perm);
    const pw = R.dmg;

    // カテゴリ別のノードを、定義から自動で組み立てる。
    // ノードを足したら cat と key を書くだけで、ここを直す必要は無い
    // **同じ key のノードが1カテゴリに何個あってもよい形にする。**
    //   取り切り型にしてダメージのノードを3段並べたら、以前の書き方では
    //   **後のノードが前のノードを上書きしていた**（×3→×5→×8 が ×8 だけになっていた）。
    //   mul は掛け合わせ、add は足し合わせる
    const cat = {};
    for (const c of CATEGORY_IDS) cat[c] = {};
    for (const base of SKILLS) {
      const s = Skill.node(base.id, perm);
      if (!s.cat || !s.key) continue;
      const v = A(s.id);
      const c = cat[s.cat];
      if (s.mode === 'mul') c[s.key] = (c[s.key] === undefined ? 1 : c[s.key]) * v;
      else c[s.key] = (c[s.key] || 0) + v;
    }
    for (const c of CATEGORY_IDS) {
      const k = cat[c];
      // 恒久層（土台＋遺物）は、カテゴリのダメージにまとめて掛ける
      if (SKILLS.some(s => s.cat === c && s.key === 'dmg')) k.dmg = (k.dmg === undefined ? 1 : k.dmg) * pw;
      if (k.crit) k.critMul = k.crit * 3.75;   // 会心率1%につき倍率+0.0375
      // **遺物は全カテゴリに掛かる**（そのカテゴリに対応する節が無くても効く）
      k.rate  = (k.rate  || 1) * R.rate;
      k.range = (k.range || 1) * (R.range || 1);
      k.size  = (k.size  || 1) * (R.size  || 1);
      k.speed = (k.speed || 1) * (R.speed || 1);
      if (R.pierce) k.pierce = (k.pierce || 0) + R.pierce;
      if (R.crit)   { k.crit = (k.crit || 0) + R.crit; k.critMul = k.crit * 3.75; }
    }

    return {
      coin:   (1 + A('coin')) * (1 + 0.06 * Skill.lv(meta, 'lure')) * R.coin,
      lives:  R.lives,        // ツリーからは増えない（「防衛線」を撤去した）
      regen:  A('regen') + (R.regen || 0),
      spawn:  1 + A('lure'),
      luck:   Skill.lv(meta, 'luck'),
      packLuck: Skill.lv(meta, 'pack'),
      picks:   1 + A('picks') + (R.picks || 0),
      choices: BAL.draftSize + A('choices') + (R.choices || 0),
      units:   A('units'),   // **遺物からは増やさない。**（R.units は存在せず NaN になっていた）
      prestige: pw,
      relic: R,
      cat,
    };
  },

  // 1つの武器へ、そのカテゴリの倍率を適用する
  applyTo(w, mods) {
    const c = mods.cat[w.def.cat];
    if (!c) return;
    if (c.dmg) w.s.dmg *= c.dmg;
    if (c.rate) w.s.rate *= c.rate;
    if (c.range) w.s.range *= c.range;
    if (c.crit) { w.s.crit += c.crit; w.s.critMul += c.critMul || 0; }
    if (c.size) {
      w.s.splash *= c.size;
      w.s.fieldR *= c.size;
      w.s.cone = Math.min(Math.PI * 0.95, w.s.cone * c.size);
    }
    if (c.dur) {
      w.s.slowDur *= c.dur;
      w.s.stunDur *= c.dur;
      w.s.knockDur *= c.dur;
      w.s.shockDur *= c.dur;
      w.s.fieldDur *= c.dur;
    }
    // ---- ここから下は、ツリーを深くしたときに足した口（2026-09-21）----
    if (c.pierce) w.s.pierce += c.pierce;       // 貫通は整数で足す
    if (c.count)  w.s.count  += c.count;        // 同時発射も整数で足す
    if (c.speed)  w.s.speed  *= c.speed;        // 弾速
    if (c.turn)   w.s.turn   *= c.turn;         // 首振りの速さ
  },
};
