/**
 * Pick a local folder via Tauri `pick_folder`, or fall back to prompt in browser.
 * Task 9 will implement the real command; until then invoke is stubbed.
 */
export async function pickFolder(): Promise<string | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const path = await invoke<string>("pick_folder");
    if (typeof path === "string" && path.trim()) {
      return path.trim();
    }
  } catch {
    // Not in Tauri, or command not registered yet.
  }

  const fallback = window.prompt("Enter folder path");
  return fallback?.trim() ? fallback.trim() : null;
}
