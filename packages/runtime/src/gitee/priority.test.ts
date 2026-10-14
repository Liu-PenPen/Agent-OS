import { describe, expect, it } from "vitest";
import {
  comparePriorityThenIdent,
  matchesPullPriority,
  priorityRank,
} from "./priority.js";
import { extractImageUrls } from "./issue-assets.js";

describe("priorityRank", () => {
  it("orders 紧急 > 主要 > 次要 > 不重要", () => {
    expect(priorityRank("紧急")).toBeLessThan(priorityRank("主要"));
    expect(priorityRank("严重")).toBe(priorityRank("紧急"));
    expect(priorityRank("主要")).toBeLessThan(priorityRank("次要"));
    expect(priorityRank("次要")).toBeLessThan(priorityRank("不重要"));
  });

  it("matches ticket-pull thresholds inclusively upward", () => {
    expect(matchesPullPriority("严重", "severe")).toBe(true);
    expect(matchesPullPriority("紧急", "severe")).toBe(true);
    expect(matchesPullPriority("主要", "severe")).toBe(false);
    expect(matchesPullPriority("", "severe")).toBe(false);

    expect(matchesPullPriority("严重", "major")).toBe(true);
    expect(matchesPullPriority("主要", "major")).toBe(true);
    expect(matchesPullPriority("高", "major")).toBe(true);
    expect(matchesPullPriority("无优先级", "major")).toBe(false);
    expect(matchesPullPriority("次要", "major")).toBe(false);

    expect(matchesPullPriority("严重", "none")).toBe(true);
    expect(matchesPullPriority("主要", "none")).toBe(true);
    expect(matchesPullPriority("无优先级", "none")).toBe(true);
    expect(matchesPullPriority("", "none")).toBe(true);
    expect(matchesPullPriority("未设置", "none")).toBe(true);
    expect(matchesPullPriority("次要", "none")).toBe(false);
    expect(matchesPullPriority("不重要", "none")).toBe(false);
  });

  it("sorts within sprint by priority then ident", () => {
    const items = [
      { priority: "次要", ident: "B" },
      { priority: "紧急", ident: "Z" },
      { priority: "紧急", ident: "A" },
      { priority: "主要", ident: "M" },
    ];
    items.sort(comparePriorityThenIdent);
    expect(items.map((i) => i.ident)).toEqual(["A", "Z", "M", "B"]);
  });
});

describe("extractImageUrls", () => {
  it("parses markdown and html images", () => {
    const text = `
见截图：![a](https://cdn.example.com/a.png)
<img src="https://cdn.example.com/b.jpg" alt="b" />
忽略相对路径 ![](./local.png)
`;
    expect(extractImageUrls(text)).toEqual([
      "https://cdn.example.com/a.png",
      "https://cdn.example.com/b.jpg",
    ]);
  });
});
