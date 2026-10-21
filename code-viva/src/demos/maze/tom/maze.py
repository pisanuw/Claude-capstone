def neighbors(grid, cell):
    a, b = cell
    out = []
    for x, y in [(a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)]:
        if x >= 0 and y >= 0 and x < len(grid) and y < len(grid[0]):
            if grid[x][y] == ".":
                out.append((x, y))
    return out


def shortest_path(grid, start, goal):
    q = [(start, 0)]
    vis = []
    while q:
        cur, d = q.pop(0)
        if cur == goal:
            return d
        if cur in vis:
            continue
        vis.append(cur)
        for nb in neighbors(grid, cur):
            q.append((nb, d + 1))
    return -1
