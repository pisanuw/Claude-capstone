const memo: Record<string, number> = {};

export function editDistance(a: string, b: string): number {
  const k = a + '|' + b;
  if (memo[k] !== undefined) return memo[k];
  let r: number;
  if (!a.length) r = b.length;
  else if (!b.length) r = a.length;
  else if (a[0] === b[0]) r = editDistance(a.slice(1), b.slice(1));
  else r = 1 + Math.min(editDistance(a.slice(1), b), editDistance(a, b.slice(1)), editDistance(a.slice(1), b.slice(1)));
  memo[k] = r;
  return r;
}

export function lcs(a: string, b: string): string {
  const dp: string[][] = [];
  for (let i = 0; i <= a.length; i++) {
    dp.push([]);
    for (let j = 0; j <= b.length; j++) {
      if (i == 0 || j == 0) dp[i].push('');
      else if (a[i - 1] == b[j - 1]) dp[i].push(dp[i - 1][j - 1] + a[i - 1]);
      else dp[i].push(dp[i - 1][j].length > dp[i][j - 1].length ? dp[i - 1][j] : dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}
