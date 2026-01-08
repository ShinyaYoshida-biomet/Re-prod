use crate::projects::ProjectRuntime;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use project_requests::handle_project_request;
use reprod_core::acp::types::{AcpPermissionRequestPayload, AcpSessionUpdateEnvelope};
use reprod_core::{
    executor::ensure_blocks, fs::FileSystemEvent, project::ProjectRecord, ArtifactInfo,
    ExecutionEvent, ExecutionRequest, ExecutionResult, RunOutputChunk, RunStatus, RunStream,
    RunSummary,
};
use runtime_fs::{handle_fs_event, spawn_fs_watcher, FsWatcherHandle};
use serde_json::{self, json};
use std::sync::Arc;
use tokio::sync::mpsc as tokio_mpsc;
use tokio::sync::{broadcast, mpsc};
use tokio::time::{Duration, Instant};
use uuid::Uuid;

mod acp_handler;
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

use crate::projects::RuntimeBroadcastEvent;
use acp_handler::{
    handle_acp_pending_edit_accept, handle_acp_pending_edit_reject, handle_acp_pending_edit_update,
    handle_acp_permission_decision, handle_acp_session_cancel, handle_acp_session_create,
    handle_acp_session_prompt,
};
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
    let mut run_event_rx: broadcast::Receiver<RuntimeBroadcastEvent> =
        current_runtime.run_events.subscribe();
    let (fs_event_tx, mut fs_event_rx) = tokio_mpsc::unbounded_channel::<FileSystemEvent>();
    let mut fs_watcher = Some(spawn_fs_watcher(
        current_runtime.descriptor.root_path.clone(),
        fs_event_tx.clone(),
    ));
    let mut fs_events_closed = false;
    let mut acp_update_rx = current_runtime.acp.subscribe_session_updates().await;
    let mut acp_permission_rx = current_runtime.acp.subscribe_permission_requests().await;

    let _ = send_responses(
        &mut socket,
        vec![build_project_opened_response(&current_runtime).await],
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
            acp_update = acp_update_rx.recv() => {
                match acp_update {
                    Ok(payload) => {
                        if !send_responses(&mut socket, vec![WSResponse::AcpSessionUpdate { session_id: payload.session_id, update: payload.update }]).await {
                            break 'ws_loop;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        tracing::warn!(
                            "ACP session updates lagged; dropped {} events",
                            skipped
                        );
                    }
                    Err(broadcast::error::RecvError::Closed) => {}
                }
            }
            acp_permission = acp_permission_rx.recv() => {
                match acp_permission {
                    Ok(request) => {
                        if !send_responses(&mut socket, vec![WSResponse::AcpPermissionRequest { request }]).await {
                            break 'ws_loop;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        tracing::warn!(
                            "ACP permission stream lagged; dropped {} prompts",
                            skipped
                        );
                    }
                    Err(broadcast::error::RecvError::Closed) => {}
                }
            }
            run_event = run_event_rx.recv() => {
                match run_event {
                    Ok(event) => {
                        let response = match event {
                            RuntimeBroadcastEvent::RunStarted { run } => WSResponse::RunStarted { run },
                            RuntimeBroadcastEvent::RunOutput { chunk } => WSResponse::RunOutput(chunk),
                            RuntimeBroadcastEvent::RunFinished { run } => WSResponse::RunFinished { run },
                            RuntimeBroadcastEvent::TimelineEventAdded { event } => WSResponse::TimelineEventAdded { event },
                            RuntimeBroadcastEvent::PlotHistoryUpdated { active_plot_id, plots } => WSResponse::PlotHistoryUpdated { active_plot_id, plots },
                        };
                        if !send_responses(&mut socket, vec![response]).await {
                            break 'ws_loop;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        // If the client falls behind, it can recover by issuing `run_query` and/or timeline queries.
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        // Runtime broadcast closed; ignore and keep the socket alive.
                    }
                }
            }
            msg = socket.recv() => {
                if !handle_ws_text(
                    msg,
                    &state,
                    &mut current_runtime,
                    &mut run_event_rx,
                    &mut acp_update_rx,
                    &mut acp_permission_rx,
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
    run_event_rx: &mut broadcast::Receiver<RuntimeBroadcastEvent>,
    acp_update_rx: &mut broadcast::Receiver<AcpSessionUpdateEnvelope>,
    acp_permission_rx: &mut broadcast::Receiver<AcpPermissionRequestPayload>,
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
                    run_event_rx,
                    acp_update_rx,
                    acp_permission_rx,
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
        WSRequest::AcpSessionCreate => handle_acp_session_create(runtime).await,
        WSRequest::AcpSessionPrompt {
            session_id,
            messages,
        } => handle_acp_session_prompt(runtime, &session_id, &messages).await,
        WSRequest::AcpSessionCancel { session_id } => {
            handle_acp_session_cancel(runtime, &session_id).await
        }
        WSRequest::AcpPermissionDecision { decision } => {
            handle_acp_permission_decision(runtime, decision).await
        }
        WSRequest::AcpPendingEditAccept { edit_id } => {
            handle_acp_pending_edit_accept(runtime, &edit_id).await
        }
        WSRequest::AcpPendingEditReject { edit_id } => {
            handle_acp_pending_edit_reject(runtime, &edit_id).await
        }
        WSRequest::AcpPendingEditUpdate { edit_id, new_text } => {
            handle_acp_pending_edit_update(runtime, &edit_id, &new_text).await
        }
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
        status: RunStatus::Queued,
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

    let created_summary = run_summary_from_event(&running_event);
    let accepted = vec![WSResponse::RunAccepted {
        run_id: run_id.clone(),
    }];
    if !send_responses(socket, accepted).await {
        return false;
    }

    // Broadcast a queued run entry so all connected clients render the same server-owned history.
    let _ = runtime.run_events.send(RuntimeBroadcastEvent::RunStarted {
        run: created_summary,
    });

    spawn_execution_task(runtime.clone(), request, run_id, running_event);
    true
}

fn spawn_execution_task(
    runtime: Arc<ProjectRuntime>,
    request: ExecutionRequest,
    run_id: String,
    queued_event: ExecutionEvent,
) {
    tokio::spawn(async move {
        let mut running_event = queued_event.clone();
        running_event.status = RunStatus::Running;
        running_event.started_at_ms = queued_event.started_at_ms;

        let _ = runtime
            .execution_repo
            .update_run(running_event.clone())
            .await;
        let _ = runtime.run_events.send(RuntimeBroadcastEvent::RunStarted {
            run: run_summary_from_event(&running_event),
        });

        let (output_tx, mut output_rx) = mpsc::unbounded_channel::<RunOutputChunk>();
        let mut stdout = String::new();
        let mut stderr = String::new();
        let mut last_persist = Instant::now();

        let executor_fut = async {
            let executor = runtime.r_executor.lock().await;
            executor
                .execute_with_event_with_history_streaming(request, &run_id, output_tx)
                .await
        };
        tokio::pin!(executor_fut);

        let mut execution_result = None;
        loop {
            tokio::select! {
                result = &mut executor_fut, if execution_result.is_none() => {
                    execution_result = Some(result);
                    break;
                }
                maybe_chunk = output_rx.recv() => {
                    let Some(chunk) = maybe_chunk else {
                        continue;
                    };
                    {
                        let mut buffer = runtime.stream_buffer.lock().await;
                        buffer.append(chunk.clone());
                    }
                    match chunk.stream {
                        RunStream::Stdout => append_line(&mut stdout, &chunk.chunk),
                        RunStream::Stderr => append_line(&mut stderr, &chunk.chunk),
                    }
                    let _ = runtime.run_events.send(RuntimeBroadcastEvent::RunOutput { chunk: chunk.clone() });

                    if last_persist.elapsed() >= Duration::from_millis(250) {
                        running_event.result.output = stdout.clone();
                        running_event.result.error = if stderr.is_empty() { None } else { Some(stderr.clone()) };
                        let _ = runtime.execution_repo.update_run(running_event.clone()).await;
                        last_persist = Instant::now();
                    }
                }
            }
        }

        // Drain any remaining chunks queued before the executor finished.
        while let Ok(chunk) = output_rx.try_recv() {
            {
                let mut buffer = runtime.stream_buffer.lock().await;
                buffer.append(chunk.clone());
            }
            match chunk.stream {
                RunStream::Stdout => append_line(&mut stdout, &chunk.chunk),
                RunStream::Stderr => append_line(&mut stderr, &chunk.chunk),
            }
            let _ = runtime
                .run_events
                .send(RuntimeBroadcastEvent::RunOutput { chunk });
        }

        let finished_at = common::now_millis() as u64;
        let Some(execution_result) = execution_result else {
            return;
        };
        match execution_result {
            Ok((result, mut event, history)) => {
                event.event_id = run_id.clone();
                event.started_at_ms = queued_event.started_at_ms;
                event.finished_at_ms = Some(finished_at);
                event.duration_ms = Some(finished_at.saturating_sub(queued_event.started_at_ms));
                event.created_at_ms = finished_at;
                event.result.output = stdout;
                event.result.error = if stderr.is_empty() {
                    None
                } else {
                    Some(stderr)
                };
                event.status = if result.success {
                    RunStatus::Succeeded
                } else {
                    RunStatus::Failed
                };

                let _ = runtime.execution_repo.finish_run(event.clone()).await;
                runtime.stream_buffer.lock().await.remove_run(&run_id);
                let summary = run_summary_from_event(&event);
                let _ = runtime
                    .run_events
                    .send(RuntimeBroadcastEvent::TimelineEventAdded {
                        event: event.clone(),
                    });
                let _ = runtime
                    .run_events
                    .send(RuntimeBroadcastEvent::RunFinished { run: summary });

                if !history.is_empty() {
                    let active_plot_id = history.last().map(|plot| plot.id.clone());
                    let _ = runtime
                        .run_events
                        .send(RuntimeBroadcastEvent::PlotHistoryUpdated {
                            active_plot_id,
                            plots: history,
                        });
                }
            }
            Err(e) => {
                let error_message = e.to_string();
                let mut failed_event = queued_event.clone();
                failed_event.status = RunStatus::Failed;
                failed_event.created_at_ms = finished_at;
                failed_event.finished_at_ms = Some(finished_at);
                failed_event.duration_ms =
                    Some(finished_at.saturating_sub(queued_event.started_at_ms));
                failed_event.result = ExecutionResult {
                    success: false,
                    output: stdout,
                    error: if stderr.is_empty() {
                        Some(error_message)
                    } else {
                        Some(format!("{}\n{}", stderr, error_message))
                    },
                    plots: Vec::new(),
                    execution_time_ms: 0,
                };
                let _ = runtime
                    .execution_repo
                    .finish_run(failed_event.clone())
                    .await;
                runtime.stream_buffer.lock().await.remove_run(&run_id);
                let _ = runtime.run_events.send(RuntimeBroadcastEvent::RunFinished {
                    run: run_summary_from_event(&failed_event),
                });
            }
        }
    });
}

fn append_line(target: &mut String, line: &str) {
    if line.is_empty() {
        return;
    }
    if target.is_empty() {
        target.push_str(line);
    } else {
        target.push('\n');
        target.push_str(line);
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
    runtime: &Arc<ProjectRuntime>,
) -> WSResponse {
    let record = ProjectRecord::from(&runtime.descriptor);
    WSResponse::ProjectOpened {
        project: record,
        state: None,
    }
}

async fn build_run_state_responses(
    runtime: &Arc<ProjectRuntime>,
    events: Vec<ExecutionEvent>,
) -> Vec<WSResponse> {
    let runs: Vec<RunSummary> = events.iter().map(run_summary_from_event).collect();
    let mut responses = common::single_response(WSResponse::RunState { runs });

    for event in events {
        if matches!(event.status, RunStatus::Running | RunStatus::Queued) {
            let buffered = runtime.stream_buffer.lock().await.get(&event.event_id);
            if buffered.is_empty() {
                // Fallback for cases like server restarts where the in-memory buffer is empty.
                responses.extend(
                    run_output_chunks_from_event(&event)
                        .into_iter()
                        .map(WSResponse::RunOutput),
                );
            } else {
                responses.extend(buffered.into_iter().map(WSResponse::RunOutput));
            }
        } else {
            // Replay stdout/stderr from the persisted run record for finished runs.
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
    let artifacts: Vec<ArtifactInfo> = event
        .result
        .plots
        .iter()
        .map(|plot| ArtifactInfo {
            path: plot
                .storage_path
                .clone()
                .unwrap_or_else(|| plot.filename.clone()),
            artifact_type: "plot".to_string(),
            label: Some(plot.filename.clone()),
            record_as: format!("plot[{}]", plot.index),
        })
        .collect();

    RunSummary {
        run_id: event.event_id.clone(),
        status: event.status.clone(),
        started_at_ms: event.started_at_ms,
        finished_at_ms: event.finished_at_ms,
        duration_ms: event.duration_ms,
        code: event.blocks.first().map(|b| b.code.clone()),
        has_stdout: !event.result.output.is_empty(),
        has_stderr: event.result.error.is_some(),
        artifacts: if artifacts.is_empty() {
            None
        } else {
            Some(artifacts)
        },
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
