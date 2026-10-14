import { describe, it, expect } from "vitest";
import { buildBotPrompt } from "./bot-prompt.js";

describe("buildBotPrompt", () => {
  it("includes role instructions and task", () => {
    const prompt = buildBotPrompt(
      {
        name: "开发工程师",
        role: "developer",
        instructions: "只实现已确认方案。",
      },
      "实现登录页",
    );
    expect(prompt).toContain("开发工程师");
    expect(prompt).toContain("developer");
    expect(prompt).toContain("只实现已确认方案。");
    expect(prompt).toContain("实现登录页");
  });

  it("tells the CEO to dispatch via tool and workers to stop for CEO", () => {
    const ceo = buildBotPrompt(
      { name: "CEO助理", role: "ceo", instructions: "调度团队。" },
      "做注册",
    );
    expect(ceo).toContain("Team Leader");
    expect(ceo).toContain("dispatch_task");
    expect(ceo).toContain("口头「已交给某某」不会派发");

    const product = buildBotPrompt(
      { name: "产品经理", role: "product", instructions: "澄清需求。" },
      "做注册",
    );
    expect(product).toContain("不要把任务派给开发");
    expect(product).toContain("request_clarification");
    expect(product).toContain("request_spec_approval");

    const developer = buildBotPrompt(
      { name: "开发", role: "developer", instructions: "实现功能。" },
      "做登录",
    );
    expect(developer).toContain("由 CEO 调用 dispatch_task");
  });

  it("includes skill load rules when skills are declared", () => {
    const prompt = buildBotPrompt(
      {
        name: "产品经理",
        role: "product",
        instructions: "澄清需求。",
        skills: [
          {
            id: "grill-me",
            source: "mattpocock/skills@grill-me",
            localPath: "C:/skills/grill-me/SKILL.md",
            status: "ready",
          },
          {
            id: "product-spec",
            source: "bundled:product-spec",
            localPath: "C:/skills/product-spec/SKILL.md",
            status: "ready",
          },
        ],
      },
      "做规格",
    );
    expect(prompt).toContain("C:/skills/grill-me/SKILL.md");
    expect(prompt).toContain("C:/skills/product-spec/SKILL.md");
    expect(prompt).toContain("$grill-me");
    expect(prompt).toContain("$product-spec");
  });
});
