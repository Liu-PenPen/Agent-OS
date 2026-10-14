# Runtime sidecar

Tauri starts the Node Desktop Runtime when `http://127.0.0.1:17890/health` is not OK.

## Resolution order

1. **Packaged install** (preferred for Releases):  
   `{resource_dir}/node/node(.exe)` + `{resource_dir}/runtime/index.js`  
   Prepared by `pnpm prepare:bundle` / `pnpm build:desktop`.  
   Sets `ML_AOS_DATA_DIR` to `{app_data}/data`.

2. **Dev with dist:**  
   `node packages/runtime/dist/index.js` when dist exists.

3. **Dev fallback:**  
   `node <tsx>/cli.mjs packages/runtime/src/index.ts`

If health is already OK, Tauri does **not** spawn and will **not** kill that external process on exit.

## Exit

Only a process tree spawned by Tauri is stopped:

- Windows: `taskkill /PID <pid> /T /F`
- Other: `Child::kill`

## Building an installer

```bash
pnpm build:desktop
```

This runs `scripts/prepare-bundle.mjs` (esbuild runtime + portable Node download), then `tauri build` (NSIS).
