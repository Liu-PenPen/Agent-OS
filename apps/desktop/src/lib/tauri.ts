/**
 * Pick a local folder via Tauri `pick_folder`, or fall back to prompt in browser.
 */
export async function pickFolder(): Promise<string | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const path = await invoke<string | null>("pick_folder");
    if (typeof path === "string" && path.trim()) {
      return path.trim();
    }
    if (path === null) {
      return null;
    }
  } catch {
    // Not in Tauri, or dialog cancelled / command unavailable.
  }

  const fallback = window.prompt("Enter folder path");
  return fallback?.trim() ? fallback.trim() : null;
}
