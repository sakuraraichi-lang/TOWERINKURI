# -*- coding: utf-8 -*-
"""30章ぶんのマップを作る。

    python tools/gen30.py            検証だけ
    python tools/gen30.py --write    src/stages.js の STAGES を丸ごと差し替える

設計書 §8 の「型 ＋ 乱数 ＋ 検証」をそのまま実装したもの。

    型    章ごとに固定（幕で決まる。一本道 / 分岐 / 螺旋・島 / 三叉 / 広間 / 混成）
    乱数  折れ点・障害物・出現口の位置。**種は章番号なので、何周目でも同じマップ**
    検証  genmaps.py の inspect をそのまま使う（経路長・地面数・十字砲火）

種を章番号から決めているのは、自動設置（前回と同じ配置を復元する）を
作れるようにするため。毎回違うマップだと復元する先が無い。
"""
import io, os, random, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from genmaps import W, H, blank, carve, block, finish, inspect, STAGES_JS

# 幕 → 型
def kata(ch):
    if ch <= 4:  return 'line'      # I   一本道・折れ線
    if ch <= 8:  return 'fork'      # II  分岐2本
    if ch <= 14: return 'spiral'    # III 螺旋・島
    if ch <= 20: return 'trident'   # IV  三叉・長距離
    if ch <= 27: return 'hall'      # V   広間・迂回
    return 'mixed'                  # VI  混成

ACT = {'line':'I 導入','fork':'II 最初の壁','spiral':'III 恒久層',
       'trident':'IV 自動化','hall':'V 特化','mixed':'VI 決着'}

def gen(ch, seed):
    """章 ch のマップを1枚作る。seed を変えると別の形になる"""
    rnd = random.Random(ch * 1000 + seed)
    g = blank()
    k = kata(ch)
    R = lambda a, b: rnd.randint(a, b)

    if k == 'line':
        # 大きなZ字。折り返しの内側に置くと、行きと帰りの両方へ射線が通る
        x0, x1 = R(1, 2), R(11, 12)
        y = [R(1, 2), R(6, 8), R(11, 13), R(16, 18)]
        carve(g, [(x0, y[0]), (x1, y[0]), (x1, y[1]), (x0, y[1]),
                  (x0, y[2]), (x1, y[2]), (x1, y[3])])
        bx = R(4, 7)
        block(g, bx, y[0] + 2, bx + 1, y[1] - 2)
        return finish(g, (x1, y[3]), [(x0, y[0])])

    if k == 'fork':
        # 両端から来て中央で挟み撃ち。脚と脚の間に地面が残る
        yl = [R(1, 2), R(5, 6), R(9, 10), R(13, 14), R(17, 18)]
        carve(g, [(1, yl[0]), (11, yl[0]), (11, yl[1]), (2, yl[1]),
                  (2, yl[2]), (11, yl[2]), (11, yl[3]), (2, yl[3]),
                  (2, yl[4]), (11, yl[4])])
        cx = R(5, 8)
        return finish(g, (cx, yl[2]), [(1, yl[0]), (11, yl[4])])

    if k == 'spiral':
        # 外周から中心へ。輪と輪の間に地面が残るので内外どちらにも撃てる
        a, b = R(1, 2), R(11, 12)
        c, d = a + R(3, 4), b - R(3, 4)
        e, f = c + R(3, 4), d - R(2, 3)
        carve(g, [(a, 1), (b, 1), (b, 17), (a, 17), (a, 5),
                  (c + 5, 5), (c + 5, 13), (c + 1, 13), (c + 1, 9), (e + 2, 9)])
        del d, f
        return finish(g, (e + 2, 10), [(a, 1)])

    if k == 'trident':
        # 3方向から来て中央で合流。合流点のまわりが全部地面
        mx, my = R(6, 8), R(8, 10)
        # carve は縦・横・斜め45度しか彫れないので、必ず中継点を置く
        carve(g, [(1, 1), (5, 5), (5, my), (mx, my)])
        carve(g, [(13, 1), (9, 5), (9, my), (mx, my)])
        carve(g, [(1, 18), (1, my + 2), (3, my + 2), (3, my), (mx, my)])
        carve(g, [(mx, my), (mx, 17)])
        block(g, 11, 14, 13, 18)
        return finish(g, (mx, 18), [(1, 1), (13, 1), (1, 18)])

    if k == 'hall':
        # 中央の島をぐるりと回る。島の上にも外周にも置ける
        l, r = R(1, 2), R(11, 12)
        t, bo = R(1, 2), R(14, 16)
        carve(g, [(l, t), (r, t), (r, bo), (l, bo), (l, t)])
        carve(g, [((l + r) // 2, bo), ((l + r) // 2, 18)])
        iw = R(3, 4)
        block(g, 6, 6, 6 + iw, 6 + iw)
        return finish(g, ((l + r) // 2, 19), [(l, t), (r, t)])

    # mixed（VI 決着）：三叉に島と迂回を足す
    mx, my = 7, R(9, 11)
    carve(g, [(1, 1), (5, 5), (5, my), (mx, my)])
    carve(g, [(13, 1), (9, 5), (9, my), (mx, my)])
    carve(g, [(1, 18), (1, my + 2), (3, my + 2), (3, my), (mx, my)])
    carve(g, [(mx, my), (mx, 17)])
    block(g, 6, 6, 8, 7)
    return finish(g, (mx, 18), [(1, 1), (13, 1), (1, 18)])


def build_30():
    out, report = [], []
    for ch in range(1, 31):
        rows, info, prob, used = None, None, ['未生成'], -1
        for seed in range(400):          # 検証を通る種を探す
            r = gen(ch, seed)
            i, p = inspect(r)
            if not p:
                rows, info, prob, used = r, i, [], seed
                break
        if rows is None:                  # どうしても通らないときは最後のものを返す
            rows = gen(ch, 0)
            info, prob = inspect(rows)
        out.append(rows)
        report.append((ch, kata(ch), used, info, prob))
    return out, report


# 章の報酬。**設計書 §4-3 の武器解放の割付をそのまま入れる。**
#   新しい武器は平均3章に1つ。それより速いと、使い切る前に次が来る
CH_WEAPON = {2: 'wc_sniper', 5: 'wc_missile', 8: 'wc_tesla', 11: 'wc_flame',
             14: 'wc_gas', 17: 'wc_cryo', 20: 'wc_mortar'}


def js_stage(ch, rows):
    body = "\n".join("      '%s'," % r for r in rows)
    rw = []
    if ch in CH_WEAPON:
        rw.append("cards: ['%s']" % CH_WEAPON[ch])
    # パックは3章ごとに1個。まだ解放していないものは
    # Game.addPack が弾いてコインへ振り替えるので、ここでは一律に置いてよい
    if ch % 3 == 0:
        rw.append("packs: { basic: 1 }")
    reward = ("{ %s }" % ", ".join(rw)) if rw else "{}"
    return ("  {\n"
            "    id: 'ch%d', name: '第%d章', act: '%s',\n"
            "    reward: %s,\n"
            "    map: [\n%s\n    ],\n"
            "  },") % (ch, ch, ACT[kata(ch)], reward, body)



def write_back(maps):
    path = os.path.normpath(STAGES_JS)
    s = io.open(path, encoding="utf-8").read()
    body = "\n".join(js_stage(ch + 1, m) for ch, m in enumerate(maps))
    pat = re.compile(r"(const STAGES = \[\n).*?(\n\];)", re.S)
    s2, n = pat.subn(lambda m: m.group(1) + body + m.group(2), s, count=1)
    if n != 1:
        raise SystemExit("src/stages.js の STAGES = [ ... ] が見つからない")
    io.open(path, "w", encoding="utf-8", newline="\n").write(s2)
    print("src/stages.js の STAGES を30章に差し替えた")


def main():
    maps, report = build_30()
    ng = 0
    print("章  型        種   通路 地面 交差 経路長")
    for ch, k, seed, info, prob in report:
        if prob:
            ng += 1
            print("%2d  %-8s  --   NG: %s" % (ch, k, ' / '.join(prob)))
        else:
            print("%2d  %-8s  %3d  %4d %4d %4d  %s"
                  % (ch, k, seed, info["paths"], info["ground"], info["cross"], info["routeLens"]))
    print()
    if ng:
        print("RESULT: *** %d 章が検証を通らない ***" % ng)
        return 1
    print("RESULT: 30章すべて OK")
    if '--write' in sys.argv:
        write_back(maps)
    else:
        print("（--write を付けると src/stages.js に書き戻す）")
    return 0


if __name__ == '__main__':
    sys.exit(main())
