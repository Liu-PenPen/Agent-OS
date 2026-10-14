import { readFileSync } from "node:fs";

const files = [
  "schedule-service",
  "bot-prompt",
  "team-leader-guard",
  "product-spec-submission",
  "auth-service",
  "bot-run-service",
  "pipeline-runner",
  "team-handoff",
];

for (const f of files) {
  const p = `packages/runtime/src/services/${f}.test.ts`;
  const s = readFileSync(p, "utf8");
  const trips = s.match(/\?{3,}/g) || [];
  console.log(
    f,
    "triple+",
    trips.length,
    "sample",
    trips.slice(0, 2),
    "created",
    s.includes("\u5df2\u521b\u5efa"),
    "analyzing",
    s.includes("\u6b63\u5728\u5206\u6790\u6267\u884c\u7ed3\u679c"),
    "stage",
    s.includes("\u25b6 Stage"),
  );
}
