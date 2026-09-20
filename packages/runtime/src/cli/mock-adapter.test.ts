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

  it("emits clarification with 2 options when prompt includes [clarify]", async () => {
    const adapter = new MockCliAdapter();
    const events: string[] = [];
    for await (const ev of adapter.run({
      prompt: "please [clarify] this",
      cwd: process.cwd(),
    })) {
      events.push(ev.type);
      if (ev.type === "clarification") {
        expect(ev.options).toHaveLength(2);
        expect(ev.prompt).toBeTruthy();
      }
    }
    expect(events).toContain("clarification");
  });
});
