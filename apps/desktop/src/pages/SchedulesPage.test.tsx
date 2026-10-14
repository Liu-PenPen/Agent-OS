// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { api } from "../lib/api";
import { SchedulesPage } from "./SchedulesPage";

vi.mock("../lib/shell-context", () => ({
  useShell: () => ({ selectTopic: vi.fn() }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("../lib/api", () => ({
  api: {
    listTicketProjects: vi.fn(async () => [
      {
        id: "hangyan",
        name: "航研所项目",
        programId: "1",
        localPath: "E:/demo",
        defaultEngine: "claude",
        cast: [],
      },
    ]),
    listTicketPulls: vi.fn(async () => []),
    listAgentSchedules: vi.fn(async () => []),
    listWorkspaces: vi.fn(async () => [{ id: "ws", name: "演示工作区", localPath: "E:/demo" }]),
    listBots: vi.fn(async () => [
      {
        id: "dev",
        name: "开发工程师",
        role: "developer",
        defaultEngine: "claude",
        instructions: "",
        enabled: true,
      },
    ]),
    createAgentSchedule: vi.fn(async () => ({
      id: "agent-1",
      prompt: "分析增量日志",
      botId: "dev",
      workspaceId: "ws",
      everyHours: 1,
      status: "draft",
      createdAt: "2026-10-13T00:00:00.000Z",
      updatedAt: "2026-10-13T00:00:00.000Z",
    })),
    createTicketPull: vi.fn(async () => ({
      id: "task-1",
      projectId: "hangyan",
      everyHours: 1,
      priority: "major",
      status: "draft",
      createdAt: "2026-10-13T00:00:00.000Z",
      updatedAt: "2026-10-13T00:00:00.000Z",
    })),
    ticketPullAction: vi.fn(async () => ({ ok: true })),
  },
}));

describe("SchedulesPage", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.mocked(api.listTicketPulls).mockClear();
    vi.mocked(api.createTicketPull).mockClear();
  });

  it("explains the selected priority and creates a draft task", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SchedulesPage />
        </MemoryRouter>,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(container.textContent).toContain("自动派发严重和主要");
    expect(container.textContent).toContain(
      "未配置参与 Bot，将按工单内容派给产品或开发。",
    );

    const none = container.querySelector<HTMLInputElement>(
      'input[value="none"]',
    );
    await act(async () => {
      none?.click();
    });
    expect(container.textContent).toContain(
      "自动派发严重、主要和无优先级",
    );

    const add = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "添加",
    );
    await act(async () => {
      add?.click();
    });
    expect(api.createTicketPull).toHaveBeenCalledWith({
      projectId: "hangyan",
      everyHours: 1,
      priority: "none",
    });
    root.unmount();
  });
});
