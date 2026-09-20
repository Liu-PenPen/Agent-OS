import { describe, it, expect } from "vitest";
import { MockCliAdapter } from "./mock-adapter.js";

describe("MockCliAdapter", () => {
  it("streams hello", async () => {
    const adapter = new MockCliAdapter();
    const chunks: string[] = [];
    for await (const ev of adapter.run({
      prompt: "hi",
      cwd: process.cwd(),
    })) {
      if (ev.type === "text_delta") chunks.push(ev.text);
    }
    expect(chunks.join("")).toContain("Mock");
  });
});
