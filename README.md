# ML AOS

Desktop workbench for multi-bot local agents: workspaces, topic chat, dispatch pipelines, and clarification HITL. Phase 1 ships a Tauri + React UI and a Node runtime on `127.0.0.1:17890`.

This repo is **independent of agent-os** — no shared runtime, no Feishu, no coupling to that codebase. Secrets stay out of the tree; Claude/Codex use their own user-level CLI logins.

**Spec / plan:** [desktop design](docs/superpowers/specs/2026-09-20-ml-aos-desktop-design.md) · [phase-1 plan](docs/superpowers/plans/2026-09-20-ml-aos-phase1.md)

## Requirements

- Node 22+
- [pnpm](https://pnpm.io/) 9+
- Optional: Git on `PATH` (workspace clone)
- Optional: [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI on `PATH` (real engine)
- Optional for native window: Rust toolchain + **MSVC Build Tools** (`link.exe`) on Windows

## Install

```bash
pnpm install
```

## Dev

Start the runtime and UI in two terminals:

```bash
pnpm dev:runtime   # http://127.0.0.1:17890
pnpm dev:ui        # Vite UI http://localhost:1420
```

### Tauri (native window)

```bash
pnpm tauri dev
```

On Windows, `tauri build` / `tauri dev` need the MSVC linker (`link.exe`). If it is missing, use `pnpm dev:runtime` + `pnpm dev:ui` instead — the browser UI talks to the same runtime. When the native shell starts, it probes `/health` and may spawn the runtime sidecar (see `apps/desktop/src-tauri/sidecars/README.md`).

## Data directory

Runtime persists JSON under a data directory:

- Default when started via `pnpm dev:runtime`: `./data` (cwd = `packages/runtime`, overridable with `ML_AOS_DATA_DIR`)
- App setting `dataDir` is stored in settings and shown under App Settings → Workspace Environment
- Spec default for packaged apps: OS app-data folder (`…/ml-aos`)

Do not commit local `data/` contents.

## Engines: mock vs Claude

| Engine | Behavior |
|--------|----------|
| `mock` (default) | In-process mock adapter; no CLI binary required. Use for UI and acceptance. |
| `claude` | Spawns `claude` (`shell: false`). Missing binary → HTTP **503** with install/login message. |
| `codex` | Stub only; returns unavailable until implemented. |

Set the default under App Settings, or per-bot on the Bot settings page.

## Workspace Git

Configure `gitUrl` on a workspace, then Clone. Requires `git` on `PATH`. Integration tests skip when Git is unavailable; see `packages/runtime/README.md`.

## Tests

```bash
pnpm test
```

## Phase 1 acceptance

See the checklist in [`.superpowers/sdd/task-12-report.md`](.superpowers/sdd/task-12-report.md) (spec §7).
