use crate::projects::ProjectRuntime;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use reprod_core::{
    fs::{FileSystemEvent, FileWatcher},
    project::ProjectRecord,
    ExecutionRequest,
};
use serde_json::{self, json};
use std::{
    path::{Path, PathBuf},
    sync::{
        mpsc::{self, RecvTimeoutError, TryRecvError},
        Arc,
    },
    thread,
    time::Duration,
};
use tokio::sync::mpsc as tokio_mpsc;

mod ai_handler;
mod common;
mod export_handler;
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

const FILE_WATCHER_POLL_INTERVAL_MS: u64 = 250;

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
                match maybe_event {
                    Some(event) => {
                        if let Ok(payload) = serde_json::to_string(&WSResponse::FileSystemEvent { event }) {
                            if socket.send(Message::Text(payload)).await.is_err() {
                                break 'ws_loop;
                            }
                        } else {
                            tracing::error!("Failed to serialize file system event");
                        }
                    }
                    None => {
                        fs_events_closed = true;
                    }
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(request) = serde_json::from_str::<WSRequest>(&text) {
                            let continue_loop = match request {
                                WSRequest::ProjectList => {
                                    let projects = state.projects.list_projects().await;
                                    send_responses(&mut socket, vec![WSResponse::ProjectList { projects }]).await
                                }
                                WSRequest::ProjectOpen { project_id } => {
                                    match state.projects.runtime_for(&project_id).await {
                                        Ok(runtime) => {
                                            current_runtime = runtime;
                                            if let Some(handle) = fs_watcher.take() {
                                                handle.stop();
                                            }
                                            fs_watcher = Some(spawn_fs_watcher(
                                                current_runtime.descriptor.root_path.clone(),
                                                fs_event_tx.clone(),
                                            ));
                                            fs_events_closed = false;
                                            send_responses(
                                                &mut socket,
                                                vec![build_project_opened_response(&state, &current_runtime).await],
                                            )
                                            .await
                                        }
                                        Err(error) => send_responses(&mut socket, error_response(error.to_string())).await,
                                    }
                                }
                                WSRequest::ProjectCreate { name, path } => {
                                    match state.projects.create_new_project(Path::new(&path), &name).await {
                                        Ok(descriptor) => {
                                            match state.projects.runtime_for(&descriptor.config.id).await {
                                                Ok(runtime) => {
                                                    current_runtime = runtime;
                                                    if let Some(handle) = fs_watcher.take() {
                                                        handle.stop();
                                                    }
                                                    fs_watcher = Some(spawn_fs_watcher(
                                                        current_runtime.descriptor.root_path.clone(),
                                                        fs_event_tx.clone(),
                                                    ));
                                                    send_responses(
                                                        &mut socket,
                                                        vec![build_project_opened_response(&state, &current_runtime).await],
                                                    ).await
                                                }
                                                Err(error) => send_responses(&mut socket, error_response(error.to_string())).await,
                                            }
                                        }
                                        Err(error) => send_responses(&mut socket, error_response(error.to_string())).await,
                                    }
                                }
                                WSRequest::ProjectAddExisting { path } => {
                                    match state.projects.add_existing_project(Path::new(&path)).await {
                                        Ok(descriptor) => {
                                            match state.projects.runtime_for(&descriptor.config.id).await {
                                                Ok(runtime) => {
                                                    current_runtime = runtime;
                                                    if let Some(handle) = fs_watcher.take() {
                                                        handle.stop();
                                                    }
                                                    fs_watcher = Some(spawn_fs_watcher(
                                                        current_runtime.descriptor.root_path.clone(),
                                                        fs_event_tx.clone(),
                                                    ));
                                                    send_responses(
                                                        &mut socket,
                                                        vec![build_project_opened_response(&state, &current_runtime).await],
                                                    ).await
                                                }
                                                Err(error) => send_responses(&mut socket, error_response(error.to_string())).await,
                                            }
                                        }
                                        Err(error) => send_responses(&mut socket, error_response(error.to_string())).await,
                                    }
                                }
                                WSRequest::ProjectClone { remote, path, name } => {
                                    match state.projects.clone_project(&remote, Path::new(&path), name).await {
                                        Ok(descriptor) => {
                                            match state.projects.runtime_for(&descriptor.config.id).await {
                                                Ok(runtime) => {
                                                    current_runtime = runtime;
                                                    if let Some(handle) = fs_watcher.take() {
                                                        handle.stop();
                                                    }
                                                    fs_watcher = Some(spawn_fs_watcher(
                                                        current_runtime.descriptor.root_path.clone(),
                                                        fs_event_tx.clone(),
                                                    ));
                                                    send_responses(
                                                        &mut socket,
                                                        vec![build_project_opened_response(&state, &current_runtime).await],
                                                    ).await
                                                }
                                                Err(error) => send_responses(&mut socket, error_response(error.to_string())).await,
                                            }
                                        }
                                        Err(error) => send_responses(&mut socket, error_response(error.to_string())).await,
                                    }
                                }
                                WSRequest::ProjectStateLoad { project_id } => {
                                    match state.projects.load_state(&project_id).await {
                                        Ok(state_payload) => {
                                            send_responses(
                                                &mut socket,
                                                vec![WSResponse::ProjectState {
                                                    project_id,
                                                    state: state_payload,
                                                }],
                                            )
                                            .await
                                        }
                                        Err(error) => send_responses(&mut socket, error_response(error.to_string())).await,
                                    }
                                }
                                WSRequest::ProjectStateSave { project_id, state: payload } => {
                                    match state.projects.save_state(&project_id, payload).await {
                                        Ok(()) => {
                                            send_responses(
                                                &mut socket,
                                                vec![WSResponse::ProjectStateSaved { project_id }],
                                            )
                                            .await
                                        }
                                        Err(error) => send_responses(&mut socket, error_response(error.to_string())).await,
                                    }
                                }
                                other => {
                                    let responses = handle_ws_request(other, &state, &current_runtime).await;
                                    send_responses(&mut socket, responses).await
                                }
                            };

                            if !continue_loop {
                                break 'ws_loop;
                            }
                        } else {
                            tracing::warn!("Failed to parse WebSocket request: {}", text);
                        }
                    }
                    Some(Ok(Message::Close(_))) => break 'ws_loop,
                    Some(Err(err)) => {
                        tracing::warn!("WebSocket error: {}", err);
                        break 'ws_loop;
                    }
                    Some(_) => {}
                    None => break 'ws_loop,
                }
            }
        }
    }

    if let Some(handle) = fs_watcher.take() {
        handle.stop();
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

struct FsWatcherHandle {
    stop_tx: mpsc::Sender<()>,
    handle: thread::JoinHandle<()>,
}

impl FsWatcherHandle {
    fn stop(self) {
        let _ = self.stop_tx.send(());
        let _ = self.handle.join();
    }
}

fn spawn_fs_watcher(
    root: PathBuf,
    tx: tokio_mpsc::UnboundedSender<FileSystemEvent>,
) -> FsWatcherHandle {
    let (stop_tx, stop_rx) = mpsc::channel();
    let handle = thread::spawn(move || match FileWatcher::new(root) {
        Ok(watcher) => loop {
            match stop_rx.try_recv() {
                Ok(_) | Err(TryRecvError::Disconnected) => break,
                Err(TryRecvError::Empty) => {}
            }

            match watcher.recv_timeout(Duration::from_millis(FILE_WATCHER_POLL_INTERVAL_MS)) {
                Ok(Some(event)) => {
                    if tx.send(event).is_err() {
                        break;
                    }
                }
                Ok(None) => {}
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
        },
        Err(err) => {
            let _ = tx.send(FileSystemEvent::Error {
                message: err.to_string(),
            });
        }
    });

    FsWatcherHandle { stop_tx, handle }
}

async fn send_responses(socket: &mut WebSocket, responses: Vec<WSResponse>) -> bool {
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

async fn build_project_opened_response(
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
