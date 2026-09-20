# Task 9 Report: Tauri sidecar lifecycle

**Status:** DONE  
**Date:** 2026-09-20  
**Commit:** `3520804` — feat: tauri spawns runtime sidecar and folder picker

---

## Summary

Tauri now probes `http://127.0.0.1:17890/health` on startup and, if needed, spawns the Node runtime without a shell. Default spawn is **node + tsx** (`packages/runtime/src/index.ts`) because `dist/` is not built yet; when `dist/index.js` exists it prefers **node + dist**. On exit, only a process tree Tauri started is killed (`taskkill /PID … /T /F` on Windows). Added `pick_folder` command (via `rfd`) and wired desktop `tauri.ts` to invoke it (browser still falls back to `prompt`).

---

## Files created / modified

| Path | Purpose |
|------|---------|
| `apps/desktop/src-tauri/src/sidecar.rs` | Health probe, spawn, process-tree kill |
| `apps/desktop/src-tauri/src/commands.rs` | `pick_folder` → `Option<String>` |
| `apps/desktop/src-tauri/src/lib.rs` | Setup spawn + Exit kill + invoke handler |
| `apps/desktop/src-tauri/permissions/pick-folder.toml` | ACL for `pick_folder` |
| `apps/desktop/src-tauri/capabilities/default.json` | Allow `allow-pick-folder` |
| `apps/desktop/src-tauri/sidecars/README.md` | Spawn resolution + bundle note |
| `apps/desktop/src-tauri/Cargo.toml` / `Cargo.lock` | `rfd` dependency |
| `apps/desktop/src/lib/tauri.ts` | Invoke real command; null = cancel |
| `apps/desktop/README.md` | Document sidecar behavior |

`tauri.conf.json` unchanged — spawn is entirely in Rust setup/exit (no config hook needed).

---

## Spawn path (documented)

1. Prefer: `node packages/runtime/dist/index.js` (cwd `packages/runtime`)
2. Current default: `node <tsx>/dist/cli.mjs packages/runtime/src/index.ts`
3. Wait up to **10s** for `/health`
4. If health already OK → do not spawn, do not kill on exit

---

## Verification

```bash
# Rust typecheck (gnu host; see Concerns)
cargo check   # PASS (stable-x86_64-pc-windows-gnu)

pnpm --filter @ml-aos/desktop test   # PASS (2)
pnpm --filter @ml-aos/desktop build  # PASS

# Sidecar spawn smoke (mirrors Rust resolution):
# node + tsx → curl http://127.0.0.1:17890/health → {"ok":true}
# taskkill /T → health down
```

`pnpm tauri dev` end-to-end not run here (MSVC `link.exe` missing; see Concerns).

---

## Self-review

| Check | Result |
|-------|--------|
| Only touched `E:\Python_Project\ml-aos` | ✓ |
| Spawn if health fails; 10s wait | ✓ |
| Kill process tree on exit (Windows `/T`) | ✓ |
| `pick_folder` wired from UI | ✓ |
| Sidecar spawn path documented | ✓ |

**Notes:**

- Stdio for sidecar is discarded (`null`) to avoid pipe-buffer stalls.
- External runtimes already on `:17890` are left alone.

---

## Concerns

- Default Windows Rust is MSVC (`C:\Program Files\Rust stable MSVC …`) but **Visual C++ `link.exe` is not installed**, so `pnpm tauri dev` / `tauri build` cannot link WebView2 yet. `cargo check` verified via `stable-x86_64-pc-windows-gnu` + MinGW.
- Packaged builds still need a real `dist` (or bundled Node) — `sidecars/README.md` notes this.

---

## Next task

Task 10 — Git clone integration test.
