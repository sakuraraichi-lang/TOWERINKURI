# -*- coding: utf-8 -*-
"""実験用ステージの生成。既存5マップには触らない。

    python tools/genexp.py

参考画像のような「開けた場に島が点在する」構造を作る。
既存マップ（幅2タイルの通路）とは別物で、比較のために並べて置く。

  ex1  15x21   標準の広さ。既存マップと同じ画面に収まる
  ex2  30x42   広大。カメラで一部を切り取って見る
"""
import math
from collections import deque


def make(W, H, islands, spawn_rows, core_xy):
    g = [['.'] * W for _ in range(H)]
    # 外周は配置可能な壁
    for x in range(W):
        g[0][x] = '#'; g[H - 1][x] = '#'
    for y in range(H):
        g[y][0] = '#'; g[y][W - 1] = '#'
    for (cx, cy, rx, ry) in islands:
        for y in range(H):
            for x in range(W):
                dx, dy = (x - cx) / rx, (y - cy) / ry
                if dx * dx + dy * dy <= 1:
                    g[y][x] = '#'
    # コアの周りは通れるように空ける
    ccx, ccy = core_xy
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            x, y = ccx + dx, ccy + dy
            if 0 < x < W - 1 and 0 < y < H - 1:
                g[y][x] = '.'
    # 出現口
    for (sx, sy) in spawn_rows:
        g[sy][sx] = 'S'
    g[ccy][ccx] = 'C'
    return [''.join(r) for r in g]


def inspect(rows):
    W, H = len(rows[0]), len(rows)
    walk = lambda c, r: 0 <= c < W and 0 <= r < H and rows[r][c] in '.SC'
    cores = [(c, r) for r in range(H) for c in range(W) if rows[r][c] == 'C']
    spawns = [(c, r) for r in range(H) for c in range(W) if rows[r][c] == 'S']
    dist = {cores[0]: 0}
    q = deque([cores[0]])
    while q:
        c, r = q.popleft()
        for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (c + dc, r + dr)
            if walk(*n) and n not in dist:
                dist[n] = dist[(c, r)] + 1
                q.append(n)
    ground = sum(1 for r in range(H) for c in range(W) if rows[r][c] == '#')
    path = sum(1 for r in range(H) for c in range(W) if rows[r][c] in '.SC')
    lens = [dist.get(s) for s in spawns]
    return {
        'サイズ': '%dx%d' % (W, H),
        '通れる': path, '置ける壁': ground,
        '通れる割合': '%d%%' % round(100 * path / (W * H)),
        '経路長': lens,
        '到達できない出現口': [s for s in spawns if s not in dist],
    }


def show(name, rows):
    info = inspect(rows)
    print('--- %s ---' % name)
    for k, v in info.items():
        print('   %s: %s' % (k, v))
    print('    map: [')
    for r in rows:
        print("      '%s'," % r)
    print('    ],')
    print()


# ex1 : 15x21。開けた場に島。出現口3・コアは下
ex1 = make(15, 21,
           islands=[(3.5, 5, 2.2, 2.0), (11, 4.5, 2.0, 2.2),
                    (7, 9.5, 2.8, 1.6), (2.5, 13, 1.8, 2.0),
                    (12, 13, 1.8, 1.8), (7, 16.5, 2.4, 1.4)],
           spawn_rows=[(2, 1), (7, 1), (12, 1)],
           core_xy=(7, 18))

# ex2 : 30x42。広大。カメラで見る
ex2 = make(30, 42,
           islands=[(7, 9, 4.2, 3.6), (22, 8, 3.8, 4.0),
                    (14, 18, 5.0, 2.8), (4, 25, 3.2, 3.4),
                    (25, 26, 3.4, 3.0), (14, 32, 4.4, 2.4),
                    (6, 36, 2.6, 2.6), (23, 36, 2.6, 2.4),
                    (18, 13, 2.2, 2.2), (10, 29, 2.2, 2.0)],
           spawn_rows=[(4, 1), (15, 1), (26, 1)],
           core_xy=(15, 38))

show('ex1  開けた場（標準）', ex1)
show('ex2  開けた場（広大）', ex2)
