import { describe, expect, it } from "vitest";
import {
  buildFallbackDispatchRequest,
  needsTeamLeaderDispatchCorrection,
  resolveTeamLeaderDispatch,
} from "./team-leader-guard.js";

describe("team-leader-guard", () => {
  it("requires correction for verbal dispatch on a feature task", () => {
    expect(
      needsTeamLeaderDispatchCorrection({
        answer: "已交给 product，请产品经理澄清需求。",
        taskText: "增加一个登录页面",
        toolCalls: [],
      }),
    ).toBe(true);
  });

  it("skips correction when dispatch_task was called", () => {
    expect(
      needsTeamLeaderDispatchCorrection({
        answer: "已派发",
        taskText: "增加登录",
        toolCalls: [
          {
            name: "dispatch_task",
            input: {
              targetBotId: "product",
              objective: "澄清",
              instruction: "做规格",
            },
          },
        ],
      }),
    ).toBe(false);
  });

  it("returns correction prompt then fallback", () => {
    const first = resolveTeamLeaderDispatch({
      role: "ceo",
      inCollaboration: false,
      taskText: "实现注册功能",
      answer: "已交给 product",
      toolCalls: [],
      alreadyCorrected: false,
      defaultTargetBotId: "developer",
    });
    expect(first.source).toBe("retry");
    expect(first.correctionPrompt).toContain("dispatch_task");
    expect(first.correctionPrompt).toContain("targetBotId=developer");

    const second = resolveTeamLeaderDispatch({
      role: "ceo",
      inCollaboration: false,
      taskText: "实现注册功能",
      answer: "还是口头说说",
      toolCalls: [],
      alreadyCorrected: true,
      defaultTargetBotId: "developer",
    });
    expect(second.source).toBe("fallback");
    expect(second.request?.targetBotId).toBe("developer");
  });

  it("treats 启动流水线 as verbal dispatch needing correction", () => {
    expect(
      needsTeamLeaderDispatchCorrection({
        answer: "请点击启动流水线，或直接 @开发工程师",
        taskText: "工单分析",
        toolCalls: [],
      }),
    ).toBe(true);
  });

  it("does not force dispatch when CEO is in collaboration report-back", () => {
    const outcome = resolveTeamLeaderDispatch({
      role: "ceo",
      inCollaboration: true,
      taskText: "开发已完成",
      answer: "可以交付了",
      toolCalls: [],
      alreadyCorrected: false,
    });
    expect(outcome.source).toBe("none");
  });

  it("builds a fallback request", () => {
    const request = buildFallbackDispatchRequest("做支付");
    expect(request.targetBotId).toBe("product");
    expect(request.instruction).toContain("兜底派发");
  });
});
