//! Node runtime sidecar: health probe, spawn, and process-tree kill.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const HEALTH_HOST: &str = "127.0.0.1";
const HEALTH_PORT: u16 = 17890;
const HEALTH_URL_HINT: &str = "http://127.0.0.1:17890/health";
const HEALTH_WAIT: Duration = Duration::from_secs(10);
const HEALTH_POLL: Duration = Duration::from_millis(250);

/// Holds the child we spawned (if any). Existing external runtimes are left alone.
pub struct SidecarState {
  pub child: Mutex<Option<Child>>,
}

impl SidecarState {
  pub fn new() -> Self {
    Self {
      child: Mutex::new(None),
    }
  }
}

pub fn ensure_runtime() -> Result<Option<Child>, String> {
  if health_ok() {
    log::info!("runtime already healthy at {HEALTH_URL_HINT}");
    return Ok(None);
  }

  let child = spawn_runtime()?;
  wait_for_health()?;
  Ok(Some(child))
}

pub fn kill_sidecar(state: &SidecarState) {
  let mut guard = match state.child.lock() {
    Ok(g) => g,
    Err(e) => e.into_inner(),
  };
  if let Some(mut child) = guard.take() {
    kill_process_tree(&mut child);
  }
}

fn health_ok() -> bool {
  let addr = format!("{HEALTH_HOST}:{HEALTH_PORT}");
  let Ok(mut stream) =
    TcpStream::connect_timeout(&addr.parse().unwrap(), Duration::from_millis(400))
  else {
    return false;
  };
  let _ = stream.set_read_timeout(Some(Duration::from_millis(400)));
  let _ = stream.set_write_timeout(Some(Duration::from_millis(400)));
  let req = b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
  if stream.write_all(req).is_err() {
    return false;
  }
  let mut buf = Vec::new();
  let _ = stream.read_to_end(&mut buf);
  let body = String::from_utf8_lossy(&buf);
  body.contains("200") && body.contains("\"ok\"")
}

fn wait_for_health() -> Result<(), String> {
  let deadline = Instant::now() + HEALTH_WAIT;
  while Instant::now() < deadline {
    if health_ok() {
      log::info!("runtime healthy at {HEALTH_URL_HINT}");
      return Ok(());
    }
    std::thread::sleep(HEALTH_POLL);
  }
  Err(format!(
    "runtime did not become healthy within {}s ({HEALTH_URL_HINT})",
    HEALTH_WAIT.as_secs()
  ))
}

fn spawn_runtime() -> Result<Child, String> {
  let repo = find_repo_root().ok_or_else(|| {
    "could not locate ml-aos repo root (looking for packages/runtime)".to_string()
  })?;
  let runtime_dir = repo.join("packages").join("runtime");
  if !runtime_dir.is_dir() {
    return Err(format!("runtime package missing: {}", runtime_dir.display()));
  }

  let (program, args, mode) = resolve_spawn_command(&repo, &runtime_dir)?;
  log::info!(
    "spawning runtime ({mode}): {} {} (cwd={})",
    program.display(),
    args.join(" "),
    runtime_dir.display()
  );

  let mut cmd = Command::new(&program);
  cmd
    .args(&args)
    .current_dir(&runtime_dir)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());

  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
  }

  cmd
    .spawn()
    .map_err(|e| format!("failed to spawn runtime ({mode}): {e}"))
}

/// Prefer production dist; fall back to tsx for local/dev (no dist yet).
fn resolve_spawn_command(
  repo: &Path,
  runtime_dir: &Path,
) -> Result<(PathBuf, Vec<String>, &'static str), String> {
  let dist_entry = runtime_dir.join("dist").join("index.js");
  if dist_entry.is_file() {
    return Ok((
      PathBuf::from("node"),
      vec![dist_entry.to_string_lossy().into_owned()],
      "node+dist",
    ));
  }

  let tsx_cli = find_tsx_cli(repo, runtime_dir).ok_or_else(|| {
    "runtime dist missing and tsx CLI not found; run `pnpm install` or build dist".to_string()
  })?;
  let entry = runtime_dir.join("src").join("index.ts");
  if !entry.is_file() {
    return Err(format!("runtime entry missing: {}", entry.display()));
  }

  Ok((
    PathBuf::from("node"),
    vec![
      tsx_cli.to_string_lossy().into_owned(),
      entry.to_string_lossy().into_owned(),
    ],
    "node+tsx (dev)",
  ))
}

fn find_tsx_cli(repo: &Path, runtime_dir: &Path) -> Option<PathBuf> {
  let candidates = [
    runtime_dir.join("node_modules").join("tsx").join("dist").join("cli.mjs"),
    repo.join("node_modules").join("tsx").join("dist").join("cli.mjs"),
  ];
  candidates.into_iter().find(|p| p.is_file())
}

fn find_repo_root() -> Option<PathBuf> {
  let mut candidates: Vec<PathBuf> = Vec::new();
  if let Ok(cwd) = std::env::current_dir() {
    candidates.push(cwd);
  }
  candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")));
  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      candidates.push(dir.to_path_buf());
    }
  }

  for start in candidates {
    let mut cur = start;
    for _ in 0..8 {
      if cur.join("packages").join("runtime").is_dir() && cur.join("pnpm-workspace.yaml").is_file()
      {
        return Some(cur);
      }
      if !cur.pop() {
        break;
      }
    }
  }
  None
}

fn kill_process_tree(child: &mut Child) {
  let pid = child.id();
  log::info!("stopping runtime sidecar pid={pid}");

  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let status = Command::new("taskkill")
      .args(["/PID", &pid.to_string(), "/T", "/F"])
      .creation_flags(CREATE_NO_WINDOW)
      .status();
    match status {
      Ok(s) if s.success() => {}
      other => {
        log::warn!("taskkill /T failed ({other:?}); falling back to Child::kill");
        let _ = child.kill();
      }
    }
  }

  #[cfg(not(windows))]
  {
    let _ = child.kill();
  }

  let _ = child.wait();
}
