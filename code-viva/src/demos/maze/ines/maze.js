export function neighbors(grid, cell) {
  const [row, col] = cell;
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const result = [];
  for (const [dr, dc] of steps) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && c >= 0 && r < grid.length && c < grid[0].length && grid[r][c] === '.') {
      result.push([r, c]);
    }
  }
  return result;
}

export function shortestPath(grid, start, goal) {
  const key = (cell) => cell.join(',');
  const dist = new Map([[key(start), 0]]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const cell = queue[head++];
    if (key(cell) === key(goal)) return dist.get(key(cell));
    for (const next of neighbors(grid, cell)) {
      if (dist.has(key(next))) continue;
      dist.set(key(next), dist.get(key(cell)) + 1);
      queue.push(next);
    }
  }
  return -1;
}
