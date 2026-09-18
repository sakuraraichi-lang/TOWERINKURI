# -*- coding: utf-8 -*-
"""**フックを、自分のプロジェクトのセッションだけに効かせるスコープガード。**

===========================================================================
**これはゲートを弱めるためのものではない。**
判定のしきい値・条件・状態ファイルには一切触れない。
「どのセッションに対して働くか」だけを、本来の想定どおりに戻す。
===========================================================================

## なぜ要るか（2026-09-18 に実際に起きた事故）

`agent-pack` を2つ目のプロジェクト（E:\\inkuriment）に入れたあと、
**1セッションで2プロジェクト分のフックが両方発火した。**

フックは出力先を `__file__` から決めており、**セッションの作業ディレクトリを見ていない。**
しかも状態ファイルが `%TEMP%\\claude-gal-watch\\<セッションID>.json` で共有なので、
こうなった。

- 議事録が二重に書かれる
- `gal_watch` が1回の編集を2回数える（「3回目」が2回目で鳴る）
- `gal_stop` のゲートが二重に走る

`~/.claude/settings.json` にフックは無く、親ディレクトリにも管理設定にも無い。
**読み込み経路が特定できなかったので、経路によらず効く側で塞ぐ。**

## やること

Stop / PostToolUse / UserPromptSubmit などの入力には `cwd` が入っている。
**それが自分のプロジェクトの下でなければ、そのフックは何もせず素通りする。**

## 判定できないときは素通りさせない

`cwd` が読めない・パスが壊れているといった場合は **「自分のもの」として扱い、
従来どおり動かす。** ガードの都合でゲートが黙って無効になるのを防ぐため。
"""
import os

# <project>/.claude/hooks/_scope.py  ->  <project>
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _norm(p):
    try:
        return os.path.normcase(os.path.abspath(p))
    except Exception:
        return None


def foreign(payload):
    """このフックの持ち主でないプロジェクトのセッションなら True。"""
    try:
        cwd = (payload or {}).get("cwd")
    except Exception:
        return False
    if not cwd:
        return False                      # 判定できない -> 従来どおり動かす
    c = _norm(cwd)
    r = _norm(PROJECT_ROOT)
    if not c or not r:
        return False                      # 判定できない -> 従来どおり動かす
    return not (c == r or c.startswith(r + os.sep))
