import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AuthResponse, StoredUser, User } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";

const DEFAULT_SECRET = "ml-aos-secret-key-default-2026";

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const chosenSalt = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, chosenSalt, 64).toString("hex");
  return { hash, salt: chosenSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = scryptSync(password, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

export interface JwtPayload {
  userId: string;
  username: string;
  email: string;
  exp: number;
}

export function signToken(payload: Omit<JwtPayload, "exp">, secret = DEFAULT_SECRET): string {
  const header = { alg: "HS256", typ: "JWT" };
  const fullPayload: JwtPayload = {
    ...payload,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };
  const encHeader = base64UrlEncode(JSON.stringify(header));
  const encPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = createHmac("sha256", secret)
    .update(`${encHeader}.${encPayload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${encHeader}.${encPayload}.${signature}`;
}

export function verifyJwtToken(token: string, secret = DEFAULT_SECRET): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }
  const [encHeader, encPayload, signature] = parts;
  const expectedSig = createHmac("sha256", secret)
    .update(`${encHeader}.${encPayload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  if (
    signature.length !== expectedSig.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
  ) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(base64UrlDecode(encPayload)) as JwtPayload;
  if (Date.now() > payload.exp) {
    throw new Error("Token expired");
  }
  return payload;
}

export class AuthService {
  constructor(
    private readonly store: JsonStore,
    private readonly secret = process.env.ML_AOS_JWT_SECRET || DEFAULT_SECRET,
  ) {}

  private sanitize(user: StoredUser): User {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
    };
  }

  async register(input: {
    username: string;
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    const username = input.username?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password;

    if (!username) {
      throw new Error("用户名不能为空");
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("请输入有效的邮箱地址");
    }
    if (!password || password.length < 8) {
      throw new Error("密码长度不能少于 8 位");
    }

    let createdUser: StoredUser | undefined;

    await this.store.transact((state) => {
      state.users = state.users ?? [];
      const duplicate = state.users.find(
        (u) =>
          u.username.toLowerCase() === username.toLowerCase() ||
          u.email.toLowerCase() === email,
      );
      if (duplicate) {
        if (duplicate.username.toLowerCase() === username.toLowerCase()) {
          throw new Error("用户名已被注册");
        }
        throw new Error("邮箱已被注册");
      }

      const { hash, salt } = hashPassword(password);
      createdUser = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        username,
        email,
        passwordHash: hash,
        salt,
        createdAt: new Date().toISOString(),
      };
      state.users.push(createdUser);
    });

    if (!createdUser) {
      throw new Error("注册失败");
    }

    const user = this.sanitize(createdUser);
    const token = signToken({ userId: user.id, username: user.username, email: user.email }, this.secret);
    return { user, token };
  }

  async login(input: {
    identifier: string;
    password: string;
  }): Promise<AuthResponse> {
    const identifier = input.identifier?.trim();
    const password = input.password;

    if (!identifier || !password) {
      throw new Error("用户名/邮箱或密码错误");
    }

    const state = await this.store.load();
    const users = state.users ?? [];
    const target = users.find(
      (u) =>
        u.username.toLowerCase() === identifier.toLowerCase() ||
        u.email.toLowerCase() === identifier.toLowerCase(),
    );

    if (!target) {
      throw new Error("用户名/邮箱或密码错误");
    }

    const match = verifyPassword(password, target.passwordHash, target.salt);
    if (!match) {
      throw new Error("用户名/邮箱或密码错误");
    }

    const user = this.sanitize(target);
    const token = signToken({ userId: user.id, username: user.username, email: user.email }, this.secret);
    return { user, token };
  }

  async getUserByToken(token: string): Promise<User> {
    const payload = verifyJwtToken(token, this.secret);
    const state = await this.store.load();
    const users = state.users ?? [];
    const target = users.find((u) => u.id === payload.userId);
    if (!target) {
      throw new Error("用户不存在或已注销");
    }
    return this.sanitize(target);
  }
}
