export type ThemeMode = "warm" | "dark" | "light" | "system";

let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;

function resolvedSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function clearSystemListener(): void {
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener("change", mediaListener);
  }
  mediaQuery = null;
  mediaListener = null;
}

function setDataTheme(theme: "warm" | "dark" | "light"): void {
  document.documentElement.dataset.theme = theme;
}

/**
 * Apply theme to `document.documentElement` via `data-theme`.
 * `system` follows `prefers-color-scheme` and updates on change.
 */
export function applyTheme(mode: ThemeMode): void {
  clearSystemListener();

  if (mode === "system") {
    setDataTheme(resolvedSystemTheme());
    if (typeof window !== "undefined" && window.matchMedia) {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaListener = () => setDataTheme(resolvedSystemTheme());
      mediaQuery.addEventListener("change", mediaListener);
    }
    return;
  }

  setDataTheme(mode);
}
