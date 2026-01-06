#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// Allow expect for critical initialization failures where panic is appropriate
#![allow(clippy::expect_used)]

mod acp;
mod commands;
mod server_launcher;
mod terminal;

use crate::{acp::AcpManager, server_launcher::launch_server, terminal::TerminalManager};
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
    let workspace_root = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let acp_state = Arc::new(Mutex::new(AcpManager::new(workspace_root)));

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
        .manage(acp_state.clone())
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
            acp::commands::acp_initialize,
            acp::commands::acp_create_session,
            acp::commands::acp_send_prompt,
            acp::commands::acp_cancel,
            acp::commands::acp_respond_to_permission,
            acp::commands::acp_detect_agents,
            acp::commands::acp_get_agent_config,
            acp::commands::acp_set_agent_config,
            acp::commands::acp_accept_pending_edit,
            acp::commands::acp_reject_pending_edit,
            acp::commands::acp_update_pending_edit,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let server_for_shutdown = server_state;
    let acp_for_shutdown = acp_state;

    app.run(move |_app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            let server_for_shutdown = server_for_shutdown.clone();
            let acp_for_shutdown = acp_for_shutdown.clone();
            tauri::async_runtime::spawn(async move {
                let mut guard = server_for_shutdown.lock().await;
                guard.shutdown().await;
            });
            tauri::async_runtime::spawn(async move {
                let mut guard = acp_for_shutdown.lock().await;
                guard.shutdown().await;
            });
        }
    });
}
