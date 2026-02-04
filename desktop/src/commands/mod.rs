use reprod_core::{ai, ChatMessage, Config, ExecutionRequest, ExecutionResult, RExecutor};
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{mpsc, Mutex};

pub mod fs;

use crate::{
    server_launcher::SharedServerHandle,
    terminal::{TerminalEvent, TerminalManager},
};

#[derive(Serialize, Clone)]
struct TerminalOutputPayload {
    session_id: String,
    data: String,
}

#[derive(Serialize, Clone)]
struct TerminalExitPayload {
    session_id: String,
    exit_code: Option<i32>,
}

#[derive(Serialize, Clone)]
struct TerminalErrorPayload {
    session_id: String,
    message: String,
}

#[derive(Serialize, Clone)]
struct TerminalKeepAlivePayload {
    session_id: String,
}

#[tauri::command]
pub async fn execute_r_code(
    request: ExecutionRequest,
    executor: State<'_, Arc<Mutex<RExecutor>>>,
) -> Result<ExecutionResult, String> {
    let executor = executor.lock().await;
    executor.execute(request).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_ai_message(
    messages: Vec<ChatMessage>,
    config: State<'_, Arc<Mutex<Config>>>,
) -> Result<String, String> {
    let cfg = config.lock().await.clone();
    ai::send_message_with_config(&cfg, messages)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_api_key(
    provider: String,
    config: State<'_, Arc<Mutex<Config>>>,
) -> Result<String, String> {
    let config = config.lock().await;

    match provider.as_str() {
        reprod_core::ai::PROVIDER_ANTHROPIC => config
            .anthropic_api_key
            .clone()
            .ok_or_else(|| "Anthropic API key not configured".to_string()),
        reprod_core::ai::PROVIDER_OPENAI => config
            .openai_api_key
            .clone()
            .ok_or_else(|| "OpenAI API key not configured".to_string()),
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

#[tauri::command]
pub async fn set_api_key(
    provider: String,
    api_key: String,
    config: State<'_, Arc<Mutex<Config>>>,
) -> Result<(), String> {
    let mut config = config.lock().await;

    match provider.as_str() {
        reprod_core::ai::PROVIDER_ANTHROPIC => config.anthropic_api_key = Some(api_key),
        reprod_core::ai::PROVIDER_OPENAI => config.openai_api_key = Some(api_key),
        _ => return Err(format!("Unknown provider: {}", provider)),
    }

    config.save().map_err(|e| e.to_string())?;
    drop(config);

    Ok(())
}

#[tauri::command]
pub async fn create_terminal_session(
    shell: Option<String>,
    manager: State<'_, Arc<TerminalManager>>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let (tx, mut rx) = mpsc::unbounded_channel();
    let session = manager
        .create_session(shell, tx)
        .await
        .map_err(|err| err.to_string())?;
    let session_id = session.id;
    let session_id_for_task = session_id.clone();
    let emitter = app_handle.clone();

    let _ = emitter.emit(
        "terminal-output",
        TerminalOutputPayload {
            session_id: session_id.clone(),
            data: "Shell started. Type commands to begin.\r\n".to_string(),
        },
    );

    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                TerminalEvent::Output(data) => {
                    let _ = emitter.emit(
                        "terminal-output",
                        TerminalOutputPayload {
                            session_id: session_id_for_task.clone(),
                            data,
                        },
                    );
                }
                TerminalEvent::Exit(code) => {
                    let _ = emitter.emit(
                        "terminal-exited",
                        TerminalExitPayload {
                            session_id: session_id_for_task.clone(),
                            exit_code: code,
                        },
                    );
                }
                TerminalEvent::Error(message) => {
                    let _ = emitter.emit(
                        "terminal-error",
                        TerminalErrorPayload {
                            session_id: session_id_for_task.clone(),
                            message,
                        },
                    );
                }
                TerminalEvent::KeepAlive => {
                    let _ = emitter.emit(
                        "terminal-keepalive",
                        TerminalKeepAlivePayload {
                            session_id: session_id_for_task.clone(),
                        },
                    );
                }
            }
        }
    });

    Ok(session_id)
}

#[tauri::command]
pub async fn write_to_terminal(
    session_id: String,
    data: String,
    manager: State<'_, Arc<TerminalManager>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    match manager.write(&session_id, &data).await {
        Ok(()) => {
            // Optimistic echo so the UI can confirm delivery.
            let _ = app_handle.emit(
                "terminal-output",
                TerminalOutputPayload { session_id, data },
            );
            Ok(())
        }
        Err(err) => {
            let _ = app_handle.emit(
                "terminal-error",
                TerminalErrorPayload {
                    session_id: session_id.clone(),
                    message: err.to_string(),
                },
            );
            Err(err.to_string())
        }
    }
}

#[tauri::command]
pub async fn resize_terminal(
    session_id: String,
    cols: u16,
    rows: u16,
    manager: State<'_, Arc<TerminalManager>>,
) -> Result<(), String> {
    manager
        .resize(&session_id, cols, rows)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn close_terminal_session(
    session_id: String,
    manager: State<'_, Arc<TerminalManager>>,
) -> Result<(), String> {
    manager
        .close(&session_id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn get_server_port(server: State<'_, SharedServerHandle>) -> Result<u16, String> {
    let server = server.lock().await;
    Ok(server.port())
}
