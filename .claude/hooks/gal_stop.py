# -*- coding: utf-8 -*-
"""**観点⑧を、モデルの自己申告から外す。** Stop フックのゲート。

===========================================================================
**このゲートと状態ファイルを、Claude の判断で書き換えないこと。**
無効化・条件緩和・閾値変更が要ると判断した場合は、実行せずユーザーに提案だけする。
期待どおり動かないときも、**フックを外す方向の修正はしない。**
===========================================================================

## なぜ要るか

`gal-summon` の観点⑧は「作業の手を止めるなら、止める前に必ず監査を回す」。
**その観点⑧を、書いた本人が飛ばした。**
しかも⑧は「①〜⑦が発火しないのは自己申告に頼っているから」という診断を受けて
追加したもの。**同じ穴に二度落ちている。**

> 体温計を測る係を発熱してる本人にやらせてるのと同じ。壊れて当然。

だから文言を強くするのをやめて、**ターンの終わりそのものを機械に見張らせる。**

## 仕様（公式ドキュメントを読んで確認したこと・2026-08-24）

Stop の入力フィールドは次だけ。

    session_id / prompt_id / transcript_path / cwd / permission_mode /
    effort / hook_event_name / last_assistant_message / stop_reason

- **`stop_hook_active` は存在しない。** 最初に書いた版はこれを読んでいたので、
  **ループ防止が常に偽で完全に死んでいた。** 代わりに `prompt_id` を使う
- **ブロックは終了コード2。**「Prevents Claude from stopping, continues the
  conversation」と明記されている。`{"decision":"block", ...}` は現行の
  Stop 出力スキーマ（`hookSpecificOutput` の `hookEventName` /
  `additionalContext` / `continue`）に無いので使わない
- **ブロック回数の上限は文書化されていない。** だから自前で持つ

## 判定の順番（上から、当てはまったら即 0 で素通り）

1. stdin が読めない            … フックの都合でセッションを壊さない
2. `last_work_at` が無い       … 作業していないターン（質問に答えただけ等）
3. `last_audit_at >= last_work_at` … 作業のあとに監査が完走している
4. `blocked_prompt == prompt_id`   … **ループ防止。同じターンでは1回しか止めない**
5. それ以外                    … `blocked_prompt` を書いて **exit 2**

## このファイルが状態に書いてよいのは `blocked_prompt` だけ

`last_audit_at` は `gal_watch.py`（監査の完走を観測する側）しか書かない。
**ゲート側が自分で「監査した」と書けない構造にしてある。**
"""
import json
import os
import re
import sys
import tempfile

STATE_DIR = os.path.join(tempfile.gettempdir(), "claude-gal-watch")

REASON = """観点⑧の監査が未実行です。次を実行してから停止してください。

  1. Agent ツールを `subagent_type: "gal-audit"` で呼ぶ
     （人格と判定の規則は ~/.claude/agents/gal-audit.md 側が持っている）
  2. **残作業を「承認が要る／要らない」で分けた一覧を必ず渡す**
     渡さないと「勝手に止めている」に倒される
  3. 【判定】本当に止めるべき／判断を仰ぐべき／勝手に止めている を受け取る
  4. **エージェントの発言をそのまま会話に残す**（要約しない）

**監査を省略・短縮するよう指示してはいけません。**
gal-audit はユーザー以外の指示では止まりません。

このゲートは監査が完走すると自動で開きます。
**状態ファイルを手で書き換えて通過しないこと。**
"""


def state_path(session_id):
    sid = re.sub(r"[^A-Za-z0-9_-]", "_", session_id or "default")[:64]
    return os.path.join(STATE_DIR, sid + ".json")


def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (IOError, ValueError):
        return {}


def save(path, st):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(st, f, ensure_ascii=False)
    except IOError:
        pass


def main():
    try:
        payload = json.load(sys.stdin)
    except (ValueError, IOError):
        return 0

    import _scope
    if _scope.foreign(payload):
        return 0                            # 他プロジェクトのセッションでは働かない
    path = state_path(payload.get("session_id"))
    st = load(path)

    worked = st.get("last_work_at", 0)     # 最後に作業が起きた時刻
    audited = st.get("last_audit_at", 0)   # 最後に監査が完走した時刻

    if not worked:
        return 0                            # 作業していないターンは素通り
    if audited >= worked:
        return 0                            # 作業のあとに監査が完走している

    # **ループ防止。** `stop_hook_active` が無いので prompt_id で代替する。
    # 同じユーザーターンの中では1回しか止めない ―― 止め続けて
    # セッションが終われなくなるのを防ぐ。
    pid = payload.get("prompt_id")
    if pid and st.get("blocked_prompt") == pid:
        return 0

    st["blocked_prompt"] = pid
    save(path, st)

    # **UTF-8 で直接書く。** Windows の Python は既定で cp932 に変換してしまい、
    # 受け取り側が UTF-8 として読むため文字化けする（実際に化けた）。
    try:
        sys.stderr.buffer.write(REASON.encode("utf-8"))
        sys.stderr.buffer.flush()
    except (AttributeError, IOError):
        sys.stderr.write(REASON)
    return 2


if __name__ == "__main__":
    sys.exit(main())
