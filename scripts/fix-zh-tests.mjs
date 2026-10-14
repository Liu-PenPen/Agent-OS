import { writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function u(...codes) {
  return String.fromCodePoint(...codes);
}

// Helper: Chinese via code points to avoid encoding loss in this script source.
const zh = {
  userOrPass: "\u7528\u6237\u540d/\u90ae\u7bb1\u6216\u5bc6\u7801\u9519\u8bef",
  userTaken: "\u7528\u6237\u540d\u5df2\u88ab\u6ce8\u518c",
  emailTaken: "\u90ae\u7bb1\u5df2\u88ab\u6ce8\u518c",
  userEmpty: "\u7528\u6237\u540d\u4e0d\u80fd\u4e3a\u7a7a",
  emailInvalid: "\u8bf7\u8f93\u5165\u6709\u6548\u7684\u90ae\u7bb1\u5730\u5740",
  passShort: "\u5bc6\u7801\u957f\u5ea6\u4e0d\u80fd\u5c11\u4e8e 8 \u4f4d",
  created: "\u5df2\u521b\u5efa",
  patrol: "\u5de1\u68c0\u65e5\u5fd7",
  onlyConfirmed: "\u53ea\u5b9e\u73b0\u5df2\u786e\u8ba4\u65b9\u6848\u3002",
  implementLogin: "\u5b9e\u73b0\u767b\u5f55\u9875",
  ceoName: "CEO\u52a9\u7406",
  schedule: "\u8c03\u5ea6\u56e2\u961f\u3002",
  doRegister: "\u505a\u6ce8\u518c",
  verbalNoDispatch:
    "\u53e3\u5934\u300c\u5df2\u4ea4\u7ed9\u67d0\u67d0\u300d\u4e0d\u4f1a\u6d3e\u53d1",
  productName: "\u4ea7\u54c1\u7ecf\u7406",
  clarify: "\u6f84\u6e05\u9700\u6c42\u3002",
  noDispatchDev: "\u4e0d\u8981\u628a\u4efb\u52a1\u6d3e\u7ed9\u5f00\u53d1",
  developer: "\u5f00\u53d1",
  implement: "\u5b9e\u73b0\u529f\u80fd\u3002",
  doLogin: "\u505a\u767b\u5f55",
  byCeo: "\u7531 CEO \u8c03\u7528 dispatch_task",
  clarifyNeed: "\u6f84\u6e05\u9700\u6c42\u3002",
  doSpec: "\u505a\u89c4\u683c",
  handedToProduct:
    "\u5df2\u4ea4\u7ed9 product\uff0c\u8bf7\u4ea7\u54c1\u7ecf\u7406\u6f84\u6e05\u9700\u6c42\u3002",
  addLoginPage: "\u589e\u52a0\u4e00\u4e2a\u767b\u5f55\u9875\u9762",
  dispatched: "\u5df2\u6d3e\u53d1",
  doSpecShort: "\u505a\u89c4\u683c",
  handedProduct: "\u5df2\u4ea4\u7ed9 product",
  canDeliver: "\u53ef\u4ee5\u4ea4\u4ed8\u4e86",
  doPay: "\u505a\u652f\u4ed8",
  fallback: "\u515c\u5e95\u6d3e\u53d1",
  analyzing: "\u6b63\u5728\u5206\u6790\u6267\u884c\u7ed3\u679c",
  done: "\u5b8c\u6210\u3002",
  plan: "\u65b9\u6848",
  summary: "\u6458\u8981",
  specWritten:
    "\u89c4\u683c\u5df2\u5199\u5165 docs/product-spec.md\uff0c\u5305\u542b Tickets\u3002",
  specOther: "\u89c4\u683c\u5df2\u5199\u5165 docs/other.md",
  missingDelivery:
    "\u4ea7\u54c1\u89c4\u683c\u548c Tickets\u3001\u9a8c\u6536\u6807\u51c6\u90fd\u5df2\u7ecf\u6574\u7406\u597d\u4e86\uff0c\u8bf7\u4f60\u67e5\u770b\u6458\u8981\u5e76\u786e\u8ba4\u662f\u5426\u53ef\u4ee5\u8fdb\u5165\u4e0b\u4e00\u9636\u6bb5\u3002",
  stageMarker: "\u25b6 Stage",
  specPathLong:
    "\u89c4\u683c\u5df2\u5199\u5165 docs/product-spec.md\uff0c\u5305\u542b\u4ea7\u54c1\u8bf4\u660e\u4e0e\u5b9e\u73b0\u4efb\u52a1\uff08Tickets\uff09\uff0c\u4ee5\u53ca\u9a8c\u6536\u6807\u51c6\u3002",
  specTickets:
    "\u89c4\u683c\u5df2\u5199\u5165 docs/product-spec.md\uff0c\u5305\u542b\u9a8c\u6536\u6807\u51c6\u4e0e Tickets\u3002",
  register: "\u6ce8\u518c",
  doReg: "\u505a\u6ce8\u518c",
  implDone: "\u5b9e\u73b0\u5b8c\u6210\uff0c\u767b\u5f55\u9875\u5df2\u52a0\u4e0a\u3002",
  tester: "\u6d4b\u8bd5\u5de5\u7a0b\u5e08",
  handedClarify:
    "\u5df2\u4ea4\u7ed9 product\uff0c\u8bf7\u4ea7\u54c1\u7ecf\u7406\u6f84\u6e05\u3002",
  addRegister: "\u589e\u52a0\u4e00\u4e2a\u6ce8\u518c\u529f\u80fd",
  stillVerbal: "\u4ecd\u7136\u53ea\u662f\u53e3\u5934\u8bf4\u8bf4\u3002",
  developerEng: "\u5f00\u53d1\u5de5\u7a0b\u5e08",
};

writeFileSync(
  join(root, "packages/runtime/src/services/schedule-service.test.ts"),
  `import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScheduleService, cronMatches } from "./schedule-service.js";

describe("ScheduleService", () => {
  it("creates, pauses, and lists a task", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-schedule-"));
    const service = new ScheduleService(dir, async () => undefined);
    const notice = await service.manage(
      {
        action: "add",
        targetBotId: "developer",
        prompt: "${zh.patrol}",
        rule: { kind: "interval", everyMs: 60_000 },
      },
      "topic-1",
    );
    expect(notice).toContain("${zh.created}");
    const [task] = await service.list();
    expect(task?.status).toBe("active");
    expect(task?.prompt).toBe("${zh.patrol}");
    await service.manage({ action: "pause", id: task!.id }, "topic-1");
    const [paused] = await service.list();
    expect(paused?.status).toBe("paused");
  });

  it("matches a wildcard cron minute", () => {
    const date = new Date("2026-09-21T08:15:00Z");
    expect(cronMatches("* * * * *", date, "UTC")).toBe(true);
  });
});
`,
  "utf8",
);

writeFileSync(
  join(root, "packages/runtime/src/services/bot-prompt.test.ts"),
  `import { describe, it, expect } from "vitest";
import { buildBotPrompt } from "./bot-prompt.js";

describe("buildBotPrompt", () => {
  it("includes role instructions and task", () => {
    const prompt = buildBotPrompt(
      {
        name: "${zh.developerEng}",
        role: "developer",
        instructions: "${zh.onlyConfirmed}",
      },
      "${zh.implementLogin}",
    );
    expect(prompt).toContain("${zh.developerEng}");
    expect(prompt).toContain("developer");
    expect(prompt).toContain("${zh.onlyConfirmed}");
    expect(prompt).toContain("${zh.implementLogin}");
  });

  it("tells the CEO to dispatch via tool and workers to stop for CEO", () => {
    const ceo = buildBotPrompt(
      { name: "${zh.ceoName}", role: "ceo", instructions: "${zh.schedule}" },
      "${zh.doRegister}",
    );
    expect(ceo).toContain("Team Leader");
    expect(ceo).toContain("dispatch_task");
    expect(ceo).toContain("${zh.verbalNoDispatch}");

    const product = buildBotPrompt(
      { name: "${zh.productName}", role: "product", instructions: "${zh.clarify}" },
      "${zh.doRegister}",
    );
    expect(product).toContain("${zh.noDispatchDev}");
    expect(product).toContain("request_clarification");
    expect(product).toContain("request_spec_approval");

    const developer = buildBotPrompt(
      { name: "${zh.developer}", role: "developer", instructions: "${zh.implement}" },
      "${zh.doLogin}",
    );
    expect(developer).toContain("${zh.byCeo}");
  });

  it("includes skill load rules when skills are declared", () => {
    const prompt = buildBotPrompt(
      {
        name: "${zh.productName}",
        role: "product",
        instructions: "${zh.clarifyNeed}",
        skills: ["grill-me", "product-spec"],
      },
      "${zh.doSpec}",
    );
    expect(prompt).toContain(".agents/skills/<skill>/SKILL.md");
    expect(prompt).toContain("$grill-me");
    expect(prompt).toContain("$product-spec");
  });
});
`,
  "utf8",
);

writeFileSync(
  join(root, "packages/runtime/src/services/team-leader-guard.test.ts"),
  `import { describe, expect, it } from "vitest";
import {
  buildFallbackDispatchRequest,
  needsTeamLeaderDispatchCorrection,
  resolveTeamLeaderDispatch,
} from "./team-leader-guard.js";

describe("team-leader-guard", () => {
  it("requires correction for verbal dispatch on a feature task", () => {
    expect(
      needsTeamLeaderDispatchCorrection({
        answer: "${zh.handedToProduct}",
        taskText: "${zh.addLoginPage}",
        toolCalls: [],
      }),
    ).toBe(true);
  });

  it("skips correction when dispatch_task was called", () => {
    expect(
      needsTeamLeaderDispatchCorrection({
        answer: "${zh.dispatched}",
        taskText: "\u589e\u52a0\u767b\u5f55",
        toolCalls: [
          {
            name: "dispatch_task",
            input: {
              targetBotId: "product",
              objective: "\u6f84\u6e05",
              instruction: "${zh.doSpecShort}",
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
      taskText: "\u5b9e\u73b0\u6ce8\u518c\u529f\u80fd",
      answer: "${zh.handedProduct}",
      toolCalls: [],
      alreadyCorrected: false,
    });
    expect(first.source).toBe("retry");
    expect(first.correctionPrompt).toContain("dispatch_task");

    const second = resolveTeamLeaderDispatch({
      role: "ceo",
      inCollaboration: false,
      taskText: "\u5b9e\u73b0\u6ce8\u518c\u529f\u80fd",
      answer: "\u8fd8\u662f\u53e3\u5934\u8bf4\u8bf4",
      toolCalls: [],
      alreadyCorrected: true,
    });
    expect(second.source).toBe("fallback");
    expect(second.request?.targetBotId).toBe("product");
  });

  it("does not force dispatch when CEO is in collaboration report-back", () => {
    const outcome = resolveTeamLeaderDispatch({
      role: "ceo",
      inCollaboration: true,
      taskText: "\u5f00\u53d1\u5df2\u5b8c\u6210",
      answer: "${zh.canDeliver}",
      toolCalls: [],
      alreadyCorrected: false,
    });
    expect(outcome.source).toBe("none");
  });

  it("builds a fallback request", () => {
    const request = buildFallbackDispatchRequest("${zh.doPay}");
    expect(request.targetBotId).toBe("product");
    expect(request.instruction).toContain("${zh.fallback}");
  });
});
`,
  "utf8",
);

writeFileSync(
  join(root, "packages/runtime/src/services/product-spec-submission.test.ts"),
  `import { describe, expect, it } from "vitest";
import {
  looksLikeProductDelivery,
  resolveProductSpecSubmission,
  tryRecoverProductSpecFromAnswer,
} from "./product-spec-submission.js";

describe("product-spec-submission", () => {
  it("recovers a local path from prose", () => {
    const request = tryRecoverProductSpecFromAnswer(
      "${zh.specWritten}",
    );
    expect(request?.deliveryMode).toBe("local");
    if (request?.deliveryMode === "local") {
      expect(request.specPath).toBe("docs/product-spec.md");
      expect(request.ticketsPath).toBe("docs/product-spec.md");
    }
  });

  it("prefers the tool call over prose recovery", () => {
    const resolved = resolveProductSpecSubmission({
      content: "${zh.specOther}",
      toolCalls: [
        {
          name: "request_spec_approval",
          input: {
            deliveryMode: "local",
            title: "${zh.plan}",
            summary: "${zh.summary}",
            specPath: "docs/product-spec.md",
            ticketsPath: "docs/product-spec.md",
          },
        },
      ],
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.source).toBe("tool");
      if (resolved.request.deliveryMode === "local") {
        expect(resolved.request.specPath).toBe("docs/product-spec.md");
      }
    }
  });

  it("marks missing submission when delivery looks done but has no path", () => {
    const content = "${zh.missingDelivery}";
    expect(looksLikeProductDelivery(content)).toBe(true);
    const resolved = resolveProductSpecSubmission({ content });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.reason).toBe("missing");
  });
});
`,
  "utf8",
);

console.log("wrote schedule/bot-prompt/team-leader/product-spec tests");
