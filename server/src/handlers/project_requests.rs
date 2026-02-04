use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::extract::ws::WebSocket;
use tokio::sync::broadcast;

use super::common::{error_response, WSRequest};
use super::runtime_fs::restart_fs_watcher;
use super::{build_project_opened_response, send_responses, AppState};
use crate::projects::{ProjectRuntime, RuntimeBroadcastEvent};
use reprod_core::acp::types::{AcpPermissionRequestPayload, AcpSessionUpdateEnvelope};
use reprod_core::config::workspace_root_override;
use reprod_core::fs::FileSystemEvent;
use tokio::sync::mpsc as tokio_mpsc;

use super::runtime_fs::FsWatcherHandle;

/// Normalizes incoming path strings to handle various formats.
///
/// Supports:
/// - file:// URLs (e.g., "file:///Users/me/workspace")
/// - Tilde expansion (e.g., "~/workspace")
/// - Regular file paths
fn normalize_incoming_path(path: &str) -> PathBuf {
    // Handle file:// URLs
    if path.starts_with("file://") {
        // Remove the file:// prefix and decode percent-encoded characters
        if let Ok(url) = url::Url::parse(path) {
            if let Ok(path) = url.to_file_path() {
                return path;
            }
        }
        // Fallback: simple string manipulation if URL parsing fails
        return PathBuf::from(path.trim_start_matches("file://"));
    }

    // Handle tilde expansion
    if path.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(&path[2..]);
        }
    } else if path == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }

    // Fallback to treating as regular path
    PathBuf::from(path)
}

pub async fn handle_project_request(
    request: &WSRequest,
    state: &AppState,
    current_runtime: &mut Arc<ProjectRuntime>,
    run_event_rx: &mut broadcast::Receiver<RuntimeBroadcastEvent>,
    acp_update_rx: &mut broadcast::Receiver<AcpSessionUpdateEnvelope>,
    acp_permission_rx: &mut broadcast::Receiver<AcpPermissionRequestPayload>,
    fs_watcher: &mut Option<FsWatcherHandle>,
    fs_event_tx: &tokio_mpsc::UnboundedSender<FileSystemEvent>,
    fs_events_closed: &mut bool,
    socket: &mut WebSocket,
) -> Option<bool> {
    match request {
        WSRequest::ProjectSwitchFolder { path } => {
            let folder_path = normalize_incoming_path(path);
            if !folder_path.exists() {
                return Some(send_responses(socket, error_response("Folder does not exist")).await);
            }
            if !folder_path.is_dir() {
                return Some(
                    send_responses(socket, error_response("Selected path is not a folder")).await,
                );
            }

            Some(
                switch_runtime_for_path(
                    state,
                    current_runtime,
                    run_event_rx,
                    acp_update_rx,
                    acp_permission_rx,
                    fs_watcher,
                    fs_event_tx,
                    fs_events_closed,
                    socket,
                    &folder_path,
                )
                .await,
            )
        }
        WSRequest::ProjectList => {
            let root = resolve_project_root(current_runtime);
            match state.projects.list_projects(&root).await {
                Ok(projects) => Some(
                    send_responses(
                        socket,
                        vec![super::common::WSResponse::ProjectListResult { projects }],
                    )
                    .await,
                ),
                Err(error) => Some(send_responses(socket, error_response(error.to_string())).await),
            }
        }
        WSRequest::ProjectSwitch { project_id } => {
            let root = resolve_project_root(current_runtime);
            match state
                .projects
                .runtime_for_project_id(&root, project_id)
                .await
            {
                Ok(runtime) => Some(
                    switch_runtime(
                        current_runtime,
                        run_event_rx,
                        acp_update_rx,
                        acp_permission_rx,
                        fs_watcher,
                        fs_event_tx,
                        fs_events_closed,
                        socket,
                        runtime,
                    )
                    .await,
                ),
                Err(error) => Some(send_responses(socket, error_response(error.to_string())).await),
            }
        }
        WSRequest::ProjectCreate { name, base_path } => {
            let root = match workspace_root_override() {
                Some(path) => path,
                None => {
                    return Some(
                        send_responses(socket, error_response("Project root is not configured"))
                            .await,
                    )
                }
            };
            let base_path = base_path.as_deref().map(Path::new);
            match state.projects.create_project(&root, name, base_path).await {
                Ok(project) => Some(
                    send_responses(
                        socket,
                        vec![super::common::WSResponse::ProjectCreated { project }],
                    )
                    .await,
                ),
                Err(error) => Some(send_responses(socket, error_response(error.to_string())).await),
            }
        }
        _ => None,
    }
}

async fn switch_runtime_for_path(
    state: &AppState,
    current_runtime: &mut Arc<ProjectRuntime>,
    run_event_rx: &mut broadcast::Receiver<RuntimeBroadcastEvent>,
    acp_update_rx: &mut broadcast::Receiver<AcpSessionUpdateEnvelope>,
    acp_permission_rx: &mut broadcast::Receiver<AcpPermissionRequestPayload>,
    fs_watcher: &mut Option<FsWatcherHandle>,
    fs_event_tx: &tokio_mpsc::UnboundedSender<FileSystemEvent>,
    fs_events_closed: &mut bool,
    socket: &mut WebSocket,
    folder_path: &Path,
) -> bool {
    match state.projects.runtime_for_path(folder_path).await {
        Ok(runtime) => {
            switch_runtime(
                current_runtime,
                run_event_rx,
                acp_update_rx,
                acp_permission_rx,
                fs_watcher,
                fs_event_tx,
                fs_events_closed,
                socket,
                runtime,
            )
            .await
        }
        Err(error) => send_responses(socket, error_response(error.to_string())).await,
    }
}

fn resolve_project_root(current_runtime: &Arc<ProjectRuntime>) -> PathBuf {
    workspace_root_override().unwrap_or_else(|| current_runtime.descriptor.root_path.clone())
}

async fn switch_runtime(
    current_runtime: &mut Arc<ProjectRuntime>,
    run_event_rx: &mut broadcast::Receiver<RuntimeBroadcastEvent>,
    acp_update_rx: &mut broadcast::Receiver<AcpSessionUpdateEnvelope>,
    acp_permission_rx: &mut broadcast::Receiver<AcpPermissionRequestPayload>,
    fs_watcher: &mut Option<FsWatcherHandle>,
    fs_event_tx: &tokio_mpsc::UnboundedSender<FileSystemEvent>,
    fs_events_closed: &mut bool,
    socket: &mut WebSocket,
    runtime: Arc<ProjectRuntime>,
) -> bool {
    *current_runtime = runtime;
    *run_event_rx = current_runtime.run_events.subscribe();
    *acp_update_rx = current_runtime.acp.subscribe_session_updates().await;
    *acp_permission_rx = current_runtime.acp.subscribe_permission_requests().await;
    restart_fs_watcher(current_runtime, fs_watcher, fs_event_tx, fs_events_closed);

    let responses = vec![build_project_opened_response(current_runtime).await];
    send_responses(socket, responses).await
}
