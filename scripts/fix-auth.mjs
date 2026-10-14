import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

// --- auth-service.test.ts ---
writeFileSync(
  join(root, "packages/runtime/src/services/auth-service.test.ts"),
  `import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  AuthService,
  hashPassword,
  verifyPassword,
  signToken,
  verifyJwtToken,
} from "./auth-service.js";
import { JsonStore } from "../store/json-store.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("AuthService & crypto utilities", () => {
  let dir: string;
  let authService: AuthService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-auth-"));
    authService = new AuthService(new JsonStore(dir), "test-jwt-secret-xyz");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("hashes and verifies passwords correctly", () => {
    const { hash, salt } = hashPassword("SuperSecret123");
    expect(hash).toBeTruthy();
    expect(salt).toBeTruthy();
    expect(verifyPassword("SuperSecret123", hash, salt)).toBe(true);
    expect(verifyPassword("WrongPassword", hash, salt)).toBe(false);
  });

  it("signs and verifies JWT tokens correctly", () => {
    const token = signToken(
      { userId: "u1", username: "alice", email: "alice@test.com" },
      "test-jwt-secret-xyz",
    );
    expect(typeof token).toBe("string");
    const payload = verifyJwtToken(token, "test-jwt-secret-xyz");
    expect(payload.userId).toBe("u1");
    expect(payload.username).toBe("alice");
    expect(payload.email).toBe("alice@test.com");

    expect(() => verifyJwtToken(token, "wrong-secret")).toThrow();
  });

  it("registers a new user and allows login with username or email", async () => {
    const regRes = await authService.register({
      username: "alice",
      email: "alice@test.com",
      password: "password123",
    });

    expect(regRes.user.username).toBe("alice");
    expect(regRes.user.email).toBe("alice@test.com");
    expect(regRes.token).toBeTruthy();

    const fetchedUser = await authService.getUserByToken(regRes.token);
    expect(fetchedUser.id).toBe(regRes.user.id);
    expect(fetchedUser.username).toBe("alice");

    const loginUserRes = await authService.login({
      identifier: "alice",
      password: "password123",
    });
    expect(loginUserRes.user.id).toBe(regRes.user.id);
    expect(loginUserRes.token).toBeTruthy();

    const loginEmailRes = await authService.login({
      identifier: "alice@test.com",
      password: "password123",
    });
    expect(loginEmailRes.user.id).toBe(regRes.user.id);

    await expect(
      authService.login({
        identifier: "alice",
        password: "wrongPassword",
      }),
    ).rejects.toThrow("\\u7528\\u6237\\u540d/\\u90ae\\u7bb1\\u6216\\u5bc6\\u7801\\u9519\\u8bef");

    await expect(
      authService.login({
        identifier: "bob",
        password: "password123",
      }),
    ).rejects.toThrow("\\u7528\\u6237\\u540d/\\u90ae\\u7bb1\\u6216\\u5bc6\\u7801\\u9519\\u8bef");
  });

  it("prevents duplicate username or email registration", async () => {
    await authService.register({
      username: "bob",
      email: "bob@test.com",
      password: "password123",
    });

    await expect(
      authService.register({
        username: "bob",
        email: "bob2@test.com",
        password: "password123",
      }),
    ).rejects.toThrow("\\u7528\\u6237\\u540d\\u5df2\\u88ab\\u6ce8\\u518c");

    await expect(
      authService.register({
        username: "bob2",
        email: "bob@test.com",
        password: "password123",
      }),
    ).rejects.toThrow("\\u90ae\\u7bb1\\u5df2\\u88ab\\u6ce8\\u518c");
  });

  it("validates input constraints (empty fields, short passwords, invalid emails)", async () => {
    await expect(
      authService.register({
        username: "",
        email: "test@test.com",
        password: "password123",
      }),
    ).rejects.toThrow("\\u7528\\u6237\\u540d\\u4e0d\\u80fd\\u4e3a\\u7a7a");

    await expect(
      authService.register({
        username: "test",
        email: "not-an-email",
        password: "password123",
      }),
    ).rejects.toThrow("\\u8bf7\\u8f93\\u5165\\u6709\\u6548\\u7684\\u90ae\\u7bb1\\u5730\\u5740");

    await expect(
      authService.register({
        username: "test",
        email: "test@test.com",
        password: "short",
      }),
    ).rejects.toThrow("\\u5bc6\\u7801\\u957f\\u5ea6\\u4e0d\\u80fd\\u5c11\\u4e8e 8 \\u4f4d");
  });
});
`.replace(/\\\\u/g, "\\u"),
  "utf8",
);

console.log("auth written", readFileSync(join(root, "packages/runtime/src/services/auth-service.test.ts"), "utf8").includes("\u7528\u6237\u540d"));
