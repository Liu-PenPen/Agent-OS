# Task 4 Report: Topics, messages, Mock CLI streaming

**Status:** DONE  
**Date:** 2026-09-20  
**Commit:** `6dad0ad` — feat: topics chat with mock CLI streaming

---

## Summary

Added `CliAdapter` / `MockCliAdapter` with ~20ms text deltas, `ChatService` for topics and messages with mock bot replies when `mentionBotId` is set, REST routes under `/api/topics`, and WebSocket `/ws` broadcasting `message.upsert` and `pipeline.update`. TDD: failing tests → implement → green.

---

## Files created / modified

| Path | Purpose |
|------|---------|
| `packages/runtime/src/cli/types.ts` | `CliAdapter`, `CliEvent`, `CliRunInput` |
| `packages/runtime/src/cli/mock-adapter.ts` | Mock streaming adapter |
| `packages/runtime/src/cli/mock-adapter.test.ts` | Streams text containing "Mock" |
| `packages/runtime/src/services/chat-service.ts` | Topic/message CRUD + mock bot reply |
| `packages/runtime/src/services/chat-service.test.ts` | Topic list, user-only, bot reply, bot validation |
| `packages/runtime/src/routes/topics.ts` | REST handlers |
| `packages/runtime/src/ws.ts` | WebSocket `/ws` + broadcast |
| `packages/runtime/src/index.ts` | Wire chat service, routes, WS |
| `packages/runtime/package.json` | Add `ws`, `@types/ws` |

---

## REST endpoints

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/api/topics?workspaceId=` | List topics (optional filter) |
| POST | `/api/topics` | Create topic `{ workspaceId, title? }` |
| GET | `/api/topics/:id/messages` | List messages for topic |
| POST | `/api/topics/:id/messages` | Send `{ content, mentionBotId? }`; bot reply when mentioned |

---

## WebSocket events

| Event | Payload |
|-------|---------|
| `message.upsert` | `{ type, message: ChatMessage }` |
| `pipeline.update` | `{ type, topicId, pipelineStage }` |

Connect: `ws://127.0.0.1:17890/ws`

---

## TDD evidence

### RED

```text
pnpm --filter @ml-aos/runtime exec vitest run src/cli/mock-adapter.test.ts src/services/chat-service.test.ts
```

**Result:** FAIL — modules missing

### GREEN

```text
pnpm test
```

**Result:** PASS — 10 runtime + 1 shared = 11 tests

---

## Self-review

| Check | Result |
|-------|--------|
| Only touched `E:\Python_Project\ml-aos` | ✓ |
| No edits under `agent-os/**` | ✓ |
| MockCliAdapter streams "Mock" with ~20ms deltas | ✓ |
| mentionBotId required for bot reply | ✓ |
| WS broadcast on message.upsert | ✓ |
| pipeline.update on topic create | ✓ |
| Root `pnpm test` green | ✓ |

**Notes:**

- Bot message content updates incrementally during mock stream (multiple upserts).
- `[clarify]` clarification events deferred to Task 5.
- No HTTP/WS integration tests yet; covered via service + adapter unit tests.

---

## Verification commands

```bash
cd E:/Python_Project/ml-aos
pnpm test
pnpm --filter @ml-aos/runtime dev
curl http://127.0.0.1:17890/api/topics?workspaceId=<id>
curl -X POST http://127.0.0.1:17890/api/topics -H "Content-Type: application/json" -d "{\"workspaceId\":\"<id>\",\"title\":\"chat\"}"
curl -X POST http://127.0.0.1:17890/api/topics/<topicId>/messages -H "Content-Type: application/json" -d "{\"content\":\"hi\",\"mentionBotId\":\"<botId>\"}"
```

---

## Next task

Task 5: Collaboration pipeline + clarification HITL.
