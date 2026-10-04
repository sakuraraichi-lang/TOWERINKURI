# ローカルのエージェントへ：クラウドで進めた作業の引き継ぎ（2026-09-30）

**このファイルは、ブランチ `claude/dreamy-gauss-4eus46` にある。`main` には無い。**
ローカルのセッションが週の上限で止まっていたあいだ（2026-09-29 夜〜09-30）、claude.ai/code のクラウドで作り直しの段2と段3を進めた。
**成果はこのブランチだけ。`main` にも本番（Vercel）にも出していない**（ユーザーの指示）。

## 1. まず読むもの（この順で）

1. **`docs/REPORT-CLOUD-2026-09-30.md`** … 報告書。何をして、何を測って、ユーザーが何を決めて、何が残っているか
2. `docs/DESIGN-STAGE3-2026-09-30.md` … 段3の設計書。**§12 がユーザーの答え、§13 が未解決の件（第30章に届く本数が下がった）**
3. `docs/PATCHNOTES.md` の先頭（0929zp・zo・zn・zm）… プレイヤーから見た変化と実測
4. `CLAUDE.md` の「クラウドのセッションでの決定（2026-09-30）」… 今後も守る決まり（このブランチの CLAUDE.md に足した）

## 2. いまの状態

| | |
|---|---|
| 土台 | `main` の 5e7b289（ver 0929zl） |
| ブランチの版 | **0929zp**（`src/balance.js` の BUILD） |
| 本番 | **0929zl のまま**（ブランチは配信していない） |
| 動作 | 測定器で通し・単独を回して動く。確認室（`?debugroom`）の新しい見本3つと図鑑の新しい節2つは、スマホ幅（390×844）で撮って確かめた |
| 未解決 | **第30章に届く本数 6/8 → 2/8**（主因は遺物の上限を開かなくしたこと）。直し方はユーザーの返事待ち（報告書 §4） |

## 3. 取り込み方（ユーザーに聞いてから）

```bash
git fetch origin claude/dreamy-gauss-4eus46
git log --oneline main..origin/claude/dreamy-gauss-4eus46
git diff main origin/claude/dreamy-gauss-4eus46 --stat
```
- **`main` に push すると本番に出る**（Vercel）。ユーザーは「本番へは出さなくて良い、ブランチだけでいい」と言った。**取り込む・配信するかは、ユーザーに確かめてから**
- ローカルの `main` が 5e7b289 より先に進んでいたら、衝突しうるのは `src/balance.js`（BUILD・chapterMul のあたり）・`src/skilltree.js`・`src/cards.js`・`src/combat.js`・`docs/PATCHNOTES.md`（先頭）・`docs/DESIGN-REBUILD-2026-09-29.md`（§13・§14）・`CLAUDE.md`
- 版の番号：ブランチは 0929zm〜zp を使った。`main` で同じ番号を別の中身に使っていたら、取り込むときに付け直す

## 4. 続きの作業の入り方

- **次の一手はユーザーの返事次第**（報告書 §4 の1・2）。返事が無いあいだに進めてよい承認済みの作業は、報告書 §4 の3〜7（カードの作り直し・ミサイルを武器の設計で直す・ガトリングだけで第25章を突破する件・触手の連携3枚・3つの型での判定）
- **ミサイルはコストで強弱を合わせない**（ユーザー「ミサイルが壊れだからコスト最重にしようではなく、ちゃんと武器毎に武器設計を練るべきです」）
- **凸に上限を置かない**（ユーザー「凸の天井を設けたらパックシステムがいずれ死にます」）

## 5. 測り直し方

ひな形は `tools/measure/`。**Node だけで動く**（Windows でも同じ。`node` が無ければ `C:\Program Files\nodejs\node.exe`）。
```bash
node tools/measure/run.js campaign --SEED 1 > out.json                  # 通し1本（約5分）
node tools/measure/run.js single --CH 25 --WPN tentacle --D 27 > out.json  # 単独・12本
node tools/measure/run.js inflation --SEED 1 > out.json                 # 1出撃の中の伸び方
# 別の版と比べる：git worktree add ../cmp <コミット> → --dir ../cmp を付ける
```
- クラウドの数字は**4〜8本**。届く本数は4本だと大きく振れた（0929zm でシード1〜4 は 4/4、5〜8 は 2/4）。**比べるときは8本以上・交互に**
- 生データと対応表：`docs/audit/2026-09-30-cloud-runs/`
