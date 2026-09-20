import { spawn, spawnSync } from "node:child_process";

export function isGitAvailable(): boolean {
  return spawnSync("git", ["--version"], { encoding: "utf-8" }).status === 0;
}

export function cloneRepo(gitUrl: string, localPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["clone", gitUrl, localPath], {
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git clone exited with code ${code}`));
    });
  });
}
