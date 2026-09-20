import type { IncomingMessage, ServerResponse } from "node:http";

export async function readJsonBody<T = unknown>(
  req: IncomingMessage,
): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export function applyCors(res: ServerResponse): void {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  applyCors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function sendError(
  res: ServerResponse,
  status: number,
  message: string,
): void {
  sendJson(res, status, { error: message });
}
