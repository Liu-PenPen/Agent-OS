### Task 7: UI pages — Workspace, Bots, Settings, Queue, Pipeline

**Files:**
- Create: `pages/WorkspaceFormPage.tsx`, `BotSettingsPage.tsx`, `AppSettingsPage.tsx`, `ClarificationQueuePage.tsx`, `PipelineDetailPage.tsx`
- Create: `App.tsx` routes (react-router)
- Drafts:
  - Workspace https://p.superdesign.dev/draft/e5ba38ea-18c9-4bf2-b8e1-f1497f3bc6d4
  - Bots https://p.superdesign.dev/draft/27171bf2-798a-45ff-99d7-de679c68e127
  - Queue https://p.superdesign.dev/draft/88c3b020-2d8d-43bb-946b-d153a2e2fdfe
  - Pipeline https://p.superdesign.dev/draft/949a92f9-aef8-423c-812a-0459abfa61a9
  - Settings https://p.superdesign.dev/draft/caa116af-d072-4fc7-a7dd-fbbeab2d9f59
  - Settings light https://p.superdesign.dev/draft/6d10e4e1-5734-4db1-8eb3-a9674939e877

**Interfaces:**
- Tauri command `pick_folder() -> string` for Browse buttons
- Clone button → `POST /api/workspaces/:id/clone`

- [ ] **Step 1: Implement Workspace form (name, localPath browse, gitUrl, save, clone)**

- [ ] **Step 2: Bot settings list + editor CRUD**

- [ ] **Step 3: App settings — theme segmented control dark/light/system**

- [ ] **Step 4: Clarification queue + answer flow**

- [ ] **Step 5: Pipeline detail from right panel click**

- [ ] **Step 6: Manual smoke: create workspace, add bot, open home**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: settings workspace bots queue and pipeline pages"
```

---
