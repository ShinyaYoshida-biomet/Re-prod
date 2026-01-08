use std::path::Path;
use std::sync::Arc;

use axum::extract::ws::WebSocket;
use tokio::sync::broadcast;

use super::common::{error_response, WSRequest};
use super::runtime_fs::restart_fs_watcher;
use super::{build_project_opened_response, send_responses, AppState};
use crate::projects::{ProjectRuntime, RuntimeBroadcastEvent};
use reprod_core::acp::types::{AcpPermissionRequestPayload, AcpSessionUpdateEnvelope};
use reprod_core::fs::FileSystemEvent;
use tokio::sync::mpsc as tokio_mpsc;

use super::runtime_fs::FsWatcherHandle;

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
            let folder_path = Path::new(path);
            if !folder_path.exists() {
                return Some(
                    send_responses(socket, error_response("Folder does not exist")).await,
                );
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
                    folder_path,
                )
                .await,
            )
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
            *current_runtime = runtime;
            *run_event_rx = current_runtime.run_events.subscribe();
            *acp_update_rx = current_runtime.acp.subscribe_session_updates().await;
            *acp_permission_rx = current_runtime.acp.subscribe_permission_requests().await;
            restart_fs_watcher(current_runtime, fs_watcher, fs_event_tx, fs_events_closed);

            let responses = vec![build_project_opened_response(current_runtime).await];
            send_responses(socket, responses).await
        }
        Err(error) => send_responses(socket, error_response(error.to_string())).await,
    }
}
