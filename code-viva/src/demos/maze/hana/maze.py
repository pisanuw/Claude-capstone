from collections import deque

MOVES = [(1, 0), (-1, 0), (0, 1), (0, -1)]


def neighbors(grid, cell):
    row, col = cell
    result = []
    for d_row, d_col in MOVES:
        r, c = row + d_row, col + d_col
        if 0 <= r < len(grid) and 0 <= c < len(grid[0]) and grid[r][c] == ".":
            result.append((r, c))
    return result


def shortest_path(grid, start, goal):
    if start == goal:
        return 0
    frontier = deque([start])
    distance = {start: 0}
    while frontier:
        cell = frontier.popleft()
        for nxt in neighbors(grid, cell):
            if nxt in distance:
                continue
            distance[nxt] = distance[cell] + 1
            if nxt == goal:
                return distance[nxt]
            frontier.append(nxt)
    return -1
