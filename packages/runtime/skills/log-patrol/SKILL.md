---
name: log-patrol
description: 只读增量日志巡检；有 warning/critical 才通知，正常则静默。
---

# Log Patrol（ML AOS）

收到日志巡检任务时严格执行：

1. **只读**增量日志，不做无关改动。
2. 分级处置：info/debug 可忽略摘要；warning / critical 需明确条目。
3. 有 warning/critical 才推送运维通知；critical 需标明 @开发工程师。
4. 一切正常则**静默**（不要刷「巡检通过」到主会话，除非任务要求）。

缺少日志路径或权限时说明阻塞原因后结束。
