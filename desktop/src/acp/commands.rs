use std::{path::PathBuf, sync::Arc};

use crate::acp::types::{AcpCancelRequest, AcpInitializeResponse, AcpPromptRequest};
use crate::acp::{build_process_config, AcpManager};
use tauri::{AppHandle, State};
use tokio::sync::Mutex;

pub type SharedAcpManager = Arc<Mutex<AcpManager>>;
pub type AcpState<'a> = State<'a, SharedAcpManager>;

#[tauri::command]
pub async fn acp_initialize(
    app_handle: AppHandle,
    state: AcpState<'_>,
    command: Option<String>,
    args: Option<Vec<String>>,
    workspace_root: Option<String>,
) -> Result<AcpInitializeResponse, String> {
    let root = workspace_root
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let cfg = build_process_config(&root, command, args);

    let mut manager = state.lock().await;
    manager
        .initialize(&app_handle, cfg)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn acp_create_session(state: AcpState<'_>) -> Result<String, String> {
    let manager = &mut *state.lock().await;
    manager
        .create_session()
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn acp_send_prompt(
    app_handle: AppHandle,
    state: AcpState<'_>,
    request: AcpPromptRequest,
) -> Result<(), String> {
    let manager = state.lock().await;
    if !manager.session_exists(&request.session_id) {
        return Err("Unknown session".to_string());
    }

    manager
        .send_prompt(
            &app_handle,
            &request.session_id,
            request.messages.iter().map(|m| m.content.clone()).collect(),
        )
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn acp_cancel(state: AcpState<'_>, request: AcpCancelRequest) -> Result<(), String> {
    let mut manager = state.lock().await;
    manager
        .cancel(&request.session_id)
        .await
        .map_err(|err| err.to_string())?;
    manager.remove_session(&request.session_id);
    Ok(())
}
