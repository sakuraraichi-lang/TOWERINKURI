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

// ---------------------------------------------------------------
// 取り切りの「連なり」を作るための道具
//
//   **1つの節でレベルを何段も上げるのはやめる。**（ユーザー指示・再掲 2026-09-22）
//   > 「幸運回路について、ツリー1個で複数レベル上げないでツリーを広げて欲しいと
//   >   言ったはず、もちろん経済カーブも、Lvが複数ある浅い所にあるスキルは
//   >   同じように見直して」
//
//   武器カテゴリの枝は先に取り切り化したが、**拠点・資源・カードの枝が漏れていた**
//   （集金効率・幸運回路・解析装置・敵誘引・増設基盤…と16節）。
//   ここを「取り切りの節を並べる」形に直す。
//
//   `chain()` は、1つの連なりを個別の節に展開する。
//     - どれも max:1（取り切り）
//     - 次の節は前の節を取ると開く（needs）
//     - 値段は cost0 から1段ごとに ×g。**収入の伸びは実測 ×4.8/章**なので、
//       g=4.8 で「1段およそ1章」、g=9 で「1段およそ2章」
//     - `gkey` は「この連なりが何を伸ばすか」。合計は Skill.gsum で取る
// ---------------------------------------------------------------
function chain(o) {
  const out = [];
  for (let i = 0; i < o.steps; i++) {
    out.push({
      id: o.id + (i + 1), name: o.names[i] || (o.name + (i + 1)),
      group: o.group, gkey: o.gkey || o.id,
      eff: o.eff, mode: o.mode || 'add', tmpl: o.tmpl,
      cost0: Math.round(o.cost0 * Math.pow(o.g, i)),
      costG: 1, max: 1, unlock: o.unlock || 0,
      needs: i === 0 ? o.needs : (o.id + i),
      cat: o.cat, key: o.key,
    });
  }
  return out;
}


// mode: 'mul' … レベルごとに eff 倍（累乗）
//       'add' … レベルごとに eff を加算
// tmpl の {e} が eff に置き換わる
const SKILLS = [
  // ============ 資源・拠点 ============
  // **累乗をやめた。** ×1.11 の上限無しだと、安いので延々買われて
  // 実測で Lv39・×153倍まで伸び、これが収入爆発の本体だった
  // （1面あたりの稼ぎが ×25.7 / ×6.4 / ×38.1 と暴れていた原因）。
  // 加算なら、レベルを積んでも収入の「次数」が上がらない
  ...chain({ id: 'coin', gkey: 'coin', group: '資源',
    names: ['集金効率', '回収機構', '精錬炉', '金融演算'],
    steps: 4, eff: 0.5, mode: 'add', tmpl: '敵から得るコイン +{e}倍',
    cost0: 40, g: 4.8, unlock: 0 }),
  // **【撤去 2026-09-21・ユーザー決定】「防衛線」（ライフ +3/段・上限なし）を外した。**
  //   > 「基本タワーのHP鍛えるスキルツリーはノーサンキュー、せめてカードで固定値上昇」
  //   漏れの重さは章によらず1体＝ライフ1のまま据え置くので、
  //   ライフを無限に買えると**難易度そのものを買って消せてしまう**。
  //   実測では Lv62（+186）まで積まれていた。
  //   ライフを増やす手段はカードの固定値（`gen_armor` 増設装甲 ライフ+6）に残してある。
  //   **`regen`（応急修理班）は残した。** 上限10段の回復で、HPの天井を上げるものではないため
  ...chain({ id: 'regen', gkey: 'regen', group: '拠点',
    names: ['応急修理班', '衛生分隊', '再建部隊'],
    steps: 3, eff: 1, mode: 'add', tmpl: 'ウェーブを1つ突破するごとにライフ +{e}（上限まで）',
    cost0: 200, g: 4.8, unlock: 1 }),
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
  //   **【2026-09-22・ユーザー指定】最終的に20基、クリア想定14基。**
  //   > 「最終的に上限20基で良いのですが、それはラスボス時にようやく
  //   >   到達できるくらいの窮屈さがよく、クリア想定は14基〜くらいが良いです」
  //   土台6 ＋ ここ最大14 ＝ 20基。**costG は実測で選んだ**
  //   （その周の終わりに何基置けたか。周の到達章と並べて見る）：
  //     2.6 … 6,10,13,19,20,20,20      第5周で20に届く（早すぎる）
  //     6   … 6,9,12,14,17,20,20       第20〜24章で20基（まだ早い）
  //     **9 … 6,6,9,11,13,16,18,19**    第17章で14基、**第30章でようやく19〜20基**
  //     14  … 6,8,8,9,11,13,14,16,17   20に届かない（遅すぎる）
  //   **取り切りの連なりに直した。**（2026-09-22）14段 × +1基 ＝ 土台6 と合わせて20基。
  //   **7段 × +2 にしたら周4で20に届いてしまった**（基数 8,12,16,20）。
  //   同じ天井でも、段が少ないと1段あたりの値段に対して増え方が急になる。
  //   1段ごとに ×9（＝およそ2章に1段）で、**第30章でようやく20基**になる
  ...chain({ id: 'units', gkey: 'units', group: '拠点',
    //   **【2026-09-23】天井 20基 → 34基（14段 × +2）。**
    //   **ユーザー承認済み。ただし34基は暫定値**（フィードバックで動かす前提）。
    //   > 「基数の天井を上げて、ちゃんと適切に火力を上げてようやくクリアできるのであれば、
    //   >   基数の天井は上げるべきです、ただし最初の頃のように、
    //   >   **雑多に基数を配り雑多に置きまくってクリアは避けて**ください」
    //
    //   **条件つきの承認。** 天井だけ上げると「置きまくって勝つ」形になる
    //   （実測：第30章・穴6で 22基479 → 38基83 → 58基10。しかも38基のところで
    //     火力を16倍振っても 60/55/55 で動かない）。
    //   **だから敵側も同時に上げる**（BAL.lateEnemyMul）。両方そろって初めて
    //   「火力を上げてようやくクリア」になる。
    //
    //   **段は14のまま、値上がりも ×9 のまま、1段の効果を +1 → +2 にする。**
    //   最初 24段 × +1・値上がり ×6.5 で天井30にしたが、
    //   **実際に届いたのは22基だった**（3シード：7,10,11,13,15,17,19,22,22）。
    //   値段曲線が律速なので、段を増やしても届かない。
    //   しかも ×6.5 に緩めると買う順番が変わって（枠が安くなって火力を後回しにする）、
    //   **序盤の前進が 3→6→10 から 3→4→7 に落ちた。**
    //   **×9 は実測で選んだ曲線なので動かさない**（この上の掃引を参照）。
    //   1段の効果だけ倍にすれば、同じ間隔のまま天井が 20 → 34 になる
    names: ['増設基盤', '第二基盤', '第三基盤', '拡張基盤', '重層基盤', '要塞化', '総力配備',
            '前線拡張', '補給拠点', '常設陣地', '恒久基盤', '大増設', '過剰配備', '限界配備'],
    steps: 14, eff: 2, mode: 'add', tmpl: '盤に置ける数が +{e} 基（全体）',
    cost0: 6e3, g: 9, unlock: 1 }),

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

  { id: 'short_dmg', name: '近接兵装', group: '短射程', cat: 'short', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '短射程カテゴリのダメージ ×{e}',
    cost0: 100, costG: 1, max: 1, unlock: 0 },
  { id: 'short_rate', name: '近接機構', group: '短射程', cat: 'short', key: 'rate',
    eff: 2.2, mode: 'mul', tmpl: '短射程カテゴリの発射レート ×{e}',
    cost0: 480, costG: 1, max: 1, unlock: 0, needs: 'short_dmg' },
  { id: 'short_dmg2', name: '近接増幅', group: '短射程', cat: 'short', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '短射程カテゴリのダメージ ×{e}',
    cost0: 2304, costG: 1, max: 1, unlock: 0, needs: 'short_rate' },
  { id: 'short_rng', name: '近接観測', group: '短射程', cat: 'short', key: 'range',
    eff: 1.6, mode: 'mul', tmpl: '短射程カテゴリの射程 ×{e}',
    cost0: 11059, costG: 1, max: 1, unlock: 0, needs: 'short_dmg2' },
  { id: 'short_util', name: '粘着処理', group: '短射程', cat: 'short', key: 'dur',
    eff: 1.8, mode: 'mul', tmpl: '短射程カテゴリの状態異常の持続 ×{e}',
    cost0: 53084, costG: 1, max: 1, unlock: 0, needs: 'short_rng' },
  { id: 'short_dmg3', name: '近接極大', group: '短射程', cat: 'short', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '短射程カテゴリのダメージ ×{e}',
    cost0: 254804, costG: 1, max: 1, unlock: 0, needs: 'short_util' },
  // **カテゴリの置ける数の節は6カテゴリそろえてある（2段・+1ずつ）。**（2026-09-24）
  //   強さの差はカテゴリの中で大きく割れていて（支援：凍結3.5基／触手10基超）、カテゴリの平均はほぼ同じ。
  //   なので上限の差は武器ごとの元の数（weapons.js の stock）で付ける
  ...chain({ id: 'short_unit', gkey: 'short_unit', group: '短射程',
    cat: 'short', key: 'units', names: ['前線基盤', '前線基盤II', '前線基盤III'],
    steps: 2, eff: 1, mode: 'add',
    tmpl: '短射程の武器1種あたりの上限 +{e} 基（盤の総数は増えない）',
    cost0: 1400, g: 9, unlock: 0 }),

  { id: 'mid_dmg', name: '汎用兵装', group: '中射程', cat: 'mid', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '中射程カテゴリのダメージ ×{e}',
    cost0: 100, costG: 1, max: 1, unlock: 0 },
  { id: 'mid_rate', name: '汎用機構', group: '中射程', cat: 'mid', key: 'rate',
    eff: 2.2, mode: 'mul', tmpl: '中射程カテゴリの発射レート ×{e}',
    cost0: 480, costG: 1, max: 1, unlock: 0, needs: 'mid_dmg' },
  { id: 'mid_dmg2', name: '汎用増幅', group: '中射程', cat: 'mid', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '中射程カテゴリのダメージ ×{e}',
    cost0: 2304, costG: 1, max: 1, unlock: 0, needs: 'mid_rate' },
  { id: 'mid_rng', name: '汎用観測', group: '中射程', cat: 'mid', key: 'range',
    eff: 1.6, mode: 'mul', tmpl: '中射程カテゴリの射程 ×{e}',
    cost0: 11059, costG: 1, max: 1, unlock: 0, needs: 'mid_dmg2' },
  { id: 'mid_util', name: '硬芯弾', group: '中射程', cat: 'mid', key: 'pierce',
    eff: 3, mode: 'add', tmpl: '中射程カテゴリの貫通 +{e}',
    cost0: 53084, costG: 1, max: 1, unlock: 0, needs: 'mid_rng' },
  { id: 'mid_dmg3', name: '汎用極大', group: '中射程', cat: 'mid', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '中射程カテゴリのダメージ ×{e}',
    cost0: 254804, costG: 1, max: 1, unlock: 0, needs: 'mid_util' },
  ...chain({ id: 'mid_unit', gkey: 'mid_unit', group: '中射程',
    cat: 'mid', key: 'units', names: ['量産設備', '量産設備II', '量産設備III'],
    steps: 2, eff: 1, mode: 'add',
    tmpl: '中射程の武器1種あたりの上限 +{e} 基（盤の総数は増えない）',
    cost0: 1400, g: 9, unlock: 0 }),

  { id: 'long_dmg', name: '徹甲兵装', group: '長射程', cat: 'long', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '長射程カテゴリのダメージ ×{e}',
    cost0: 100, costG: 1, max: 1, unlock: 0 },
  { id: 'long_rate', name: '徹甲機構', group: '長射程', cat: 'long', key: 'rate',
    eff: 2.2, mode: 'mul', tmpl: '長射程カテゴリの発射レート ×{e}',
    cost0: 480, costG: 1, max: 1, unlock: 0, needs: 'long_dmg' },
  { id: 'long_dmg2', name: '徹甲増幅', group: '長射程', cat: 'long', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '長射程カテゴリのダメージ ×{e}',
    cost0: 2304, costG: 1, max: 1, unlock: 0, needs: 'long_rate' },
  { id: 'long_rng', name: '徹甲観測', group: '長射程', cat: 'long', key: 'range',
    eff: 1.6, mode: 'mul', tmpl: '長射程カテゴリの射程 ×{e}',
    cost0: 11059, costG: 1, max: 1, unlock: 0, needs: 'long_dmg2' },
  { id: 'long_util', name: '照準計算機', group: '長射程', cat: 'long', key: 'crit',
    eff: 0.25, mode: 'add', tmpl: '長射程カテゴリの会心率 +{e}（会心倍率も上がる）',
    cost0: 53084, costG: 1, max: 1, unlock: 0, needs: 'long_rng' },
  { id: 'long_dmg3', name: '徹甲極大', group: '長射程', cat: 'long', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '長射程カテゴリのダメージ ×{e}',
    cost0: 254804, costG: 1, max: 1, unlock: 0, needs: 'long_util' },
  ...chain({ id: 'long_unit', gkey: 'long_unit', group: '長射程',
    cat: 'long', key: 'units', names: ['狙撃陣地', '狙撃陣地II', '狙撃陣地III'],
    steps: 2, eff: 1, mode: 'add',
    tmpl: '長射程の武器1種あたりの上限 +{e} 基（盤の総数は増えない）',
    cost0: 1400, g: 9, unlock: 0 }),

  { id: 'area_dmg', name: '高熱兵装', group: '範囲攻撃', cat: 'area', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '範囲攻撃カテゴリのダメージ ×{e}',
    cost0: 100, costG: 1, max: 1, unlock: 0 },
  { id: 'area_rate', name: '高熱機構', group: '範囲攻撃', cat: 'area', key: 'rate',
    eff: 2.2, mode: 'mul', tmpl: '範囲攻撃カテゴリの発射レート ×{e}',
    cost0: 480, costG: 1, max: 1, unlock: 0, needs: 'area_dmg' },
  { id: 'area_dmg2', name: '高熱増幅', group: '範囲攻撃', cat: 'area', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '範囲攻撃カテゴリのダメージ ×{e}',
    cost0: 2304, costG: 1, max: 1, unlock: 0, needs: 'area_rate' },
  { id: 'area_rng', name: '高熱観測', group: '範囲攻撃', cat: 'area', key: 'range',
    eff: 1.6, mode: 'mul', tmpl: '範囲攻撃カテゴリの射程 ×{e}',
    cost0: 11059, costG: 1, max: 1, unlock: 0, needs: 'area_dmg2' },
  { id: 'area_util', name: '拡散増幅', group: '範囲攻撃', cat: 'area', key: 'size',
    eff: 1.8, mode: 'mul', tmpl: '範囲攻撃カテゴリの効果範囲 ×{e}',
    cost0: 53084, costG: 1, max: 1, unlock: 0, needs: 'area_rng' },
  { id: 'area_dmg3', name: '高熱極大', group: '範囲攻撃', cat: 'area', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '範囲攻撃カテゴリのダメージ ×{e}',
    cost0: 254804, costG: 1, max: 1, unlock: 0, needs: 'area_util' },
  ...chain({ id: 'area_unit', gkey: 'area_unit', group: '範囲攻撃',
    cat: 'area', key: 'units', names: ['散布基盤', '散布基盤II'],
    steps: 2, eff: 1, mode: 'add',
    tmpl: '範囲攻撃の武器1種あたりの上限 +{e} 基（盤の総数は増えない）',
    cost0: 1400, g: 9, unlock: 0 }),

  { id: 'target_dmg', name: '成形兵装', group: '指定攻撃', cat: 'target', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '指定攻撃カテゴリのダメージ ×{e}',
    cost0: 100, costG: 1, max: 1, unlock: 0 },
  { id: 'target_rate', name: '成形機構', group: '指定攻撃', cat: 'target', key: 'rate',
    eff: 2.2, mode: 'mul', tmpl: '指定攻撃カテゴリの発射レート ×{e}',
    cost0: 480, costG: 1, max: 1, unlock: 0, needs: 'target_dmg' },
  { id: 'target_dmg2', name: '成形増幅', group: '指定攻撃', cat: 'target', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '指定攻撃カテゴリのダメージ ×{e}',
    cost0: 2304, costG: 1, max: 1, unlock: 0, needs: 'target_rate' },
  { id: 'target_rng', name: '成形観測', group: '指定攻撃', cat: 'target', key: 'range',
    eff: 1.6, mode: 'mul', tmpl: '指定攻撃カテゴリの射程 ×{e}',
    cost0: 11059, costG: 1, max: 1, unlock: 0, needs: 'target_dmg2' },
  { id: 'target_util', name: '多連装', group: '指定攻撃', cat: 'target', key: 'count',
    eff: 2, mode: 'add', tmpl: '指定攻撃カテゴリの同時発射 +{e} 発',
    cost0: 53084, costG: 1, max: 1, unlock: 0, needs: 'target_rng' },
  { id: 'target_dmg3', name: '成形極大', group: '指定攻撃', cat: 'target', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '指定攻撃カテゴリのダメージ ×{e}',
    cost0: 254804, costG: 1, max: 1, unlock: 0, needs: 'target_util' },
  ...chain({ id: 'target_unit', gkey: 'target_unit', group: '指定攻撃',
    cat: 'target', key: 'units', names: ['支持架台', '支持架台II'],
    steps: 2, eff: 1, mode: 'add',
    tmpl: '指定攻撃の武器1種あたりの上限 +{e} 基（盤の総数は増えない）',
    cost0: 1400, g: 9, unlock: 0 }),

  { id: 'support_dmg', name: '制圧兵装', group: '支援', cat: 'support', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '支援カテゴリのダメージ ×{e}',
    cost0: 100, costG: 1, max: 1, unlock: 0 },
  { id: 'support_rate', name: '制圧機構', group: '支援', cat: 'support', key: 'rate',
    eff: 2.2, mode: 'mul', tmpl: '支援カテゴリの発射レート ×{e}',
    cost0: 480, costG: 1, max: 1, unlock: 0, needs: 'support_dmg' },
  { id: 'support_dmg2', name: '制圧増幅', group: '支援', cat: 'support', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '支援カテゴリのダメージ ×{e}',
    cost0: 2304, costG: 1, max: 1, unlock: 0, needs: 'support_rate' },
  { id: 'support_rng', name: '制圧観測', group: '支援', cat: 'support', key: 'range',
    eff: 1.6, mode: 'mul', tmpl: '支援カテゴリの射程 ×{e}',
    cost0: 11059, costG: 1, max: 1, unlock: 0, needs: 'support_dmg2' },
  { id: 'support_util', name: '拡張リング', group: '支援', cat: 'support', key: 'size',
    eff: 1.8, mode: 'mul', tmpl: '支援カテゴリの効果範囲 ×{e}',
    cost0: 53084, costG: 1, max: 1, unlock: 0, needs: 'support_rng' },
  { id: 'support_dmg3', name: '制圧極大', group: '支援', cat: 'support', key: 'dmg',
    eff: 3.5, mode: 'mul', tmpl: '支援カテゴリのダメージ ×{e}',
    cost0: 254804, costG: 1, max: 1, unlock: 0, needs: 'support_util' },
  ...chain({ id: 'support_unit', gkey: 'support_unit', group: '支援',
    cat: 'support', key: 'units', names: ['支援拠点', '支援拠点II'],
    steps: 2, eff: 1, mode: 'add',
    tmpl: '支援の武器1種あたりの上限 +{e} 基（盤の総数は増えない）',
    cost0: 1400, g: 9, unlock: 0 }),

  // ============ カード側の枠を増やす ============
  //   **後ろへずらした。**（ユーザー 2026-09-24「3択のスキル選出が…5択、複数回選択出来るのは一体何の効果か
  //   わからない、4章ほどでテストプレイしてる段階だけど、4章にしては早い」）
  //   前は 500〜8,100 コイン・2章突破で開いていて、第3〜4章で5択・1ウェーブ3枚になっていた。
  //   **【2026-09-25】さらに後ろへ。**（ユーザー「10章くらいから選択肢が増えたり、15章くらいから枚数が増えたりしていくといい」）
  //   **開く章は解放条件（unlock＝突破した章の数）で決め、値段はそこで買える額に置く。**
  //   物差し（100コイン≒第1章・1章で×4.8）どおりの 1.4億／3,400億では、通し2本で
  //   選択肢が第12章・枚数が第19〜20章でやっと買えた（周4は第15〜16章で終わり、そこで足りなかった）。
  //   1/10・1/100 にした：選択肢 1,500万（9章突破で開く＝第10章）・取れる枚数 30億（14章突破で開く＝第15章）。
  //   2段目はどちらも ×12,000（≒6章あと）
  ...chain({ id: 'picks', gkey: 'picks', group: 'カード',
    names: ['増設スロット', '二重スロット'],
    steps: 2, eff: 1, mode: 'add', tmpl: 'ウェーブ突破ごとに取れるカードが +{e} 枚',
    cost0: 3e9, g: 12000, unlock: 14 }),
  ...chain({ id: 'choices', gkey: 'choices', group: 'カード',
    names: ['選択肢拡張', '広域走査'],
    steps: 2, eff: 1, mode: 'add', tmpl: 'カード選択の提示枚数 +{e}（3択 → 4択 …）',
    cost0: 1.5e7, g: 12000, unlock: 9 }),
  //   **上限なしの1節をやめた。**（2026-09-22）Lv20 まで積むと3択からコモンが消えていた
  //   （draft.js 側にも下限を入れてある）。取り切り3段で、効き幅も設計で決まる
  ...chain({ id: 'luck', gkey: 'luck', group: 'カード',
    names: ['幸運回路', '選別装置', '天運演算'],
    steps: 3, eff: 4, mode: 'add', tmpl: 'カード選択で高レアリティが出やすくなる（+{e}）',
    cost0: 400, g: 4.8, unlock: 1 }),
  ...chain({ id: 'pack', gkey: 'pack', group: 'カード',
    names: ['解析装置', '深層解析', '完全解析'],
    steps: 3, eff: 4, mode: 'add', tmpl: '転生で得るカードパックの等級が上がりやすくなる（+{e}）',
    cost0: 900, g: 4.8, unlock: 3 }),

  // ============ 危険と引き換え ============
  ...chain({ id: 'lure', gkey: 'lure', group: '危険',
    names: ['敵誘引', '挑発信号', '撹乱電波', '総攻撃誘発'],
    steps: 4, eff: 0.25, mode: 'add', tmpl: '敵の出現数 +{e}倍 / コイン獲得 +6%（危険だが儲かる）',
    cost0: 120, g: 4.8, unlock: 1 }),
];

// ============ 範囲を広げる節を、ゲームから外す ============
//
//   **ユーザー指示（2026-09-22・最優先）**
//   > 「武器の範囲を広げるスキル、カードなどゲーム内から全て削除してください、
//   >   コメントアウトです、**バグの温床です**。代替案は後回しでいいです、
//   >   本当に一番やばいです」
//
//   外すのは **射程（key:'range'）と 効果範囲（key:'size'）** の節。
//   節は一本の連なり（dmg → rate → dmg2 → **rng** → util → dmg3）なので、
//   単に消すと後ろが繋がらなくなる。**外した節の `needs` を、
//   その節を必要としていた節へ引き継がせて、連なりを詰める。**
//
//   **戻すときは OFF_KEYS を空にするだけ。**（代替案が決まったら）
//   既に買われている節は、一覧から消えるので効果も集計されなくなる
//   （Skill.mods は SKILLS を回すため）。コインは戻さない
const OFF_KEYS = ['range', 'size'];
const SKILLS_OFF = SKILLS.filter(s => OFF_KEYS.indexOf(s.key) >= 0);
{
  const offIds = {};
  for (const s of SKILLS_OFF) offIds[s.id] = s.needs || null;
  // 外した節どうしが連なっている場合もあるので、生きている節まで辿る
  const liveNeeds = (id) => {
    let n = offIds[id];
    let guard = 0;
    while (n && offIds[n] !== undefined && guard++ < 20) n = offIds[n];
    return n || undefined;
  };
  for (const s of SKILLS) {
    if (s.needs && offIds[s.needs] !== undefined) s.needs = liveNeeds(s.needs);
  }
  for (let i = SKILLS.length - 1; i >= 0; i--) {
    if (offIds[SKILLS[i].id] !== undefined) SKILLS.splice(i, 1);
  }
}

const SKILL_BY_ID = {};
for (const s of SKILLS) SKILL_BY_ID[s.id] = s;

// 換装（パックの部品で節の効き方を付け替える仕組み）は 2026-09-25 に撤去した（ユーザー判断。遊んでいて死んでいた）

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
    const isUnitNode = s && (s.key === 'units' || s.gkey === 'units');
    // **遺物「初期投資」は、各連なりの1段目（根の節）だけを無料にする。**（ユーザー 2026-09-24）
    //   段積みの頃の「Lv+1」のままだと、取り切り（max 1）では **1枚でツリー75節のうち49節**が
    //   取得扱いになっていた（敵の数を増やす敵誘引4段まで勝手に効いていた）。
    //   根の節＝`needs` を持たない節。設置枠と敵誘引は除く
    const isRoot = s && !s.needs && s.gkey !== 'lure';
    const base = (p && typeof Relic !== 'undefined' && !isUnitNode && isRoot && Relic.mods(p).startLv > 0)
      ? 1 : 0;
    const lv = (meta.skills[id] || 0) + base;
    return s ? Math.min(lv, Skill.maxOf(p, id)) : lv;
  },

  // ノードの定義（換装を撤去したので、ただの引き当て）
  node(id) { return SKILL_BY_ID[id]; },

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
    const cleared = p ? stageProgressCount(p) : 0;   // 突破＋スキップ
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
    // **敵誘引はツリーから外した。**（2026-09-26・ユーザー「誘引自体はこれは難易度上昇要素として残しておき、スキルツリーから一旦消してしまっても良い」）
    //   定義と効き方（mods.spawn）は、あとでハードモードの難易度調整に使えるように残す。BAL.lureInTree で戻せる
    if (s && s.gkey === 'lure' && !BAL.lureInTree) return false;
    // **前のノードを取っていないと開かない。**（取り切り型ツリー・2026-09-21）
    //   `needs` に前のノードのIDを書く。枝が「順に開いていく」形になる
    if (s.needs) {
      const meta = (typeof Game !== 'undefined' && Game.meta) ? Game.meta : null;
      // 買った数ではなく **取得扱いか** で見る（遺物「初期投資」で無料になった根の節からも次が開くように）
      if (!meta || Skill.lv(meta, s.needs) <= 0) return false;
    }
    if (s.cat) {
      return WEAPON_IDS.some(wid => WEAPONS[wid].cat === s.cat && (perm.collection['wc_' + wid] || 0) > 0);
    }
    const cleared = stageProgressCount(perm);        // 突破＋スキップ
    return cleared >= s.unlock;
  },

  lockReason(perm, id) {
    const s = SKILL_BY_ID[id];
    if (s.needs) {
      const meta = (typeof Game !== 'undefined' && Game.meta) ? Game.meta : null;
      if (!meta || Skill.lv(meta, s.needs) <= 0) {
        const prev = SKILL_BY_ID[s.needs];
        return '「' + (prev ? prev.name : s.needs) + '」を取ると開放';
      }
    }
    if (s.cat) return CATEGORIES[s.cat].name + 'の武器を手に入れると解放';
    return 'ステージを ' + s.unlock + ' 個突破すると解放';
  },

  // そのノードの上限。**どの節も取り切り（max 1）。**
  //   以前は設置枠だけ `maxPerClear`（踏破した章の数で上限を開ける）で縛っていたが、
  //   2026-09-21 のユーザー指示で「値段の跳ね上がりで間隔を作る」に置き換えた。
  //   進行で上限が変わる節はもう無いので、上限はそのまま `s.max`
  maxOf(perm, id) { return SKILL_BY_ID[id].max; },
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
    let t = 0;
    for (const s of SKILLS) if (s.cat === cat && s.key === 'units') t += Skill.amount(meta, s.id);
    return t;
  },

  // 安い順にまとめ買いする。**周回のたびに同じ買い物を手で繰り返させないため。**
  //   測定器が1周を回すときと同じ買い方（安い順）なので、
  //   実測の数字と、プレイヤーが押したときの結果がずれない。
  //   **敵誘引だけは買わない。** 敵の数が増えるノードなので、勝手に押されると事故になる
  //   （以前は「取り切りの節を先に」の並べ替えがあったが、いまは全節が取り切りなので安い順だけ）
  buyOrder(meta, perm) {
    return SKILLS.map(s => s.id)
      .filter(id => (SKILL_BY_ID[id].gkey !== 'lure') && Skill.canBuy(meta, perm, id))
      .sort((a, b) => {
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
    return SKILLS.some(s => s.gkey !== 'lure' && Skill.canBuy(meta, perm, s.id));
  },

  // アップグレード＋転生ボーナスを、出撃時の倍率一式にまとめる
  // **連なり全体の合計。**（2026-09-22）
  //   取り切りに割ったので、`coin` のような1つのidはもう存在しない
  //   （coin1〜coin4 になった）。gkey で束ねて足す
  gsum(meta, gkey) {
    let t = 0;
    for (const s of SKILLS) if (s.gkey === gkey) t += Skill.amount(meta, s.id);
    return t;
  },

  mods(meta, perm) {
    const A = (id) => Skill.amount(meta, id);
    const G = (k) => Skill.gsum(meta, k);
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
      coin:   (1 + G('coin')) * (1 + (BAL.lureInTree ? 0.06 * Skill.gsum(meta, 'lure') / 0.25 : 0)) * R.coin,
      lives:  R.lives,        // ツリーからは増えない（「防衛線」を撤去した）
      regen:  G('regen') + (R.regen || 0),
      spawn:  1 + (BAL.lureInTree ? G('lure') : 0),   // 誘引を外している間は、買ってあっても効かせない（見えない所で敵が増えたままにしない）
      luck:   G('luck'),
      packLuck: G('pack'),
      picks:   1 + G('picks') + (R.picks || 0),
      choices: BAL.draftSize + G('choices') + (R.choices || 0),
      units:   G('units'),   // **遺物からは増やさない。**（R.units は存在せず NaN になっていた）
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
