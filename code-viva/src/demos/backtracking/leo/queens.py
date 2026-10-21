def solve_queens(n):
    res = []
    b = [-1] * n

    def go(r):
        if r == n:
            res.append(b[:])
            return
        for c in range(n):
            ok = True
            for r2 in range(r):
                if b[r2] == c or abs(b[r2] - c) == r - r2:
                    ok = False
                    break
            if ok:
                b[r] = c
                go(r + 1)
                b[r] = -1

    go(0)
    return res


def subsets(items):
    out = [[]]
    for x in items:
        tmp2 = []
        for s in out:
            tmp2.append(s + [x])
        out = out + tmp2
    return out
