use std::sync::{atomic::Ordering, Arc};

use crate::projects::ProjectRuntime;
use reprod_core::{
    ai::{
        self,
        tools::{
            get_console_tools, get_filesystem_tools, get_pending_edit_tools, get_r_context_tools,
            get_repo_tools,
            get_web_search_tools, WriteTextFileRequest,
        },
    },
    edit::{EditOperation, EditTextFileRequest, TextEdit},
    ChatMessage,
};
use similar::TextDiff;
use tokio::sync::mpsc::UnboundedSender;
use tokio::time::{timeout, Duration};

use super::common::{
    build_streaming_payload, error_response, now_millis, tool_log_from_call, with_system_prompts,
    AgentEventPayload, AgentEventStatus, AIMode, AppState, ApprovalDecisionPayload,
    ApprovalOption, ApprovalRequestPayload, ApprovalRule, ArtifactDetailsPayload, ArtifactKind,
    PlanStepKind, PlanStepPayload, PlanStepStatus, ToolLogStatus, ToolPreviewPayload,
    WSResponse,
};
use super::tool_handler::execute_ai_tool_call;

async fn build_context_prompt(
    runtime: &Arc<ProjectRuntime>,
    context: reprod_core::acp::types::AcpContextRequest,
) -> Result<String, anyhow::Error> {
    let mut parts = Vec::new();

    // 1. Console Context
    if let Some(limit) = context.console_history_limit {
        if limit > 0 {
            let runs = runtime
                .execution_repo
                .latest_runs(limit)
                .await
                .unwrap_or_default();
            
            if !runs.is_empty() {
                let mut console_text = String::from("Recent console output (newest first, truncated):\n");
                for run in runs {
                    let status = format!("{:?}", run.status).to_lowercase();
                    let duration = run.duration_ms.unwrap_or(0);
                    console_text.push_str(&format!("- [{}] {} in {}ms\n", run.created_at_ms, status, duration));
                    if !run.result.output.is_empty() {
                        let trimmed = run.result.output.lines().take(20).collect::<Vec<_>>().join("\n");
                        let truncated = if trimmed.len() > 800 { &trimmed[..800] } else { &trimmed };
                        console_text.push_str(&format!("stdout: {}\n", truncated));
                    }
                    if let Some(err) = &run.result.error {
                        let trimmed = err.lines().take(20).collect::<Vec<_>>().join("\n");
                        let truncated = if trimmed.len() > 800 { &trimmed[..800] } else { &trimmed };
                        console_text.push_str(&format!("stderr: {}\n", truncated));
                    }
                    console_text.push('\n');
                }
                parts.push(console_text);
            }
        }
    }

    // 2. File Context
    if let Some(path) = context.active_buffer_path {
        if !path.is_empty() {
            match runtime.edit_service.read_text_file(&path).await {
                Ok(result) => {
                    parts.push(format!("Current file ({}):\n\n```r\n{}\n```\n", path, result.text));
                }
                Err(e) => {
                    tracing::warn!("Failed to read context file {}: {}", path, e);
                }
            }
        }
    }

    // 3. User Input
    parts.push(context.user_input);

    Ok(parts.join("\n"))
}

type ResponseSender = Option<UnboundedSender<WSResponse>>;

fn push_response(responses: &mut Vec<WSResponse>, sender: &ResponseSender, response: WSResponse) {
    if let Some(sender) = sender {
        let _ = sender.send(response);
    } else {
        responses.push(response);
    }
}

fn push_responses(responses: &mut Vec<WSResponse>, sender: &ResponseSender, next: Vec<WSResponse>) {
    for response in next {
        push_response(responses, sender, response);
    }
}

struct EventStream {
    stream_id: String,
    counter: u64,
    sender: ResponseSender,
}

impl EventStream {
    fn new(stream_id: &str, sender: ResponseSender) -> Self {
        Self {
            stream_id: stream_id.to_string(),
            counter: 0,
            sender,
        }
    }

    fn next_event_id(&mut self) -> String {
        self.counter += 1;
        format!("{}-event-{}", self.stream_id, self.counter)
    }

    fn emit(&self, responses: &mut Vec<WSResponse>, event: AgentEventPayload) {
        push_response(
            responses,
            &self.sender,
            WSResponse::AgentEvent {
                id: self.stream_id.clone(),
                event,
            },
        );
    }
}

fn tool_requires_approval(name: &str) -> bool {
    matches!(name, "apply_pending_edit")
}

fn push_cancel_response(
    responses: &mut Vec<WSResponse>,
    sender: &ResponseSender,
    event_stream: &mut EventStream,
    stream_id: &str,
) {
    let cancel_event_id = event_stream.next_event_id();
    event_stream.emit(
        responses,
        AgentEventPayload::Error {
            id: cancel_event_id,
            status: AgentEventStatus::Error,
            timestamp: now_millis(),
            message: "Request cancelled by user.".to_string(),
            recoverable: false,
            suggested_action: None,
            parent_id: None,
        },
    );
    push_response(
        responses,
        sender,
        WSResponse::AIResponseComplete {
            id: stream_id.to_string(),
            final_text: "Request cancelled by user.".to_string(),
            code_blocks: None,
        },
    );
}

fn extract_path_from_input(input: &serde_json::Value) -> Option<String> {
    input
        .get("path")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
}

fn extract_pending_edit_fields(
    output: &serde_json::Value,
) -> Option<(String, String, String, String)> {
    let edit = output.get("edit")?;
    if output.get("type")?.as_str()? != "pending_edit" {
        return None;
    }
    let file_path = edit.get("file_path")?.as_str()?.to_string();
    let old_text = edit.get("old_text")?.as_str()?.to_string();
    let new_text = edit.get("new_text")?.as_str()?.to_string();
    let unified_diff = edit.get("unified_diff")?.as_str()?.to_string();
    Some((file_path, old_text, new_text, unified_diff))
}

fn extract_pending_edit_path(output: &serde_json::Value) -> Option<String> {
    extract_pending_edit_fields(output).map(|(path, _, _, _)| path)
}

#[derive(serde::Deserialize)]
struct PlanSeed {
    steps: Vec<PlanSeedStep>,
}

#[derive(serde::Deserialize)]
struct PlanSeedStep {
    title: String,
}

async fn build_plan(
    provider: &dyn ai::AIProvider,
    messages: &[ChatMessage],
) -> Option<Vec<PlanStepPayload>> {
    let user_message = messages.iter().rev().find(|m| m.role == "user")?;
    let plan_prompt = ChatMessage {
        role: "system".to_string(),
        content: "You are a planning assistant. Return JSON only: {\"steps\":[{\"title\":\"...\"},...]}. Limit to 3 concise steps. No extra text.".to_string(),
    };
    let user = ChatMessage {
        role: "user".to_string(),
        content: user_message.content.clone(),
    };

    let response = match timeout(Duration::from_secs(8), provider.send_message(vec![plan_prompt, user])).await {
        Ok(Ok(text)) => text,
        _ => return None,
    };

    let json_text = extract_json(&response)?;
    let seed: PlanSeed = serde_json::from_str(&json_text).ok()?;
    if seed.steps.is_empty() {
        return None;
    }

    let steps = seed
        .steps
        .into_iter()
        .take(3)
        .enumerate()
        .map(|(index, step)| PlanStepPayload {
            id: format!("{}", index + 1),
            title: step.title,
            status: PlanStepStatus::Pending,
            kind: Some(PlanStepKind::Plan),
            error: None,
            started_at: None,
            finished_at: None,
            waiting_reason: None,
        })
        .collect::<Vec<_>>();
    Some(steps)
}

fn extract_json(text: &str) -> Option<String> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(text[start..=end].to_string())
}

fn emit_plan_update(
    responses: &mut Vec<WSResponse>,
    event_stream: &EventStream,
    steps: &[PlanStepPayload],
) {
    event_stream.emit(
        responses,
        AgentEventPayload::PlanUpdate {
            steps: steps.to_vec(),
        },
    );
}

fn mark_plan_running(steps: &mut [PlanStepPayload], index: usize) -> bool {
    if let Some(step) = steps.get_mut(index) {
        if matches!(step.status, PlanStepStatus::Pending) {
            step.status = PlanStepStatus::Running;
            step.started_at = Some(now_millis());
            step.waiting_reason = None;
            return true;
        }
    }
    false
}

fn mark_plan_finished(
    steps: &mut [PlanStepPayload],
    index: usize,
    status: PlanStepStatus,
    error: Option<String>,
) -> bool {
    if let Some(step) = steps.get_mut(index) {
        step.status = status;
        step.finished_at = Some(now_millis());
        step.error = error;
        step.waiting_reason = None;
        return true;
    }
    false
}

fn normalize_relative_path(path: &str) -> Option<String> {
    use std::path::Component;
    let mut parts = Vec::new();
    let path = std::path::Path::new(path);
    for component in path.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
            Component::CurDir => {}
            _ => return None,
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

fn approval_prefix_from_path(path: &str) -> Option<String> {
    let normalized = normalize_relative_path(path)?;
    if let Some((parent, _)) = normalized.rsplit_once('/') {
        if !parent.is_empty() {
            return Some(parent.to_string());
        }
    }
    Some(normalized)
}

fn build_approval_rule(tool: &str, path: Option<&str>) -> Option<ApprovalRule> {
    let path_prefix = path.and_then(approval_prefix_from_path);
    Some(ApprovalRule {
        tool: tool.to_string(),
        path_prefix,
    })
}

fn build_diff(path: &str, old_text: &str, new_text: &str) -> String {
    TextDiff::from_lines(old_text, new_text)
        .unified_diff()
        .header(path, path)
        .to_string()
}

fn apply_edits_preview(original: &str, edits: &[TextEdit]) -> Result<String, String> {
    let mut result = original.to_string();
    let mut sorted = edits.to_vec();
    sorted.sort_by(|a, b| {
        (
            b.range.start_line,
            b.range.start_col,
            b.range.end_line,
            b.range.end_col,
        )
            .cmp(&(
                a.range.start_line,
                a.range.start_col,
                a.range.end_line,
                a.range.end_col,
            ))
    });

    for edit in sorted {
        let start = line_col_to_index(&result, edit.range.start_line, edit.range.start_col)?;
        let end = line_col_to_index(&result, edit.range.end_line, edit.range.end_col)?;
        if start > end {
            return Err("Edit range start is after end".to_string());
        }
        result.replace_range(start..end, &edit.text);
    }

    Ok(result)
}

fn line_col_to_index(text: &str, line: u32, col: u32) -> Result<usize, String> {
    if line == 0 || col == 0 {
        return Err("Line/column indices must be 1-based".to_string());
    }
    let mut current_line = 1u32;
    let mut current_col = 1u32;
    for (idx, ch) in text.char_indices() {
        if current_line == line && current_col == col {
            return Ok(idx);
        }
        if ch == '\n' {
            current_line += 1;
            current_col = 1;
        } else {
            current_col += 1;
        }
    }
    if current_line == line && current_col == col {
        return Ok(text.len());
    }
    Err("Line/column out of range".to_string())
}

async fn build_tool_preview(
    tool_call: &reprod_core::ToolCall,
    runtime: &Arc<ProjectRuntime>,
) -> Option<ToolPreviewPayload> {
    match tool_call.name.as_str() {
        "read_text_file" => Some(ToolPreviewPayload {
            kind: "read".to_string(),
            filepath: extract_path_from_input(&tool_call.input),
            diff: None,
            command: None,
            affected_lines: None,
        }),
        "write_text_file" => {
            let request: WriteTextFileRequest =
                serde_json::from_value(tool_call.input.clone()).ok()?;
            let read_result = runtime.edit_service.read_text_file(&request.path).await;
            let old_text = read_result.map(|result| result.text).unwrap_or_default();
            let diff = build_diff(&request.path, &old_text, &request.content);
            Some(ToolPreviewPayload {
                kind: "diff".to_string(),
                filepath: Some(request.path),
                diff: Some(diff),
                command: None,
                affected_lines: None,
            })
        }
        "edit_text_file" | "propose_text_edit" => {
            let request: EditTextFileRequest =
                serde_json::from_value(tool_call.input.clone()).ok()?;
            let read_result = runtime.edit_service.read_text_file(&request.path).await;
            let old_text = read_result.map(|result| result.text).unwrap_or_default();
            let new_text = match request.operation {
                EditOperation::Delete => String::new(),
                EditOperation::Create | EditOperation::Replace => {
                    request.new_text.clone().unwrap_or_default()
                }
                EditOperation::ApplyEdits => {
                    let edits = request.edits.clone().unwrap_or_default();
                    apply_edits_preview(&old_text, &edits).ok()?
                }
            };
            let diff = build_diff(&request.path, &old_text, &new_text);
            Some(ToolPreviewPayload {
                kind: "diff".to_string(),
                filepath: Some(request.path),
                diff: Some(diff),
                command: None,
                affected_lines: None,
            })
        }
        "apply_pending_edit" => {
            let edit_id = tool_call
                .input
                .get("edit_id")
                .and_then(|value| value.as_str())?;
            let edit = crate::pending_edits::get_pending_edit(
                &runtime.pending_edits,
                edit_id,
            )
            .await?;
            Some(ToolPreviewPayload {
                kind: "diff".to_string(),
                filepath: Some(edit.file_path),
                diff: Some(edit.unified_diff),
                command: None,
                affected_lines: None,
            })
        }
        _ => None,
    }
}

fn summarize_tool_result(tool_call: &reprod_core::ToolCall, outcome: &serde_json::Value) -> String {
    match tool_call.name.as_str() {
        "read_text_file" => extract_path_from_input(&tool_call.input)
            .map(|path| format!("Read file {}", path))
            .unwrap_or_else(|| "Read file".to_string()),
        "write_text_file" | "edit_text_file" | "propose_text_edit" => {
            extract_pending_edit_path(outcome)
                .map(|path| format!("Proposed edit for {}", path))
                .unwrap_or_else(|| "Proposed edit".to_string())
        }
        "apply_pending_edit" => "Applied pending edit".to_string(),
        _ => outcome.to_string(),
    }
}

fn artifact_for_tool_result(
    tool_call: &reprod_core::ToolCall,
    output: &serde_json::Value,
    diff_summary: &str,
    display_summary: &str,
) -> Option<(ArtifactKind, Option<String>, String, Option<ArtifactDetailsPayload>)> {
    let (old_text, new_text, diff, pending_path) = extract_pending_edit_fields(output)
        .map(|(path, old_text, new_text, diff)| (Some(old_text), Some(new_text), Some(diff), Some(path)))
        .unwrap_or_else(|| {
            let old_text = output
                .get("old_text")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string());
            let new_text = output
                .get("new_text")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string());
            (old_text, new_text, None, None)
        });

    match tool_call.name.as_str() {
        "read_text_file" => Some((
            ArtifactKind::FileRead,
            extract_path_from_input(&tool_call.input),
            display_summary.to_string(),
            None,
        )),
        "write_text_file" | "edit_text_file" | "propose_text_edit" => Some((
            ArtifactKind::FileWrite,
            pending_path.or_else(|| extract_path_from_input(&tool_call.input)),
            display_summary.to_string(),
            Some(ArtifactDetailsPayload {
                diff: diff.or_else(|| Some(diff_summary.to_string())),
                exit_code: None,
                stdout: None,
                stderr: None,
                tests_passed: None,
                tests_failed: None,
                old_text,
                new_text,
            }),
        )),
        "web_search" => Some((
            ArtifactKind::Command,
            None,
            "Web search".to_string(),
            None,
        )),
        _ => None,
    }
}

fn is_recoverable_error(message: &str) -> bool {
    !(message.contains("permission denied") || message.contains("not found"))
}

fn suggest_recovery(message: &str) -> Option<String> {
    let lowered = message.to_lowercase();
    if lowered.contains("not found") {
        return Some("Verify the path and retry".to_string());
    }
    if lowered.contains("permission denied") {
        return Some("Request permission or choose a different location".to_string());
    }
    if lowered.contains("syntax") {
        return Some("Check syntax and try again".to_string());
    }
    None
}

pub(super) async fn handle_ai_message(
    state: &AppState,
    runtime: &Arc<ProjectRuntime>,
    session_id: String,
    content: String,
    context: Option<reprod_core::acp::types::AcpContextRequest>,
    enable_tools: bool,
    request_id: Option<String>,
    stream: bool,
    mode: AIMode,
    sender: ResponseSender,
) -> Vec<WSResponse> {
    let cfg = state.config.lock().await.clone();
    let provider = ai::from_config(&cfg);
    let stream_id = request_id.unwrap_or_else(|| {
        let count = state.request_counter.fetch_add(1, Ordering::Relaxed);
        format!("req-{}", count)
    });
    let cancel_token = state.cancels.register(&stream_id).await;

    // 1. Get or create session
    let mut sessions = runtime.local_sessions.lock().await;
    let session = sessions
        .entry(session_id.clone())
        .or_insert_with(|| reprod_core::ai::session::LocalAgentSession::new(session_id.clone()));

    // 2. Append new user message (with context if provided)
    let final_content = if let Some(ctx) = context {
        match build_context_prompt(runtime, ctx).await {
            Ok(c) => c,
            Err(_) => content,
        }
    } else {
        content
    };

    session.add_message(ChatMessage {
        role: "user".to_string(),
        content: final_content,
    });

    let history = session.history().to_vec();
    drop(sessions); // Release lock while calling provider

    let messages_with_prompts = with_system_prompts(&history, mode);

    let mut outbound = Vec::new();
    let mut event_stream = EventStream::new(&stream_id, sender.clone());
    let thought_id = event_stream.next_event_id();
    event_stream.emit(
        &mut outbound,
        AgentEventPayload::Thought {
            id: thought_id,
            status: AgentEventStatus::Done,
            timestamp: now_millis(),
            text: "Analyzing request to determine next actions.".to_string(),
            reasoning: Some("Establish context before acting.".to_string()),
            parent_id: None,
        },
    );

    let mut plan_steps = if enable_tools {
        build_plan(provider.as_ref(), &messages_with_prompts).await
    } else {
        None
    };
    if let Some(steps) = plan_steps.as_ref() {
        if !steps.is_empty() {
            emit_plan_update(&mut outbound, &event_stream, steps);
        }
    }

    let responses = if enable_tools {
        let mut tools = get_filesystem_tools();
        tools.extend(get_r_context_tools());
        tools.extend(get_console_tools());
        tools.extend(get_web_search_tools());
        tools.extend(get_repo_tools());
        tools.extend(get_pending_edit_tools());
        let mut responses = Vec::new();
        let mut loop_count = 0;
        let mut plan_index = 0usize;
        const MAX_TOOL_LOOPS: usize = 5;

        'tool_loop: loop {
            if cancel_token.is_cancelled() {
                push_cancel_response(&mut responses, &sender, &mut event_stream, &stream_id);
                break 'tool_loop;
            }

            // Always get latest history from session
            let history = {
                let sessions = runtime.local_sessions.lock().await;
                sessions.get(&session_id).unwrap().history().to_vec()
            };

            let messages_with_prompts = with_system_prompts(&history, mode);
            let mut cancelled = false;
            let response = tokio::select! {
                _ = cancel_token.wait() => {
                    cancelled = true;
                    None
                }
                response = provider.send_message_with_tools(messages_with_prompts.clone(), tools.clone()) => {
                    Some(response)
                }
            };
            if cancelled {
                push_cancel_response(&mut responses, &sender, &mut event_stream, &stream_id);
                break 'tool_loop;
            }
            let response = match response {
                Some(Ok(response)) => response,
                Some(Err(e)) => {
                    push_responses(&mut responses, &sender, error_response(e.to_string()));
                    break 'tool_loop;
                }
                None => {
                    push_responses(&mut responses, &sender, error_response("Missing response".to_string()));
                    break 'tool_loop;
                }
            };

            if let Some(ref tool_calls) = response.tool_calls {
                let mut tool_results = Vec::new();
                let mut saw_error = false;

                for tool_call in tool_calls {
                    let mut tool_call = tool_call.clone();
                    if let Some(steps) = plan_steps.as_mut() {
                        if mark_plan_running(steps, plan_index) {
                            emit_plan_update(&mut responses, &event_stream, steps);
                        }
                    }
                    let normalized_path = extract_path_from_input(&tool_call.input)
                        .and_then(|path| normalize_relative_path(&path));
                    let approval_rule =
                        build_approval_rule(&tool_call.name, normalized_path.as_deref());
                    let requires_approval = tool_requires_approval(&tool_call.name)
                        && !state
                            .approvals
                            .is_allowed(
                                &session_id,
                                &tool_call.name,
                                normalized_path.as_deref(),
                                &runtime.descriptor.root_path,
                            )
                            .await;
                    let request_event_id = event_stream.next_event_id();
                    let task_event_id = event_stream.next_event_id();
                    let preview = build_tool_preview(&tool_call, runtime).await;
                    event_stream.emit(
                        &mut responses,
                        AgentEventPayload::ToolRequest {
                            id: request_event_id.clone(),
                            status: if requires_approval {
                                AgentEventStatus::Blocked
                            } else {
                                AgentEventStatus::Running
                            },
                            timestamp: now_millis(),
                            tool: tool_call.name.clone(),
                            input: tool_call.input.clone(),
                            requires_approval,
                            preview: preview.clone(),
                            parent_id: None,
                        },
                    );

                    let mut approved_input = tool_call.input.clone();
                    if requires_approval {
                        let approval_preview = preview.unwrap_or(ToolPreviewPayload {
                            kind: "diff".to_string(),
                            filepath: extract_path_from_input(&tool_call.input),
                            diff: None,
                            command: None,
                            affected_lines: None,
                        });
                        push_response(
                            &mut responses,
                            &sender,
                            WSResponse::ApprovalRequest {
                                id: stream_id.clone(),
                                request: ApprovalRequestPayload {
                                    event_id: request_event_id.clone(),
                                    tool: tool_call.name.clone(),
                                    preview: approval_preview,
                                    options: vec![
                                        ApprovalOption::ApproveOnce,
                                        ApprovalOption::ApproveSession,
                                        ApprovalOption::Edit,
                                        ApprovalOption::Deny,
                                    ],
                                    input: Some(tool_call.input.clone()),
                                },
                            },
                        );

                        let receiver = state.approvals.register(request_event_id.clone()).await;
                        let mut approval_cancelled = false;
                        let decision = tokio::select! {
                            _ = cancel_token.wait() => {
                                approval_cancelled = true;
                                ApprovalDecisionPayload {
                                    event_id: request_event_id.clone(),
                                    decision: ApprovalOption::Deny,
                                    edited_input: None,
                                }
                            }
                            result = timeout(Duration::from_secs(300), receiver) => {
                                match result {
                                    Ok(Ok(decision)) => decision,
                                    _ => ApprovalDecisionPayload {
                                        event_id: request_event_id.clone(),
                                        decision: ApprovalOption::Deny,
                                        edited_input: None,
                                    },
                                }
                            }
                        };
                        if approval_cancelled {
                            push_cancel_response(&mut responses, &sender, &mut event_stream, &stream_id);
                            break 'tool_loop;
                        }

                        match decision.decision {
                            ApprovalOption::ApproveOnce => {
                                event_stream.emit(
                                    &mut responses,
                                    AgentEventPayload::ToolRequest {
                                        id: request_event_id.clone(),
                                        status: AgentEventStatus::Approved,
                                        timestamp: now_millis(),
                                        tool: tool_call.name.clone(),
                                        input: tool_call.input.clone(),
                                        requires_approval: true,
                                        preview: None,
                                        parent_id: None,
                                    },
                                );
                            }
                            ApprovalOption::ApproveSession => {
                                if let Some(rule) = approval_rule.clone() {
                                    state
                                        .approvals
                                        .allow_for_session(&session_id, rule.clone())
                                        .await;
                                    if let Err(err) = state
                                        .approvals
                                        .allow_persistent(&runtime.descriptor.root_path, rule)
                                        .await
                                    {
                                        tracing::warn!("Failed to persist approval: {}", err);
                                    }
                                }
                                event_stream.emit(
                                    &mut responses,
                                    AgentEventPayload::ToolRequest {
                                        id: request_event_id.clone(),
                                        status: AgentEventStatus::Approved,
                                        timestamp: now_millis(),
                                        tool: tool_call.name.clone(),
                                        input: tool_call.input.clone(),
                                        requires_approval: true,
                                        preview: None,
                                        parent_id: None,
                                    },
                                );
                            }
                            ApprovalOption::Edit => {
                                if let Some(input) = decision.edited_input.clone() {
                                    approved_input = input;
                                }
                                event_stream.emit(
                                    &mut responses,
                                    AgentEventPayload::ToolRequest {
                                        id: request_event_id.clone(),
                                        status: AgentEventStatus::Approved,
                                        timestamp: now_millis(),
                                        tool: tool_call.name.clone(),
                                        input: approved_input.clone(),
                                        requires_approval: true,
                                        preview: None,
                                        parent_id: None,
                                    },
                                );
                            }
                            ApprovalOption::Deny => {
                                event_stream.emit(
                                    &mut responses,
                                    AgentEventPayload::ToolRequest {
                                        id: request_event_id.clone(),
                                        status: AgentEventStatus::Denied,
                                        timestamp: now_millis(),
                                        tool: tool_call.name.clone(),
                                        input: tool_call.input.clone(),
                                        requires_approval: true,
                                        preview: None,
                                        parent_id: None,
                                    },
                                );
                                let denied_message = "User denied tool execution".to_string();
                                let denied_event_id = event_stream.next_event_id();
                                event_stream.emit(
                                    &mut responses,
                                    AgentEventPayload::ToolResult {
                                        id: denied_event_id,
                                        status: AgentEventStatus::Denied,
                                        timestamp: now_millis(),
                                        request_id: request_event_id.clone(),
                                        tool: tool_call.name.clone(),
                                        output: None,
                                        error: Some(denied_message.clone()),
                                        parent_id: None,
                                    },
                                );
                                tool_results.push((
                                    tool_call.id.clone(),
                                    format!("Denied: {}", denied_message),
                                ));
                                if let Some(steps) = plan_steps.as_mut() {
                                    if plan_index < steps.len() {
                                        if mark_plan_finished(
                                            steps,
                                            plan_index,
                                            PlanStepStatus::Error,
                                            Some(denied_message.clone()),
                                        ) {
                                            emit_plan_update(&mut responses, &event_stream, steps);
                                        }
                                        plan_index += 1;
                                    }
                                }
                                saw_error = true;
                                continue;
                            }
                        }
                    }
                    if cancel_token.is_cancelled() {
                        push_cancel_response(&mut responses, &sender, &mut event_stream, &stream_id);
                        break 'tool_loop;
                    }
                    event_stream.emit(
                        &mut responses,
                        AgentEventPayload::Task {
                            id: task_event_id.clone(),
                            status: AgentEventStatus::Running,
                            timestamp: now_millis(),
                            label: format!("Run tool: {}", tool_call.name),
                            deps: Vec::new(),
                            parent_id: None,
                        },
                    );

                    tool_call.input = approved_input;
                    let mut log = tool_log_from_call(&tool_call);
                    push_response(
                        &mut responses,
                        &sender,
                        WSResponse::AIToolStarted {
                            id: stream_id.clone(),
                            tool: log.clone(),
                        },
                    );

                    let tool_result =
                        execute_ai_tool_call(&tool_call, runtime, &session_id).await;
                    match tool_result {
                        Ok(result) => {
                            log.status = ToolLogStatus::Done;
                            log.output = Some(result.output.clone());
                            tool_results.push((tool_call.id.clone(), result.summary.clone()));

                            let display_summary =
                                summarize_tool_result(&tool_call, &result.output);
                            let tool_result_id = event_stream.next_event_id();
                            event_stream.emit(
                                &mut responses,
                                AgentEventPayload::ToolResult {
                                    id: tool_result_id,
                                    status: AgentEventStatus::Done,
                                    timestamp: now_millis(),
                                    request_id: request_event_id.clone(),
                                    tool: tool_call.name.clone(),
                                    output: Some(result.output.clone()),
                                    error: None,
                                    parent_id: None,
                                },
                            );

                            if let Some((kind, path, summary, details)) =
                                artifact_for_tool_result(
                                    &tool_call,
                                    &result.output,
                                    &result.summary,
                                    &display_summary,
                                )
                            {
                                let artifact_id = event_stream.next_event_id();
                                event_stream.emit(
                                    &mut responses,
                                    AgentEventPayload::Artifact {
                                        id: artifact_id,
                                        status: AgentEventStatus::Done,
                                        timestamp: now_millis(),
                                        kind,
                                        path,
                                        summary,
                                        details,
                                        parent_id: None,
                                    },
                                );
                            }

                            event_stream.emit(
                                &mut responses,
                                AgentEventPayload::Task {
                                    id: task_event_id,
                                    status: AgentEventStatus::Done,
                                    timestamp: now_millis(),
                                    label: format!("Run tool: {}", tool_call.name),
                                    deps: Vec::new(),
                                    parent_id: None,
                                },
                            );
                            if let Some(steps) = plan_steps.as_mut() {
                                if plan_index < steps.len() {
                                    if mark_plan_finished(
                                        steps,
                                        plan_index,
                                        PlanStepStatus::Done,
                                        None,
                                    ) {
                                        emit_plan_update(&mut responses, &event_stream, steps);
                                    }
                                    plan_index += 1;
                                }
                            }
                        }
                        Err(err) => {
                            log.status = ToolLogStatus::Error;
                            log.error = Some(err.clone());
                            tool_results.push((tool_call.id.clone(), format!("Error: {}", err)));
                            saw_error = true;

                            let recoverable = is_recoverable_error(&err);
                            let suggested_action = suggest_recovery(&err);
                            let tool_error_id = event_stream.next_event_id();
                            event_stream.emit(
                                &mut responses,
                                AgentEventPayload::ToolResult {
                                    id: tool_error_id,
                                    status: AgentEventStatus::Error,
                                    timestamp: now_millis(),
                                    request_id: request_event_id.clone(),
                                    tool: tool_call.name.clone(),
                                    output: None,
                                    error: Some(err.clone()),
                                    parent_id: None,
                                },
                            );
                            let error_event_id = event_stream.next_event_id();
                            event_stream.emit(
                                &mut responses,
                                AgentEventPayload::Error {
                                    id: error_event_id,
                                    status: AgentEventStatus::Error,
                                    timestamp: now_millis(),
                                    message: err.clone(),
                                    recoverable,
                                    suggested_action: suggested_action.clone(),
                                    parent_id: None,
                                },
                            );
                            let thought_event_id = event_stream.next_event_id();
                            event_stream.emit(
                                &mut responses,
                                AgentEventPayload::Thought {
                                    id: thought_event_id,
                                    status: AgentEventStatus::Running,
                                    timestamp: now_millis(),
                                    text: format!(
                                        "Tool failed: {}. Considering alternative.",
                                        err
                                    ),
                                    reasoning: suggested_action.clone(),
                                    parent_id: None,
                                },
                            );
                            let recovery_task_id = event_stream.next_event_id();
                            event_stream.emit(
                                &mut responses,
                                AgentEventPayload::Task {
                                    id: recovery_task_id,
                                    status: AgentEventStatus::Pending,
                                    timestamp: now_millis(),
                                    label: format!(
                                        "Recover from {} failure",
                                        tool_call.name
                                    ),
                                    deps: Vec::new(),
                                    parent_id: None,
                                },
                            );
                            event_stream.emit(
                                &mut responses,
                                AgentEventPayload::Task {
                                    id: task_event_id,
                                    status: AgentEventStatus::Error,
                                    timestamp: now_millis(),
                                    label: format!("Run tool: {}", tool_call.name),
                                    deps: Vec::new(),
                                    parent_id: None,
                                },
                            );
                            if let Some(steps) = plan_steps.as_mut() {
                                if plan_index < steps.len() {
                                    if mark_plan_finished(
                                        steps,
                                        plan_index,
                                        PlanStepStatus::Error,
                                        Some(err.clone()),
                                    ) {
                                        emit_plan_update(&mut responses, &event_stream, steps);
                                    }
                                    plan_index += 1;
                                }
                            }
                        }
                    }
                    if cancel_token.is_cancelled() {
                        push_cancel_response(&mut responses, &sender, &mut event_stream, &stream_id);
                        break 'tool_loop;
                    }
                    log.finished_at = Some(now_millis());
                    push_response(
                        &mut responses,
                        &sender,
                        WSResponse::AIToolFinished {
                            id: stream_id.clone(),
                            tool: log,
                        },
                    );
                }

                // Update session history with assistant turn and tool results
                {
                    let mut sessions = runtime.local_sessions.lock().await;
                    let session = sessions.get_mut(&session_id).unwrap();
                    
                    session.add_message(ChatMessage {
                        role: "assistant".to_string(),
                        content: response.content.clone(),
                    });
                    
                    for (tool_id, result) in tool_results {
                        session.add_message(ChatMessage {
                            role: "user".to_string(),
                            content: format!("Tool '{}' result: {}", tool_id, result),
                        });
                    }
                    if saw_error {
                        session.add_message(ChatMessage {
                            role: "user".to_string(),
                            content: "One or more tools failed. Please adapt and continue."
                                .to_string(),
                        });
                    }
                }

                loop_count += 1;
                if loop_count >= MAX_TOOL_LOOPS {
                    let loop_error_id = event_stream.next_event_id();
                    event_stream.emit(
                        &mut responses,
                        AgentEventPayload::Error {
                            id: loop_error_id,
                            status: AgentEventStatus::Error,
                            timestamp: now_millis(),
                            message: "Tool loop limit reached".to_string(),
                            recoverable: false,
                            suggested_action: None,
                            parent_id: None,
                        },
                    );
                    push_response(
                        &mut responses,
                        &sender,
                        WSResponse::Error {
                            message: "Tool loop limit reached".to_string(),
                        },
                    );
                    break;
                }
                continue;
            }

            // Final assistant message (no more tool calls)
            {
                let mut sessions = runtime.local_sessions.lock().await;
                let session = sessions.get_mut(&session_id).unwrap();
                session.add_message(ChatMessage {
                    role: "assistant".to_string(),
                    content: response.content.clone(),
                });
            }

            push_responses(
                &mut responses,
                &sender,
                build_streaming_payload(stream, &stream_id, response.content.clone()),
            );
            push_response(
                &mut responses,
                &sender,
                WSResponse::AIResponseWithTools { response },
            );
            break 'tool_loop;
        }

        responses
    } else {
        // Chat mode (no tools)
        let mut responses = Vec::new();
        
        let history = {
            let sessions = runtime.local_sessions.lock().await;
            sessions.get(&session_id).unwrap().history().to_vec()
        };
        let messages_with_prompts = with_system_prompts(&history, mode);

        let response = tokio::select! {
            _ = cancel_token.wait() => {
                push_cancel_response(&mut responses, &sender, &mut event_stream, &stream_id);
                state.cancels.unregister(&stream_id).await;
                return responses;
            }
            response = provider.send_message(messages_with_prompts) => response,
        };

        match response {
            Ok(response) => {
                // Update session history
                {
                    let mut sessions = runtime.local_sessions.lock().await;
                    let session = sessions.get_mut(&session_id).unwrap();
                    session.add_message(ChatMessage {
                        role: "assistant".to_string(),
                        content: response.clone(),
                    });
                }

                push_responses(
                    &mut responses,
                    &sender,
                    build_streaming_payload(stream, &stream_id, response),
                );
            }
            Err(e) => {
                push_responses(&mut responses, &sender, error_response(e.to_string()));
            }
        }
        responses
    };

    outbound.extend(responses);
    state.cancels.unregister(&stream_id).await;
    outbound
}

pub(super) async fn handle_agent_approval_decision(
    state: &AppState,
    decision: ApprovalDecisionPayload,
) -> Vec<WSResponse> {
    if state.approvals.resolve(decision).await {
        Vec::new()
    } else {
        error_response("No pending approval for decision")
    }
}
