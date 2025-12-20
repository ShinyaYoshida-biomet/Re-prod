use std::{path::PathBuf, sync::Arc};

use crate::acp::config::{load_acp_config, save_acp_config};
use crate::acp::detection::detect_agents;
use crate::acp::types::{
    AcpAgentConfig, AcpCancelRequest, AcpDetectedAgent, AcpInitializeResponse,
    AcpPermissionDecision, AcpPromptRequest,
};
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

    let acp_cfg = load_acp_config().unwrap_or_default();
    let detected = detect_agents().unwrap_or_default();
    let resolved_command = command.or_else(|| {
        if acp_cfg.active_mode == "external_agent" {
            acp_cfg.active_agent.as_ref().and_then(|active_id| {
                detected
                    .iter()
                    .find(|agent| agent.id == *active_id && agent.available)
                    .and_then(|agent| {
                        agent
                            .path
                            .as_ref()
                            .map(|p| p.to_string_lossy().to_string())
                            .or_else(|| Some(agent.command.clone()))
                    })
            })
        } else {
            None
        }
    });

    let cfg = build_process_config(&root, resolved_command, args);

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

#[tauri::command]
pub async fn acp_respond_to_permission(
    state: AcpState<'_>,
    decision: AcpPermissionDecision,
) -> Result<(), String> {
    let manager = state.lock().await;
    manager
        .respond_permission(decision)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn acp_detect_agents() -> Result<Vec<AcpDetectedAgent>, String> {
    detect_agents().map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn acp_get_agent_config() -> Result<AcpAgentConfig, String> {
    load_acp_config()
        .map(|cfg| AcpAgentConfig {
            active_mode: cfg.active_mode,
            active_agent: cfg.active_agent,
        })
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn acp_set_agent_config(
    active_mode: String,
    active_agent: Option<String>,
) -> Result<AcpAgentConfig, String> {
    let mut cfg = load_acp_config().unwrap_or_default();
    let normalized_mode = active_mode.to_lowercase();
    if normalized_mode != "api" && normalized_mode != "external_agent" {
        return Err("Invalid active_mode; use 'api' or 'external_agent'".to_string());
    }

    cfg.active_mode = normalized_mode.clone();
    cfg.active_agent = if normalized_mode == "api" {
        None
    } else {
        active_agent
    };

    save_acp_config(&cfg).map_err(|err| err.to_string())?;

    Ok(AcpAgentConfig {
        active_mode: cfg.active_mode,
        active_agent: cfg.active_agent,
    })
}
