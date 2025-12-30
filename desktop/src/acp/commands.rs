use std::{path::PathBuf, sync::Arc};

use crate::acp::types::{
    AcpAgentConfig, AcpCancelRequest, AcpDetectedAgent, AcpInitializeResponse,
    AcpPermissionDecision, AcpPromptRequest,
};
use crate::acp::runtime::DesktopAcpRuntime;
use crate::acp::{build_process_config, AcpManager};
use reprod_core::acp::config::{
    load_acp_config, normalize_active_mode, save_acp_config, ACP_MODE_API,
    ACP_MODE_EXTERNAL_AGENT,
};
use reprod_core::acp::detection::{detect_agents, resolve_active_agent_command};
use reprod_core::acp::AcpRuntime;
use tauri::{AppHandle, State};
use tracing::info;
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
    let detected = detect_agents().await.unwrap_or_default();
    let command_override = command.clone();
    let resolved_command = command.or_else(|| resolve_active_agent_command(&acp_cfg, &detected));
    if acp_cfg.active_mode == ACP_MODE_EXTERNAL_AGENT
        && command_override.is_none()
        && resolved_command.is_none()
    {
        return Err("Selected ACP agent unavailable; refresh detection and reselect".to_string());
    }
    info!(
        workspace_root = %root.display(),
        active_mode = %acp_cfg.active_mode,
        active_agent = ?acp_cfg.active_agent,
        active_agent_command = ?acp_cfg.active_agent_command,
        command_override = ?command_override,
        resolved_command = ?resolved_command,
        args = ?args,
        "Initializing ACP"
    );

    let cfg = build_process_config(&root, resolved_command, args);

    let mut manager = state.lock().await;
    manager
        .initialize(&app_handle, cfg)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn acp_create_session(state: AcpState<'_>) -> Result<String, String> {
    let runtime = DesktopAcpRuntime::new(state.inner().clone());
    runtime.create_session().await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn acp_send_prompt(state: AcpState<'_>, request: AcpPromptRequest) -> Result<(), String> {
    let manager = state.lock().await;
    if !manager.session_exists(&request.session_id) {
        return Err("Unknown session".to_string());
    }
    drop(manager);

    let runtime = DesktopAcpRuntime::new(state.inner().clone());
    runtime
        .send_prompt(
            &request.session_id,
            request.messages.iter().map(|m| m.content.clone()).collect(),
        )
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn acp_cancel(state: AcpState<'_>, request: AcpCancelRequest) -> Result<(), String> {
    let runtime = DesktopAcpRuntime::new(state.inner().clone());
    runtime
        .cancel(&request.session_id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn acp_respond_to_permission(
    state: AcpState<'_>,
    decision: AcpPermissionDecision,
) -> Result<(), String> {
    let runtime = DesktopAcpRuntime::new(state.inner().clone());
    runtime
        .respond_permission(decision)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn acp_detect_agents() -> Result<Vec<AcpDetectedAgent>, String> {
    detect_agents().await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn acp_get_agent_config() -> Result<AcpAgentConfig, String> {
    info!("Fetching ACP config");
    load_acp_config()
        .map(|cfg| AcpAgentConfig {
            active_mode: cfg.active_mode,
            active_agent: cfg.active_agent,
            active_agent_command: cfg.active_agent_command,
        })
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn acp_set_agent_config(
    active_mode: String,
    active_agent: Option<String>,
) -> Result<AcpAgentConfig, String> {
    info!(
        active_mode = %active_mode,
        active_agent = ?active_agent,
        "Saving ACP config"
    );
    let mut cfg = load_acp_config().unwrap_or_default();
    let normalized_mode = normalize_active_mode(&active_mode).map_err(|err| err.to_string())?;

    cfg.active_mode = normalized_mode.clone();
    cfg.active_agent = None;
    cfg.active_agent_command = None;
    if normalized_mode != ACP_MODE_API {
        let selected = active_agent
            .clone()
            .ok_or_else(|| "active_agent must be set for external_agent mode".to_string())?;
        let detected = detect_agents().await.map_err(|err| err.to_string())?;
        cfg.active_agent = Some(selected);
        cfg.active_agent_command = Some(
            resolve_active_agent_command(&cfg, &detected)
                .ok_or_else(|| "ACP agent unavailable or not detected".to_string())?,
        );
    }

    save_acp_config(&cfg).map_err(|err| err.to_string())?;
    info!(
        active_mode = %cfg.active_mode,
        active_agent = ?cfg.active_agent,
        active_agent_command = ?cfg.active_agent_command,
        "Saved ACP config"
    );

    Ok(AcpAgentConfig {
        active_mode: cfg.active_mode,
        active_agent: cfg.active_agent,
        active_agent_command: cfg.active_agent_command,
    })
}
