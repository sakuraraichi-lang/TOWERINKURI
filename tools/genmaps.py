# -*- coding: utf-8 -*-
"""マップ生成器。src/stages.js の map: を作った本体。

手書きのマップは壊れる。実際、最初に手書きした5枚のうち4枚が
「コアが壁に囲まれて到達できない」状態だった。
なので通路は必ず折れ線で彫り、連結を彫り方で保証する。

    python tools/genmaps.py            検証だけして結果を表示する
    python tools/genmaps.py --write    検証を通ったら src/stages.js に書き戻す

検証する条件（`src/balance.js` の minRouteLen と揃えてある）:
  - 全ての行の長さが揃っている
  - コア(C)が1つ、出現口(S)が1つ以上ある
  - 全ての出現口からコアへ到達できる
  - どの出現口からの経路長も minRouteLen 以上
    （短いと、どこに置いても撃つ時間が足りずに必ず漏れる。
      経路17タイルのマップで「8回挑戦して全部ウェーブ1で撃沈」になった）
  - 通路に面した壁が25タイル以上ある（置き場所が無いとゲームにならない）

凡例： # 壁（設置可） / . 通路 / S 敵の出現口 / C コア
"""
import io
import os
import re
import sys
from collections import deque

W, H = 13, 19
MIN_ROUTE = 28
MIN_WALLS = 25
STAGES_JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "stages.js")


# ---------------------------------------------------------------
# 彫る
# ---------------------------------------------------------------
def blank():
    return [['#'] * W for _ in range(H)]


def carve(g, pts):
    """折れ線に沿って通路を彫る。縦か横のみ（斜めは彫れない）"""
    for i in range(len(pts) - 1):
        (c0, r0), (c1, r1) = pts[i], pts[i + 1]
        assert c0 == c1 or r0 == r1, "斜めは彫れない %s -> %s" % (pts[i], pts[i + 1])
        if c0 == c1:
            for r in range(min(r0, r1), max(r0, r1) + 1):
                g[r][c0] = '.'
        else:
            for c in range(min(c0, c1), max(c0, c1) + 1):
                g[r0][c] = '.'


def rect(g, c0, r0, c1, r1):
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            g[r][c] = '.'


def finish(g, core, spawns):
    g[core[1]][core[0]] = 'C'
    for s in spawns:
        g[s[1]][s[0]] = 'S'
    return [''.join(row) for row in g]


# ---------------------------------------------------------------
# 検証
# ---------------------------------------------------------------
def inspect(rows):
    widths = sorted(set(len(r) for r in rows))
    spawns = [(c, r) for r in range(len(rows)) for c in range(len(rows[r])) if rows[r][c] == 'S']
    cores = [(c, r) for r in range(len(rows)) for c in range(len(rows[r])) if rows[r][c] == 'C']
    problems = []
    if len(widths) != 1:
        problems.append("行の長さが揃っていない %s" % widths)
        return None, problems
    if len(cores) != 1:
        problems.append("コア(C)が %d 個" % len(cores))
        return None, problems
    if not spawns:
        problems.append("出現口(S)が無い")
        return None, problems

    w, h = widths[0], len(rows)
    walk = lambda c, r: 0 <= c < w and 0 <= r < h and rows[r][c] in '.SC'
    dist = {cores[0]: 0}
    q = deque([cores[0]])
    while q:
        c, r = q.popleft()
        for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (c + dc, r + dr)
            if walk(*n) and n not in dist:
                dist[n] = dist[(c, r)] + 1
                q.append(n)

    unreachable = [s for s in spawns if s not in dist]
    if unreachable:
        problems.append("コアへ到達できない出現口 %s" % unreachable)
    lens = sorted(dist[s] for s in spawns if s in dist)
    if lens and min(lens) < MIN_ROUTE:
        problems.append("経路が短すぎる %d < %d（経路長 %s）" % (min(lens), MIN_ROUTE, lens))
    useful = sum(1 for r in range(h) for c in range(w)
                 if rows[r][c] == '#' and any(walk(c + dc, r + dr)
                                              for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1))))
    if useful < MIN_WALLS:
        problems.append("通路に面した壁が少なすぎる %d < %d" % (useful, MIN_WALLS))

    return {"paths": len(dist), "walls": useful, "routeLens": lens}, problems


# ---------------------------------------------------------------
# 5枚のマップ
# ---------------------------------------------------------------
def build_all():
    out = {}

    # st1 訓練場：一本道の長い蛇行。壁が通路に挟まれていて、どこに置いても複数列を撃てる
    g = blank()
    carve(g, [(1, 1), (11, 1), (11, 3), (1, 3), (1, 5), (11, 5), (11, 7), (1, 7),
              (1, 9), (11, 9), (11, 11), (1, 11), (1, 13), (11, 13), (11, 15), (1, 15),
              (1, 17), (11, 17)])
    out['st1'] = finish(g, (6, 17), [(1, 1)])

    # st2 二面作戦：1本の長い蛇行路の両端から来て、中央のコアを挟み撃ちにされる
    g = blank()
    carve(g, [(1, 1), (11, 1), (11, 4), (1, 4), (1, 7), (11, 7), (11, 10), (1, 10),
              (1, 13), (11, 13), (11, 16), (1, 16)])
    out['st2'] = finish(g, (6, 7), [(1, 1), (1, 16)])

    # st3 螺旋：外周から中心へ巻き込む長い一本道
    g = blank()
    carve(g, [(1, 1), (11, 1), (11, 17), (1, 17), (1, 3), (9, 3), (9, 15), (3, 15),
              (3, 5), (7, 5), (7, 13), (5, 13), (5, 7), (6, 7)])
    out['st3'] = finish(g, (6, 7), [(1, 1)])

    # st4 広間：上の広間から外周を大きく回り、下からしか中央の部屋に入れない
    g = blank()
    rect(g, 1, 1, 11, 2)
    carve(g, [(1, 2), (1, 5), (3, 5), (3, 9), (1, 9), (1, 17)])      # 左の縦通路（折れ込み）
    carve(g, [(11, 2), (11, 5), (9, 5), (9, 9), (11, 9), (11, 17)])  # 右の縦通路
    carve(g, [(1, 17), (11, 17)])                                     # 下の連絡路
    rect(g, 5, 10, 7, 12)                                             # 中央の小部屋
    carve(g, [(6, 17), (6, 12)])                                      # 下からの唯一の入口
    out['st4'] = finish(g, (6, 11), [(1, 1), (11, 1)])

    # st5 三叉：上辺の3か所から湧き、外周を左右に分かれて回り、下の唯一の入口で合流する
    g = blank()
    carve(g, [(1, 1), (11, 1)])
    carve(g, [(1, 1), (1, 17)])
    carve(g, [(11, 1), (11, 17)])
    carve(g, [(1, 17), (11, 17)])
    carve(g, [(6, 17), (6, 10)])
    rect(g, 5, 9, 7, 10)
    out['st5'] = finish(g, (6, 9), [(1, 1), (6, 1), (11, 1)])

    return out


# ---------------------------------------------------------------
def write_back(out):
    path = os.path.normpath(STAGES_JS)
    s = io.open(path, encoding="utf-8").read()
    for sid, rows in out.items():
        body = "\n".join("      '%s'," % r for r in rows)
        pat = re.compile(r"(id: '%s',.*?map: \[\n).*?(\n    \],)" % sid, re.S)
        s, n = pat.subn(lambda m: m.group(1) + body + m.group(2), s, count=1)
        if n != 1:
            raise SystemExit("stages.js に %s の map: が見つからない" % sid)
    io.open(path, "w", encoding="utf-8", newline="\n").write(s)
    print("src/stages.js に書き戻した")


def main():
    out = build_all()
    ok = True
    print("検証（経路長 %d 以上 / 通路に面した壁 %d 以上）" % (MIN_ROUTE, MIN_WALLS))
    for sid in ['st1', 'st2', 'st3', 'st4', 'st5']:
        info, problems = inspect(out[sid])
        if problems:
            ok = False
            print("  %-5s NG" % sid)
            for p in problems:
                print("        - %s" % p)
        else:
            print("  %-5s OK  通路%3d  面した壁%3d  経路長%s"
                  % (sid, info["paths"], info["walls"], info["routeLens"]))
    print()
    if not ok:
        print("RESULT: *** 修正が必要 ***")
        return 1
    print("RESULT: ALL OK")
    if '--write' in sys.argv:
        write_back(out)
    else:
        print("（--write を付けると src/stages.js に書き戻す）")
    return 0


if __name__ == '__main__':
    sys.exit(main())
