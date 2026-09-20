# Task 6 Report: Desktop UI shell + theme

**Status:** DONE  
**Date:** 2026-09-20  
**Commit:** `bad48d7` — feat: desktop shell layout and theme tokens

---

## Summary

Scaffolded `apps/desktop` as Vite React-TS + Tauri 2 (`productName` / window title **ML AOS**). Added design-token CSS (dark/light), `applyTheme`, REST client, three-pane Home shell (TopBar / Sidebar / RightPanel / AppLayout), and Vitest coverage for `applyTheme("light")`. Runtime gained minimal GET/PATCH `/api/settings` (+ CORS) so theme can persist.

---

## Files created / modified

| Path | Purpose |
|------|---------|
| `apps/desktop/**` | Vite React UI + Tauri 2 (`src-tauri`) |
| `apps/desktop/src/styles/tokens.css` | Dark/light CSS variables from design system |
| `apps/desktop/src/styles/shell.css` | Three-pane chrome layout |
| `apps/desktop/src/lib/theme.ts` | `applyTheme` + system `prefers-color-scheme` |
| `apps/desktop/src/lib/theme.test.ts` | jsdom unit test |
| `apps/desktop/src/lib/api.ts` | REST base `http://127.0.0.1:17890` |
| `apps/desktop/src/lib/ws.ts` | Minimal WS helper |
| `apps/desktop/src/components/shell/*` | TopBar, Sidebar, RightPanel, AppLayout |
| `apps/desktop/src/pages/HomePage.tsx` | Center timeline + composer (mock data) |
| `packages/runtime/src/services/settings-service.ts` | Load/patch AppSettings |
| `packages/runtime/src/routes/settings.ts` | GET/PATCH `/api/settings` |
| `packages/runtime/src/http/json.ts` | CORS headers for browser Vite |
| `packages/runtime/src/index.ts` | Wire settings + OPTIONS |

---

## Verification

```bash
pnpm --filter @ml-aos/desktop test   # applyTheme light/dark — PASS
pnpm --filter @ml-aos/desktop build  # tsc + vite build — PASS
pnpm --filter @ml-aos/desktop dev    # http://localhost:1420 — ML AOS chrome
pnpm --filter @ml-aos/runtime test   # includes settings service — PASS
```

---

## Self-review

| Check | Result |
|-------|--------|
| Only touched `E:\Python_Project\ml-aos` | ✓ |
| Window/product title ML AOS | ✓ |
| `applyTheme("light")` → `data-theme=light` | ✓ |
| TopBar theme toggle → PATCH `/api/settings` | ✓ |
| `pnpm --filter @ml-aos/desktop dev` works without Tauri | ✓ |
| Rust available; `tauri.conf.json` ready for `tauri dev` | ✓ |

**Notes:**

- Home content uses static mock topics/messages; live REST/WS wiring is later.
- Vite 8 + Vitest 3: separate `vitest.config.ts` to avoid Vite 6/8 plugin type clash in `tsc -b`.

---

## Next task

Task 7 (per plan) — wire live topics/chat/pipeline into the shell.
