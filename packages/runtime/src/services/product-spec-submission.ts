import {
  findProductSpecRequest,
  ProductSpecRequestSchema,
  type ProductSpecRequest,
} from "@ml-aos/shared";

export type ToolCallRecord = { name: string; input?: unknown };

/** Product reply looks like a written spec, not an open clarification. */
export function looksLikeProductDelivery(content: string): boolean {
  const text = content.trim();
  if (text.length < 40) return false;
  if (
    /请直接回复|请选择|关键决策|问题 \d|问题\d/.test(text) &&
    !/已写入|已更新/.test(text)
  ) {
    return false;
  }
  const hasArtifact =
    /product-spec|docs\/|\.md\b|Tickets|验收标准|规格|document\.url/i.test(text);
  if (!hasArtifact) return false;
  const questions = (text.match(/[？?]/g) ?? []).length;
  if (
    questions >= 2 &&
    !/docs\/|product-spec|\.md\b|document\.url/i.test(text)
  ) {
    return false;
  }
  return true;
}

/** Recover a local product-spec card when the model wrote paths but skipped the tool. */
export function tryRecoverProductSpecFromAnswer(
  answer: string,
): ProductSpecRequest | undefined {
  const docxMatch = answer.match(
    /https?:\/\/[^\s)\]"'<>]+\/docx\/[A-Za-z0-9_-]+/i,
  );
  if (docxMatch) {
    const documentUrl = docxMatch[0].replace(/[.,;:]+$/u, "");
    const parsed = ProductSpecRequestSchema.safeParse({
      deliveryMode: "lark-doc",
      title: guessTitle(answer) ?? "产品方案",
      summary: guessSummary(answer),
      documentUrl,
    });
    if (parsed.success) return parsed.data;
  }

  const path =
    answer.match(/(docs\/[^\s`'"]+\.md)/i)?.[1] ??
    answer.match(/([^\s`'"]*product-spec\.md)/i)?.[1];
  if (!path) return undefined;

  const ticketsPath =
    answer.match(/(docs\/[^\s`'"]*tickets[^\s`'"]*\.md)/i)?.[1] ??
    answer.match(/(docs\/[^\s`'"]*tickets[^\s`'"]*)/i)?.[1] ??
    path;

  const parsed = ProductSpecRequestSchema.safeParse({
    deliveryMode: "local",
    title: guessTitle(answer) ?? "产品方案",
    summary: guessSummary(answer),
    specPath: path,
    ticketsPath,
  });
  return parsed.success ? parsed.data : undefined;
}

export function missingSpecSubmissionPrompt(): string {
  return [
    "上一轮已经完成产品方案整理，但没有完成 Agent OS 的结构化提交。",
    "不要重新创建文档，也不要继续解释或改代码。请沿用上一轮已经生成的唯一产物。",
    "必须实际调用 MCP 工具 request_spec_approval（server=agent_os），deliveryMode=local，提交 specPath 与 ticketsPath（同一文件可填两次）。",
    "在 Codex 中若工具列表没有直接显示它，先调用 tool_search 搜索 request_spec_approval / agent_os，加载后再调用。",
    "工具调用成功后立即结束本轮，等待用户在确认卡上批准。禁止把任务交给开发。",
  ].join("\n\n");
}

export function resolveProductSpecSubmission(input: {
  toolCalls?: ToolCallRecord[];
  content: string;
}):
  | { ok: true; request: ProductSpecRequest; source: "tool" | "answer" }
  | { ok: false; reason: "missing" | "not_delivery" } {
  const fromTool = findProductSpecRequest(input.toolCalls);
  if (fromTool) {
    return { ok: true, request: fromTool, source: "tool" };
  }
  if (!looksLikeProductDelivery(input.content)) {
    return { ok: false, reason: "not_delivery" };
  }
  const fromAnswer = tryRecoverProductSpecFromAnswer(input.content);
  if (fromAnswer) {
    return { ok: true, request: fromAnswer, source: "answer" };
  }
  return { ok: false, reason: "missing" };
}

function guessTitle(answer: string): string | undefined {
  const match = answer.match(/(?:标题|title)[：:\s]*([^\n]{2,80})/i);
  return match?.[1]?.trim();
}

function guessSummary(answer: string): string {
  const match = answer.match(/(?:摘要|summary)[：:\s]*([^\n]{2,500})/i);
  if (match?.[1]) return match[1].trim().slice(0, 500);
  const compact = answer.replace(/\s+/g, " ").trim();
  return (compact.slice(0, 200) || "产品方案已整理，请确认。").slice(0, 500);
}
