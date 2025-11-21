use crate::projects::ProjectRuntime;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use project_requests::handle_project_request;
use reprod_core::{fs::FileSystemEvent, project::ProjectRecord, ExecutionRequest};
use runtime_fs::{handle_fs_event, spawn_fs_watcher, FsWatcherHandle};
use serde_json::{self, json};
use std::sync::Arc;
use tokio::sync::mpsc as tokio_mpsc;

mod ai_handler;
mod common;
mod export_handler;
mod project_requests;
mod runtime_fs;
mod session_handler;
mod timeline_handler;
mod tool_handler;

pub use common::AppState;

use ai_handler::handle_ai_message;
use common::{error_response, WSRequest, WSResponse};
use export_handler::handle_export_request;
use session_handler::{handle_interrupt, handle_restart};
use timeline_handler::{handle_timeline_query, handle_timeline_stats_query};
use tool_handler::{handle_execute_tool, handle_list_tools};

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let mut current_runtime = match state.projects.default_runtime().await {
        Ok(runtime) => runtime,
        Err(error) => {
            let _ = send_responses(&mut socket, error_response(error.to_string())).await;
            return;
        }
    };
    let (fs_event_tx, mut fs_event_rx) = tokio_mpsc::unbounded_channel::<FileSystemEvent>();
    let mut fs_watcher = Some(spawn_fs_watcher(
        current_runtime.descriptor.root_path.clone(),
        fs_event_tx.clone(),
    ));
    let mut fs_events_closed = false;

    let _ = send_responses(
        &mut socket,
        vec![build_project_opened_response(&state, &current_runtime).await],
    )
    .await;

    'ws_loop: loop {
        tokio::select! {
            maybe_event = fs_event_rx.recv(), if !fs_events_closed => {
                if !handle_fs_event(&maybe_event, &mut socket).await {
                    break 'ws_loop;
                }
                if maybe_event.is_none() {
                    fs_events_closed = true;
                }
            }
            msg = socket.recv() => {
                if !handle_ws_text(
                    msg,
                    &state,
                    &mut current_runtime,
                    &mut fs_watcher,
                    &fs_event_tx,
                    &mut fs_events_closed,
                    &mut socket,
                )
                .await {
                    break 'ws_loop;
                }
            }
        }
    }

    if let Some(handle) = fs_watcher.take() {
        handle.stop();
    }
}

async fn handle_ws_text(
    msg: Option<Result<Message, axum::Error>>,
    state: &AppState,
    current_runtime: &mut Arc<ProjectRuntime>,
    fs_watcher: &mut Option<FsWatcherHandle>,
    fs_event_tx: &tokio_mpsc::UnboundedSender<FileSystemEvent>,
    fs_events_closed: &mut bool,
    socket: &mut WebSocket,
) -> bool {
    match msg {
        Some(Ok(Message::Text(text))) => match serde_json::from_str::<WSRequest>(&text) {
            Ok(request) => {
                if let Some(continue_loop) = handle_project_request(
                    &request,
                    state,
                    current_runtime,
                    fs_watcher,
                    fs_event_tx,
                    fs_events_closed,
                    socket,
                )
                .await
                {
                    return continue_loop;
                }

                let responses = handle_ws_request(request, state, current_runtime).await;
                send_responses(socket, responses).await
            }
            Err(error) => {
                tracing::warn!("Failed to parse WebSocket request: {}", error);
                true
            }
        },
        Some(Ok(Message::Close(_))) => false,
        Some(Err(err)) => {
            tracing::warn!("WebSocket error: {}", err);
            false
        }
        Some(_) => true,
        None => false,
    }
}
async fn handle_ws_request(
    request: WSRequest,
    state: &AppState,
    runtime: &Arc<ProjectRuntime>,
) -> Vec<WSResponse> {
    match request {
        WSRequest::Execute { request } => handle_execution_request(runtime, request).await,
        WSRequest::AIMessage {
            messages,
            enable_tools,
            request_id,
            stream,
            mode,
        } => {
            handle_ai_message(
                state,
                runtime,
                messages,
                enable_tools,
                request_id,
                stream,
                mode,
            )
            .await
        }
        WSRequest::ListTools => handle_list_tools(state),
        WSRequest::ExecuteTool {
            tool_id,
            capability_id,
            parameters,
        } => handle_execute_tool(state, runtime, tool_id, capability_id, parameters).await,
        WSRequest::TimelineQuery { query } => handle_timeline_query(runtime, query),
        WSRequest::TimelineStatsQuery => handle_timeline_stats_query(runtime),
        WSRequest::ExportRMarkdown { request } => {
            handle_export_request(state, runtime, request).await
        }
        WSRequest::InterruptExecution => handle_interrupt(runtime).await,
        WSRequest::RestartSession => handle_restart(runtime).await,
        WSRequest::FileSystemAction {
            action,
            path,
            content,
            to,
        } => handle_fs_action(runtime, action, path, content, to),
        _ => Vec::new(),
    }
}

async fn handle_execution_request(
    runtime: &Arc<ProjectRuntime>,
    request: ExecutionRequest,
) -> Vec<WSResponse> {
    let executor = runtime.r_executor.lock().await;
    match executor.execute_with_event(request).await {
        Ok((result, event)) => vec![
            WSResponse::ExecutionResult { result },
            WSResponse::TimelineEventAdded { event },
        ],
        Err(e) => error_response(e.to_string()),
    }
}

fn handle_fs_action(
    runtime: &Arc<ProjectRuntime>,
    action: String,
    path: String,
    content: Option<String>,
    to: Option<String>,
) -> Vec<WSResponse> {
    let result = match action.as_str() {
        "list" => runtime
            .file_system
            .list_dir(&path)
            .map(|entries| json!(entries))
            .map_err(|e| e.to_string()),
        "read" => runtime
            .file_system
            .read_file(&path)
            .map(|content| json!(content))
            .map_err(|e| e.to_string()),
        "write" => runtime
            .file_system
            .write_file(&path, content.as_deref().unwrap_or(""))
            .map(|_| json!(null))
            .map_err(|e| e.to_string()),
        "delete" => runtime
            .file_system
            .delete_path(&path)
            .map(|_| json!(null))
            .map_err(|e| e.to_string()),
        "rename" => runtime
            .file_system
            .rename_path(&path, to.as_deref().unwrap_or(""))
            .map(|_| json!(null))
            .map_err(|e| e.to_string()),
        "create_dir" => runtime
            .file_system
            .create_dir(&path)
            .map(|_| json!(null))
            .map_err(|e| e.to_string()),
        "root" => Ok(json!(runtime
            .file_system
            .canonical_root()
            .display()
            .to_string())),
        "copy" => runtime
            .file_system
            .copy_path(&path, to.as_deref().unwrap_or(""))
            .map(|_| json!(null))
            .map_err(|e| e.to_string()),
        _ => Err(format!("Unknown FS action: {}", action)),
    };

    match result {
        Ok(data) => vec![WSResponse::FileSystemResult {
            action,
            path,
            to,
            success: true,
            data: Some(data),
            error: None,
        }],
        Err(e) => vec![WSResponse::FileSystemResult {
            action,
            path,
            to,
            success: false,
            data: None,
            error: Some(e),
        }],
    }
}

pub(in crate::handlers) async fn send_responses(
    socket: &mut WebSocket,
    responses: Vec<WSResponse>,
) -> bool {
    for response in responses {
        match serde_json::to_string(&response) {
            Ok(response_text) => {
                if socket.send(Message::Text(response_text)).await.is_err() {
                    return false;
                }
            }
            Err(error) => {
                tracing::error!("Failed to serialize WebSocket response: {}", error);
            }
        }
    }
    true
}

pub(in crate::handlers) async fn build_project_opened_response(
    state: &AppState,
    runtime: &Arc<ProjectRuntime>,
) -> WSResponse {
    let record = ProjectRecord::from(&runtime.descriptor);
    let project_state = state
        .projects
        .load_state(&record.id)
        .await
        .unwrap_or_else(|error| {
            tracing::warn!("Failed to load project state for {}: {}", record.id, error);
            None
        });

    WSResponse::ProjectOpened {
        project: record,
        state: project_state,
    }
}
