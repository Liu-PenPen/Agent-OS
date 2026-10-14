import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function patch(path, from, to) {
  const full = join(root, path);
  let s = readFileSync(full, "utf8");
  if (!s.includes(from)) {
    console.log("skip/missing", path, JSON.stringify(from).slice(0, 40));
    return;
  }
  s = s.split(from).join(to);
  writeFileSync(full, s, "utf8");
  console.log("patched", path, from.slice(0, 20), "->", to.slice(0, 30));
}

// bot-run: fix corrupted expects
patch(
  "packages/runtime/src/services/bot-run-service.test.ts",
  'expect(reply?.run?.current).toBe("????????");',
  'expect(reply?.run?.current).toBe("\\u6b63\\u5728\\u5206\\u6790\\u6267\\u884c\\u7ed3\\u679c");',
);
patch(
  "packages/runtime/src/services/bot-run-service.test.ts",
  'yield { type: "text_delta" as const, text: "???? };',
  'yield { type: "text_delta" as const, text: "\\u5b8c\\u6210\\u3002" };',
);
patch(
  "packages/runtime/src/services/bot-run-service.test.ts",
  'title: "???",',
  'title: "\\u65b9\\u6848",',
);
patch(
  "packages/runtime/src/services/bot-run-service.test.ts",
  'summary: "???",',
  'summary: "\\u6458\\u8981",',
);

// pipeline-runner stage marker — find whatever is there
{
  const p = join(root, "packages/runtime/src/services/pipeline-runner.test.ts");
  let s = readFileSync(p, "utf8");
  const m = s.match(/m\.content\.includes\(([^)]+)\)/);
  console.log("pipeline includes arg:", m && m[1]);
  s = s.replace(
    /m\.content\.includes\([^)]+\)/,
    'm.content.includes("\\u25b6 Stage")',
  );
  writeFileSync(p, s, "utf8");
  console.log("pipeline stage marker fixed");
}
