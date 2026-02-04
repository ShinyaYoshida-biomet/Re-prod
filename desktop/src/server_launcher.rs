use std::{
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command},
    time::{Duration, Instant},
};

use reprod_core::config::{server_binary_override, HealthResponse, PORT_ENV, WS_SCHEMA_VERSION};
use reqwest::StatusCode;
use thiserror::Error;
use tokio::time::sleep;

pub type SharedServerHandle = std::sync::Arc<tokio::sync::Mutex<ServerHandle>>;

#[derive(Debug, Error)]
pub enum ServerLaunchError {
    #[error("failed to locate server binary at {0}")]
    MissingBinary(String),
    #[error("failed to spawn server process: {0}")]
    SpawnFailed(String),
    #[error("server failed to start within timeout")]
    StartupTimeout,
    #[error("server schema version mismatch: expected {expected}, got {actual} — rebuild with `cargo build --release -p reprod-server`")]
    SchemaMismatch { expected: u32, actual: u32 },
}

pub struct ServerHandle {
    child: Child,
    port: u16,
}

impl ServerHandle {
    pub fn port(&self) -> u16 {
        self.port
    }

    pub async fn shutdown(&mut self) {
        // Try a graceful kill and give the process time to exit.
        let _ = self.child.kill();
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if let Ok(Some(_)) = self.child.try_wait() {
                return;
            }
            sleep(Duration::from_millis(100)).await;
        }

        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for ServerHandle {
    fn drop(&mut self) {
        // Best-effort synchronous shutdown for when async drop is unavailable.
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn find_available_port() -> u16 {
    // Prefer stable ports first for easier debugging, then fall back to OS-assigned.
    for port in [3001_u16, 3002_u16, 3003_u16] {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return port;
        }
    }

    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|listener| listener.local_addr().ok())
        .map(|addr| addr.port())
        .unwrap_or(3001)
}

fn server_binary_path() -> Option<PathBuf> {
    if let Some(path) = server_binary_override() {
        if path.exists() {
            return Some(path);
        }
    }

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|parent| parent.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    #[cfg(target_os = "windows")]
    let binary_name = "reprod-server.exe";
    #[cfg(not(target_os = "windows"))]
    let binary_name = "reprod-server";

    // When bundled, the sidecar is placed alongside the main binary.
    let sidecar = exe_dir.join(binary_name);
    if sidecar.exists() {
        return Some(sidecar);
    }

    // Fallback: use workspace target for dev builds (`cargo tauri dev`).
    let workspace_target = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("target")
        .join("release")
        .join(binary_name);
    if workspace_target.exists() {
        return Some(workspace_target);
    }

    None
}

async fn wait_for_server_health(port: u16, timeout: Duration) -> Result<(), ServerLaunchError> {
    let url = format!("http://127.0.0.1:{}/health", port);
    let start = Instant::now();
    let client = reqwest::Client::new();

    while start.elapsed() < timeout {
        match client.get(&url).send().await {
            Ok(resp) if resp.status() == StatusCode::OK => {
                // Parse schema version; plain-text "OK" from an older sidecar
                // that predates the JSON health response is treated as version 0
                // so the mismatch is caught immediately.
                let actual = resp
                    .json::<HealthResponse>()
                    .await
                    .map(|h| h.schema_version)
                    .unwrap_or(0);
                if actual != WS_SCHEMA_VERSION {
                    return Err(ServerLaunchError::SchemaMismatch {
                        expected: WS_SCHEMA_VERSION,
                        actual,
                    });
                }
                return Ok(());
            }
            _ => sleep(Duration::from_millis(150)).await,
        }
    }

    Err(ServerLaunchError::StartupTimeout)
}

pub async fn launch_server() -> Result<ServerHandle, ServerLaunchError> {
    let port = find_available_port();
    let binary = server_binary_path().ok_or_else(|| ServerLaunchError::MissingBinary(
        "reprod-server (sidecar) not found next to app or in target/release; set REPROD_SERVER_PATH to override".to_string(),
    ))?;
    if !Path::new(&binary).exists() {
        return Err(ServerLaunchError::MissingBinary(
            binary.display().to_string(),
        ));
    }

    let rust_log =
        std::env::var("RUST_LOG").unwrap_or_else(|_| "reprod=info,axum=warn".to_string());
    let mut child = Command::new(&binary)
        .env(PORT_ENV, port.to_string())
        .env("RUST_LOG", &rust_log)
        .spawn()
        .map_err(|err| ServerLaunchError::SpawnFailed(err.to_string()))?;

    if let Err(err) = wait_for_server_health(port, Duration::from_secs(10)).await {
        let _ = child.kill();
        let _ = child.wait();
        return Err(err);
    }

    Ok(ServerHandle { child, port })
}
