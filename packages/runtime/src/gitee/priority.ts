/** Map Gitee priority_human (and English aliases) to sort rank. Lower = higher priority. */
export function priorityRank(priority: string | undefined | null): number {
  const value = (priority ?? "").trim().toLowerCase();
  if (!value) return 50;
  if (/紧急|严重|urgent|critical|p0|blocker/.test(value)) return 0;
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

/** Lowest priority a ticket-pull schedule will hand to CEO. */
export type PullPriority = "severe" | "major" | "none";

export function isUnprioritized(priority: string | undefined | null): boolean {
  const value = (priority ?? "").trim().toLowerCase();
  if (!value) return true;
  return (
    value === "无优先级" ||
    value === "未设置" ||
    value === "none" ||
    value === "unset" ||
    value === "无"
  );
}

/**
 * 严重：只含严重（含紧急）。
 * 主要：严重 + 主要。
 * 无优先级：严重 + 主要 + 未填写优先级。次要、不重要不派发。
 */
export function matchesPullPriority(
  priority: string | undefined | null,
  threshold: PullPriority,
): boolean {
  if (isUnprioritized(priority)) return threshold === "none";
  const rank = priorityRank(priority);
  if (rank === 0) return true;
  if (rank === 10) return threshold === "major" || threshold === "none";
  return false;
}
