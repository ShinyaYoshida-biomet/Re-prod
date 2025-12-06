#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// Allow expect for critical initialization failures where panic is appropriate
#![allow(clippy::expect_used)]

mod commands;
mod server_launcher;
mod terminal;

use crate::{server_launcher::launch_server, terminal::TerminalManager};
use reprod_core::{Config, RExecutor};
use std::sync::Arc;

use tokio::sync::Mutex;

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Initialize config from ~/.reprod/auth.json
    let config = Config::load().unwrap_or_default();

    // Initialize services
    let temp_dir = std::env::temp_dir().join("reprod");
    if let Err(e) = std::fs::create_dir_all(&temp_dir) {
        eprintln!("Failed to create temp directory: {}", e);
    }

    let r_executor = Arc::new(Mutex::new(RExecutor::new(temp_dir, config.r_path.clone())));
    let terminal_manager = Arc::new(TerminalManager::new());
    let config_state = Arc::new(Mutex::new(config));

    // Start the bundled Axum server as a sidecar so the frontend can connect.
    let server_handle = launch_server()
        .await
        .unwrap_or_else(|err| panic!("Failed to launch bundled server: {}", err));
    let server_state = Arc::new(Mutex::new(server_handle));

    let app = tauri::Builder::default()
        .manage(r_executor)
        .manage(terminal_manager)
        .manage(config_state)
        .manage(server_state.clone())
        .plugin(tauri_plugin_pty::init())
        .invoke_handler(tauri::generate_handler![
            commands::execute_r_code,
            commands::send_ai_message,
            commands::get_api_key,
            commands::set_api_key,
            commands::create_terminal_session,
            commands::write_to_terminal,
            commands::resize_terminal,
            commands::close_terminal_session,
            commands::get_server_port,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let server_for_shutdown = server_state;

    app.run(move |_app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            let server_for_shutdown = server_for_shutdown.clone();
            tauri::async_runtime::spawn(async move {
                let mut guard = server_for_shutdown.lock().await;
                guard.shutdown().await;
            });
        }
    });
}
