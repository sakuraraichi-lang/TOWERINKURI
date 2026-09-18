# -*- coding: utf-8 -*-
"""空転の観点①②を、モデルの外側で数える。あわせて**観点⑧の材料**も記録する。

===========================================================================
**このフックと状態ファイルを、Claude の判断で書き換えないこと。**
無効化・条件緩和・閾値変更が要ると判断した場合は、実行せずユーザーに提案だけする。
期待どおり動かないときも、**フックを外す方向の修正はしない。**
===========================================================================

## なぜ要るか

`gal-summon` の観点は8つあるが、**実際に発火していたのは⑧だけだった。**

⑧（手を止めるとき）は「いま下す判断」なので、過去を振り返らなくても分かる。
①（同一箇所を3回目以降）②（同じ失敗が3連続）は**履歴を数えないと分からない**のに、
数える係がどこにもいなかった。

しかも `gal-summon` は「作業に没入すると内側から止められない」ことへの対策なのに、
**起動条件の検知をその内側の能力に依存させていた。**
発熱している本人に体温を測らせているのと同じで、壊れて当然だった。

**だから数えられるものはモデルの外に出す。** それがこのフック。

## 何をするか

PostToolUse で呼ばれ、状態をセッションごとのファイルに貯める。

- **同じファイルを3回以上編集した** → 観点①
- **同じ種類の失敗が3回続いた** → 観点②

数え直す基準は **「最後に監査（gal-summon）が完走してから」**。
以前は `git commit` でリセットしていたが、**コミットは監査ではない。**
コミットのたびに数え直していたので、同じ場所を何度触っても発火しにくかった。

あわせて `gal_stop.py`（Stopフック）が使う2つの時刻を記録する。

- `last_work_at`  … 最後に作業（ファイル編集）が起きた時刻
- `last_audit_at` … **最後に監査が完走した時刻**（召喚しただけでは記録しない）

閾値を超えたときだけ stderr に書いて終了コード2で返す。
PostToolUse の終了コード2は「ツールは既に実行済みで、stderr が Claude に見える」なので、
**無視できない形で視界に入る。** 超えていないときは黙って0で返す。
"""
import hashlib
import json
import os
import re
import sys
import tempfile
import time

# 閾値。gal-summon の観点①②と同じ数字にする
EDIT_LIMIT = 3      # **同じ箇所**の編集回数
ERROR_LIMIT = 3     # 同じ失敗の連続回数

# **同一ファイルを何回触ったら、量として知らせるか。**
# 観点①は「同じ箇所の堂々巡り」を見るものなので、こちらは別の警告として出す。
FILE_VOLUME_LIMIT = 12

# **観点①の数え方【2026-09-03 変更・ユーザー承認済み】**
#
# 変更前は `file_path` だけをキーにして、同じファイルへの Edit 呼び出しを数えていた。
# **その結果、2026-09-03 に1日で8回鳴り、ギャルが判定した3回はすべて「誤検出」だった。**
#
#   1回目  run_balance.py と PartyPolicy.cs へ同じ修正を移植   → 誤検出
#   2回目  教頭の記述訂正と、教師の実装が同じファイルに乗った   → 誤検出
#   3回目  BOSS_TRIALS / AI_RNG新設 / calamity_gate の3件      → 誤検出
#   4〜8回目  同じ形（コミット分割の往復、C#への1関数ずつの移植）
#
# ギャルの判定（逐語）：
#   **「フックが『同一ファイル』と『同一バグの3周目』を区別できてないだけ。」**
#
# このリポジトリでは事情が2つ重なる。
#   - `sim/run_balance.py` が冒険者AIの本体なので、触らずに済む作業がほとんど無い
#   - **Python と C# を1行ずつ対応させる決まり**があり、1つの修正が必ず2ファイルに出る
#     さらに関数を1つずつ写すので、`Edit` の呼び出し回数だけが積み上がる
#
# そこで、**「同じ箇所」を `old_string` の頭で見分ける**ようにした。
#   - 同じ場所を3回書き換えている  → 観点①（堂々巡り）。**ここは緩めない**
#   - 別々の場所を何度も書いている  → 進捗。数えるが、12回でようやく「量」として知らせる
#
# **ゲートそのもの（gal_stop.py の観点⑧）は一切触っていない。**
# 監査を挟まずに止まれない仕組みはそのまま。ここで変えたのは
# **「何を堂々巡りと呼ぶか」の精度だけ**である。
#
# Write / NotebookEdit は全体を置き換えるので、従来どおりファイル単位で数える。

# 監査を担当する正式なサブエージェント（`~/.claude/agents/gal-audit.md`）
AUDIT_AGENT = "gal-audit"

# **監査の実行記録。** ユーザーが後から見返せるように、呼び出しと判定を追記していく。
#   「gal エージェント、呼び出されて実行したものを私に見えるようにしてくれ」【ユーザー指定】
# サブエージェントの出力は既定ではユーザーに見えないので、**ここに残す。**
AUDIT_LOG = os.path.join(os.path.expanduser("~"), ".claude", "gal-audit.log")

STATE_DIR = os.path.join(tempfile.gettempdir(), "claude-gal-watch")


def state_path(session_id):
    sid = re.sub(r"[^A-Za-z0-9_-]", "_", session_id or "default")[:64]
    return os.path.join(STATE_DIR, sid + ".json")


def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (IOError, ValueError):
        return {"edits": {}, "err_sig": None, "err_streak": 0, "fired": {}}


def save(path, st):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(st, f, ensure_ascii=False)
    except IOError:
        pass


def error_signature(payload):
    """失敗の種類を表す短い指紋。**具体的な行番号やパスは落とす。**

    そうしないと「同じ失敗」が毎回別物に見えてしまう。
    見るのは例外の型と、メッセージの骨格だけ。
    """
    resp = payload.get("tool_response")
    if isinstance(resp, dict):
        text = "%s\n%s" % (resp.get("stderr") or "", resp.get("stdout") or "")
        if not resp.get("is_error") and "Error" not in text and "Traceback" not in text:
            return None
    elif isinstance(resp, str):
        text = resp
    else:
        return None

    lines = [l.strip() for l in text.splitlines() if l.strip()]
    hit = None
    for l in reversed(lines):
        if re.search(r"(Error|Exception|Traceback|error:|失敗|assert)", l):
            hit = l
            break
    if hit is None:
        return None
    # 行番号・16進・パス・引用符の中身を落として骨格だけ残す
    norm = re.sub(r"0x[0-9a-fA-F]+|\d+", "#", hit)
    norm = re.sub(r"[A-Za-z]:[\\/][^\s'\"]+|/[^\s'\"]{4,}", "<path>", norm)
    norm = re.sub(r"\s+", " ", norm)[:180]
    return hashlib.sha1(norm.encode("utf-8", "replace")).hexdigest()[:12], norm


def _log_audit(inp, resp, completed):
    """監査の呼び出しと結果を追記する。**ユーザーが後から読むための記録。**

    サブエージェントの出力はユーザーの画面に出ないので、
    「呼んだこと」も「何を渡したか」も「何が返ったか」も、ここが唯一の証跡になる。
    書けなくても本体の判定は続ける（記録の失敗で監査を止めない）。
    """
    try:
        os.makedirs(os.path.dirname(AUDIT_LOG), exist_ok=True)
        text = resp if isinstance(resp, str) else json.dumps(resp, ensure_ascii=False)
        # **`errors="replace"` で書く。** サロゲート単体などが混ざると
        # `UnicodeEncodeError` になり、**記録どころか監査の完走記録まで巻き添えで落ちる。**
        # 下の `except` も広く取ってあるが、そもそも落とさないのが先。
        with open(AUDIT_LOG, "a", encoding="utf-8", errors="replace", newline="\n") as f:
            f.write("\n" + "=" * 72 + "\n")
            f.write("%s  %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"),
                                  "完走" if completed else "**判定が返っていない**"))
            f.write("-" * 72 + "\n[渡した材料]\n")
            f.write((inp.get("prompt") or "")[:4000] + "\n")
            f.write("-" * 72 + "\n[返ってきた判定]\n")
            f.write(text[:4000] + "\n")
    except Exception:
        # **記録の失敗で監査を止めない。** ここを `(IOError, OSError)` に絞っていたら、
        # `UnicodeEncodeError`（ValueError 系）で関数ごと落ち、
        # **呼び出し元の `last_audit_at` を書く行まで到達しなかった。**
        # 「記録に失敗しても本体の判定は続ける」という約束が、そこで破れていた（監査で発覚）。
        # **記録は副作用。本体より優先させない。**
        pass


def read_payload():
    """**stdin を UTF-8 として読む。** 【ユーザー承認のうえ修正 2026-08-24】

    以前は `json.load(sys.stdin)` だった。**それが致命的だった。**
    Windows の Python は stdin を既定のロケール（日本語環境では cp932）で
    復号するため、**UTF-8 のペイロードが丸ごと化けた。**
    実際に `gal-audit.log` には「ギャル」が `繧ｮ繝｣繝ｫ` と記録されていた。

    化けると下の `got = "【判定】" in text` が**恒久的に偽**になる。つまり

      - `last_audit_at` が一度も書かれない
      - → **観点⑧のゲート（gal_stop.py）が構造的に開かない**
        （`prompt_id` のループ防止で1ターン1回だけ通過していただけ）
      - → 観点①②のカウンタも一度もリセットされない

    **監査の仕組み全体が、文字コード1つで死んでいた。**
    バイト列で読んで明示的に復号する。cp932 は後方互換のための保険。
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


def main():
    payload = read_payload()
    if payload is None:
        return 0

    import _scope
    if _scope.foreign(payload):
        return 0                            # 他プロジェクトのセッションでは働かない
    path = state_path(payload.get("session_id"))
    st = load(path)
    tool = payload.get("tool_name") or ""
    inp = payload.get("tool_input") or {}
    warnings = []
    now = time.time()

    # ---- 観点⑧のための時刻。**止まってよいかを外側で判定するため** ----
    # `gal_stop.py`（Stopフック）が、この2つを比べる。
    #   作業したのに監査が完走していないなら、止まらせない。
    # **Bash / PowerShell も「作業」に数える。**
    # 当初は Edit / Write / NotebookEdit しか見ていなかったが、
    # **ファイルを書き換える手段はそれだけではない。**
    # `sed`・ヒアドキュメント・生成スクリプト（`gen_*.py`）はすべて Bash 経由で、
    # 実際このリポジトリの編集はほぼ全部 Bash から行われていた。
    # **つまりゲートは事実上ほとんど発火していなかった**（監査で発覚）。
    #
    # コマンドが本当にファイルを書いたかを厳密に見分けるのは難しいので、
    # **「シェルを呼んだら作業とみなす」保守的な側に倒す。**
    # 読むだけのコマンドで余分に発火するほうが、書き換えを見逃すよりましである。
    if tool in ("Edit", "Write", "NotebookEdit"):
        f = inp.get("file_path") or ""
        if f and "scratchpad" not in f.replace("\\", "/"):
            st["last_work_at"] = now
    elif tool in ("Bash", "PowerShell"):
        st["last_work_at"] = now

    # ---- 監査の「完走」を記録する ----
    # **呼んだことと完走したことは違う。**
    # 最初の版は `tool_input` に「ギャル」が入っていれば記録していたが、
    # それは**召喚しただけ**でも通ってしまう。
    # PostToolUse はツールが返ったあとに走るので、**返答に【判定】が入っているか**
    # まで見れば「判定を受け取った」ところまで確かめられる。
    if tool == "Agent":
        # **正式なサブエージェント名だけで見分ける**（`~/.claude/agents/gal-audit.md`）。
        # 旧版は依頼文の中身（`tool_input` を JSON 化した文字列）に「ギャル」が
        # 含まれていれば召喚とみなしていたが、教師・教頭への依頼文には
        # 「ギャル」の3文字が普通に出てくるため、**監査でない呼び出しを
        # 監査として誤判定する経路になっていた**（実際に nurse 1件・
        # vice-principal 1件・teacher 2件で誤検知しかけた。応答に
        # 「【判定】」が無かったためゲートは開かずに済んだ）。
        # 取りこぼしを嫌って偽陽性を許す設計が、監査の偽装経路になっていたため、
        # **`subagent_type` の完全一致だけを条件にする。**
        called = (inp.get("subagent_type") == AUDIT_AGENT)
        resp = payload.get("tool_response")
        got = "【判定】" in (resp if isinstance(resp, str)
                             else json.dumps(resp, ensure_ascii=False))
        if called:
            _log_audit(inp, resp, got)
        if called and got:
            st["last_audit_at"] = now
            # **観点①②のリセットもここ。** 基準は「最後にコミットしてから」ではなく
            # 「**最後に監査が完走してから**」。コミットは監査ではない。
            st["edits"] = {}
            st["err_sig"], st["err_streak"] = None, 0

    # ---- 観点① 同一箇所を3回目以降修正している ----
    if tool in ("Edit", "Write", "NotebookEdit"):
        f = inp.get("file_path") or ""
        # 一時ファイルは数えない（作業の本体ではない）
        if f and STATE_DIR not in f and "scratchpad" not in f.replace("\\", "/"):
            base = os.path.normcase(os.path.abspath(f))

            # **同じ箇所かどうかを `old_string` の頭で見分ける。**
            # 空白と行頭のインデントを潰したうえで、先頭120文字だけを見る。
            # 同じ関数を少しずつ直していれば頭は変わらないので、堂々巡りとして数える。
            # 別の関数を書いていれば別のキーになるので、積み上がらない。
            old = inp.get("old_string")
            if tool == "Edit" and isinstance(old, str) and old.strip():
                norm = re.sub(r"\s+", " ", old.strip())[:120]
                spot = hashlib.sha1(norm.encode("utf-8")).hexdigest()[:12]
                key, where = base + "#" + spot, "同じ箇所"
            else:
                # Write / NotebookEdit は全体を置き換えるので、ファイル単位のまま
                key, where = base, "ファイル全体の書き換え"

            n = st["edits"].get(key, 0) + 1
            st["edits"][key] = n
            # 3回目で1度、その後は倍になるたび（3→6→12）。鳴らしすぎない
            if n >= EDIT_LIMIT and (n == EDIT_LIMIT or n % (EDIT_LIMIT * 2) == 0):
                warnings.append(
                    "【観点① 同一箇所を3回目以降修正している】\n"
                    "  %s の**%s**を、監査を挟まずに **%d回目** の編集。"
                    % (os.path.basename(f), where, n))

            # **ファイル単位の合計も数える。**こちらは堂々巡りではなく「量」の警告。
            # 1つのファイルに長く手を入れ続けているとき、監査を挟む機会を作るためにある。
            vkey = "vol:" + base
            v = st["edits"].get(vkey, 0) + 1
            st["edits"][vkey] = v
            if v >= FILE_VOLUME_LIMIT and v % FILE_VOLUME_LIMIT == 0:
                warnings.append(
                    "【編集量】%s を、監査を挟まずに **%d回** 編集している。\n"
                    "  同じ箇所の繰り返しではないが、一度ここまでを監査に通すか検討する。"
                    % (os.path.basename(f), v))

    # ---- 観点② 同じ失敗が3連続 ----
    sig = error_signature(payload)
    if sig is None:
        st["err_sig"], st["err_streak"] = None, 0
    else:
        h, norm = sig
        if h == st.get("err_sig"):
            st["err_streak"] = st.get("err_streak", 0) + 1
        else:
            st["err_sig"], st["err_streak"] = h, 1
        if st["err_streak"] >= ERROR_LIMIT and st["err_streak"] % ERROR_LIMIT == 0:
            warnings.append(
                "【観点② 同じ失敗が3連続】\n"
                "  %d回続けて同じ失敗:\n  %s" % (st["err_streak"], norm))

    save(path, st)

    if not warnings:
        return 0

    msg = ("空転の観点に当たりました。**gal-summon を起動してください。**\n\n"
           + "\n\n".join(warnings)
           + "\n\n手順は ~/.claude/skills/gal-summon/SKILL.md。\n"
             "同じやり方を続ける前に、外の視点で「もう終わり／方向ズレ／続行OK」を受け取ること。\n")
    # **UTF-8 で直接書く。** Windows の Python は既定で cp932 に変換してしまい、
    # 受け取り側が UTF-8 として読むため文字化けする（実際に化けた）。
    try:
        sys.stderr.buffer.write(msg.encode("utf-8"))
        sys.stderr.buffer.flush()
    except (AttributeError, IOError):
        sys.stderr.write(msg)
    return 2


if __name__ == "__main__":
    sys.exit(main())
