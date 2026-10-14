import { randomUUID } from "node:crypto";
import { access, readdir } from "node:fs/promises";
import type { Workspace } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";
import { cloneRepo } from "./git-service.js";
export interface CreateWorkspaceInput {
  name: string;
  localPath: string;
  gitUrl?: string;
}

export type UpdateWorkspaceInput = Partial<
  Pick<Workspace, "name" | "localPath" | "gitUrl">
>;

function assertLocalPath(localPath: string): void {
  if (!localPath.trim()) {
    throw new Error("localPath is required");
  }
}

async function pathIsEmpty(localPath: string): Promise<boolean> {
  try {
    await access(localPath);
  } catch {
    return true;
  }
  const entries = await readdir(localPath);
  return entries.length === 0;
}

export class WorkspaceService {
  constructor(private readonly store: JsonStore) {}

  async list(): Promise<Workspace[]> {
    const state = await this.store.load();
    return state.workspaces;
  }

  async get(id: string): Promise<Workspace | undefined> {
    const state = await this.store.load();
    return state.workspaces.find((w) => w.id === id);
  }

  async create(input: CreateWorkspaceInput): Promise<Workspace> {
    assertLocalPath(input.localPath);

    const state = await this.store.load();
    const workspace: Workspace = {
      id: randomUUID(),
      name: input.name,
      localPath: input.localPath,
      ...(input.gitUrl ? { gitUrl: input.gitUrl } : {}),
    };
    state.workspaces.push(workspace);
    await this.store.save(state);
    return workspace;
  }

  async update(id: string, patch: UpdateWorkspaceInput): Promise<Workspace> {
    const state = await this.store.load();
    const index = state.workspaces.findIndex((w) => w.id === id);
    if (index === -1) {
      throw new Error(`Workspace not found: ${id}`);
    }

    const current = state.workspaces[index];
    if (patch.localPath !== undefined) {
      assertLocalPath(patch.localPath);
    }

    const localPathChanged =
      patch.localPath !== undefined && patch.localPath !== current.localPath;

    const updated: Workspace = {
      ...current,
      ...patch,
    };
    state.workspaces[index] = updated;

    if (localPathChanged) {
      for (const topic of state.topics) {
        if (topic.workspaceId === id) {
          topic.cliSessionId = undefined;
          topic.cliSessions = {};
        }
      }
    }

    await this.store.save(state);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const state = await this.store.load();
    const index = state.workspaces.findIndex((w) => w.id === id);
    if (index === -1) {
      throw new Error(`Workspace not found: ${id}`);
    }
    state.workspaces.splice(index, 1);
    await this.store.save(state);
  }

  async clone(id: string): Promise<Workspace> {
    const state = await this.store.load();
    const workspace = state.workspaces.find((w) => w.id === id);
    if (!workspace) {
      throw new Error(`Workspace not found: ${id}`);
    }
    if (!workspace.gitUrl) {
      throw new Error("Workspace has no gitUrl");
    }
    if (!(await pathIsEmpty(workspace.localPath))) {
      throw new Error("localPath is not empty");
    }

    await cloneRepo(workspace.gitUrl, workspace.localPath);
    return workspace;
  }
}
