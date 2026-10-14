import { describe, expect, it } from "vitest";
import {
  AcceptanceSubmissionSchema,
  findAcceptanceSubmission,
  formatAcceptanceSummary,
} from "./acceptance.js";

describe("acceptance schema", () => {
  it("parses submit_acceptance tool input", () => {
    const found = findAcceptanceSubmission([
      {
        name: "mcp__agent_os__submit_acceptance",
        input: {
          verdict: "fail",
          summary: "登录按钮不可点",
          checks: [
            {
              id: "login",
              title: "登录",
              status: "fail",
              detail: "按钮 disabled",
            },
          ],
          evidence: [{ kind: "screenshot", path: ".ml-aos/acceptance/a.png" }],
          source: "agent-browser",
        },
      },
    ]);
    expect(found?.verdict).toBe("fail");
    expect(found?.checks[0]?.status).toBe("fail");
  });

  it("requires skipReason for skip", () => {
    const bad = AcceptanceSubmissionSchema.safeParse({
      verdict: "skip",
      summary: "无 UI",
    });
    expect(bad.success).toBe(false);

    const ok = AcceptanceSubmissionSchema.safeParse({
      verdict: "skip",
      summary: "无 UI",
      skipReason: "纯库，无页面",
      source: "skip",
    });
    expect(ok.success).toBe(true);
  });

  it("formats summary for cards", () => {
    const text = formatAcceptanceSummary({
      id: "1",
      topicId: "t",
      at: new Date().toISOString(),
      verdict: "pass",
      summary: "通过",
      checks: [{ id: "a", title: "首页", status: "pass" }],
      evidence: [],
      source: "playwright",
    });
    expect(text).toContain("PASS");
    expect(text).toContain("首页");
  });
});
