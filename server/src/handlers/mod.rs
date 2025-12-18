use crate::projects::ProjectRuntime;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use project_requests::handle_project_request;
use reprod_core::{
    executor::ensure_blocks,
    fs::FileSystemEvent,
    project::ProjectRecord,
    ExecutionEvent,
    ExecutionRequest,
    ExecutionResult,
    RunOutputChunk,
    RunStatus,
    RunStream,
    RunSummary,
};
use runtime_fs::{handle_fs_event, spawn_fs_watcher, FsWatcherHandle};
use serde_json::{self, json};
use std::sync::Arc;
use tokio::sync::mpsc as tokio_mpsc;
use uuid::Uuid;

mod ai_handler;
mod common;
mod export_handler;
mod plot_history_handler;
mod project_requests;
mod runtime_fs;
mod session_handler;
pub mod stream_buffer;
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
use std::process::Command;
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

                match request {
                    WSRequest::Execute { request } => {
                        handle_execution_request_streaming(socket, current_runtime, request).await
                    }
                    other => {
                        let responses = handle_ws_request(other, state, current_runtime).await;
                        send_responses(socket, responses).await
                    }
                }
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
        WSRequest::PlotHistoryGet => handle_plot_history_get(runtime).await,
        WSRequest::PlotHistorySetActive { plot_id } => {
            handle_plot_history_set_active(runtime, plot_id).await
        }
        WSRequest::PlotHistoryExport {
            plot_id,
            path,
            format,
        } => handle_plot_history_export(runtime, plot_id, path, format).await,
        WSRequest::PlotHistoryDelete { plot_id } => {
            handle_plot_history_delete(runtime, plot_id).await
        }
        WSRequest::PlotHistorySave => handle_plot_history_save(runtime).await,
        WSRequest::PlotHistoryRestore => handle_plot_history_restore(runtime).await,
        WSRequest::PlotHistoryClear => handle_plot_history_clear(runtime).await,
        WSRequest::RunQuery { limit } => match runtime
            .execution_repo
            .latest_runs(limit.unwrap_or(50))
            .await
        {
            Ok(events) => build_run_state_responses(runtime, events).await,
            Err(e) => error_response(format!("Run query failed: {}", e)),
        },
        _ => Vec::new(),
    }
}

async fn handle_execution_request_streaming(
    socket: &mut WebSocket,
    runtime: &Arc<ProjectRuntime>,
    request: ExecutionRequest,
) -> bool {
    let run_id = Uuid::new_v4().to_string();
    let started_at = common::now_millis() as u64;
    let mut request = request;
    request.context.triggered_at_ms = started_at;

    let mut blocks = ensure_blocks(&request);
    for (idx, block) in blocks.iter_mut().enumerate() {
        block.index = idx as u32;
        if block.label.is_none() {
            block.label = Some(format!("Block {}", idx + 1));
        }
    }
    request.blocks = blocks.clone();

    let environment = {
        let executor = runtime.r_executor.lock().await;
        executor.environment_snapshot()
    };

    let running_event = ExecutionEvent {
        event_id: run_id.clone(),
        context: request.context.clone(),
        blocks,
        result: ExecutionResult {
            success: false,
            output: String::new(),
            error: None,
            plots: Vec::new(),
            execution_time_ms: 0,
        },
        environment,
        created_at_ms: started_at,
        status: RunStatus::Running,
        started_at_ms: started_at,
        finished_at_ms: None,
        duration_ms: None,
    };

    if let Err(e) = runtime
        .execution_repo
        .create_run(running_event.clone())
        .await
    {
        return send_responses(
            socket,
            error_response(format!("Failed to create run: {}", e)),
        )
        .await;
    }

    let started_summary = run_summary_from_event(&running_event);
    let accepted_and_started = vec![
        WSResponse::RunAccepted {
            run_id: run_id.clone(),
        },
        WSResponse::RunStarted {
            run: started_summary,
        },
    ];
    if !send_responses(socket, accepted_and_started).await {
        return false;
    }

    let responses =
        handle_execution_request_body(runtime, request, run_id, running_event).await;
    send_responses(socket, responses).await
}

async fn handle_execution_request_body(
    runtime: &Arc<ProjectRuntime>,
    request: ExecutionRequest,
    run_id: String,
    running_event: ExecutionEvent,
) -> Vec<WSResponse> {
    let mut responses: Vec<WSResponse> = Vec::new();

    let executor = runtime.r_executor.lock().await;
    match executor.execute_with_event_with_history(request).await {
        Ok((result, mut event, history, streamed_chunks)) => {
            let finished_at = common::now_millis() as u64;

            {
                let mut buffer = runtime.stream_buffer.lock().await;
                for mut chunk in streamed_chunks {
                    chunk.run_id = run_id.clone();
                    buffer.append(chunk.clone());
                    responses.push(WSResponse::RunOutput(chunk));
                }
            }

            let (stdout, stderr) = {
                let mut buffer = runtime.stream_buffer.lock().await;
                buffer.finalize(&run_id)
            };

            event.event_id = run_id.clone();
            event.started_at_ms = running_event.started_at_ms;
            event.finished_at_ms = Some(finished_at);
            event.duration_ms = Some(finished_at.saturating_sub(running_event.started_at_ms));
            event.created_at_ms = finished_at;
            if !stdout.is_empty() {
                event.result.output = stdout.clone();
            }
            if let Some(err) = stderr.clone() {
                event.result.error = Some(err);
            }
            if event.result.output.is_empty() && !result.output.is_empty() {
                event.result.output = result.output.clone();
            }
            if event.result.error.is_none() {
                event.result.error = result.error.clone();
            }
            event.status = if result.success {
                RunStatus::Succeeded
            } else {
                RunStatus::Failed
            };

            if responses
                .iter()
                .all(|r| !matches!(r, WSResponse::RunOutput(_)))
            {
                responses.extend(
                    run_output_chunks_from_event(&event)
                        .into_iter()
                        .map(WSResponse::RunOutput),
                );
            }

            if let Err(e) = runtime.execution_repo.finish_run(event.clone()).await {
                responses.extend(error_response(format!("Failed to persist run: {}", e)));
                return responses;
            }

            let summary = run_summary_from_event(&event);
            responses.push(WSResponse::TimelineEventAdded { event: event.clone() });
            responses.push(WSResponse::RunFinished {
                run: summary,
            });

            if !history.is_empty() {
                let active_plot_id = history.last().map(|plot| plot.id.clone());
                responses.push(WSResponse::PlotHistoryUpdated {
                    active_plot_id,
                    plots: history,
                });
            }
        }
        Err(e) => {
            let finished_at = common::now_millis() as u64;
            let (stdout, stderr) = {
                let mut buffer = runtime.stream_buffer.lock().await;
                buffer.finalize(&run_id)
            };
            let error_message = e.to_string();
            let mut failed_event = running_event.clone();
            failed_event.status = RunStatus::Failed;
            failed_event.created_at_ms = finished_at;
            failed_event.finished_at_ms = Some(finished_at);
            failed_event.duration_ms = Some(finished_at.saturating_sub(running_event.started_at_ms));
            failed_event.result = ExecutionResult {
                success: false,
                output: stdout,
                error: Some(
                    stderr
                        .filter(|s| !s.is_empty())
                        .map(|s| format!("{}\n{}", s, error_message))
                        .unwrap_or_else(|| error_message.clone()),
                ),
                plots: Vec::new(),
                execution_time_ms: 0,
            };
            let _ = runtime.execution_repo.finish_run(failed_event.clone()).await;
            responses.extend(
                run_output_chunks_from_event(&failed_event)
                    .into_iter()
                    .map(WSResponse::RunOutput),
            );
            responses.extend(error_response(e.to_string()));
            responses.push(WSResponse::RunFinished {
                run: run_summary_from_event(&failed_event),
            });
        }
    }

    responses
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
        "open_external" => {
            let resolved = runtime.file_system.resolve_checked(&path);
            match resolved {
                Ok(target) => {
                    let outcome = open_in_system(&target);
                    match outcome {
                        Ok(_) => Ok(json!(null)),
                        Err(e) => Err(e.to_string()),
                    }
                }
                Err(e) => Err(e.to_string()),
            }
        }
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

fn open_in_system(path: &std::path::Path) -> Result<(), anyhow::Error> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(path).status()?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", path.to_string_lossy().as_ref()])
            .status()?;
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        Command::new("xdg-open").arg(path).status()?;
    }
    Ok(())
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

async fn build_run_state_responses(
    runtime: &Arc<ProjectRuntime>,
    events: Vec<ExecutionEvent>,
) -> Vec<WSResponse> {
    let runs: Vec<RunSummary> = events.iter().map(run_summary_from_event).collect();
    let mut responses = common::single_response(WSResponse::RunState { runs });

    for event in events {
        if matches!(event.status, RunStatus::Running) {
            let buffered = runtime
                .stream_buffer
                .lock()
                .await
                .get(&event.event_id);
            responses.extend(buffered.into_iter().map(WSResponse::RunOutput));
        } else {
            responses.extend(
                run_output_chunks_from_event(&event)
                    .into_iter()
                    .map(WSResponse::RunOutput),
            );
        }
    }

    responses
}

fn run_summary_from_event(event: &ExecutionEvent) -> RunSummary {
    RunSummary {
        run_id: event.event_id.clone(),
        status: event.status.clone(),
        started_at_ms: event.started_at_ms,
        finished_at_ms: event.finished_at_ms,
        duration_ms: event.duration_ms,
        code: event.blocks.first().map(|b| b.code.clone()),
        has_stdout: !event.result.output.is_empty(),
        has_stderr: event.result.error.is_some(),
        artifacts: None,
        plots: if event.result.plots.is_empty() {
            None
        } else {
            Some(event.result.plots.clone())
        },
        error: event.result.error.clone(),
    }
}

fn run_output_chunks_from_event(event: &ExecutionEvent) -> Vec<RunOutputChunk> {
    let at_ms = event.finished_at_ms.unwrap_or(event.created_at_ms);
    let mut chunks = Vec::new();

    if !event.result.output.is_empty() {
        chunks.push(RunOutputChunk {
            run_id: event.event_id.clone(),
            stream: RunStream::Stdout,
            chunk: event.result.output.clone(),
            at_ms,
        });
    }

    if let Some(err) = &event.result.error {
        chunks.push(RunOutputChunk {
            run_id: event.event_id.clone(),
            stream: RunStream::Stderr,
            chunk: err.clone(),
            at_ms,
        });
    }

    chunks
}
