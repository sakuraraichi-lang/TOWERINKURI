# -*- coding: utf-8 -*-
"""**ユーザーへの文を日本語に保つ見張り。**（2026-09-29 ユーザー「日本語で報告してください、これは3回目の指摘です」）

## なぜ要るか

「回答は日本語で」は `~/.claude/CLAUDE.md` にも記憶（japanese-permission-prompts.md）にも書いてあるのに、
長い作業の途中で英語に流れた。流れ方はいつも同じだった。

- 会話が長くなって要約（コンパクション）されると、**要約が英語**で書かれる
- 作業の途中に割り込む通知（「しばらく報告がない」「ファイルが変わった」など）が**英語**
- 考える（内部の推論）のを英語でしていて、その調子のまま**途中の一言と最後の報告**に漏れる

文言を強くしても、没入している本人は気づけない（gal_stop.py と同じ理屈）。だから外から見張る。

## やること

- **Stop**：最後の文（`last_assistant_message`）が英語なら、終了コード2で止めて日本語で書き直させる。
  同じ `prompt_id` で2回まで（それ以上は素通り。ループでセッションを壊さない）
- **PostToolUse**：いま出したばかりの途中の一言（会話記録の最新の text）が英語なら、終了コード2で本人に知らせる。
  同じ一言には1回だけ

## 英語の判定

コード（``` の塊・`…`）・URL・パスを取り除いてから、英字の数 A と日本語の字（かな・漢字・全角）の数 J を数える。
A が 30 以上で、J が A の 4分の1 未満なら英語とみなす。
（「本番 0929l を curl で確認」のような、日本語の中に英字の名前が混ざる文は日本語のまま通る）
"""
import json
import os
import re
import sys
import tempfile

STATE_DIR = os.path.join(tempfile.gettempdir(), "claude-lang-guard")


def is_english(text):
    if not text:
        return False
    t = re.sub(r"```.*?```", " ", text, flags=re.S)
    t = re.sub(r"`[^`]*`", " ", t)
    t = re.sub(r"https?://\S+", " ", t)
    t = re.sub(r"[A-Za-z]:[\\/][^\s)]*", " ", t)
    t = re.sub(r"\S+\.(js|css|md|py|json|html|png|jsonl)\b", " ", t)
    a = len(re.findall(r"[A-Za-z]", t))
    j = len(re.findall(r"[぀-ヿ㐀-鿿＀-￯]", t))
    return a >= 30 and j * 4 < a


def load(sid):
    try:
        with open(os.path.join(STATE_DIR, sid + ".json"), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save(sid, st):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(os.path.join(STATE_DIR, sid + ".json"), "w", encoding="utf-8") as f:
            json.dump(st, f, ensure_ascii=False)
    except Exception:
        pass


def latest_text(path):
    """会話記録の末尾から、いちばん新しい assistant の text を探す（uuid と本文）"""
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            f.seek(max(0, size - 400000))
            lines = f.read().decode("utf-8", "ignore").splitlines()
    except Exception:
        return None, None
    for ln in reversed(lines):
        try:
            o = json.loads(ln)
        except Exception:
            continue
        if o.get("type") == "user" and not o.get("isMeta"):
            c = (o.get("message") or {}).get("content")
            # ツールの結果ではない、人が書いた発言まで来たら打ち切る
            if isinstance(c, str) or (isinstance(c, list) and any(isinstance(b, dict) and b.get("type") == "text" for b in c)):
                return None, None
        if o.get("type") != "assistant":
            continue
        if (o.get("message") or {}).get("model") == "<synthetic>":
            continue    # 利用制限などの、システムが差し込む文（本人が書いたものではない）
        for b in (o.get("message") or {}).get("content") or []:
            if isinstance(b, dict) and b.get("type") == "text" and b.get("text", "").strip():
                return o.get("uuid"), b["text"]
    return None, None


def say(msg):
    try:
        sys.stderr.buffer.write(msg.encode("utf-8"))
        sys.stderr.buffer.flush()
    except Exception:
        sys.stderr.write(msg)


def main():
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except Exception:
        return 0
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import _scope
        if _scope.foreign(payload):
            return 0
    except Exception:
        pass
    if payload.get("agent_id"):
        return 0    # サブエージェントの中の道具の呼び出し。見張るのは本体がユーザーに書く文だけ
    sid = str(payload.get("session_id") or "nosession")
    ev = payload.get("hook_event_name")
    st = load(sid)

    if ev == "Stop":
        if not is_english(payload.get("last_assistant_message") or ""):
            return 0
        pid = str(payload.get("prompt_id") or "")
        n = st.get("stop", {}).get(pid, 0)
        if n >= 2:
            return 0
        st.setdefault("stop", {})[pid] = n + 1
        save(sid, st)
        say("【言語の見張り】最後の報告が英語でした。ユーザーへの文はすべて日本語の決まりです"
            "（~/.claude/CLAUDE.md・記憶 japanese-permission-prompts）。同じ内容を日本語で書き直して報告してください。")
        return 2

    if ev == "PostToolUse":
        uid, text = latest_text(payload.get("transcript_path") or "")
        if not uid or not is_english(text):
            return 0
        warned = st.setdefault("warned", [])
        if uid in warned:
            return 0
        warned.append(uid)
        st["warned"] = warned[-200:]
        save(sid, st)
        say("【言語の見張り】直前にユーザーへ書いた一言が英語でした：「" + text.strip()[:80] +
            "…」。途中の一言も最後の報告も日本語で書いてください。次の一言から日本語に戻すこと。")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
