import { execFile } from "node:child_process";
import { homedir } from "node:os";
import type { SkillBinding } from "@ml-aos/shared";
import { parseSkillToken, UPSTREAM_SKILLS } from "./skill-catalog.js";
import { resolveUserSkillPath } from "./skill-paths.js";
import { installBundledSkill } from "./skill-seed.js";

export interface SkillLibraryOptions {
  /** When false, missing skills are reported and nothing is written or downloaded. */
  install?: boolean;
  home?: string;
  runInstall?: (spec: string) => Promise<void>;
}

export function npxSkillsAdd(spec: string): Promise<void> {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  return new Promise((resolve, reject) => {
    execFile(
      command,
      ["--yes", "skills", "add", spec, "-g", "-y"],
      { timeout: 120_000, windowsHide: true },
      (error, _stdout, stderr) => {
        if (!error) {
          resolve();
          return;
        }
        const detail = String(stderr ?? "").trim().slice(0, 500);
        reject(new Error(detail || error.message));
      },
    );
  });
}

function failed(id: string, source: string, error: string): SkillBinding {
  return { id, source, status: "failed", error };
}

export function refreshSkillBindings(
  skills: Array<string | SkillBinding> | undefined,
  homeDir = homedir(),
): SkillBinding[] {
  const out: SkillBinding[] = [];
  for (const skill of skills ?? []) {
    const token =
      typeof skill === "string"
        ? skill
        : skill.source.includes("@")
          ? skill.source
          : skill.id;
    const parsed = parseSkillToken(token);
    if (!parsed) {
      out.push(
        failed(
          typeof skill === "string" ? skill.trim().slice(0, 64) || "invalid" : skill.id,
          typeof skill === "string" ? skill.trim() : skill.source,
          "请填写 Skill 名字，或 owner/repo@skill。",
        ),
      );
      continue;
    }
    const found = resolveUserSkillPath(homeDir, parsed.id);
    if (found) {
      out.push({
        id: parsed.id,
        source: parsed.source,
        localPath: found,
        status: "ready",
      });
      continue;
    }
    const previous = typeof skill === "string" ? undefined : skill.error;
    out.push(
      failed(
        parsed.id,
        parsed.source,
        previous && previous !== "尚未安装"
          ? previous
          : `本机用户技能库没有 ${parsed.id}。`,
      ),
    );
  }
  return out;
}

export function skillNotReadyMessage(
  skills: SkillBinding[] | undefined,
): string | undefined {
  const missing = (skills ?? []).filter(
    (skill) => skill.status !== "ready" || !skill.localPath,
  );
  if (missing.length === 0) return undefined;
  const detail = missing
    .map((skill) => `${skill.id}（${skill.error ?? "未安装"}）`)
    .join("；");
  return `Skill 未就绪：${detail}。请在智能体配置中保存，完成安装后再运行。`;
}

export class SkillLibrary {
  private readonly home: string;

  constructor(private readonly options: SkillLibraryOptions = {}) {
    this.home = options.home ?? homedir();
  }

  refresh(skills: Array<string | SkillBinding> | undefined): SkillBinding[] {
    return refreshSkillBindings(skills, this.home);
  }

  async ensure(tokens: string[]): Promise<SkillBinding[]> {
    const byId = new Map<string, SkillBinding>();
    for (const token of tokens) {
      const binding = await this.ensureOne(token);
      byId.set(binding.id, binding);
    }
    return [...byId.values()];
  }

  private async ensureOne(token: string): Promise<SkillBinding> {
    const parsed = parseSkillToken(token);
    if (!parsed) {
      return failed(
        token.trim().slice(0, 64) || "invalid",
        token.trim(),
        "请填写 Skill 名字，或 owner/repo@skill。",
      );
    }

    const found = resolveUserSkillPath(this.home, parsed.id);
    if (found) {
      return {
        id: parsed.id,
        source: parsed.source,
        localPath: found,
        status: "ready",
      };
    }

    if (this.options.install === false) {
      return failed(
        parsed.id,
        parsed.source,
        `本机用户技能库没有 ${parsed.id}。`,
      );
    }

    const upstream = parsed.source.includes("@")
      ? parsed.source
      : UPSTREAM_SKILLS[parsed.id];
    if (upstream) {
      try {
        await (this.options.runInstall ?? npxSkillsAdd)(upstream);
      } catch (error) {
        const message = error instanceof Error ? error.message : "安装失败";
        return failed(parsed.id, upstream, message.slice(0, 500));
      }
      const after = resolveUserSkillPath(this.home, parsed.id);
      if (after) {
        return {
          id: parsed.id,
          source: upstream,
          localPath: after,
          status: "ready",
        };
      }
      return failed(
        parsed.id,
        upstream,
        "安装已结束，但用户技能库里没有 SKILL.md。",
      );
    }

    const bundled = await installBundledSkill(parsed.id, this.home);
    if (bundled) {
      return {
        id: parsed.id,
        source: `bundled:${parsed.id}`,
        localPath: bundled,
        status: "ready",
      };
    }

    return failed(
      parsed.id,
      parsed.id,
      `没有 ${parsed.id}。请填写 owner/repo@${parsed.id} 后保存。`,
    );
  }
}
