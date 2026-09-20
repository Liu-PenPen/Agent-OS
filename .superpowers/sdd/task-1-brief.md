### Task 1: Monorepo scaffold + shared models

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/models.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/models.test.ts`
- Test: `packages/shared` via vitest

**Interfaces:**
- Produces: `@ml-aos/shared` exports all types above + Zod parsers `AppSettingsSchema`, `BotConfigSchema`, `WorkspaceSchema`

- [ ] **Step 1: Init workspace root**

```json
// package.json
{
  "name": "ml-aos",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "test": "pnpm -r test",
    "dev:runtime": "pnpm --filter @ml-aos/runtime dev",
    "dev:ui": "pnpm --filter @ml-aos/desktop dev",
    "tauri": "pnpm --filter @ml-aos/desktop tauri"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
  - "apps/*"
```

`.gitignore`: `node_modules`, `dist`, `src-tauri/target`, `.env`, `data/`, `.superdesign/tmp`

- [ ] **Step 2: Write failing Zod round-trip test**

```ts
// packages/shared/src/models.test.ts
import { describe, it, expect } from "vitest";
import { AppSettingsSchema } from "./models.js";

describe("AppSettingsSchema", () => {
  it("defaults theme to dark when parsing partial", () => {
    const parsed = AppSettingsSchema.parse({
      theme: "dark",
      defaultEngine: "mock",
      dataDir: "C:/tmp/ml-aos",
      notifications: true,
    });
    expect(parsed.theme).toBe("dark");
  });
});
```

- [ ] **Step 3: Run test — expect FAIL (module missing)**

Run: `cd E:\Python_Project\ml-aos\packages\shared && pnpm exec vitest run src/models.test.ts`  
Expected: FAIL resolve or export missing

- [ ] **Step 4: Implement models + Zod + package.json**

Implement `models.ts` with schemas matching Domain types section. Export from `index.ts`. Add vitest/typescript deps.

- [ ] **Step 5: Run test — expect PASS**

- [ ] **Step 6: Commit**

```bash
cd E:/Python_Project/ml-aos
git init   # if not already
git add package.json pnpm-workspace.yaml .gitignore packages/shared
git commit -m "chore: scaffold shared models and workspace"
```

---
