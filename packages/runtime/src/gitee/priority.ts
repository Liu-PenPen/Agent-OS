/** Map Gitee priority_human (and English aliases) to sort rank. Lower = higher priority. */
export function priorityRank(priority: string | undefined | null): number {
  const value = (priority ?? "").trim().toLowerCase();
  if (!value) return 50;
  if (/紧急|urgent|critical|p0|blocker/.test(value)) return 0;
  if (/高|high|主要|major|p1/.test(value)) return 10;
  if (/中|medium|次要|minor|normal|p2/.test(value)) return 20;
  if (/低|low|不重要|trivial|p3/.test(value)) return 30;
  return 40;
}

export function comparePriorityThenIdent(
  a: { priority?: string; ident: string },
  b: { priority?: string; ident: string },
): number {
  const rank = priorityRank(a.priority) - priorityRank(b.priority);
  if (rank !== 0) return rank;
  return a.ident.localeCompare(b.ident, "zh-CN");
}
