#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// Allow expect for critical initialization failures where panic is appropriate
#![allow(clippy::expect_used)]

mod commands;
mod terminal;

use crate::terminal::TerminalManager;
use reprod_core::{Config, RExecutor};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri_plugin_pty;

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

    tauri::Builder::default()
        .manage(r_executor)
        .manage(terminal_manager)
        .manage(config_state)
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
