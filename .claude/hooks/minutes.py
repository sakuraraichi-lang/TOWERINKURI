# -*- coding: utf-8 -*-
"""**ユーザー・私・エージェント間のやり取りの「議事録」を、日時つきで残す。**

> **ユーザー指示 2026-08-26:**
> 「僕の発言、君の発言、君達のエージェント間の発言を日時で保存して議事録として
>  GitHub にアップロードする仕組み作れる？ ギャルがそれ見るだけで簡単に監査できて、
>  言った言わないがないようにする上に、齟齬が起きないようにするシステムを作れますか？」
> 「とりあえずは僕の発言の記録は大事だからね、ギャルが僕の発言を引用出来るように
>  なると監査効率が良くなる」

**エージェント同士の発言は `agent_log.py` が `.claude/agent-comments.log` に
残しているが、ユーザー本人と私（メインセッション）の発言はどこにも残っていない。**
このフックはその欠けを埋める。**最優先はユーザー発言の原文保存。**

## 何を記録するか（公式ドキュメントで確認したイベントとフィールド）

| 誰の発言 | イベント | 取り出すフィールド |
|---|---|---|
| ユーザー | `UserPromptSubmit` | `user_input`（打った本文そのもの） |
| 私 | `Stop` | `last_assistant_message`（ターンの最後の1つだけ） |
| セッションの切れ目 | `SessionStart` / `SessionEnd` | `session_start_reason` / `session_end_reason` |

対応していないイベントで呼ばれた場合は何もせず終了コード0で返す
（＝将来 matcher の設定を広げても暴発しない）。

## 置き場所の判断 ―― `docs/minutes/YYYY-MM-DD.jsonl`（git 追跡下）

`agent_log.py` の `.claude/agent-comments.log` は **git 追跡の外**
（`.gitignore` の `.claude/*` 除外）に置き、`docs/agent-log-snapshots/` へ
**人力で随時コピーを取る**方式になっている。

今回はあえて揃えず、**最初から `docs/minutes/` に直接書く。** 理由：

1. **「git で追跡できる場所であること（GitHub に上げるため）」が今回は
   明示の要件。** `.claude/` に書いて後から誰かがコピーする一段を挟むと、
   コピーする仕組みそのものが未実装のまま「議事録が GitHub に上がらない」
   期間が生まれる。CP-004（`docs/decision-2026-08-26-conversation-log-tracking.md`）
   と同じ穴を、今回は最初から作らない。
2. **「増え続けるので区切り方が要る」は、日ごとのファイルに分けることで
   そのまま解決する。** 1日が終われば、その日のファイルは実質的に
   確定した「写し」になる。`agent-comments.log`（単一ファイルに無期限追記、
   現在735KB）のような無限成長は起きない。
3. ハッシュ連鎖は**日をまたいでも**つながる（後述）。日ごとに切っても
   「連鎖が途切れて改ざんを覆い隠せる」ことにはならない。

**踏まえたうえでの残作業：** 生成物は git の作業ツリー上には既に存在するが、
**コミットするかどうかは校長・ユーザーの判断**（このフックからはコミットしない）。

## 形式 ―― JSON Lines（1行1レコード）

**理由：**
- **原文をそのまま保存できる。** 改行や記号を含む本文でも、JSON文字列の
  エスケープに乗せれば区切りが崩れない（区切り文字を独自定義した平文形式だと、
  本文中にその文字が出た瞬間に壊れる）。
- **通し番号・時刻・話者が別フィールドなので、ギャルが機械的に引ける。**
  `id`（例 `2026-08-26#000003`）で該当行を一意に指せる。
- `grep` / `jq` の両方で拾える（1行1オブジェクトなので `grep '"speaker":"user"'`
  でユーザー発言だけ抜き出せる）。

## ハッシュ連鎖 ―― 改ざん検知

各レコードは直前レコードの `hash` を `prev_hash` として持ち、
自分自身の内容（`prev_hash` を含む）から `hash` を計算する
（`sha256(compact-json)`）。

- **本文を書き換えると、そのレコード自身の `hash` が合わなくなる。**
- **書き換えた側が `hash` まで辻褄を合わせても、次のレコードの
  `prev_hash` が新しい `hash` と一致しなくなる。**
- 日をまたぐ場合も、新しい日の最初のレコードの `prev_hash` に
  **前日ファイルの最後の `hash`** を継ぐ。ファイルを分けても連鎖は切れない。

**できないこと（正直に書く）：** ある行から末尾までを丸ごと・整合を保ったまま
書き換えれば、この連鎖だけでは検知できない（ハッシュ連鎖に共通の限界）。
それを検知するのは **git のコミット履歴側の役目**であり、このフックの担当ではない。

## 既存フックとの作法の一致

- **stdin は UTF-8 として明示的に読む。** `json.load(sys.stdin)` は使わない
  （Windows既定の cp932 で日本語が化ける。`gal_watch.py` の教訓）。
- **記録に失敗しても本体を止めない。** 例外はすべて握って終了コード0で返す。
"""
import hashlib
import io
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MINUTES_DIR = os.path.join(ROOT, "docs", "minutes")

GENESIS_HASH = "0" * 64
LOCK_TIMEOUT = 5.0     # 秒。これを超えたら記録を諦める（本体は止めない）
LOCK_STALE = 10.0      # 秒。これより古いロックファイルは前回の異常終了とみなし奪う


def read_payload():
    """**stdin を UTF-8 として読む。** `json.load(sys.stdin)` にしないこと。

    Windows の Python は既定のロケール（日本語環境では cp932）で復号するため、
    UTF-8 のペイロードが丸ごと化ける（`gal_watch.py` が実際に踏んだ事故）。
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


def compact_json(obj):
    """ハッシュ計算・検証の両方で使う正準表現。**キー順を固定するため
    `sort_keys` は使わない**（書き込み時の挿入順を検証時にも再現できれば足り、
    そのほうが `json.loads` が返す順序ともそのまま一致する）。"""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def compute_hash(record_without_hash):
    payload = compact_json(record_without_hash).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def acquire_lock(lock_path):
    """同一ファイルへの同時追記で行が壊れないための簡易ロック。

    取れなくても例外にはせず `False` を返す（呼び出し側が記録を諦める）。
    **前回セッションの異常終了で残ったロックは、一定時間で奪う。**
    """
    start = time.time()
    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
            os.close(fd)
            return True
        except FileExistsError:
            try:
                age = time.time() - os.path.getmtime(lock_path)
                if age > LOCK_STALE:
                    os.remove(lock_path)
                    continue
            except OSError:
                pass
            if time.time() - start > LOCK_TIMEOUT:
                return False
            time.sleep(0.05)


def release_lock(lock_path):
    try:
        os.remove(lock_path)
    except OSError:
        pass


def read_last_record(path):
    """ファイルの最後の1行を読んで JSON にする。無い/壊れていれば None。"""
    if not os.path.isfile(path):
        return None
    try:
        with io.open(path, "r", encoding="utf-8", errors="replace") as f:
            last = None
            for line in f:
                line = line.strip()
                if line:
                    last = line
            if last is None:
                return None
            return json.loads(last)
    except (IOError, ValueError):
        return None


def find_previous_file_hash(dir_path, date_str):
    """自分より前の日付の議事録ファイルのうち、最新のものの最終ハッシュを探す。
    無ければ `GENESIS_HASH`（このフックで初めて書くレコード）。"""
    try:
        names = sorted(
            n for n in os.listdir(dir_path)
            if n.endswith(".jsonl") and n[:10] < date_str
        )
    except OSError:
        names = []
    if not names:
        return GENESIS_HASH
    prev_path = os.path.join(dir_path, names[-1])
    rec = read_last_record(prev_path)
    if rec and isinstance(rec.get("hash"), str):
        return rec["hash"]
    return GENESIS_HASH


def build_record(payload):
    """イベントの種類から話者・本文・付帯情報を組み立てる。
    対応外のイベントは `None` を返す。"""
    event = payload.get("hook_event_name") or ""

    if event == "UserPromptSubmit":
        speaker = "user"
        # **2026-09-01 実物確認済み: 本文キーは `prompt`。**
        # `user_input` は `claude-code-guide` のドキュメント由来で、実物には
        # 存在しなかった（2026-08-31 発覚。診断ログ `docs/minutes/2026-09-01.jsonl`
        # の `extra.payload_keys` で `prompt` だと判明した）。
        # `user_input` は捨てずに残す：バージョンが変わってキー名が戻る／
        # 別名で復活する可能性はゼロではなく、`prompt` を優先しつつ
        # フォールバックに置いておく分にはコストがほぼ無い。
        text = payload.get("prompt") or payload.get("user_input") or ""
        # **診断用の全量ダンプ（`payload` 丸ごと）はもう役目を終えたので外す。**
        # `prompt` は `text` と二重になるだけで監査には要らない。
        # 残すのは2つだけ：
        #   - `payload_keys`: 今後またペイロードの形が変わったとき、
        #     `text` が黙って空文字化するのを次のターンで検知できるようにする
        #     （空文字化に気づく手段そのものは残す）。
        #   - `session_title`: 診断で見つかった想定外キー。セッションの見出しで
        #     監査時に「どの作業の発言か」を素早く判断できるため、名前を付けて残す。
        extra = {
            "payload_keys": sorted(payload.keys()),
            "session_title": payload.get("session_title"),
        }
    elif event == "Stop":
        speaker = "assistant"
        text = payload.get("last_assistant_message") or ""
        extra = {"stop_reason": payload.get("stop_reason")}
    elif event == "SessionStart":
        speaker = "system"
        reason = payload.get("session_start_reason") or ""
        text = u"セッション開始（%s）" % reason
        extra = {"session_start_reason": reason}
    elif event == "SessionEnd":
        speaker = "system"
        reason = payload.get("session_end_reason") or ""
        text = u"セッション終了（%s）" % reason
        extra = {"session_end_reason": reason}
    else:
        return None

    return {
        "event": event,
        "speaker": speaker,
        "session_id": payload.get("session_id"),
        "prompt_id": payload.get("prompt_id"),
        "cwd": payload.get("cwd"),
        "permission_mode": payload.get("permission_mode"),
        "transcript_path": payload.get("transcript_path"),
        "text": text,
        "extra": extra,
    }


def append_record(payload):
    base = build_record(payload)
    if base is None:
        return False

    os.makedirs(MINUTES_DIR, exist_ok=True)
    date_str = time.strftime("%Y-%m-%d")
    file_path = os.path.join(MINUTES_DIR, date_str + ".jsonl")
    lock_path = file_path + ".lock"

    if not acquire_lock(lock_path):
        return False
    try:
        last = read_last_record(file_path)
        if last is not None and isinstance(last.get("hash"), str):
            prev_hash = last["hash"]
            seq = int(last.get("seq") or 0) + 1
        else:
            prev_hash = find_previous_file_hash(MINUTES_DIR, date_str)
            seq = 1

        record = {
            "id": "%s#%06d" % (date_str, seq),
            "seq": seq,
            "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        record.update(base)
        record["prev_hash"] = prev_hash
        record["hash"] = compute_hash(record)

        with io.open(file_path, "a", encoding="utf-8", newline="\n") as f:
            f.write(compact_json(record) + "\n")
        return True
    finally:
        release_lock(lock_path)


def verify_file(path):
    """1ファイル分のハッシュ連鎖を検証する。`(ok, 壊れた行番号 or None, 件数)`。"""
    prev_hash = None
    count = 0
    try:
        with io.open(path, "r", encoding="utf-8") as f:
            for lineno, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue
                count += 1
                try:
                    record = json.loads(line)
                except ValueError:
                    return False, lineno, count
                stored_hash = record.get("hash")
                stored_prev = record.get("prev_hash")
                body = dict(record)
                body.pop("hash", None)
                recomputed = compute_hash(body)
                if recomputed != stored_hash:
                    return False, lineno, count
                if prev_hash is not None and stored_prev != prev_hash:
                    return False, lineno, count
                prev_hash = stored_hash
    except IOError as e:
        return False, None, count
    return True, None, count


def verify_dir(dir_path):
    """ディレクトリ内の *.jsonl を日付順にすべて検証し、結果を表示する。"""
    ok_all = True
    try:
        names = sorted(n for n in os.listdir(dir_path) if n.endswith(".jsonl"))
    except OSError:
        print(u"ディレクトリが見つかりません: %s" % dir_path)
        return 1
    prev_file_last_hash = GENESIS_HASH
    for name in names:
        path = os.path.join(dir_path, name)
        ok, bad_line, count = verify_file(path)
        # 日をまたいだ連鎖も見る
        first = None
        if count:
            with io.open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        first = json.loads(line)
                        break
        cross_ok = True
        if first is not None and prev_file_last_hash != GENESIS_HASH:
            cross_ok = (first.get("prev_hash") == prev_file_last_hash)
        status = u"OK" if (ok and cross_ok) else u"NG"
        if not (ok and cross_ok):
            ok_all = False
        detail = u""
        if not ok:
            detail = u"  -> %d行目で連鎖が壊れています" % bad_line if bad_line else u"  -> 読み込みエラー"
        elif not cross_ok:
            detail = u"  -> 前日ファイルとの連鎖が切れています"
        print(u"%s  %-24s  %4d件  %s%s" % (status, name, count, "", detail))
        last = read_last_record(path)
        if last and isinstance(last.get("hash"), str):
            prev_file_last_hash = last["hash"]
    return 0 if ok_all else 1


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "verify":
        target = sys.argv[2] if len(sys.argv) >= 3 else MINUTES_DIR
        return verify_dir(target)

    payload = read_payload()
    if payload is None:
        return 0
    import _scope
    if _scope.foreign(payload):
        return 0                            # 他プロジェクトのセッションでは働かない
    try:
        append_record(payload)
    except Exception:
        # **記録の失敗でセッションを止めない。** 記録は副作用。
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
