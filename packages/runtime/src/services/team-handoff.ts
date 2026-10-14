import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatMessage, DispatchTaskRequest } from "@ml-aos/shared";
import { findDispatchTaskRequest } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";
import type { BotRunService, BotRunSettled } from "./bot-run-service.js";
import type { BotService } from "./bot-service.js";
import type { ChatEvent } from "./chat-service.js";
import type { AppControl } from "./app-control.js";
import { resolveTeamLeaderDispatch } from "./team-leader-guard.js";

/**
 * agent-os isomorphic handoff:
 * - Dispatch only via dispatch_task (or CEO guard fallback).
 * - Workers always report back to CEO; CEO decides next dispatch_task.
 * - No system auto developer→tester→reviewer chain.
 */
export class TeamHandoff {
  constructor(
    private readonly store: JsonStore,
    private readonly bots: BotService,
    private readonly botRun: BotRunService,
    private readonly emit?: (event: ChatEvent) => void,
    private readonly control?: AppControl,
  ) {}

  async handle(info: BotRunSettled): Promise<void> {
    if (this.botRun.isDiscarded(info.req.topicId)) return;
    if (await this.control?.handle(info)) return;
    if (!info.result.ok || info.result.clarificationPending) return;

    const role = info.bot.role.toLowerCase();
    const content = await this.messageContent(info.result.messageId);
    const inCollaboration =
      info.req.origin === "handoff" || info.req.origin === "resume";

    // CEO team-leader-guard (agent-os): tool → correction → fallback.
    // inCollaboration only for report-back (origin=handoff/resume), NOT ticket kickoff.
    if (role === "ceo") {
      const defaultTargetBotId = await this.defaultDispatchTarget(
        info.req.topicId,
      );
      const outcome = resolveTeamLeaderDispatch({
        role,
        inCollaboration,
        taskText: info.req.prompt,
        answer: content,
        toolCalls: info.result.toolCalls,
        alreadyCorrected: info.req.origin === "correction",
        defaultTargetBotId,
      });

      if (outcome.source === "retry" && outcome.correctionPrompt) {
        await this.note(
          info.req.topicId,
          "CEO 未实际调用 dispatch_task，正在开新会话纠正（对齐 agent-os team-leader-guard）。",
        );
        await this.botRun.start({
          topicId: info.req.topicId,
          botId: info.bot.id,
          origin: "correction",
          clearSession: true,
          prompt: outcome.correctionPrompt,
        });
        return;
      }

      if (outcome.request) {
        if (outcome.source === "fallback") {
          await this.note(
            info.req.topicId,
            `CEO 纠正后仍未调用 dispatch_task，系统兜底派发给 ${outcome.request.targetBotId}。`,
          );
        }
        await this.dispatchFromRequest(info.req.topicId, info.bot, outcome.request);
        return;
      }

      // Collaboration report-back with no further dispatch = final summary turn.
      return;
    }

    // Workers (and product after non-gated work): report back to CEO.
    if (
      info.req.origin === "handoff" &&
      (role === "developer" ||
        role === "tester" ||
        role === "reviewer" ||
        role === "product")
    ) {
      // Product normally stops on clarification/spec cards (handled above).
      // If product finished without a gate, still report to CEO.
      await this.reportToCeo(info, content);
    }
  }

  private async dispatchFromRequest(
    topicId: string,
    from: { id: string; name: string },
    request: DispatchTaskRequest,
  ): Promise<void> {
    await this.control?.dispatchTask(topicId, from, request);
  }

  /**
   * Prefer product, else developer among enabled bots.
   * When the topic has a Gitee Cast, only pick roles in that Cast (skip ceo).
   */
  private async defaultDispatchTarget(topicId: string): Promise<string> {
    const list = await this.bots.list();
    const enabled = list.filter((b) => b.enabled);
    const cast = await this.topicCast(topicId);
    const pool =
      cast && cast.length > 0
        ? enabled.filter((bot) =>
            cast.some(
              (token) =>
                token === bot.id ||
                token.toLowerCase() === bot.role.toLowerCase(),
            ),
          )
        : enabled;
    for (const preferred of ["product", "developer", "tester", "reviewer"]) {
      const hit = pool.find((bot) => bot.role.toLowerCase() === preferred);
      if (hit) return hit.role.toLowerCase();
    }
    const other = pool.find((bot) => bot.role.toLowerCase() !== "ceo");
    if (other) return other.id;
    if (enabled.some((bot) => bot.role.toLowerCase() === "product")) {
      return "product";
    }
    if (enabled.some((bot) => bot.role.toLowerCase() === "developer")) {
      return "developer";
    }
    return "product";
  }

  private async topicCast(topicId: string): Promise<string[] | null> {
    try {
      const raw = await readFile(
        join(this.store.getDir(), "gitee-dispatches.json"),
        "utf-8",
      );
      const parsed = JSON.parse(raw) as {
        byIssueId?: Record<string, { topicId?: string; cast?: string[] }>;
      };
      for (const row of Object.values(parsed.byIssueId ?? {})) {
        if (row.topicId === topicId && Array.isArray(row.cast)) {
          return row.cast;
        }
      }
    } catch {
      // no dispatch file / parse error → unconstrained
    }
    return null;
  }

  private async reportToCeo(
    info: BotRunSettled,
    content: string,
  ): Promise<void> {
    const list = await this.bots.list();
    const ceo = list.find((b) => b.enabled && b.role.toLowerCase() === "ceo");
    if (!ceo) {
      await this.note(info.req.topicId, "未找到已启用的 CEO 助理，无法交回结果。");
      return;
    }
    const project = await this.projectName(info.req.topicId);
    await this.note(
      info.req.topicId,
      `${info.bot.name} 已完成，结果交回 ${ceo.name}。`,
      {
        fromName: info.bot.name,
        toName: ceo.name,
        objective: "根据这份结果决定下一步",
        instruction: content.slice(0, 500),
        expectedOutput:
          "需要时调用 dispatch_task 继续派发；已可交付则向用户简短汇总",
        project,
        reportToName: ceo.name,
      },
    );
    await this.botRun.start({
      topicId: info.req.topicId,
      botId: ceo.id,
      origin: "handoff",
      prompt: [
        `${info.bot.name} 已完成当前协作任务，结果交回给你。`,
        `结果：\n${content.slice(0, 1600)}`,
        "请基于这份结果继续组织后续工作：仍需其他成员时必须调用 dispatch_task；已经可以交付时，用一两句话向用户汇总结论。不要自己写代码，不要长篇分析仓库。",
      ].join("\n\n"),
    });
  }

  private async messageContent(messageId: string): Promise<string> {
    const state = await this.store.load();
    return state.messages.find((m) => m.id === messageId)?.content ?? "";
  }

  private async projectName(topicId: string): Promise<string> {
    const state = await this.store.load();
    const topic = state.topics.find((t) => t.id === topicId);
    const workspace = state.workspaces.find((w) => w.id === topic?.workspaceId);
    return workspace?.name ?? "当前工作区";
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
    let saved = false;
    await this.store.transact((state) => {
      if (!state.topics.some((t) => t.id === topicId)) return;
      state.messages.push(message);
      saved = true;
    });
    if (saved) this.emit?.({ type: "message.upsert", message });
  }
}

/** Re-export for tests that inspect tool-only path. */
export { findDispatchTaskRequest };
