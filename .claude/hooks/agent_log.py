# -*- coding: utf-8 -*-
"""**サブエージェントの発言を、ユーザーが読める形で残す。**

> **ユーザー指示:「各エージェントのコメントを私が見れるようにしてください」**

## なぜ要るか

サブエージェントの出力は**ユーザーの画面に出ない。**
メインが会話に貼らなければ、呼んだことすら伝わらない。
貼るのはメインの義務だが、**義務は忘れられる。**外側にも残す。

既存の `gal_watch.py` にも記録機能（`~/.claude/gal-audit.log`）はあるが、

1. **ギャルしか記録しない。** 教師・教頭・学級委員長の発言は残らない
2. **文字化けする。** `json.load(sys.stdin)` は Windows の既定 (cp932) で
   デコードするため、UTF-8 のペイロードが壊れる。
   実際に `gal-audit.log` の中身は `繧ｮ繝｣繝ｫ`（＝「ギャル」）になっていた

**この2つを直した別のログとして足す。**`gal_watch.py` 側は触らない
（あちらの冒頭に「Claude の判断で書き換えるな」と書いてあるため）。

## 何をするか

PostToolUse（matcher: Agent）で呼ばれ、**全サブエージェントの発言**を
`<project>/.claude/agent-comments.log` に UTF-8 で追記する。

- 誰を呼んだか（`subagent_type`）
- 何を渡したか（プロンプト）
- **何が返ってきたか（発言の全文）**
- 【判定】が含まれていたか

**記録の失敗でセッションを止めない。**何があっても終了コード0で返す。
"""
import io
import json
import os
import sys
import time

LOG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "agent-comments.log")

LIMIT = 12000   # 1件あたりの上限。発言は基本まるごと残す


def read_payload():
    """**stdin を UTF-8 として読む。**

    `json.load(sys.stdin)` にしてはいけない。Windows の Python は
    既定のロケール（日本語環境では cp932）で復号するため、
    **UTF-8 のペイロードが化ける。**`gal_watch.py` はこれを踏んでいる。
    """
    try:
        raw = sys.stdin.buffer.read()
    except (AttributeError, IOError):
        try:
            raw = sys.stdin.read().encode("utf-8", "replace")
        except Exception:
            return None
    for enc in ("utf-8", "cp932"):
        try:
            return json.loads(raw.decode(enc))
        except (UnicodeDecodeError, ValueError):
            continue
    return None


def response_text(resp):
    """Agent ツールの返り値から、**発言の本文**を取り出す。

    返り値の形は一定ではない（文字列のことも、content ブロックの
    配列を持つ辞書のこともある）。**取れる限りテキストを集める。**
    """
    if isinstance(resp, str):
        return resp
    out = []

    def walk(x):
        if isinstance(x, str):
            out.append(x)
        elif isinstance(x, dict):
            if x.get("type") == "text" and isinstance(x.get("text"), str):
                out.append(x["text"])
            else:
                for v in x.values():
                    walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(resp)
    return "\n".join(out)


def main():
    payload = read_payload()
    if not payload or (payload.get("tool_name") or "") != "Agent":
        return 0

    import _scope
    if _scope.foreign(payload):
        return 0                            # 他プロジェクトのセッションでは働かない
    inp = payload.get("tool_input") or {}
    who = inp.get("subagent_type") or "(既定)"
    what = inp.get("description") or ""
    prompt = inp.get("prompt") or ""
    text = response_text(payload.get("tool_response"))

    try:
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        with io.open(LOG, "a", encoding="utf-8", errors="replace", newline="\n") as f:
            f.write(u"\n" + u"=" * 76 + u"\n")
            f.write(u"%s  【%s】 %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), who, what))
            f.write(u"  判定の有無: %s\n" % (u"あり" if u"【判定】" in text else u"なし"))
            f.write(u"-" * 76 + u"\n[渡した材料]\n")
            f.write(prompt[:LIMIT] + u"\n")
            f.write(u"-" * 76 + u"\n[エージェントの発言]\n")
            f.write((text or u"(本文を取り出せなかった)")[:LIMIT] + u"\n")
    except Exception:
        # **記録の失敗でセッションを止めない。**
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
