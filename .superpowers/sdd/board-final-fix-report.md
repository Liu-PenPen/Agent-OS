# Board final fix report

Branch: `feature/task-board-gitee-status`

## Fixes (one pass)

1. **Stage sync on advance** (`PipelineService`)
   - Non-completed `advance` now upserts existing board row `stage` / `botId` / `updatedAt` via `syncBoardStage`.
   - `ensureBoardRunning` refreshes stage/botId/pipelineId when a topic row already exists (no longer no-op).
2. **updateIssueState program check** (`TicketService`)
   - After `getIssueDetail`, rejects when `issue.programId !== project.programId`.

## Tests

```
pnpm --filter @ml-aos/runtime exec vitest run \
  src/services/pipeline-service.test.ts \
  src/services/ticket-service-board.test.ts

✓ ticket-service-board.test.ts (4)
✓ pipeline-service.test.ts (10)
Test Files  2 passed | Tests  14 passed
```

New/adjusted coverage:
- `advance to testing updates board row stage`
- gitee topic reuse: dispatch refreshes `developing`, mid-advance `testing`
- `updateIssueState rejects issue from another program`
