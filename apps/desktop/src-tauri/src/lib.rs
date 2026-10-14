mod commands;
mod sidecar;

use sidecar::SidecarState;
use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(SidecarState::new())
    .invoke_handler(tauri::generate_handler![commands::pick_folder])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let resource_dir = app.path().resource_dir().ok();
      let app_data_dir = app.path().app_data_dir().ok();
      let ctx = sidecar::SpawnContext {
        resource_dir,
        app_data_dir,
      };
      match sidecar::ensure_runtime(&ctx) {
        Ok(Some(child)) => {
          let state = app.state::<SidecarState>();
          *state.child.lock().unwrap_or_else(|e| e.into_inner()) = Some(child);
        }
        Ok(None) => {}
        Err(err) => {
          log::error!("runtime sidecar: {err}");
          // Still open the UI; REST calls will fail until runtime is available.
        }
      }

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      if let RunEvent::Exit = event {
        let state = app_handle.state::<SidecarState>();
        sidecar::kill_sidecar(&*state);
      }
    });
}
