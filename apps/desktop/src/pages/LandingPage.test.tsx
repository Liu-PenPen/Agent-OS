// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { LandingPage } from "./LandingPage";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../lib/shell-context", () => ({
  useShell: () => ({
    workspace: { id: "ws-1", name: "Demo Workspace", localPath: "/repo" },
    topics: [
      {
        id: "t-1",
        title: "测试需求",
        createdAt: new Date().toISOString(),
        pipelineStage: "idle",
      },
    ],
    bots: [
      {
        id: "b-1",
        name: "CEO助理",
        role: "ceo",
        defaultEngine: "claude",
        enabled: true,
      },
    ],
    selectTopic: vi.fn(),
  }),
}));

describe("LandingPage Component", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("renders brand header without theme or enter controls", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <BrowserRouter>
          <LandingPage />
        </BrowserRouter>,
      );
    });

    expect(container.textContent).toContain("MLAOS");
    expect(container.textContent).toContain("智能体操作系统");
    expect(container.querySelector(".landing-enter-btn")).toBeNull();
    expect(container.querySelector(".theme-btn")).toBeNull();
    expect(container.textContent).toContain("进入工作区");
    expect(container.textContent).toContain("CEO助理");
  });
});
