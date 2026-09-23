import { z } from "zod";
import { normalizeToolName, type ToolCallRecord } from "./app-tools.js";

export const AcceptanceCheckSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  status: z.enum(["pass", "fail", "skip"]),
  detail: z.string().trim().max(1000).optional(),
});

export const AcceptanceEvidenceSchema = z.object({
  kind: z.enum(["screenshot", "note", "url"]),
  path: z.string().trim().max(500).optional(),
  text: z.string().trim().max(2000).optional(),
  url: z.string().trim().max(500).optional(),
});

export const AcceptanceSubmissionSchema = z
  .object({
    verdict: z.enum(["pass", "fail", "skip"]),
    summary: z.string().trim().min(1).max(500),
    checks: z.array(AcceptanceCheckSchema).max(40).default([]),
    evidence: z.array(AcceptanceEvidenceSchema).max(20).default([]),
    baseURL: z.string().trim().max(300).optional(),
    viewport: z.string().trim().max(40).optional(),
    source: z
      .enum(["agent-browser", "playwright", "manual", "skip"])
      .default("agent-browser"),
    skipReason: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.verdict === "skip" && !value.skipReason?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "verdict=skip 时必须提供 skipReason",
        path: ["skipReason"],
      });
    }
    if (value.verdict === "fail" && value.checks.every((c) => c.status !== "fail")) {
      // soft: allow fail without check items, but encourage checks
    }
  });

export type AcceptanceSubmission = z.infer<typeof AcceptanceSubmissionSchema>;
export type AcceptanceCheck = z.infer<typeof AcceptanceCheckSchema>;
export type AcceptanceEvidence = z.infer<typeof AcceptanceEvidenceSchema>;

export type AcceptanceResult = AcceptanceSubmission & {
  id: string;
  topicId: string;
  botId?: string;
  workspacePath?: string;
  at: string;
  suitePath?: string;
  reportPath?: string;
};

export function findAcceptanceSubmission(
  toolCalls: ToolCallRecord[] | undefined,
): AcceptanceSubmission | undefined {
  const calls = toolCalls ?? [];
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const call = calls[index];
    if (!call || normalizeToolName(call.name) !== "submit_acceptance") continue;
    const parsed = AcceptanceSubmissionSchema.safeParse(call.input);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

export function formatAcceptanceSummary(result: AcceptanceResult): string {
  const checks = result.checks
    .map((c) => `- [${c.status}] ${c.title}${c.detail ? ` — ${c.detail}` : ""}`)
    .join("\n");
  const lines = [
    `验收结论：${result.verdict.toUpperCase()}`,
    result.summary,
    result.skipReason ? `跳过原因：${result.skipReason}` : "",
    result.baseURL ? `baseURL：${result.baseURL}` : "",
    checks ? `检查点：\n${checks}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
