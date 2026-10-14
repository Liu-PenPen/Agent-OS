import { readFileSync } from "node:fs";
const s = readFileSync(
  "packages/runtime/src/services/auth-service.test.ts",
  "utf8",
);
const ms = [...s.matchAll(/toThrow\(([^)]+)\)/g)];
for (const m of ms) console.log(JSON.stringify(m[1]));
console.log("---");
console.log("includes zh", s.includes("\u7528\u6237\u540d"));
console.log("includes escape", s.includes("\\u7528"));
console.log("len", s.length);
