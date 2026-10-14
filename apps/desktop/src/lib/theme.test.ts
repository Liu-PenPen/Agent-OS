import { describe, expect, it, beforeEach } from "vitest";
import { applyTheme } from "./theme";

describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("applies warm", () => {
    applyTheme("warm");
    expect(document.documentElement.dataset.theme).toBe("warm");
  });

  it("applies light", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("applies dark", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
