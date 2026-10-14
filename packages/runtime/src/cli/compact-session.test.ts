import { describe, it, expect } from "vitest";
import { parseCompactCommand } from "./compact-session.js";

describe("parseCompactCommand", () => {
  it("detects bare /compact", () => {
    expect(parseCompactCommand("/compact")).toEqual({
      isCompact: true,
      instructions: undefined,
    });
  });

  it("captures trailing instructions", () => {
    expect(parseCompactCommand("/compact keep decisions")).toEqual({
      isCompact: true,
      instructions: "keep decisions",
    });
  });

  it("ignores non-compact text", () => {
    expect(parseCompactCommand("please compact this")).toEqual({
      isCompact: false,
    });
  });
});
