# @ml-aos/desktop

Vite + React + TypeScript UI shell for **ML AOS**, with Tauri 2 packaging.

## Dev (browser UI)

```bash
pnpm --filter @ml-aos/desktop dev
```

Opens Vite on http://localhost:1420. Product title: **ML AOS**.

Runtime API expected at `http://127.0.0.1:17890` (theme persist via GET/PATCH `/api/settings`).

## Tauri (native window)

Requires Rust toolchain (`cargo` / `rustc`) and Node on `PATH`.

```bash
pnpm --filter @ml-aos/desktop tauri dev
```

On start, Tauri probes `http://127.0.0.1:17890/health` and, if needed, spawns the runtime sidecar (prefer `node …/dist/index.js`, else `node` + `tsx` — see `src-tauri/sidecars/README.md`). On exit it kills only the process tree it started (`taskkill /T` on Windows). Folder Browse uses the `pick_folder` command.

If Rust is missing, the Vite UI still works; only `tauri dev` / `tauri build` need Rust.
