def edit_distance(a, b):
    rows, cols = len(a) + 1, len(b) + 1
    dist = [[0] * cols for _ in range(rows)]
    for i in range(rows):
        dist[i][0] = i
    for j in range(cols):
        dist[0][j] = j
    for i in range(1, rows):
        for j in range(1, cols):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dist[i][j] = min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + cost)
    return dist[rows - 1][cols - 1]


def lcs(a, b):
    if not a or not b:
        return ""
    if a[-1] == b[-1]:
        return lcs(a[:-1], b[:-1]) + a[-1]
    left = lcs(a[:-1], b)
    right = lcs(a, b[:-1])
    return left if len(left) >= len(right) else right
