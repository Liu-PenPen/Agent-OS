# Runtime sidecar

Tauri starts the Node Desktop Runtime when `http://127.0.0.1:17890/health` is not OK.

## Spawn resolution (no shell)

Working directory: `packages/runtime`.

1. **Production / dist (preferred):**  
   `node packages/runtime/dist/index.js`  
   Used when `dist/index.js` exists.

2. **Dev fallback (current default):**  
   `node <tsx>/dist/cli.mjs packages/runtime/src/index.ts`  
   Resolves `tsx` from `packages/runtime/node_modules` or the repo-root `node_modules`.  
   There is no runtime `build`/`dist` script yet, so **dev uses tsx**.

If health is already OK, Tauri does **not** spawn and will **not** kill that external process on exit.

## Exit

Only a process tree spawned by Tauri is stopped:

- Windows: `taskkill /PID <pid> /T /F`
- Other: `Child::kill`

## Bundle note

For packaged builds, ship `packages/runtime/dist` (or an equivalent entry) next to the app and ensure `node` is on PATH, or point at a bundled Node binary. This folder is the placeholder for that packaging step.
