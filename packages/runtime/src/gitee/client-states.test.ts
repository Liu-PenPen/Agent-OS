import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV = {
  MI_CLAW_GITEE_TOKEN: "t",
  MI_CLAW_GITEE_ENTERPRISE_ID: "1",
  GITEE_USER_ID: "2",
};

describe("listIssueTypeStates", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.MI_CLAW_GITEE_TOKEN = ENV.MI_CLAW_GITEE_TOKEN;
    process.env.MI_CLAW_GITEE_ENTERPRISE_ID = ENV.MI_CLAW_GITEE_ENTERPRISE_ID;
    process.env.GITEE_USER_ID = ENV.GITEE_USER_ID;
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("listIssueTypeStates maps id/title", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ data: [{ id: 10, title: "已完成" }] }),
    ) as typeof fetch;

    const { listIssueTypeStates } = await import("./client.js");
    const rows = await listIssueTypeStates(5);
    expect(rows).toEqual([{ id: 10, title: "已完成" }]);

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      URL,
    ];
    expect(url.pathname).toBe("/enterprises/1/issue_types/5/states");
  });

  it("falls back to issue_states query when issue_types path 404s", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL(input.url);
      if (url.pathname.endsWith("/issue_types/5/states")) {
        return new Response("not found", { status: 404 });
      }
      if (url.pathname.endsWith("/issue_states")) {
        expect(url.searchParams.get("issue_type_id")).toBe("5");
        return Response.json({ data: [{ id: 20, title: "进行中" }] });
      }
      throw new Error(`unexpected fetch: ${url.toString()}`);
    }) as typeof fetch;

    const { listIssueTypeStates } = await import("./client.js");
    const rows = await listIssueTypeStates(5);
    expect(rows).toEqual([{ id: 20, title: "进行中" }]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("updateIssueState", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.MI_CLAW_GITEE_TOKEN = ENV.MI_CLAW_GITEE_TOKEN;
    process.env.MI_CLAW_GITEE_ENTERPRISE_ID = ENV.MI_CLAW_GITEE_ENTERPRISE_ID;
    process.env.GITEE_USER_ID = ENV.GITEE_USER_ID;
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("updateIssueState sends issue_state_id", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL(input.url);
      expect(url.pathname).toBe("/enterprises/1/issues/123");
      expect(init?.method).toBe("PUT");
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ issue_state_id: 10 });
      return Response.json({
        issue_state: { id: 10, title: "已完成" },
      });
    }) as typeof fetch;

    const { updateIssueState } = await import("./client.js");
    const result = await updateIssueState({ issueId: 123, issueStateId: 10 });
    expect(result).toEqual({ stateId: 10, stateTitle: "已完成" });
  });

  it("retries with PATCH when PUT returns 405", async () => {
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Response("method not allowed", { status: 405 });
      }
      expect(init?.method).toBe("PATCH");
      return Response.json({
        issue_state: { id: 11, title: "待办" },
      });
    }) as typeof fetch;

    const { updateIssueState } = await import("./client.js");
    const result = await updateIssueState({ issueId: "456", issueStateId: 11 });
    expect(result).toEqual({ stateId: 11, stateTitle: "待办" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("getIssueDetail issueTypeId", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.MI_CLAW_GITEE_TOKEN = ENV.MI_CLAW_GITEE_TOKEN;
    process.env.MI_CLAW_GITEE_ENTERPRISE_ID = ENV.MI_CLAW_GITEE_ENTERPRISE_ID;
    process.env.GITEE_USER_ID = ENV.GITEE_USER_ID;
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("returns issueTypeId from issue_type.id", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        id: 99,
        ident: "I99",
        title: "Test",
        program_id: "818309",
        issue_type: { id: 7 },
        issue_state: { title: "待办" },
      }),
    ) as typeof fetch;

    const { getIssueDetail } = await import("./client.js");
    const detail = await getIssueDetail(99);
    expect(detail.issueTypeId).toBe(7);
  });

  it("returns issueTypeId from issue_type_id fallback", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        id: 100,
        ident: "I100",
        title: "Test",
        program_id: "818309",
        issue_type_id: 8,
        issue_state: { title: "待办" },
      }),
    ) as typeof fetch;

    const { getIssueDetail } = await import("./client.js");
    const detail = await getIssueDetail(100);
    expect(detail.issueTypeId).toBe(8);
  });
});
