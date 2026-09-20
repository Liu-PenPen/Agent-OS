//! Tauri IPC commands.

use rfd::FileDialog;

/// Native folder picker; returns an absolute path string, or `null` if cancelled.
#[tauri::command]
pub fn pick_folder() -> Option<String> {
  FileDialog::new()
    .set_title("Select folder")
    .pick_folder()
    .map(|path| path.to_string_lossy().into_owned())
}
