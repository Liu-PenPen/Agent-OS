# Task 5 Report: Collaboration pipeline + clarification

**Status:** DONE  
**Date:** 2026-09-20  
**Commit:** (see git log after commit)

---

## Summary

Added `PipelineService` (dispatch + stage advance with optional 5s mock auto-advance), `ClarificationService` (list pending, answer with system message), REST routes, `MockCliAdapter` `[clarify]` → clarification event with 2 options, and `ChatService` persistence of clarification messages. TDD: RED → GREEN, 16 runtime + 1 shared tests pass.

---

## Files created / modified

| Path | Purpose |
|------|---------|
| `packages/runtime/src/services/pipeline-service.ts` | Dispatch pipeline, advance stages |
| `packages/runtime/src/services/pipeline-service.test.ts` | developing stage + advance chain |
| `packages/runtime/src/services/clarification-service.ts` | List/answer clarifications |
| `packages/runtime/src/services/clarification-service.test.ts` | pending → answered |
| `packages/runtime/src/routes/pipelines.ts` | dispatch + advance REST |
| `packages/runtime/src/routes/clarifications.ts` | list + answer REST |
| `packages/runtime/src/cli/mock-adapter.ts` | `[clarify]` emits clarification |
| `packages/runtime/src/cli/mock-adapter.test.ts` | clarify event test |
| `packages/runtime/src/services/chat-service.ts` | persist clarification messages |
| `packages/runtime/src/services/chat-service.test.ts` | clarification persistence |
| `packages/runtime/src/index.ts` | wire services + routes |

---

## REST endpoints

| Method | Path | Behavior |
|--------|------|----------|
| POST | `/api/topics/:id/dispatch` | `{ title, assigneeBotIds? }` → PipelineTask @ developing |
| POST | `/api/pipelines/:id/advance` | Advance stage (test helper) |
| GET | `/api/clarifications?status=pending` | List pending clarification messages |
| POST | `/api/clarifications/:id/answer` | `{ optionId }` → answered + system message |

---

## TDD evidence

### RED

Missing modules + clarify tests failed.

### GREEN

```bash
pnpm test
```

**Result:** PASS — 16 runtime + 1 shared = 17 tests

---

## Self-review

| Check | Result |
|-------|--------|
| Only touched `E:\Python_Project\ml-aos` | ✓ |
| Pipeline dispatch sets stage developing | ✓ |
| Advance chain developing→testing→reviewing→completed | ✓ |
| Mock `[clarify]` emits 2 options | ✓ |
| ChatService persists clarification kind | ✓ |
| Answer appends system message | ✓ |
| Mock auto-advance 5s in runtime | ✓ |

**Notes:**

- No HTTP integration tests yet (consistent with Task 4 defer).
- Clarification answer uses clarification.id (not message.id) in URL.

---

## Next task

Task 6: Desktop UI shell + theme.
