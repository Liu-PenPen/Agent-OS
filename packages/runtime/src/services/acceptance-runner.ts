import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AcceptanceResult, AcceptanceSubmission } from "@ml-aos/shared";
import type { AcceptanceService } from "./acceptance-service.js";

const SUITE_CANDIDATES = [
  join(".ml-aos", "acceptance", "playwright.config.ts"),
  join(".ml-aos", "acceptance", "playwright.config.js"),
  join("acceptance", "playwright.config.ts"),
  join("acceptance", "playwright.config.js"),
];

export async function findAcceptanceSuite(
  workspacePath: string,
): Promise<string | undefined> {
  const root = resolve(workspacePath);
  for (const rel of SUITE_CANDIDATES) {
    const full = join(root, rel);
    try {
      await access(full);
      return full;
    } catch {
      // continue
    }
  }
  return undefined;
}

function playwrightCli(): { command: string; prefixArgs: string[] } {
  const candidates = [
    join(process.cwd(), "node_modules", "@playwright", "test", "cli.js"),
    join(
      process.cwd(),
      "..",
      "..",
      "node_modules",
      "@playwright",
      "test",
      "cli.js",
    ),
  ];
  for (const cliJs of candidates) {
    if (existsSync(cliJs)) {
      return { command: process.execPath, prefixArgs: [cliJs] };
    }
  }
  return {
    command: process.execPath,
    prefixArgs: [candidates[0]!],
  };
}

function summarizePlaywrightJson(payload: unknown): {
  passed: number;
  failed: number;
  skipped: number;
  checks: AcceptanceSubmission["checks"];
} {
  const checks: AcceptanceSubmission["checks"] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  const visitSuite = (suite: any, parents: string[] = []) => {
    const nextParents = suite?.title ? [...parents, suite.title] : parents;
    for (const spec of suite?.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const result = test.results?.[test.results.length - 1];
        const statusRaw = (result?.status ?? test.status ?? "failed") as string;
        const title =
          [...nextParents, spec.title].filter(Boolean).join(" › ") || "unnamed";
        let status: "pass" | "fail" | "skip" = "fail";
        if (statusRaw === "passed") {
          status = "pass";
          passed += 1;
        } else if (statusRaw === "skipped") {
          status = "skip";
          skipped += 1;
        } else {
          failed += 1;
        }
        checks.push({
          id: `pw-${checks.length + 1}`,
          title,
          status,
          detail: result?.error?.message ?? result?.errors?.[0]?.message,
        });
      }
    }
    for (const child of suite?.suites ?? []) visitSuite(child, nextParents);
  };

  for (const suite of (payload as any)?.suites ?? []) visitSuite(suite);
  return { passed, failed, skipped, checks };
}

export class AcceptanceRunner {
  constructor(private readonly acceptance: AcceptanceService) {}

  async run(input: {
    topicId: string;
    botId?: string;
    workspacePath: string;
    baseURL?: string;
  }): Promise<AcceptanceResult> {
    const suitePath = await findAcceptanceSuite(input.workspacePath);
    if (!suitePath) {
      throw new Error(
        "工作区未找到 Playwright 验收套件。请在 .ml-aos/acceptance/playwright.config.ts 或 acceptance/playwright.config.ts 放置配置，或改用 agent-browser + submit_acceptance。",
      );
    }

    const reportPath = join(
      resolve(input.workspacePath),
      ".ml-aos",
      "acceptance",
      "playwright-report.json",
    );
    const { command, prefixArgs } = playwrightCli();
    if (!existsSync(prefixArgs[0]!)) {
      throw new Error(
        "未找到 @playwright/test。请在 ml-aos 根目录 pnpm install，并按需 pnpm exec playwright install chromium。",
      );
    }

    const args = [
      ...prefixArgs,
      "test",
      "--config",
      suitePath,
      "--reporter=json",
    ];

    const env = {
      ...process.env,
      ...(input.baseURL
        ? { EYES_BASE_URL: input.baseURL, BASE_URL: input.baseURL }
        : {}),
    };

    const { exitCode, stdout, stderr } = await spawnCapture(
      command,
      args,
      resolve(input.workspacePath),
      env,
    );

    let payload: unknown;
    let parsedOk = false;
    try {
      const start = stdout.indexOf("{");
      payload = JSON.parse(start >= 0 ? stdout.slice(start) : stdout);
      parsedOk = true;
    } catch {
      try {
        payload = JSON.parse(await readFile(reportPath, "utf8"));
        parsedOk = true;
      } catch {
        payload = { suites: [] };
      }
    }

    const summary = summarizePlaywrightJson(payload);
    const hasCases = summary.checks.length > 0;
    const verdict =
      parsedOk && hasCases && exitCode === 0 && summary.failed === 0
        ? "pass"
        : "fail";

    const submission: AcceptanceSubmission = {
      verdict,
      summary:
        verdict === "pass"
          ? `Playwright 套件通过（${summary.passed} passed）`
          : !parsedOk
            ? `Playwright 报告解析失败（exitCode=${exitCode}）`
            : !hasCases
              ? `Playwright 未产出用例结果（exitCode=${exitCode}）`
              : `Playwright 套件失败（${summary.failed} failed, ${summary.passed} passed）`,
      checks: summary.checks,
      evidence: [
        {
          kind: "note",
          text: (stderr || stdout).slice(-1500) || `exitCode=${exitCode}`,
        },
      ],
      baseURL: input.baseURL,
      source: "playwright",
    };

    return this.acceptance.save({
      topicId: input.topicId,
      botId: input.botId,
      workspacePath: input.workspacePath,
      submission,
      suitePath,
      reportPath,
    });
  }
}

function spawnCapture(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}
