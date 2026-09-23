// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { TicketInbox } from "./TicketInbox";
import { api } from "../../lib/api";

vi.mock("../../lib/shell-context", () => ({
  useShell: () => ({
    workspace: { id: "ws-1", name: "demo", localPath: "E:\\\\demo" },
    setWorkspaceId: vi.fn(),
    selectTopic: vi.fn(),
    refreshAll: vi.fn(async () => undefined),
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    ticketsStatus: vi.fn(async () => ({
      configured: true,
      projectsPath: "config/gitee-projects.json",
    })),
    listTicketProjects: vi.fn(async () => [
      {
        id: "hangyan",
        name: "航研所项目",
        programId: "818309",
        ident: "PJ20251201",
        localPath: "E:\\\\demo",
        defaultEngine: "claude",
        cast: [],
      },
    ]),
    listTicketTodos: vi.fn(async () => [
      {
        id: 101,
        ident: "IHY-128",
        title: "登录页支持邮箱验证码",
        stateTitle: "待办",
        sprintTitle: "Sprint 12",
        programId: "818309",
        url: "https://example.com",
        priority: "主要",
        priorityRank: 10,
      },
    ]),
    getTicketDetail: vi.fn(async () => ({
      id: 101,
      ident: "IHY-128",
      title: "登录页支持邮箱验证码",
      stateTitle: "待办",
      sprintTitle: "Sprint 12",
      programId: "818309",
      url: "https://example.com",
      priority: "主要",
      priorityRank: 10,
      description: "详细说明",
      authorName: "测试",
      imageUrls: [],
    })),
    updateTicketProject: vi.fn(),
    dispatchTicket: vi.fn(),
    listWorkspaces: vi.fn(async () => []),
    listTicketIssueStates: vi.fn(async () => [
      { id: 1, title: "待办" },
      { id: 2, title: "完成" },
    ]),
    updateTicketIssueState: vi.fn(async () => ({
      stateId: 2,
      stateTitle: "完成",
    })),
  },
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("TicketInbox (API)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.mocked(api.listTicketIssueStates).mockClear();
    vi.mocked(api.updateTicketIssueState).mockClear();
  });

  it("loads projects and todos from API", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<TicketInbox onCollapse={vi.fn()} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("工单");
    expect(container.textContent).toContain("航研所项目");
    expect(container.textContent).toContain("IHY-128");
    expect(container.textContent).toContain("交给 CEO");
    expect(container.textContent).toContain("改状态");
  });

  it("requests issue states when opening change-state picker", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<TicketInbox onCollapse={vi.fn()} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const changeBtn = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent === "改状态",
    );
    expect(changeBtn).toBeTruthy();

    await act(async () => {
      changeBtn!.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(api.listTicketIssueStates).toHaveBeenCalledWith("hangyan", 101);
    expect(container.textContent).toContain("完成");
  });
});
