import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { GiteeEnvConfig } from "./client.js";

const MARKDOWN_IMG = /!\[[^\]]*]\(\s*<?([^)\s>]+)>?\s*(?:["'][^"']*["'])?\s*\)/g;
const HTML_IMG = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

export function extractImageUrls(description: string): string[] {
  const urls = new Set<string>();
  for (const match of description.matchAll(MARKDOWN_IMG)) {
    const url = match[1]?.trim();
    if (url && /^https?:\/\//i.test(url)) urls.add(url);
  }
  for (const match of description.matchAll(HTML_IMG)) {
    const url = match[1]?.trim();
    if (url && /^https?:\/\//i.test(url)) urls.add(url);
  }
  return [...urls];
}

function guessExt(url: string, contentType: string | null): string {
  const fromUrl = extname(new URL(url).pathname).toLowerCase();
  if (fromUrl && fromUrl.length <= 5) return fromUrl;
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return ".jpg";
  if (contentType?.includes("gif")) return ".gif";
  if (contentType?.includes("webp")) return ".webp";
  return ".bin";
}

export type DownloadedImage = {
  url: string;
  localPath?: string;
  error?: string;
};

/** Download issue images into `{localPath}/.ml-aos/tickets/{ident}/`. */
export async function downloadIssueImages(options: {
  config: GiteeEnvConfig;
  localPath: string;
  ident: string;
  urls: string[];
}): Promise<DownloadedImage[]> {
  if (options.urls.length === 0) return [];
  const dir = join(options.localPath, ".ml-aos", "tickets", options.ident);
  await mkdir(dir, { recursive: true });

  const results: DownloadedImage[] = [];
  let index = 0;
  for (const url of options.urls) {
    index += 1;
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${options.config.token}`,
          "User-Agent": "mcp-gitee-ent ml-aos Go/windows/amd64/node",
        },
      });
      if (!response.ok) {
        results.push({
          url,
          error: `HTTP ${response.status}`,
        });
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = guessExt(url, response.headers.get("content-type"));
      const filePath = join(dir, `${String(index).padStart(2, "0")}${ext}`);
      await writeFile(filePath, buffer);
      results.push({ url, localPath: filePath });
    } catch (error) {
      results.push({
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
