pub mod commands;
pub mod runtime;

pub use reprod_acp::types;

use std::path::PathBuf;

use anyhow::Result;
use reprod_acp::{
    types::{
        AcpInitializeResponse, AcpPermissionDecision, AcpPermissionRequestPayload,
        AcpSessionUpdateEnvelope,
    },
    AcpGateway, ProcessConfig,
};
use tauri::{AppHandle, Emitter};
use tracing::{info, warn};
use tokio::sync::broadcast;

struct Forwarders {
    updates: tauri::async_runtime::JoinHandle<()>,
    permissions: tauri::async_runtime::JoinHandle<()>,
}

/// Manages the lifecycle of the external ACP agent and simple in-memory sessions.
pub struct AcpManager {
    gateway: AcpGateway,
    forwarders: Option<Forwarders>,
}

impl AcpManager {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self {
            gateway: AcpGateway::new(workspace_root),
            forwarders: None,
        }
    }

    pub async fn initialize(
        &mut self,
        app_handle: &AppHandle,
        config: ProcessConfig,
    ) -> Result<AcpInitializeResponse> {
        if self.gateway.is_running() {
            return Ok(AcpInitializeResponse {
                workspace_root: self.gateway.workspace_root().to_path_buf(),
                status: "already_running".to_string(),
            });
        }

        let response = self.gateway.initialize(config).await?;
        self.start_forwarders(app_handle.clone());
        info!("ACP agent ready");
        Ok(response)
    }

    pub async fn create_session(&mut self) -> Result<String> {
        self.gateway.create_session().await
    }

    pub fn session_exists(&self, session_id: &str) -> bool {
        self.gateway.session_exists(session_id)
    }

    pub fn remove_session(&mut self, session_id: &str) {
        self.gateway.remove_session(session_id);
    }

    pub async fn cancel(&self, session_id: &str) -> Result<()> {
        self.gateway.cancel(session_id).await
    }

    pub async fn respond_permission(&self, decision: AcpPermissionDecision) -> Result<()> {
        self.gateway.respond_permission(decision).await
    }

    pub async fn send_prompt(&self, session_id: &str, messages: Vec<String>) -> Result<()> {
        self.gateway.send_prompt(session_id, messages).await
    }

    pub fn subscribe_session_updates(
        &self,
    ) -> broadcast::Receiver<AcpSessionUpdateEnvelope> {
        self.gateway.subscribe_session_updates()
    }

    pub fn subscribe_permission_requests(
        &self,
    ) -> broadcast::Receiver<AcpPermissionRequestPayload> {
        self.gateway.subscribe_permission_requests()
    }

    pub async fn shutdown(&mut self) {
        if let Some(handles) = self.forwarders.take() {
            handles.updates.abort();
            handles.permissions.abort();
        }
        self.gateway.shutdown().await;
    }

    fn start_forwarders(&mut self, app_handle: AppHandle) {
        if self.forwarders.is_some() {
            return;
        }

        let mut updates_rx = self.subscribe_session_updates();
        let mut permissions_rx = self.subscribe_permission_requests();
        let handle_for_updates = app_handle.clone();
        let update_handle = tauri::async_runtime::spawn(async move {
            loop {
                match updates_rx.recv().await {
                    Ok(payload) => {
                        let _ = handle_for_updates.emit("acp://session-update", payload);
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                        warn!("ACP session update receiver lagged; skipped {skipped} events");
                    }
                }
            }
        });

        let permission_handle = tauri::async_runtime::spawn(async move {
            loop {
                match permissions_rx.recv().await {
                    Ok(request) => {
                        let _ = app_handle.emit("acp://permission-request", request);
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                        warn!("ACP permission stream lagged; skipped {skipped} prompts");
                    }
                }
            }
        });

        self.forwarders = Some(Forwarders {
            updates: update_handle,
            permissions: permission_handle,
        });
    }
}

pub use reprod_acp::build_process_config;
