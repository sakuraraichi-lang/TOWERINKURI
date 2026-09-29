# 他のタワーディフェンス（と近いジャンル）の調べもの — 段3の下調べ 2026-09-30

設計書 `docs/DESIGN-REBUILD-2026-09-29.md` §14 の「参考：既存のタワーディフェンスの仕組みを調べてアイデアに使ってよい（写すのではなく、このゲームの形に起こす）」のための下調べ。
**クラウドのセッションで作った**（ローカルのセッションが週の上限で止まったため）。事実は各ページの記述から。「このゲームへの起こし方」は案で、決定ではない。

段3で扱う4つ（カードの作り直し・敵の耐性・前提のあるカード・重ね取りの式）に沿って並べる。

---

## 1. 敵の耐性：何を持たせると「混成が要る」になるか（§8 の原則）

| ゲーム | 仕組み | 要点 |
|---|---|---|
| **Bloons TD 6** | 風船の「性質」：**鉛**＝鋭い・凍結・エネルギーの攻撃が効かない（爆発・火・酸が要る）／**紫**＝火・プラズマ・エネルギーが効かない／**カモ**＝探知の無い塔からは見えない／**再生**＝倒しきらないと層が戻る／**要塞化**＝外側の層の硬さが倍 | **「効かない」がはっきりしている**ので、答えを持っていないと必ず漏れる。性質は重ねられる（再生＋カモ＋要塞化の鉛） |
| **Kingdom Rush** | **物理の装甲**（低 1〜30%／中 31〜60%／高 61〜90%／極 90%〜 軽減）と**魔法耐性**の2本。魔法は装甲を無視、物理は魔法耐性を無視。**真のダメージ**はどちらも無視 | 2本の軸が**互いの弱点**になっている。どちらか一方の武器だけでは片方の敵に詰まる |
| **Arknights** | 物理は **DEF を引き算**（ATK 1000・DEF 600 → 400）、術は **RES を割合で**（RES 30 → 30%減）。**どちらも最低 5% は通る** | **引き算の装甲は「1発が軽い攻撃」を殺し、「1発が重い攻撃」を残す**。連射と一撃で役割が分かれる。最低保証で「完全な無効」は作らない |
| **Legion TD 2** | 攻撃4種（貫通・衝撃・魔法・純粋）× 防御5種の表。倍率は **75%〜125%** の幅 | 幅が狭い（±25%）ので**詰みは作らず、得意・不得意だけ**を作る。「純粋」は何にも有利・不利が無い |
| **Defense Grid** | シールド持ちには、火炎の塔が**半分のダメージで燃焼なし** | 状態異常の**付与だけを止める**耐性もある |

**このゲームに起こすなら（案）**
- いまの戦闘は「dmg を与える」1本で、軽減は無い（`Combat.damage`）。**Arknights 型の引き算の装甲**が、いちばん少ない変更で「連射（ガトリング・火炎・手裏剣）と一撃（刀・迫撃砲・レーザーライフル）の役割」を分ける。最低保証（例 5〜10%）を置いて完全な無効は作らない
- **状態異常への耐性**（燃えない・凍らない・掴めない）は Defense Grid のシールド型：ダメージは通るが付与だけ止まる。いまの「ボスは足止めが効かない」（`ccUsed = Infinity`）がすでにこの形
- **Legion TD 2 の幅（±25%）** を物差しにする：耐性で**詰み**を作るのではなく、**混成の偏りを罰する**程度から始め、測って広げる（確定方針「大きく振ってから狭める」とは逆向きになるので、幅はユーザーと決める）
- 耐性は「敵の種類」に付けるのが BTD6・Kingdom Rush の形。「章ごとに耐性の敵が増える」で、章の特色（ストップポイント）も置ける

## 2. 重ね取りの式：レートが「無尽蔵に増える」を止める（§14 の「1出撃の中の伸び」）

| ゲーム | 仕組み |
|---|---|
| **Risk of Rain 2** | 3種の重ね方：**線形**（1枚ごとに同じ量を足す。注射器 +15%/枚）・**指数**（1枚ごとに倍。シェイプドグラス）・**双曲線**（`1 − 1/(1 + 係数×枚数)`。100% に近づくが届かない。線形なら6枚で90%のところ、双曲線だと47%） |
| **Path of Exile** | **「増加（increased）」は同じ軸で全部足してから1回掛ける／「さらに（more）」は1つずつ掛ける**。increased 100% を3つ＝×4、more 100% が混じると ×3×2＝×6 |
| **Balatro** | 足し算の倍率（+Mult）を先に、掛け算の倍率（×Mult）を後に。**同じ「倍率」でも足すか掛けるかで結果が大きく違う**ことを、札の種類で見せている |

**いまのこのゲーム**：武器のカードは `w.s.rate *= Game.rk(1.25)` のように**全部が掛け算（more）**。同じ軸を5枚重ねると 1.25^5＝×3.05、汎用（過給機 ×1.15^3・冷却系統 ×1.1^3）とツリーのレート ×2.2 と遺物（律動 最大 +330%）も全部掛かる。

**このゲームに起こすなら（案）**
- **PoE 型が最小の変更で効く**：同じ軸（レート・ダメージ・数）のカードは**その出撃の中で足し算にまとめ（increased）、軸ごとに1回だけ掛ける**。1.25 を5枚＝×2.25（いまは ×3.05）。レジェンドなど一部だけを **more（掛け算）** として残せば「この1枚で激変」は残せる
- **レートだけは双曲線**（RoR2 型）にすると、上限の数字を決めずに天井ができる。例：レートの上乗せ ＝ 上限 × (1 − 1/(1 + k×枚数))
- どちらを採っても、**カードの説明文に出す倍率は、重ねたときの実際の値**で出す（いまの `Game.rk` の表示と揃える）

## 3. 前提のあるカード（§14 の「前提のあるカード」）

| ゲーム | 仕組み |
|---|---|
| **Hades** | **レジェンドの恩恵**は、同じ神の「その前の段」の恩恵を2つ以上持っていないと出ない。**デュオの恩恵**は、2柱の神それぞれの前提の恩恵が要る。死ねば全部失う（1出撃の中だけ） |
| **Vampire Survivors** | **進化**：武器を最大レベルにして、決まった補助アイテムを持った状態で、10分を過ぎてボスの宝箱を開けると進化。補助アイテムは消えることもある |
| **Bloons TD 6** | 塔ごとに3本の道。**1本は5段まで、もう1本は2段まで、3本目は0**。5段目は同じものを盤に1基だけ |
| **Rogue Tower** | 3択（強化を買うと6択・毎ウェーブ）で、塔を解放する札と強化の札が混ざる。**強化の札はメニューで道筋（どの札の先にどの札があるか）を見られる** |

**このゲームに起こすなら（案）**
- **Hades 型（前提の札を2枚持っていると3択に出る）**が、いまの3択（`draft.js`）にいちばん素直に乗る。前提を満たした札だけ抽選の候補に入れるだけで済む
- **「1枚しか取れない」上位札**（`maxStack: 1`）にだけ、以前禁止した**射程・範囲を広げる効果**を置く（ユーザー §14）。**BTD6 の「5段目は1基だけ」**と同じ考え方で、広がる数を札の側で決め打ちにできる
- **Vampire Survivors の「消費して進化」**：前提の札を差し出して上位札に替える形にすると、重ね取りの天井（§2）とも噛み合う（同じ軸の枚数が減る）
- **Rogue Tower の「道筋を見せる」**：前提のある札は、どの札の先に何があるかを見せないと狙えない。確認室と、カードの一覧（図鑑）に「この札の先」を出す
- **BTD6 の「2本目は2段まで」**：1つの武器に**方向（系統）を2つまで**しか深く取れない、という縛りは「武器ごとの個性」を出す形としてありうる（案の段階。3択の仕組みが変わるので大きい）

## 4. 段3の設計書に持っていくもの（まとめ・案）

1. **耐性**：引き算の装甲（最低保証あり）＋状態異常の付与だけを止める耐性。幅は ±25% 相当から測って広げる
2. **重ね取り**：同じ軸は足してから掛ける（PoE の increased）。レートは双曲線で天井。一部のレジェンドだけ掛け算
3. **前提の札**：前提の札2枚で3択に出る上位札（Hades）。上位札は1枚だけ・射程と範囲はここにだけ置く
4. **見せ方**：前提と「この札の先」を図鑑と確認室で見せる（Rogue Tower）

---

出典
- [Bloon Properties | Bloons Wiki](https://bloons.fandom.com/wiki/Bloon_Properties)／[Lead Bloon (BTD6) | Blooncyclopedia](https://www.bloonswiki.com/Lead_Bloon_(BTD6))／[Purple Bloon | Bloons Wiki](https://bloons.fandom.com/wiki/Purple_Bloon)／[Crosspathing | Bloons Wiki](https://bloons.fandom.com/wiki/Crosspathing)
- [Armor and Magic resistance | Kingdom Rush Wiki](https://kingdomrushtd.fandom.com/wiki/Armor_and_Magic_resistance)／[True Damage | Kingdom Rush Wiki](https://kingdomrushtd.fandom.com/wiki/True_Damage)
- [Arknights: Damage Formulas Pocket Reference | GamePress](https://gamepress.gg/arknights/core-gameplay/arknights-damage-formulas-pocket-reference)／[Damage | Arknights Wiki](https://arknights.fandom.com/wiki/Damage)
- [Attack & Defense Types | Legion TD 2 Wiki](https://legiontd2.wiki.gg/wiki/Attack_&_Defense_Types)
- [Defense Grid: The Awakening | Wikipedia](https://en.wikipedia.org/wiki/Defense_Grid:_The_Awakening)
- [Item Stacking | Risk of Rain 2 Wiki](https://riskofrain2.wiki.gg/wiki/Item_Stacking)
- [Stat | Path of Exile Wiki](https://pathofexile.fandom.com/wiki/Stat)
- [Guide: Activation Sequence | Balatro Wiki](https://balatrogame.fandom.com/wiki/Guide:_Activation_Sequence)
- [Duo Boons | Hades Wiki](https://hades.fandom.com/wiki/Duo_Boons)／[Legendary Boons | Hades Wiki](https://hades.fandom.com/wiki/Legendary_Boons)
- [Evolution | Vampire Survivors Wiki](https://vampire.survivors.wiki/w/Evolution)
- [Upgrade Cards | Rogue Tower Wiki](https://rogue-tower.fandom.com/wiki/Upgrade_Cards)／[Rogue Tower on Steam](https://store.steampowered.com/app/1843760/Rogue_Tower/)
