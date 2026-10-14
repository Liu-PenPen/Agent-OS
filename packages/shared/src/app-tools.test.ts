import { describe, expect, it } from "vitest";
import {
  clarificationToMarkdown,
  findClarificationRequest,
  findDispatchTaskRequest,
  looksLikeReviewFailure,
  looksLikeTestFailure,
  normalizeToolName,
} from "./app-tools.js";

describe("app tools", () => {
  it("normalizes Claude MCP tool names", () => {
    expect(normalizeToolName("mcp__agent_os__request_clarification")).toBe(
      "request_clarification",
    );
    expect(normalizeToolName("dispatch_task")).toBe("dispatch_task");
  });

  it("reads the latest clarification tool call", () => {
    const request = findClarificationRequest([
      {
        name: "mcp__agent_os__request_clarification",
        input: {
          title: "需求确认",
          questions: [
            {
              id: "auth",
              prompt: "登录方式",
              options: [
                { id: "a", label: "密码" },
                { id: "b", label: "验证码" },
              ],
              recommendedOptionId: "a",
            },
          ],
        },
      },
    ]);
    expect(request?.questions).toHaveLength(1);
    expect(clarificationToMarkdown(request!)).toContain("问题 1：登录方式");
  });

  it("reads a dispatch_task call", () => {
    const request = findDispatchTaskRequest([
      {
        name: "dispatch_task",
        input: {
          targetBotId: "developer",
          objective: "实现登录",
          instruction: "按规格实现",
          expectedOutput: "代码与验证说明",
        },
      },
    ]);
    expect(request?.targetBotId).toBe("developer");
  });

  it("detects test and review failures", () => {
    expect(looksLikeTestFailure("失败项：登录按钮不可见")).toBe(true);
    expect(looksLikeTestFailure("全部通过，可以进入审查")).toBe(false);
    expect(looksLikeReviewFailure("结论：REVIEW_FAILED，缺校验")).toBe(true);
  });
});
