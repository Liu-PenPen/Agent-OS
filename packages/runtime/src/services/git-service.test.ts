import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { cloneRepo, isGitAvailable } from "./git-service.js";

const hasGit = isGitAvailable();

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd, stdio: "ignore" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed with code ${result.status}`);
  }
}

describe("git-service", () => {
  (hasGit ? it : it.skip)("clones into empty dir", async () => {
    const base = await mkdtemp(join(tmpdir(), "ml-aos-git-"));
    const source = join(base, "source");
    const target = join(base, "clone");

    await mkdir(source);
    git(source, "init");
    git(source, "config", "user.email", "test@example.com");
    git(source, "config", "user.name", "Test");
    await writeFile(join(source, "README.md"), "hello\n");
    git(source, "add", ".");
    git(source, "commit", "-m", "init");

    const gitUrl = pathToFileURL(source).href;
    await cloneRepo(gitUrl, target);

    await expect(access(join(target, "README.md"))).resolves.toBeUndefined();
  });
});
