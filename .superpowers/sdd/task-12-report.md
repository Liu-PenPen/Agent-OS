# Task 12 Report: README + acceptance checklist

**Status:** DONE  
**Date:** 2026-09-20  
**Commit:** `7376b28` — docs: README and phase-1 acceptance notes

---

## Summary

Added root `README.md` (install, `pnpm dev:runtime` / `pnpm dev:ui`, Tauri/MSVC notes, data dir, no agent-os coupling, mock vs Claude engines, links to spec/plan). Fixed Task 11 Important: `apps/desktop/src/lib/api.ts` parses `{ error: string }` on non-OK responses so UI shows clean 503 text. Ran unit tests + HTTP smoke against a live runtime; verified `agent-os` git status clean.

---

## Files

| Path | Change |
|------|--------|
| `README.md` | Root product README |
| `apps/desktop/src/lib/api.ts` | Parse JSON `{ error }` on HTTP errors |
| `.superpowers/sdd/task-12-report.md` | This report + acceptance table |
| `.superpowers/sdd/progress.md` | Task 12 ledger |

---

## Acceptance checklist (spec §7)

| # | Check | Pass? | Evidence |
|---|--------|-------|----------|
| 1 | Window title / top bar ML AOS | **PASS** (code) | `index.html` `<title>ML AOS</title>`; `TopBar` brand; `tauri.conf.json` `productName`/`title`. Full `tauri dev` E2E still blocked without MSVC `link.exe` — browser UI title verified via source. |
| 2 | Configure bot + @ in topic (mock OK) | **PASS** | Smoke: create mock bot → topic message with `mentionBotId` → 2 messages (user + bot). Unit: `chat-service` mention tests. |
| 3 | Workspace localPath visible | **PASS** | Smoke: workspace create returns `localPath`. UI: `RightPanel` shows `workspace?.localPath`. |
| 4 | gitUrl + clone (or skip documented) | **PASS** | Smoke: workspace has `gitUrl`. Clone: `git-service` integration test passed; README + `packages/runtime/README.md` document Git-on-PATH / skip. |
| 5 | Dispatch shows pipeline stages | **PASS** | Smoke: dispatch → `developing`; advance → `testing`. |
| 6 | Clarification answer writes back | **PASS** | Smoke: `[clarify]` prompt → answer → `status=answered`; topic messages increased. Unit: clarification-service tests. |
| 7 | Theme dark/light/system persists | **PASS** | Smoke: PATCH theme `light` → GET still `light`. Unit: `theme.test.ts`. UI settings page wires `api.setTheme`. |
| 8 | agent-os git status clean / untouched | **PASS** | `git -C E:\Python_Project\agent-os status --short` → empty. |

---

## Tests

```bash
pnpm --filter @ml-aos/runtime test   # 24/24 PASS
pnpm --filter @ml-aos/desktop test   # 2/2 PASS
pnpm --filter @ml-aos/desktop build  # PASS
```

Smoke (runtime on `:17890`, temp `ML_AOS_DATA_DIR`): health, theme PATCH/GET, bot/@ mock chat, dispatch/advance, `[clarify]` answer, Claude missing → `503 {"error":"..."}`.

---

## Concerns / defer

- Native Tauri window acceptance (#1) not run end-to-end on this machine (MSVC linker). Browser/Vite title + source config used as proxy.
- No automated HTTP IT suite; smoke was manual script this session.
- Untracked historical `.superpowers/sdd/*-brief.md` / review pkgs from earlier tasks left uncommitted (out of this commit scope).

---

## Next

Phase 1 SDD plan complete for Tasks 1–12.
