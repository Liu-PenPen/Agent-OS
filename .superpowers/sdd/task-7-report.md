# Task 7 Report: UI pages — Workspace, Bots, Settings, Queue, Pipeline

**Status:** DONE  
**Date:** 2026-09-20  
**Commit:** (see git log after commit)

---

## Summary

Added react-router pages for workspace form, bot CRUD, app settings (theme segmented control), clarification queue + answer, and pipeline detail. Extended desktop `api` client; stubbed Tauri `pick_folder` with `window.prompt` fallback. Right panel Pipeline / Needs you navigate to detail/queue. Added `GET /api/pipelines/:id` so the detail page can load.

---

## Files created / modified

| Path | Purpose |
|------|---------|
| `apps/desktop/src/pages/WorkspaceFormPage.tsx` | name / localPath browse / gitUrl / save / clone |
| `apps/desktop/src/pages/BotSettingsPage.tsx` | bot list + editor CRUD |
| `apps/desktop/src/pages/AppSettingsPage.tsx` | theme segmented dark/light/system + settings |
| `apps/desktop/src/pages/ClarificationQueuePage.tsx` | pending queue + answer options |
| `apps/desktop/src/pages/PipelineDetailPage.tsx` | stages + advance |
| `apps/desktop/src/App.tsx` | BrowserRouter routes |
| `apps/desktop/src/lib/api.ts` | workspaces/bots/clarifications/pipelines client |
| `apps/desktop/src/lib/tauri.ts` | pickFolder invoke stub + prompt |
| `apps/desktop/src/lib/app-context.ts` | theme outlet context type |
| `apps/desktop/src/styles/pages.css` | form / queue / pipeline page styles |
| `apps/desktop/src/components/shell/*` | nav links + pipeline/queue clicks |
| `packages/runtime/src/routes/pipelines.ts` | `GET /api/pipelines/:id` |

---

## Routes

- `/` Home  
- `/workspaces/new`, `/workspaces/:id`  
- `/bots`  
- `/settings`  
- `/queue`  
- `/pipelines/:id`

---

## Verification

```bash
pnpm --filter @ml-aos/desktop test   # PASS (theme)
pnpm --filter @ml-aos/desktop build  # PASS
pnpm --filter @ml-aos/runtime test   # PASS
# API smoke (runtime on :17890): POST workspace 201, POST bot 201, GET settings 200
# GET /api/pipelines/demo → 404 until a real task is dispatched
```

---

## Self-review

| Check | Result |
|-------|--------|
| Only touched `E:\Python_Project\ml-aos` | ✓ |
| Theme segmented control dark/light/system | ✓ |
| Browse uses prompt when Tauri command missing | ✓ |
| Clone → `POST /api/workspaces/:id/clone` | ✓ |
| Right panel opens pipeline / queue | ✓ |

**Notes:**

- Real `pick_folder` lands in Task 9; current stub invoke + prompt is intentional.
- Right panel still uses placeholder pipeline id `demo` until Task 8 wires live `pipelineTaskId`.

---

## Next task

Task 8 — wire Home chat end-to-end (Mock).
