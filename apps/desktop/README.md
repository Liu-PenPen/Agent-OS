# @ml-aos/desktop

Vite + React + TypeScript UI shell for **ML AOS**, with Tauri 2 packaging.

## Dev (browser UI)

```bash
pnpm --filter @ml-aos/desktop dev
```

Opens Vite on http://localhost:1420. Product title: **ML AOS**.

Runtime API expected at `http://127.0.0.1:17890` (theme persist via GET/PATCH `/api/settings`).

## Tauri (native window)

Requires Rust toolchain (`cargo` / `rustc`).

```bash
pnpm --filter @ml-aos/desktop tauri dev
```

If Rust is missing, the Vite UI still works; only `tauri dev` / `tauri build` need Rust.
