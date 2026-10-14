import { describe, expect, it } from "vitest";
import {
  formatChoiceAnswers,
  choiceQuestionOffset,
  parseChoiceQuestions,
} from "./choice-questions.js";

describe("parseChoiceQuestions", () => {
  it("parses numbered questions with letter options", () => {
    const text = `
问题 1：认证方式与账号体系
选项 A（本地/轻量模式）：用户名 + 密码
选项 B（标准云端模式 - 推荐）：邮箱 + 密码
选项 C（第三方 SSO）：OAuth
问题 2：会话管理
选项 A（JWT - 推荐）：无状态
选项 B（Cookie）：服务端 Session
`;
    const questions = parseChoiceQuestions(text);
    expect(questions).toHaveLength(2);
    expect(questions[0]?.options[1]?.recommended).toBe(true);
    expect(questions[1]?.prompt).toContain("会话管理");
  });

  it("parses a single option list", () => {
    const text = `
请在以下 3 种典型方案中确认：
选项 1：轻量本地模式
选项 2：标准云端服务模式（推荐）
选项 3：第三方 SSO
`;
    const questions = parseChoiceQuestions(text);
    expect(questions).toHaveLength(1);
    expect(questions[0]?.options).toHaveLength(3);
    expect(questions[0]?.options[1]?.recommended).toBe(true);
  });

  it("parses markdown bullets from a product reply", () => {
    const text = `
#### 问题 1：核心认证方式与登录入口
- **选项 A（标准账号密码）**：支持用户名加密码（推荐：MVP 最快）。
- **选项 B（企业 OAuth）**：支持第三方授权。
- **选项 C（混合认证）**：账号密码加验证码。

#### 问题 2：账号获取与注册策略
- **选项 A（开放注册）**：公开注册入口。
- **选项 B（邀请制）**：仅管理员分配。
`;
    const questions = parseChoiceQuestions(text);
    expect(questions).toHaveLength(2);
    expect(questions[0]?.options).toHaveLength(3);
    expect(questions[0]?.options[0]?.label).toContain("标准账号密码");
    expect(questions[0]?.options[0]?.recommended).toBe(true);
    expect(questions[1]?.prompt).toContain("注册策略");
  });

  it("parses numbered headings with bold letter options", () => {
    const text = `
### 结论
需要先澄清登录功能的认证方式。

#### 1. 登录认证方式
- **A. 账号密码登录**（最基础，支持本地用户名/邮箱 + 密码哈希存储）
- **B. 邮箱 / 手机验证码免密登录**（需要对接短信或邮件）
- **C. 第三方 OAuth 登录**（如 GitHub / 微信 / Google）

#### 2. 账号注册与管理范围
- **A. 开放注册**（任何访客可注册并自动登录）
- **B. 仅管理员邀请**（关闭公开注册）
- **C. 开放注册加个人中心**（推荐）
`;
    const questions = parseChoiceQuestions(text);
    expect(questions).toHaveLength(2);
    expect(questions[0]?.prompt).toBe("登录认证方式");
    expect(questions[0]?.options).toHaveLength(3);
    expect(questions[0]?.options[0]?.label).toContain("账号密码登录");
    expect(questions[1]?.options[2]?.recommended).toBe(true);
    expect(text.slice(0, choiceQuestionOffset(text))).toContain("结论");
  });

  it("does not treat a delivery summary as choice questions", () => {
    const text = `
### 结论
需求澄清已完成。

1. **规格完整度分析**：
- 方案明确了账号密码与开放注册。
`;
    expect(parseChoiceQuestions(text)).toHaveLength(0);
  });

  it("drops a repeated question list in the same reply", () => {
    const block = `
问题 1：登录方式
选项 A：密码
选项 B：验证码
问题 1：登录方式
选项 A：密码
选项 B：验证码
`;
    expect(parseChoiceQuestions(block)).toHaveLength(1);
  });

  it("formats answers", () => {
    const questions = parseChoiceQuestions(
      "问题 1：认证\n选项 A：本地\n选项 B（推荐）：云端",
    );
    expect(formatChoiceAnswers(questions, { q1: "b" })).toContain("云端");
  });
});
