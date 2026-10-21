def subsets(items):
    result = []
    total = 1 << len(items)
    for mask in range(total):
        chosen = [items[i] for i in range(len(items)) if mask & (1 << i)]
        result.append(chosen)
    return result


def solve_queens(n):
    found = []
    used_cols, used_diag, used_anti = set(), set(), set()
    board = []

    def backtrack(row):
        if row == n:
            found.append(board[:])
            return
        for col in range(n):
            if col in used_cols or row - col in used_diag or row + col in used_anti:
                continue
            used_cols.add(col)
            used_diag.add(row - col)
            used_anti.add(row + col)
            board.append(col)
            backtrack(row + 1)
            board.pop()
            used_cols.remove(col)
            used_diag.remove(row - col)
            used_anti.remove(row + col)

    backtrack(0)
    return found
