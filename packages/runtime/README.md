# @ml-aos/runtime

Local HTTP + WebSocket runtime for ML AOS desktop.

## Git clone

Workspace clone (`POST /api/workspaces/:id/clone`) runs `git clone` via `spawn("git", ["clone", ...])` (no shell). **Git must be on `PATH`**; integration tests skip automatically when `git --version` fails.
