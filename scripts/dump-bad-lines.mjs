import { readFileSync } from "node:fs";

for (const f of ["bot-run-service", "pipeline-runner", "team-handoff"]) {
  const s = readFileSync(`packages/runtime/src/services/${f}.test.ts`, "utf8");
  const lines = s.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/\?{2,}/.test(lines[i]) || /includes\(/.test(lines[i]) && /Stage/.test(lines[i])) {
      console.log(f, i + 1, JSON.stringify(lines[i]).slice(0, 120));
    }
  }
  console.log("---");
}
