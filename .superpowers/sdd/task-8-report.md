# Task 8 Report: Wire Home chat end-to-end (Mock)

**Status:** DONE  
**Date:** 2026-09-20  
**Commit:** (see git log after commit)

---

## Summary

Wired Home chat against the mock runtime: Sidebar topics from API, MessageList + Composer with `@` bot picker, WebSocket live `message.upsert` / `pipeline.update`, inline ClarificationCard + queue badge, RightPanel live `localPath` / `gitUrl` / pipeline stages / pending count, and Dispatch. Added `POST /api/topics/:id/abort` on the runtime (AbortController per topic run).

---

## Files created / modified

| Path | Purpose |
|------|---------|
| `apps/desktop/src/components/chat/MessageList.tsx` | Live message timeline |
| `apps/desktop/src/components/chat/Composer.tsx` | @ picker, Send / Abort / Dispatch |
| `apps/desktop/src/components/chat/ClarificationCard.tsx` | Inline HITL answer card |
| `apps/desktop/src/lib/shell-context.tsx` | Shared shell state + WS |
| `apps/desktop/src/pages/HomePage.tsx` | Live topic chat surface |
| `apps/desktop/src/components/shell/Sidebar.tsx` | Topics from API + workspace switch |
| `apps/desktop/src/components/shell/RightPanel.tsx` | Live context / pipeline / pending |
| `apps/desktop/src/components/shell/AppLayout.tsx` | ShellProvider wrap |
| `apps/desktop/src/lib/api.ts` | topics / messages / abort / dispatch |
| `apps/desktop/src/styles/shell.css` | Mention / clarification / topic active |
| `packages/runtime/src/services/chat-service.ts` | AbortController + abort() |
| `packages/runtime/src/routes/topics.ts` | `POST /api/topics/:id/abort` |
| `packages/runtime/src/services/chat-service.test.ts` | Abort idle case |

---

## Verification

```bash
pnpm --filter @ml-aos/runtime test   # PASS (18)
pnpm --filter @ml-aos/desktop test   # PASS (2)
pnpm --filter @ml-aos/desktop build  # PASS
# API smoke on :17890:
# POST message → mock stream; [clarify] → pending; dispatch → developing;
# POST /api/topics/:id/abort → { ok: true, aborted: false|true }
```

---

## Self-review

| Check | Result |
|-------|--------|
| Only touched `E:\Python_Project\ml-aos` | ✓ |
| Sidebar topics from API | ✓ |
| @bot send + mock stream via WS | ✓ |
| Clarification card + queue count | ✓ |
| Right panel localPath/gitUrl/pipeline/pending | ✓ |
| Abort endpoint present | ✓ |

**Notes:**

- Abort marks `aborted: true` only while a bot run is in flight; idle topics return `aborted: false`.
- Pipeline auto-advance (5s) updates the right panel via `pipeline.update` + refetch.

---

## Next task

Task 9 — Tauri sidecar lifecycle.
