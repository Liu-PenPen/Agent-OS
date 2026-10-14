import { describe, expect, it } from "vitest";
import {
  looksLikeProductDelivery,
  resolveProductSpecSubmission,
  tryRecoverProductSpecFromAnswer,
} from "./product-spec-submission.js";

describe("product-spec-submission", () => {
  it("recovers a local path from prose", () => {
    const request = tryRecoverProductSpecFromAnswer(
      "规格已写入 docs/product-spec.md，包含 Tickets。",
    );
    expect(request?.deliveryMode).toBe("local");
    if (request?.deliveryMode === "local") {
      expect(request.specPath).toBe("docs/product-spec.md");
      expect(request.ticketsPath).toBe("docs/product-spec.md");
    }
  });

  it("prefers the tool call over prose recovery", () => {
    const resolved = resolveProductSpecSubmission({
      content: "规格已写入 docs/other.md",
      toolCalls: [
        {
          name: "request_spec_approval",
          input: {
            deliveryMode: "local",
            title: "方案",
            summary: "摘要",
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
    const content = "产品规格和 Tickets、验收标准都已经整理好了，请你查看摘要并确认是否可以进入下一阶段。";
    expect(looksLikeProductDelivery(content)).toBe(true);
    const resolved = resolveProductSpecSubmission({ content });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.reason).toBe("missing");
  });
});
