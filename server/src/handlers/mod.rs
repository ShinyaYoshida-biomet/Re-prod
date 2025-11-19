use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use reprod_core::{
    fs::{FileSystemEvent, FileWatcher},
    ExecutionRequest,
};
use serde_json::{self, json};
use std::{
    path::PathBuf,
    sync::mpsc::{self, RecvTimeoutError, TryRecvError},
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
    let (fs_event_tx, mut fs_event_rx) = tokio_mpsc::unbounded_channel::<FileSystemEvent>();
    let workspace_root = state.fs.root_path().to_path_buf();
    let mut fs_watcher = Some(spawn_fs_watcher(workspace_root, fs_event_tx));
    let mut fs_events_closed = false;

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
                            let responses = handle_ws_request(request, &state).await;

                            for response in responses {
                                if let Ok(response_text) = serde_json::to_string(&response) {
                                    if socket.send(Message::Text(response_text)).await.is_err() {
                                        break 'ws_loop;
                                    }
                                } else {
                                    tracing::error!("Failed to serialize WebSocket response");
                                }
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

async fn handle_ws_request(request: WSRequest, state: &AppState) -> Vec<WSResponse> {
    match request {
        WSRequest::Execute { request } => handle_execution_request(state, request).await,
        WSRequest::AIMessage {
            messages,
            enable_tools,
            request_id,
            stream,
            mode,
        } => handle_ai_message(state, messages, enable_tools, request_id, stream, mode).await,
        WSRequest::ListTools => handle_list_tools(state),
        WSRequest::ExecuteTool {
            tool_id,
            capability_id,
            parameters,
        } => handle_execute_tool(state, tool_id, capability_id, parameters).await,
        WSRequest::TimelineQuery { query } => handle_timeline_query(state, query),
        WSRequest::TimelineStatsQuery => handle_timeline_stats_query(state),
        WSRequest::ExportRMarkdown { request } => handle_export_request(state, request).await,
        WSRequest::InterruptExecution => handle_interrupt(state).await,
        WSRequest::RestartSession => handle_restart(state).await,
        WSRequest::FileSystemAction {
            action,
            path,
            content,
            to,
        } => handle_fs_action(state, action, path, content, to),
    }
}

async fn handle_execution_request(state: &AppState, request: ExecutionRequest) -> Vec<WSResponse> {
    let executor = state.r_executor.lock().await;
    match executor.execute_with_event(request).await {
        Ok((result, event)) => vec![
            WSResponse::ExecutionResult { result },
            WSResponse::TimelineEventAdded { event },
        ],
        Err(e) => error_response(e.to_string()),
    }
}

fn handle_fs_action(
    state: &AppState,
    action: String,
    path: String,
    content: Option<String>,
    to: Option<String>,
) -> Vec<WSResponse> {
    let result = match action.as_str() {
        "list" => state
            .fs
            .list_dir(&path)
            .map(|entries| json!(entries))
            .map_err(|e| e.to_string()),
        "read" => state
            .fs
            .read_file(&path)
            .map(|content| json!(content))
            .map_err(|e| e.to_string()),
        "write" => state
            .fs
            .write_file(&path, content.as_deref().unwrap_or(""))
            .map(|_| json!(null))
            .map_err(|e| e.to_string()),
        "delete" => state
            .fs
            .delete_path(&path)
            .map(|_| json!(null))
            .map_err(|e| e.to_string()),
        "rename" => state
            .fs
            .rename_path(&path, to.as_deref().unwrap_or(""))
            .map(|_| json!(null))
            .map_err(|e| e.to_string()),
        "create_dir" => state
            .fs
            .create_dir(&path)
            .map(|_| json!(null))
            .map_err(|e| e.to_string()),
        "root" => Ok(json!(state.fs.canonical_root().display().to_string())),
        "copy" => state
            .fs
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
