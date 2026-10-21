def solve_queens(n):
    solutions = []
    cols = []

    def place(row):
        if row == n:
            solutions.append(list(cols))
            return
        for col in range(n):
            if is_safe(cols, row, col):
                cols.append(col)
                place(row + 1)
                cols.pop()

    place(0)
    return solutions


def is_safe(cols, row, col):
    for prev_row, prev_col in enumerate(cols):
        if prev_col == col:
            return False
        if abs(prev_col - col) == row - prev_row:
            return False
    return True


def subsets(items):
    if not items:
        return [[]]
    first, rest = items[0], items[1:]
    without_first = subsets(rest)
    with_first = [[first] + s for s in without_first]
    return without_first + with_first
