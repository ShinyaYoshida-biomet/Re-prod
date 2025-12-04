use crate::projects::{ProjectRuntime, StartupAction};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use project_requests::handle_project_request;
use reprod_core::{fs::FileSystemEvent, project::ProjectRecord, ExecutionRequest};
use runtime_fs::{handle_fs_event, restart_fs_watcher, FsWatcherHandle};
use serde_json::{self, json};
use std::{future::Future, sync::Arc};
use tokio::sync::mpsc as tokio_mpsc;

mod ai_handler;
mod common;
mod export_handler;
mod plot_history_handler;
mod project_requests;
mod runtime_fs;
mod session_handler;
mod timeline_handler;
mod tool_handler;

pub use common::AppState;

use ai_handler::handle_ai_message;
use common::{error_response, WSRequest, WSResponse};
use export_handler::handle_export_request;
use plot_history_handler::{
    handle_plot_history_clear, handle_plot_history_delete, handle_plot_history_export,
    handle_plot_history_get, handle_plot_history_restore, handle_plot_history_save,
    handle_plot_history_set_active,
};
use session_handler::{handle_interrupt, handle_restart};
use timeline_handler::{handle_timeline_query, handle_timeline_stats_query};
use tool_handler::{handle_execute_tool, handle_list_tools};
use common::single_response;

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let (fs_event_tx, mut fs_event_rx) = tokio_mpsc::unbounded_channel::<FileSystemEvent>();
    let mut current_runtime: Option<Arc<ProjectRuntime>> = None;
    let mut fs_watcher: Option<FsWatcherHandle> = None;
    let mut fs_events_closed = true;

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
    current_runtime: &mut Option<Arc<ProjectRuntime>>,
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

                let responses = handle_ws_request(
                    request,
                    state,
                    current_runtime.as_ref(),
                    fs_watcher,
                    fs_event_tx,
                    fs_events_closed,
                    current_runtime,
                )
                .await;
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
    runtime: Option<&Arc<ProjectRuntime>>,
    fs_watcher: &mut Option<FsWatcherHandle>,
    fs_event_tx: &tokio_mpsc::UnboundedSender<FileSystemEvent>,
    fs_events_closed: &mut bool,
    current_runtime: &mut Option<Arc<ProjectRuntime>>,
) -> Vec<WSResponse> {
    match request {
        WSRequest::Execute { request } => {
            with_runtime(runtime, |rt| handle_execution_request(rt, request)).await
        }
        WSRequest::AIMessage {
            messages,
            enable_tools,
            request_id,
            stream,
            mode,
        } => {
            with_runtime(runtime, |rt| {
                handle_ai_message(state, rt, messages, enable_tools, request_id, stream, mode)
            })
            .await
        }
        WSRequest::ListTools => handle_list_tools(state),
        WSRequest::ExecuteTool {
            tool_id,
            capability_id,
            parameters,
        } => with_runtime(runtime, |rt| {
            handle_execute_tool(state, rt, tool_id, capability_id, parameters)
        })
        .await,
        WSRequest::TimelineQuery { query } => {
            with_runtime(runtime, |rt| handle_timeline_query(rt, query)).await
        }
        WSRequest::TimelineStatsQuery => {
            with_runtime(runtime, |rt| handle_timeline_stats_query(rt)).await
        }
        WSRequest::ExportRMarkdown { request } => {
            with_runtime(runtime, |rt| handle_export_request(state, rt, request)).await
        }
        WSRequest::InterruptExecution => with_runtime(runtime, handle_interrupt).await,
        WSRequest::RestartSession => with_runtime(runtime, handle_restart).await,
        WSRequest::FileSystemAction {
            action,
            path,
            content,
            to,
        } => {
            with_runtime(runtime, |rt| async move {
                handle_fs_action(rt, action, path, content, to)
            })
            .await
        }
        WSRequest::PlotHistoryGet => with_runtime(runtime, handle_plot_history_get).await,
        WSRequest::PlotHistorySetActive { plot_id } => {
            with_runtime(runtime, |rt| handle_plot_history_set_active(rt, plot_id)).await
        }
        WSRequest::PlotHistoryExport {
            plot_id,
            path,
            format,
        } => with_runtime(runtime, |rt| {
            handle_plot_history_export(rt, plot_id, path, format)
        })
        .await,
        WSRequest::PlotHistoryDelete { plot_id } => {
            with_runtime(runtime, |rt| handle_plot_history_delete(rt, plot_id)).await
        }
        WSRequest::PlotHistorySave => with_runtime(runtime, handle_plot_history_save).await,
        WSRequest::PlotHistoryRestore => {
            with_runtime(runtime, handle_plot_history_restore).await
        }
        WSRequest::PlotHistoryClear => with_runtime(runtime, handle_plot_history_clear).await,
        WSRequest::StartupAction => {
            handle_startup_action(
                state,
                current_runtime,
                fs_watcher,
                fs_event_tx,
                fs_events_closed,
            )
            .await
        }
        _ => Vec::new(),
    }
}

async fn handle_startup_action(
    state: &AppState,
    current_runtime: &mut Option<Arc<ProjectRuntime>>,
    fs_watcher: &mut Option<FsWatcherHandle>,
    fs_event_tx: &tokio_mpsc::UnboundedSender<FileSystemEvent>,
    fs_events_closed: &mut bool,
) -> Vec<WSResponse> {
    match state.projects.startup_behavior().await {
        StartupAction::ShowWelcome => single_response(WSResponse::StartupAction {
            action_type: "show_welcome".to_string(),
            project_id: None,
        }),
        StartupAction::OpenProject(project_id) => match state.projects.runtime_for(&project_id).await {
            Ok(runtime) => {
                *current_runtime = Some(runtime);
                if let Some(active_runtime) = current_runtime.as_ref() {
                    restart_fs_watcher(active_runtime, fs_watcher, fs_event_tx, fs_events_closed);
                    vec![
                        WSResponse::StartupAction {
                            action_type: "open_project".to_string(),
                            project_id: Some(project_id),
                        },
                        build_project_opened_response(state, active_runtime).await,
                    ]
                } else {
                    error_response("Failed to initialize project runtime")
                }
            }
            Err(error) => error_response(error.to_string()),
        },
    }
}

async fn with_runtime<F, Fut>(
    runtime: Option<&Arc<ProjectRuntime>>,
    action: F,
) -> Vec<WSResponse>
where
    F: FnOnce(&Arc<ProjectRuntime>) -> Fut,
    Fut: Future<Output = Vec<WSResponse>>,
{
    match runtime {
        Some(rt) => action(rt).await,
        None => error_response("No project is open"),
    }
}

async fn handle_execution_request(
    runtime: &Arc<ProjectRuntime>,
    request: ExecutionRequest,
) -> Vec<WSResponse> {
    let executor = runtime.r_executor.lock().await;
    match executor.execute_with_event_with_history(request).await {
        Ok((result, event, history)) => {
            let mut responses = vec![
                WSResponse::ExecutionResult { result },
                WSResponse::TimelineEventAdded { event },
            ];

            if !history.is_empty() {
                let active_plot_id = history.last().map(|plot| plot.id.clone());
                responses.push(WSResponse::PlotHistoryUpdated {
                    active_plot_id,
                    plots: history,
                });
            }

            responses
        }
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
