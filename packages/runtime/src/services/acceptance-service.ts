import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  AcceptanceResult,
  AcceptanceSubmission,
} from "@ml-aos/shared";
import { AcceptanceSubmissionSchema } from "@ml-aos/shared";
import type { GiteeProjectsStore } from "../gitee/projects.js";

export type ProjectTestEnv = {
  testBaseUrl?: string;
  testStartCommand?: string;
  localPath?: string;
  projectName?: string;
};

export class AcceptanceService {
  constructor(
    private readonly dataDir: string,
    private readonly projects?: GiteeProjectsStore,
  ) {}

  private topicDir(topicId: string): string {
    return join(this.dataDir, "acceptance", topicId);
  }

  async save(input: {
    topicId: string;
    botId?: string;
    workspacePath?: string;
    submission: AcceptanceSubmission;
    suitePath?: string;
    reportPath?: string;
  }): Promise<AcceptanceResult> {
    const submission = AcceptanceSubmissionSchema.parse(input.submission);
    const result: AcceptanceResult = {
      ...submission,
      id: randomUUID(),
      topicId: input.topicId,
      botId: input.botId,
      workspacePath: input.workspacePath,
      at: new Date().toISOString(),
      suitePath: input.suitePath,
      reportPath: input.reportPath,
    };

    const dir = this.topicDir(input.topicId);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `${result.id}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );

    if (input.workspacePath?.trim()) {
      const wsDir = join(
        resolve(input.workspacePath),
        ".ml-aos",
        "acceptance",
      );
      await mkdir(wsDir, { recursive: true });
      await writeFile(
        join(wsDir, `${result.id}.json`),
        `${JSON.stringify(result, null, 2)}\n`,
        "utf8",
      );
    }

    return result;
  }

  async list(topicId: string): Promise<AcceptanceResult[]> {
    const dir = this.topicDir(topicId);
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const rows: AcceptanceResult[] = [];
    for (const name of names.filter((n) => n.endsWith(".json"))) {
      try {
        const raw = await readFile(join(dir, name), "utf8");
        rows.push(JSON.parse(raw) as AcceptanceResult);
      } catch {
        // skip corrupt
      }
    }
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  }

  async latest(topicId: string): Promise<AcceptanceResult | undefined> {
    const rows = await this.list(topicId);
    return rows[0];
  }

  async get(topicId: string, id: string): Promise<AcceptanceResult | undefined> {
    try {
      const raw = await readFile(join(this.topicDir(topicId), `${id}.json`), "utf8");
      return JSON.parse(raw) as AcceptanceResult;
    } catch {
      return undefined;
    }
  }

  /** Resolve L2 test env by matching workspace path to a Gitee project setting. */
  async resolveTestEnv(workspacePath?: string): Promise<ProjectTestEnv> {
    if (!workspacePath?.trim() || !this.projects) return {};
    const key = pathKey(workspacePath);
    try {
      const list = await this.projects.list();
      const hit = list.find(
        (p) => p.localPath && pathKey(p.localPath) === key,
      );
      if (!hit) return { localPath: workspacePath };
      return {
        localPath: hit.localPath,
        projectName: hit.name,
        testBaseUrl: hit.testBaseUrl,
        testStartCommand: hit.testStartCommand,
      };
    } catch {
      return { localPath: workspacePath };
    }
  }

  formatTesterPromptExtras(env: ProjectTestEnv): string {
    const lines = [
      "—— 验收门禁（必须）——",
      "结束后必须调用 MCP 工具 submit_acceptance（server=agent_os），提交结构化结果；不要只在正文写「通过/失败」。",
      "优先用 $agent-browser 做真实页面验收；截图放到工作区 .ml-aos/acceptance/ 下并在 evidence 中引用路径。",
      "无 UI 的纯库项目可用 verdict=skip 并填写 skipReason。",
      "若工作区存在 .ml-aos/acceptance/playwright.config.ts 或 acceptance/playwright.config.ts，可调用 run_acceptance_suite 跑回归套件。",
    ];
    if (env.testBaseUrl) {
      lines.push(`被测 baseURL：${env.testBaseUrl}`);
    }
    if (env.testStartCommand) {
      lines.push(
        `启服命令（在工作目录执行，若服务未起）：${env.testStartCommand}`,
      );
    }
    if (!env.testBaseUrl && !env.testStartCommand) {
      lines.push(
        "项目未配置 testBaseUrl / testStartCommand：请从规格或开发结论自行确认访问地址，或 ask 用户。",
      );
    }
    return lines.join("\n");
  }
}

function pathKey(value: string): string {
  return resolve(value).replace(/\\/g, "/").toLowerCase();
}

/** Ensure parent dir exists for a file path (exported for tests). */
export async function ensureParent(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}
