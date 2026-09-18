# -*- coding: utf-8 -*-
"""マップ生成器。src/stages.js の map: を作った本体。

    python tools/genmaps.py            検証だけして結果を表示する
    python tools/genmaps.py --write    検証を通ったら src/stages.js に書き戻す

手書きのマップは壊れる。実際、最初に手書きした5枚のうち4枚が
「コアが壁に囲まれて到達できない」状態だった。
なので通路は必ず折れ線で彫り、連結を彫り方で保証する。

凡例
    .  通路（敵が通る）
    #  地面（ユニットを置ける）
    S  敵の出現口
    C  コア
    空白 障害物（通れないし置けない）

十字砲火が組めることを数値で確かめる。
一直線の廊下だと、どのユニットも同じ方向を向くことになって射線が重ならない。
「2本以上の通路が、60度以上ひらいた方向に見える地面」を交差点候補として数え、
それが一定数あることを条件にしている。
"""
import io
import math
import os
import re
import sys
from collections import deque

W, H = 15, 21
MIN_ROUTE = 20          # 出現口からコアまでの最短タイル数の下限
                        # （ユニットを複数置けるようになり、以前より射線が濃いので下げてある）
MIN_GROUND = 90         # 置ける地面の数
MIN_CROSS = 40          # 十字砲火が組める地面の数
CROSS_R = 6.0           # 射線が届くとみなすタイル距離
CROSS_ANGLE = math.radians(60)
STAGES_JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "stages.js")


def blank():
    return [['#'] * W for _ in range(H)]


def _put(g, c, r, w):
    for dr in range(w):
        for dc in range(w):
            cc, rr = c + dc, r + dr
            if 0 <= cc < W and 0 <= rr < H:
                g[rr][cc] = '.'


def carve(g, pts, w=2):
    """折れ線に沿って幅 w の通路を彫る。縦・横・斜め(45度)が使える"""
    for i in range(len(pts) - 1):
        (c0, r0), (c1, r1) = pts[i], pts[i + 1]
        dc, dr = c1 - c0, r1 - r0
        assert dc == 0 or dr == 0 or abs(dc) == abs(dr), \
            "縦・横・斜めのみ %s -> %s" % (pts[i], pts[i + 1])
        n = max(abs(dc), abs(dr))
        sc = (dc > 0) - (dc < 0)
        sr = (dr > 0) - (dr < 0)
        for k in range(n + 1):
            _put(g, c0 + sc * k, r0 + sr * k, w)


def block(g, c0, r0, c1, r1):
    """障害物（置けない・通れない）。見た目の変化と射線の遮りを作る"""
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            if 0 <= c < W and 0 <= r < H and g[r][c] == '#':
                g[r][c] = ' '


def finish(g, core, spawns):
    g[core[1]][core[0]] = 'C'
    for s in spawns:
        g[s[1]][s[0]] = 'S'
    return [''.join(row) for row in g]


# ---------------------------------------------------------------
def inspect(rows):
    widths = sorted(set(len(r) for r in rows))
    problems = []
    if len(widths) != 1:
        return None, ["行の長さが揃っていない %s" % widths]
    w, h = widths[0], len(rows)
    spawns = [(c, r) for r in range(h) for c in range(w) if rows[r][c] == 'S']
    cores = [(c, r) for r in range(h) for c in range(w) if rows[r][c] == 'C']
    if len(cores) != 1:
        return None, ["コア(C)が %d 個" % len(cores)]
    if not spawns:
        return None, ["出現口(S)が無い"]

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

    ground = [(c, r) for r in range(h) for c in range(w) if rows[r][c] == '#']
    if len(ground) < MIN_GROUND:
        problems.append("置ける地面が少なすぎる %d < %d" % (len(ground), MIN_GROUND))

    paths = [(c, r) for r in range(h) for c in range(w) if rows[r][c] in '.SC']
    cross = 0
    for (gc, gr) in ground:
        angles = []
        for (pc, pr) in paths:
            d = math.hypot(pc - gc, pr - gr)
            if d <= CROSS_R:
                angles.append(math.atan2(pr - gr, pc - gc))
        ok = False
        for i in range(len(angles)):
            for j in range(i + 1, len(angles)):
                da = abs(angles[i] - angles[j]) % (2 * math.pi)
                if da > math.pi:
                    da = 2 * math.pi - da
                if da >= CROSS_ANGLE:
                    ok = True
                    break
            if ok:
                break
        if ok:
            cross += 1
    if cross < MIN_CROSS:
        problems.append("十字砲火を組める地面が少なすぎる %d < %d" % (cross, MIN_CROSS))

    return {"paths": len(dist), "ground": len(ground), "cross": cross, "routeLens": lens}, problems


# ---------------------------------------------------------------
def build_all():
    out = {}

    # st1 訓練場：大きなZ字。斜めの区間があるので、内側の地面から2方向へ射線が通る
    g = blank()
    carve(g, [(2, 1), (11, 1), (11, 4), (7, 8), (2, 8), (2, 12), (11, 12), (11, 16), (7, 16)])
    block(g, 5, 3, 6, 5)
    block(g, 5, 18, 8, 19)
    out['st1'] = finish(g, (7, 17), [(2, 1)])

    # st2 二面作戦：1本の長い蛇行路の両端から来て、中央のコアを挟み撃ちにされる。
    # 脚と脚の間に地面が2列残るので、同じ区間を左右から撃てる
    g = blank()
    carve(g, [(1, 1), (11, 1), (11, 5), (2, 5), (2, 9), (11, 9),
              (11, 13), (2, 13), (2, 17), (11, 17)])
    block(g, 6, 19, 9, 20)
    out['st2'] = finish(g, (6, 9), [(1, 1), (11, 17)])

    # st3 螺旋：外周から中心へ。輪と輪の間に地面が残るので、内外どちらにも撃てる
    g = blank()
    carve(g, [(1, 1), (12, 1), (12, 17), (1, 17), (1, 5), (9, 5), (9, 13), (5, 13), (5, 9), (7, 9)])
    out['st3'] = finish(g, (7, 10), [(1, 1)])

    # st4 広間：中央の島をぐるりと回る。島の上にも外周にも置けるので射線が組みやすい
    g = blank()
    carve(g, [(2, 1), (12, 1), (12, 8), (12, 15), (2, 15), (2, 8), (2, 1)])
    carve(g, [(7, 15), (7, 18)])
    block(g, 6, 6, 9, 9)
    out['st4'] = finish(g, (7, 19), [(2, 1), (12, 1)])

    # st5 三叉：3方向から来て中央で合流。合流点のまわりが全部地面
    g = blank()
    carve(g, [(1, 1), (5, 5), (5, 7), (7, 9)])
    carve(g, [(13, 1), (9, 5), (9, 7), (7, 9)])
    carve(g, [(1, 18), (1, 11), (4, 8), (4, 6), (6, 8), (7, 9)])
    carve(g, [(7, 9), (7, 17)])
    block(g, 11, 14, 13, 18)
    out['st5'] = finish(g, (7, 18), [(1, 1), (13, 1), (1, 18)])

    return out


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
    print("検証（経路長%d以上 / 地面%d以上 / 十字砲火を組める地面%d以上）" % (MIN_ROUTE, MIN_GROUND, MIN_CROSS))
    for sid in ['st1', 'st2', 'st3', 'st4', 'st5']:
        info, problems = inspect(out[sid])
        if problems:
            ok = False
            print("  %-5s NG" % sid)
            for p in problems:
                print("        - %s" % p)
            if info:
                print("        （通路%d 地面%d 交差%d 経路長%s）"
                      % (info["paths"], info["ground"], info["cross"], info["routeLens"]))
        else:
            print("  %-5s OK  通路%3d  地面%3d  交差%3d  経路長%s"
                  % (sid, info["paths"], info["ground"], info["cross"], info["routeLens"]))
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
