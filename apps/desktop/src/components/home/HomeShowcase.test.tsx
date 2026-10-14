// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { HomeShowcase } from "./HomeShowcase";
import type { BotConfig, Workspace } from "@ml-aos/shared";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("HomeShowcase Component", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  const mockBots: BotConfig[] = [
    {
      id: "bot-1",
      name: "CEO 助理",
      role: "ceo",
      defaultEngine: "claude",
      instructions: "调度",
      enabled: true,
    },
    {
      id: "bot-2",
      name: "产品经理",
      role: "product",
      defaultEngine: "claude",
      instructions: "需求澄清",
      enabled: true,
    },
  ];

  const mockWorkspace: Workspace = {
    id: "ws-1",
    name: "AOS Core",
    localPath: "/path/to/repo",
  };

  it("renders brand hero and cast without workspace hint", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <HomeShowcase
          workspace={mockWorkspace}
          bots={mockBots}
          onEnterWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain("MLAOS");
    expect(container.textContent).toContain("智能体操作系统");
    expect(container.textContent).toContain("AI 数字化员工团队协作");
    expect(container.textContent).not.toContain("Gitee");
    expect(container.textContent).toContain("进入工作区");
    expect(container.textContent).not.toContain("最近话题");
    expect(container.textContent).not.toContain("点名智能体");
    expect(container.textContent).not.toContain("AOS Core");
  });

  it("triggers onEnterWorkspace when CTA is clicked", async () => {
    const onEnterWorkspace = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <HomeShowcase
          workspace={mockWorkspace}
          bots={mockBots}
          onEnterWorkspace={onEnterWorkspace}
          onCreateWorkspace={vi.fn()}
        />,
      );
    });

    const ctaBtn = container.querySelector(".showcase-cta") as HTMLButtonElement;
    ctaBtn.click();
    expect(onEnterWorkspace).toHaveBeenCalledTimes(1);
  });

  it("prompts workspace creation when workspace is null", async () => {
    const onCreateWorkspace = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <HomeShowcase
          workspace={null}
          bots={mockBots}
          onEnterWorkspace={vi.fn()}
          onCreateWorkspace={onCreateWorkspace}
        />,
      );
    });

    expect(container.textContent).toContain("创建工作区");
    const ctaBtn = container.querySelector(".showcase-cta") as HTMLButtonElement;
    ctaBtn.click();
    expect(onCreateWorkspace).toHaveBeenCalledTimes(1);
  });

  it("brings a cast card to front when its flow pill is clicked", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <HomeShowcase
          workspace={mockWorkspace}
          bots={mockBots}
          onEnterWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
        />,
      );
    });

    expect(container.querySelector(".showcase-cast-card.is-front")?.textContent).toContain(
      "CEO",
    );

    const reviewPill = Array.from(
      container.querySelectorAll(".showcase-flow-btn"),
    ).find((el) => el.textContent?.includes("审查")) as HTMLButtonElement;
    await act(async () => {
      reviewPill.click();
    });

    expect(container.querySelector(".showcase-cast-card.is-front")?.textContent).toContain(
      "代码审查",
    );
    expect(
      container.querySelector(".showcase-flow-item.is-active")?.textContent,
    ).toContain("审查");
  });
});
