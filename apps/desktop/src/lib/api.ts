import type { AppSettings, ThemeMode } from "@ml-aos/shared";

const BASE_URL = "http://127.0.0.1:17890";

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  baseUrl: BASE_URL,

  getSettings(): Promise<AppSettings> {
    return request<AppSettings>("/api/settings");
  },

  patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    return request<AppSettings>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  setTheme(theme: ThemeMode): Promise<AppSettings> {
    return this.patchSettings({ theme });
  },
};
