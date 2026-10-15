/**
 * Prepare Tauri installer resources:
 * 1) Bundle packages/runtime → dist/index.js
 * 2) Copy into apps/desktop/src-tauri/resources/runtime/
 * 3) Download portable Node (win-x64 / darwin / linux) into resources/node/
 */
import { createWriteStream } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const resourcesRoot = join(
  repoRoot,
  "apps",
  "desktop",
  "src-tauri",
  "resources",
);
const runtimeOut = join(resourcesRoot, "runtime");
const nodeOut = join(resourcesRoot, "node");
const cacheDir = join(repoRoot, ".cache", "node-portable");

const NODE_VERSION = process.env.ML_AOS_NODE_VERSION?.trim() || "22.14.0";

function platformSpec() {
  const { platform, arch } = process;
  if (platform === "win32" && arch === "x64") {
    return {
      key: "win-x64",
      archive: `node-v${NODE_VERSION}-win-x64.zip`,
      binaryRel: ["node.exe"],
    };
  }
  if (platform === "darwin" && (arch === "arm64" || arch === "x64")) {
    const key = arch === "arm64" ? "darwin-arm64" : "darwin-x64";
    return {
      key,
      archive: `node-v${NODE_VERSION}-${key}.tar.gz`,
      binaryRel: ["bin", "node"],
    };
  }
  if (platform === "linux" && arch === "x64") {
    return {
      key: "linux-x64",
      archive: `node-v${NODE_VERSION}-linux-x64.tar.xz`,
      binaryRel: ["bin", "node"],
    };
  }
  throw new Error(
    `Unsupported packager host ${platform}/${arch}. Build on win-x64, darwin, or linux-x64.`,
  );
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`download failed ${res.status}: ${url}`);
  }
  await mkdir(dirname(dest), { recursive: true });
  await pipeline(res.body, createWriteStream(dest));
}

async function extractArchive(archivePath, destDir, spec) {
  await rm(destDir, { recursive: true, force: true });
  await mkdir(destDir, { recursive: true });
  if (spec.archive.endsWith(".zip")) {
    if (process.platform === "win32") {
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
        ],
        { stdio: "inherit" },
      );
    } else {
      execFileSync("unzip", ["-q", archivePath, "-d", destDir], {
        stdio: "inherit",
      });
    }
  } else if (spec.archive.endsWith(".tar.gz")) {
    execFileSync("tar", ["-xzf", archivePath, "-C", destDir], {
      stdio: "inherit",
    });
  } else if (spec.archive.endsWith(".tar.xz")) {
    execFileSync("tar", ["-xJf", archivePath, "-C", destDir], {
      stdio: "inherit",
    });
  } else {
    throw new Error(`unknown archive type: ${spec.archive}`);
  }
}

async function copyNodeBinary(extractRoot, spec) {
  await rm(nodeOut, { recursive: true, force: true });
  await mkdir(nodeOut, { recursive: true });

  const entries = await readdir(extractRoot);
  const folder = entries.find((name) => name.startsWith("node-v"));
  if (!folder) {
    throw new Error(`extracted node folder not found under ${extractRoot}`);
  }
  const extracted = join(extractRoot, folder);
  const binary = join(extracted, ...spec.binaryRel);
  if (!(await pathExists(binary))) {
    throw new Error(`node binary missing: ${binary}`);
  }

  if (process.platform === "win32") {
    await copyFile(binary, join(nodeOut, "node.exe"));
  } else {
    await copyFile(binary, join(nodeOut, "node"));
    await chmod(join(nodeOut, "node"), 0o755);
  }

  await writeFile(
    join(nodeOut, "VERSION"),
    `${NODE_VERSION} ${spec.key}\n`,
    "utf8",
  );
  await writeFile(
    join(nodeOut, "README.md"),
    "Portable Node binary is downloaded by `pnpm prepare:bundle` into this folder (`node.exe` on Windows, `node` elsewhere).\n",
    "utf8",
  );
}

async function ensurePortableNode() {
  const spec = platformSpec();
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${spec.archive}`;
  const archivePath = join(cacheDir, spec.archive);
  const extractDir = join(cacheDir, `extract-${spec.key}`);

  if (!(await pathExists(archivePath))) {
    console.log(`downloading ${url}`);
    await download(url, archivePath);
  } else {
    console.log(`using cached ${archivePath}`);
  }

  await extractArchive(archivePath, extractDir, spec);
  await copyNodeBinary(extractDir, spec);
  console.log(`portable node -> ${nodeOut}`);
}

async function buildRuntimeBundle() {
  const script = join(repoRoot, "packages", "runtime", "scripts", "build-bundle.mjs");
  execFileSync(process.execPath, [script], {
    cwd: join(repoRoot, "packages", "runtime"),
    stdio: "inherit",
  });
}

async function copyRuntimeResources() {
  await rm(runtimeOut, { recursive: true, force: true });
  await mkdir(runtimeOut, { recursive: true });
  const dist = join(repoRoot, "packages", "runtime", "dist");
  await copyFile(join(dist, "index.js"), join(runtimeOut, "index.js"));
  await copyFile(
    join(dist, "app-tools-server.js"),
    join(runtimeOut, "app-tools-server.js"),
  );
  await copyFile(join(dist, "package.json"), join(runtimeOut, "package.json"));
  console.log(`runtime resources -> ${runtimeOut}`);
}

async function main() {
  console.log("prepare-bundle: build runtime");
  await buildRuntimeBundle();
  console.log("prepare-bundle: copy runtime resources");
  await copyRuntimeResources();
  console.log("prepare-bundle: portable node");
  await ensurePortableNode();
  console.log("prepare-bundle: done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
