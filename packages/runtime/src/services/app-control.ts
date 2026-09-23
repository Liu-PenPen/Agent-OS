import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  AcceptanceResult,
  ChatMessage,
  ProductSpecRequest,
} from "@ml-aos/shared";
import {
  calledScheduleManage,
  clarificationToMarkdown,
  findAcceptanceSubmission,
  findApprovalRequest,
  findClarificationRequest,
  findDispatchTaskRequest,
  findProductSpecRequest,
  formatAcceptanceSummary,
  formatApprovalDecision,
  formatClarificationResume,
  formatSpecDecision,
  looksLikeReviewFailure,
  looksLikeTestFailure,
  normalizeToolName,
} from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";
import type { BotRunService, BotRunSettled } from "./bot-run-service.js";
import type { BotService } from "./bot-service.js";
import type { ChatEvent } from "./chat-service.js";
import { copyScreenshot, findLatestScreenshot } from "./visual-check.js";
import {
  missingSpecSubmissionPrompt,
  resolveProductSpecSubmission,
} from "./product-spec-submission.js";
import type { AcceptanceService } from "./acceptance-service.js";
import type { AcceptanceRunner } from "./acceptance-runner.js";

const MAX_BOUNCES = 2;

export interface StageInspection {
  pipelineId: string;
  topicId: string;
  stage: "developing" | "testing" | "reviewing";
  botId: string;
  excerpt: string;
  workspacePath: string;
}

export interface PipelineGate {
  continueAfterHuman(topicId: string): Promise<void>;
  rewindToDeveloper(pipelineId: string, evidence: string): Promise<void>;
}

export interface ControlDecision {
  token: string;
  action: "clarification" | "spec" | "approval" | "visual";
  answer?: string;
  decision?: "approved" | "rejected" | "false_positive" | "confirmed";
}

export class AppControl {
  private pipeline: PipelineGate | undefined;
  private acceptance: AcceptanceService | undefined;
  private runner: AcceptanceRunner | undefined;
  private bounces = new Map<string, number>();

  constructor(
    private readonly store: JsonStore,
    private readonly bots: BotService,
    private readonly botRun: BotRunService,
    private readonly dataDir: string,
    private readonly emit?: (event: ChatEvent) => void,
  ) {}

  attachPipeline(pipeline: PipelineGate): void {
    this.pipeline = pipeline;
  }

  attachAcceptance(
    acceptance: AcceptanceService,
    runner: AcceptanceRunner,
  ): void {
    this.acceptance = acceptance;
    this.runner = runner;
  }

  /** True when this run is consumed by a tool or a human gate. */
  async handle(info: BotRunSettled): Promise<boolean> {
    const tools = info.result.toolCalls ?? [];
    const clarification = findClarificationRequest(tools);
    if (clarification) {
      await this.postCard(info.req.topicId, info.bot.id, {
        tool: "clarification",
        title: clarification.title,
        summary: clarification.intro,
        content: clarificationToMarkdown(clarification),
        questions: clarification.questions.map((question) => ({
          id: question.id,
          prompt: question.prompt,
          options: question.options.map((option) => ({
            id: option.id,
            label: option.label,
            recommended: option.id === question.recommendedOptionId,
          })),
        })),
        channel: "team",
      });
      await this.mention(info.req.topicId, info.bot.id, clarification.questions.length);
      return true;
    }

    const spec = findProductSpecRequest(tools);
    if (spec) {
      await this.postSpecCard(info.req.topicId, info.bot.id, spec);
      return true;
    }

    const approval = findApprovalRequest(tools);
    if (approval) {
      await this.postCard(info.req.topicId, info.bot.id, {
        tool: "approval",
        title: approval.operation,
        summary: approval.detail,
        detail: approval.impact,
        operation: approval.operation,
        impact: approval.impact,
        rollback: approval.rollback,
        content: `高危操作待审批：${approval.operation}`,
        channel: "team",
      });
      return true;
    }

    const acceptanceSubmission = findAcceptanceSubmission(tools);
    if (acceptanceSubmission && this.acceptance) {
      const workspacePath = await this.workspacePath(info.req.topicId);
      const result = await this.acceptance.save({
        topicId: info.req.topicId,
        botId: info.bot.id,
        workspacePath,
        submission: acceptanceSubmission,
      });
      await this.postAcceptanceCard(info.req.topicId, info.bot.id, result);
      if (result.verdict === "fail") {
        await this.openVisual({
          topicId: info.req.topicId,
          botId: info.bot.id,
          excerpt: formatAcceptanceSummary(result),
          channel: "team",
        });
        return true;
      }
      // pass / skip：仍交回 CEO（return false）
      return false;
    }

    const ranSuiteCall = [...tools]
      .reverse()
      .find((call) => normalizeToolName(call.name) === "run_acceptance_suite");
    if (ranSuiteCall && this.acceptance && this.runner) {
      const workspacePath = await this.workspacePath(info.req.topicId);
      if (!workspacePath) {
        await this.note(info.req.topicId, "无法跑验收套件：话题未绑定工作区。");
        return true;
      }
      const env = await this.acceptance.resolveTestEnv(workspacePath);
      const toolBaseURL =
        ranSuiteCall.input &&
        typeof ranSuiteCall.input === "object" &&
        typeof (ranSuiteCall.input as { baseURL?: unknown }).baseURL === "string"
          ? (ranSuiteCall.input as { baseURL: string }).baseURL.trim()
          : undefined;
      try {
        const result = await this.runner.run({
          topicId: info.req.topicId,
          botId: info.bot.id,
          workspacePath,
          baseURL: toolBaseURL || env.testBaseUrl,
        });
        await this.postAcceptanceCard(info.req.topicId, info.bot.id, result);
        if (result.verdict === "fail") {
          await this.openVisual({
            topicId: info.req.topicId,
            botId: info.bot.id,
            excerpt: formatAcceptanceSummary(result),
            channel: "team",
          });
          return true;
        }
        return false;
      } catch (error) {
        await this.note(
          info.req.topicId,
          error instanceof Error ? error.message : "验收套件执行失败",
        );
        return true;
      }
    }

    const dispatch = findDispatchTaskRequest(tools);
    if (dispatch) {
      if (info.bot.role.toLowerCase() !== "ceo") {
        await this.note(info.req.topicId, "只有 CEO 助理可以调用 dispatch_task。");
        return true;
      }
      await this.dispatchTo(info.req.topicId, info.bot, dispatch);
      return true;
    }

    if (calledScheduleManage(tools)) return true;
    if (!info.result.ok) return false;

    const content = await this.messageContent(info.result.messageId);
    const role = info.bot.role.toLowerCase();

    // agent-os ensureProductSpecSubmission: product must submit a confirm card.
    if (role === "product") {
      const submission = resolveProductSpecSubmission({
        toolCalls: tools,
        content,
      });
      if (submission.ok) {
        await this.postSpecCard(info.req.topicId, info.bot.id, submission.request);
        if (submission.source === "answer") {
          await this.note(
            info.req.topicId,
            "产品经理未调用 request_spec_approval，已从回复路径恢复待确认方案卡。请先确认后再进入开发。",
          );
        }
        return true;
      }
      if (submission.reason === "missing") {
        if (info.req.origin === "correction") {
          await this.note(
            info.req.topicId,
            "产品方案已整理，但产品经理仍未调用 request_spec_approval。流程已停下，请再次 @产品经理 要求提交确认卡。",
          );
          return true;
        }
        await this.note(
          info.req.topicId,
          "产品方案疑似已写完，但未调用 request_spec_approval。正在开新会话纠正（对齐 agent-os）。",
        );
        await this.botRun.start({
          topicId: info.req.topicId,
          botId: info.bot.id,
          origin: "correction",
          clearSession: true,
          prompt: missingSpecSubmissionPrompt(),
        });
        return true;
      }
    }

    if (
      role === "product" &&
      /问题\s*\d+|选项\s*[A-Za-z0-9]|请选择|关键决策|未决决策/.test(content)
    ) {
      await this.note(
        info.req.topicId,
        "产品经理在正文里写了选项，但没有调用 request_clarification，所以不会出现可点选卡片。请再次 @产品经理，要求用工具提交确认卡；或在输入框直接回复例如 1-A、2-A。",
      );
      return true;
    }

    if (role === "tester") {
      if (looksLikeTestFailure(content)) {
        await this.openVisual({
          topicId: info.req.topicId,
          botId: info.bot.id,
          excerpt: content,
          channel: "team",
        });
        return true;
      }
      if (info.req.origin === "correction") {
        await this.note(
          info.req.topicId,
          "测试工程师仍未调用 submit_acceptance。流程已停下，请再次派测或手动提交验收结果。",
        );
        return true;
      }
      // chat / handoff / resume：缺结构化结果则纠正（ADR-A1）
      await this.note(
        info.req.topicId,
        "测试结论缺少 submit_acceptance。正在开新会话纠正。",
      );
      await this.botRun.start({
        topicId: info.req.topicId,
        botId: info.bot.id,
        origin: "correction",
        clearSession: true,
        prompt: [
          "你刚才的验收没有调用 MCP 工具 submit_acceptance。",
          "请根据已做的检查，立即调用 submit_acceptance 提交结构化结果（verdict/summary/checks/evidence）。",
          "无 UI 可用 verdict=skip 并写 skipReason。调用后停止。",
        ].join("\n"),
      });
      return true;
    }

    if (role === "reviewer" && looksLikeReviewFailure(content)) {
      await this.bounceDeveloper(info.req.topicId, content);
      return true;
    }
    return false;
  }

  private async postAcceptanceCard(
    topicId: string,
    botId: string,
    result: AcceptanceResult,
  ): Promise<void> {
    const checks = result.checks
      .map((c) => `[${c.status}] ${c.title}`)
      .join("；");
    await this.postCard(topicId, botId, {
      tool: "acceptance",
      title: `验收 ${result.verdict.toUpperCase()}`,
      summary: result.summary,
      detail: [
        result.skipReason ? `跳过：${result.skipReason}` : "",
        result.baseURL ? `baseURL：${result.baseURL}` : "",
        checks ? `检查点：${checks}` : "",
        `来源：${result.source}`,
      ]
        .filter(Boolean)
        .join("\n"),
      content: formatAcceptanceSummary(result),
      channel: "team",
      acceptanceId: result.id,
      acceptanceVerdict: result.verdict,
      cardStatus: "done",
    });
  }

  private async postSpecCard(
    topicId: string,
    botId: string,
    spec: ProductSpecRequest,
  ): Promise<void> {
    const where =
      spec.deliveryMode === "local"
        ? `${spec.specPath} · ${spec.ticketsPath}`
        : spec.documentUrl;
    await this.postCard(topicId, botId, {
      tool: "spec",
      title: spec.title,
      summary: spec.summary,
      detail: where,
      specPath: spec.deliveryMode === "local" ? spec.specPath : undefined,
      ticketsPath: spec.deliveryMode === "local" ? spec.ticketsPath : undefined,
      documentUrl: spec.deliveryMode === "lark-doc" ? spec.documentUrl : undefined,
      content: `产品方案待确认：${spec.title}`,
      channel: "team",
    });
  }

  async inspectStage(input: StageInspection): Promise<"continue" | "pause" | "bounce" | "block"> {
    if (input.stage === "testing" && looksLikeTestFailure(input.excerpt)) {
      await this.openVisual({
        topicId: input.topicId,
        botId: input.botId,
        excerpt: input.excerpt,
        channel: "pipeline",
        pipelineId: input.pipelineId,
        workspacePath: input.workspacePath,
      });
      return "pause";
    }
    if (input.stage === "reviewing" && looksLikeReviewFailure(input.excerpt)) {
      const count = (this.bounces.get(input.pipelineId) ?? 0) + 1;
      this.bounces.set(input.pipelineId, count);
      if (count > MAX_BOUNCES) return "block";
      return "bounce";
    }
    return "continue";
  }

  async answer(topicId: string, decision: ControlDecision): Promise<void> {
    const message = await this.takePending(topicId, decision.token);
    if (!message?.appTool || !message.botId) {
      throw new Error("control card not found");
    }
    const tool = message.appTool;
    if (decision.action === "clarification") {
      const answer = decision.answer?.trim();
      if (!answer) throw new Error("answer is required");
      await this.resume(topicId, message.botId, formatClarificationResume(answer));
      return;
    }
    if (decision.action === "spec") {
      const approved = decision.decision === "approved";
      const prompt = formatSpecDecision(approved, {
        title: tool.title ?? "产品方案",
        summary: tool.summary ?? "",
      });
      if (!approved) {
        await this.resume(topicId, message.botId, prompt);
        return;
      }
      // agent-os: confirm card returns to CEO; CEO must dispatch_task → developer.
      const ceo = await this.botByRole("ceo");
      if (!ceo) throw new Error("未找到 CEO 助理");
      const paths = [
        tool.specPath ? `规格：${tool.specPath}` : "",
        tool.ticketsPath ? `任务：${tool.ticketsPath}` : "",
        tool.documentUrl ? `文档：${tool.documentUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      await this.note(
        topicId,
        `用户已确认产品方案「${tool.title ?? "产品方案"}」，结果交回 ${ceo.name} 继续派发。`,
      );
      await this.botRun.start({
        topicId,
        botId: ceo.id,
        origin: "handoff",
        prompt: [
          prompt,
          paths,
          "必须调用 dispatch_task，targetBotId=developer。不要自己写代码。",
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
      return;
    }
    if (decision.action === "approval") {
      const approved = decision.decision === "approved";
      await this.resume(
        topicId,
        message.botId,
        formatApprovalDecision({
          approved,
          operation: tool.operation ?? tool.title ?? "操作",
          detail: tool.summary ?? "",
        }),
      );
      return;
    }
    if (decision.action === "visual") {
      const confirmed = decision.decision === "confirmed";
      if (tool.channel === "pipeline" && tool.pipelineId && this.pipeline) {
        if (confirmed) {
          await this.pipeline.rewindToDeveloper(tool.pipelineId, tool.detail ?? tool.summary ?? "");
        } else {
          await this.pipeline.continueAfterHuman(topicId);
        }
        return;
      }
      if (confirmed) {
        await this.bounceDeveloper(topicId, tool.detail ?? tool.summary ?? "测试未通过");
      } else {
        await this.dispatchRole(topicId, "reviewer", "人工判定测试失败为误判，请继续审查。", tool.summary ?? "");
      }
      return;
    }
    throw new Error("unknown control action");
  }

  private async openVisual(input: {
    topicId: string;
    botId: string;
    excerpt: string;
    channel: "team" | "pipeline";
    pipelineId?: string;
    workspacePath?: string;
  }): Promise<void> {
    let imageUrl: string | undefined;
    const workspace = input.workspacePath ?? (await this.workspacePath(input.topicId));
    if (workspace) {
      const shot = await findLatestScreenshot(workspace);
      if (shot) {
        const name = await copyScreenshot(shot, join(this.dataDir, "media"));
        imageUrl = `/api/media/${name}`;
      }
    }
    await this.postCard(input.topicId, input.botId, {
      tool: "visual",
      title: "视觉验收",
      summary: input.excerpt.slice(0, 500),
      detail: input.excerpt.slice(0, 1500),
      imageUrl,
      content: "测试未通过，需要你判定是误判还是缺陷。",
      channel: input.channel,
      pipelineId: input.pipelineId,
    });
  }

  private async bounceDeveloper(topicId: string, evidence: string): Promise<void> {
    const count = (this.bounces.get(topicId) ?? 0) + 1;
    this.bounces.set(topicId, count);
    if (count > MAX_BOUNCES) {
      await this.note(topicId, "打回开发已达 2 次，流程停在这里，请人工处理。");
      return;
    }
    await this.note(topicId, `打回开发（第 ${count} 次）。`);
    await this.dispatchRole(
      topicId,
      "developer",
      "审查或测试未通过，请只修复下面的证据，不要扩大改动。",
      evidence,
    );
  }

  private async dispatchRole(
    topicId: string,
    role: string,
    objective: string,
    evidence: string,
  ): Promise<void> {
    const bot = await this.botByRole(role);
    if (!bot) {
      await this.note(topicId, `未找到已启用的成员（role=${role}）。`);
      return;
    }
    await this.botRun.start({
      topicId,
      botId: bot.id,
      origin: "handoff",
      prompt: [objective, evidence.slice(0, 1600)].join("\n\n"),
    });
  }

  /** Public entry used by TeamHandoff (tool + CEO guard fallback). */
  async dispatchTask(
    topicId: string,
    from: { id: string; name: string },
    request: {
      targetBotId: string;
      objective: string;
      instruction: string;
      expectedOutput?: string;
    },
  ): Promise<void> {
    await this.dispatchTo(topicId, from, request);
  }

  private async dispatchTo(
    topicId: string,
    from: { id: string; name: string },
    request: {
      targetBotId: string;
      objective: string;
      instruction: string;
      expectedOutput?: string;
    },
  ): Promise<void> {
    const target = await this.botByRoleOrId(request.targetBotId);
    if (!target || target.id === from.id) {
      await this.note(topicId, `无法派发给 ${request.targetBotId}。`);
      return;
    }
    const project = await this.projectName(topicId);
    await this.note(
      topicId,
      `${from.name} 已派给 ${target.name}。`,
      {
        fromName: from.name,
        toName: target.name,
        objective: request.objective,
        instruction: request.instruction,
        expectedOutput: request.expectedOutput,
        project,
        reportToName: from.name,
      },
    );
    await this.botRun.start({
      topicId,
      botId: target.id,
      origin: "handoff",
      prompt: [
        `来自 ${from.name} 的派发（dispatch_task）。完成后结果会交回 ${from.name}。`,
        `协作目标：${request.objective}`,
        `执行要求：${request.instruction}`,
        request.expectedOutput ? `期望产出：${request.expectedOutput}` : "",
        target.role.toLowerCase() === "tester"
          ? await this.testerAcceptanceExtras(topicId)
          : "",
        "完成本阶段后停止。不要把任务交给下一位；由调度者继续组织。",
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
  }

  private async testerAcceptanceExtras(topicId: string): Promise<string> {
    if (!this.acceptance) {
      return [
        "—— 验收门禁 ——",
        "结束后必须调用 submit_acceptance 提交结构化结果。",
      ].join("\n");
    }
    const path = await this.workspacePath(topicId);
    const env = await this.acceptance.resolveTestEnv(path);
    return this.acceptance.formatTesterPromptExtras(env);
  }

  private async projectName(topicId: string): Promise<string> {
    const state = await this.store.load();
    const topic = state.topics.find((item) => item.id === topicId);
    return (
      state.workspaces.find((item) => item.id === topic?.workspaceId)?.name ??
      "当前工作区"
    );
  }

  private async resume(topicId: string, botId: string, prompt: string): Promise<void> {
    await this.botRun.start({
      topicId,
      botId,
      origin: "resume",
      prompt,
    });
  }

  private async postCard(
    topicId: string,
    botId: string,
    input: Omit<NonNullable<ChatMessage["appTool"]>, "token" | "status"> & {
      content: string;
      cardStatus?: "pending" | "done";
    },
  ): Promise<void> {
    const { content, cardStatus, ...tool } = input;
    const message: ChatMessage = {
      id: randomUUID(),
      topicId,
      author: "bot",
      botId,
      kind: "app-tool",
      content,
      createdAt: new Date().toISOString(),
      appTool: {
        ...tool,
        token: randomUUID(),
        status: cardStatus ?? "pending",
      },
    };
    await this.saveMessage(message);
  }

  private async mention(topicId: string, botId: string, count: number): Promise<void> {
    const message: ChatMessage = {
      id: randomUUID(),
      topicId,
      author: "bot",
      botId,
      kind: "mention",
      content: `@我 需要你确认 ${count} 个问题，请在上方卡片中选择。`,
      createdAt: new Date().toISOString(),
    };
    await this.saveMessage(message);
  }

  private async note(
    topicId: string,
    content: string,
    dispatch?: ChatMessage["dispatch"],
  ): Promise<void> {
    const message: ChatMessage = {
      id: randomUUID(),
      topicId,
      author: "system",
      content,
      createdAt: new Date().toISOString(),
      ...(dispatch ? { kind: "dispatch" as const, dispatch } : {}),
    };
    await this.saveMessage(message);
  }

  private async saveMessage(message: ChatMessage): Promise<void> {
    let saved = false;
    await this.store.transact((state) => {
      if (!state.topics.some((topic) => topic.id === message.topicId)) return;
      state.messages.push(message);
      saved = true;
    });
    if (saved) this.emit?.({ type: "message.upsert", message });
  }

  private async takePending(topicId: string, token: string): Promise<ChatMessage | undefined> {
    let found: ChatMessage | undefined;
    await this.store.transact((state) => {
      const message = state.messages.find(
        (item) =>
          item.topicId === topicId &&
          item.appTool?.token === token &&
          item.appTool.status === "pending",
      );
      if (!message?.appTool) return;
      message.appTool.status = "done";
      found = message;
    });
    if (found) this.emit?.({ type: "message.upsert", message: found });
    return found;
  }

  private async messageContent(messageId: string): Promise<string> {
    const state = await this.store.load();
    return state.messages.find((message) => message.id === messageId)?.content ?? "";
  }

  private async workspacePath(topicId: string): Promise<string | undefined> {
    const state = await this.store.load();
    const topic = state.topics.find((item) => item.id === topicId);
    return state.workspaces.find((item) => item.id === topic?.workspaceId)?.localPath;
  }

  private async botByRole(role: string) {
    const list = await this.bots.list();
    return list.find((bot) => bot.enabled && bot.role.toLowerCase() === role.toLowerCase());
  }

  private async botByRoleOrId(target: string) {
    const list = await this.bots.list();
    return list.find(
      (bot) =>
        bot.enabled &&
        (bot.id === target || bot.role.toLowerCase() === target.toLowerCase()),
    );
  }
}
