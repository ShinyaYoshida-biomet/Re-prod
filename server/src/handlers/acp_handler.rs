use std::sync::Arc;

use super::context_builder::build_context_prompt;
use reprod_core::ai::extract_code_blocks;

use super::common::{
    build_approval_request_payload, error_response, now_millis, single_response,
    with_system_prompts, AIMode, AgentEventPayload, AgentEventStatus, ApprovalOption, PlanStepKind,
    PlanStepPayload, PlanStepStatus, ToolLogPayload, ToolLogStatus, WSResponse,
};
use super::pending_edit_ui::pending_edit_payload_from_output;
use crate::pending_edits;
use crate::projects::ProjectRuntime;
use reprod_core::acp::types::{
    AcpPermissionDecision, AcpPermissionDecisionOutcome, AcpPermissionDecisionScope,
    AcpPermissionOption, AcpPermissionRequestPayload, AcpPlanStep, AcpPlanStepStatus,
    AcpPromptMessage, AcpSessionUpdate,
};
use reprod_core::ChatMessage;
use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;
use uuid::Uuid;

pub async fn handle_acp_session_create(runtime: &Arc<ProjectRuntime>) -> Vec<WSResponse> {
    match runtime.acp.create_session().await {
        Ok(session_id) => single_response(WSResponse::AcpSessionCreated { session_id }),
        Err(error) => error_response(error.to_string()),
    }
}

pub async fn handle_acp_ai_message(
    runtime: &Arc<ProjectRuntime>,
    session_id: String,
    content: String,
    context: Option<reprod_core::acp::types::AcpContextRequest>,
    request_id: Option<String>,
    mode: AIMode,
    sender: Option<UnboundedSender<WSResponse>>,
) -> Vec<WSResponse> {
    let stream_id = request_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    let acp_session_id = {
        let mut conversations = runtime.acp_conversations.lock().await;
        if let Some(existing) = conversations.get(&session_id) {
            existing.clone()
        } else {
            match runtime.acp.create_session().await {
                Ok(session) => {
                    conversations.insert(session_id.clone(), session.clone());
                    session
                }
                Err(error) => {
                    return error_response(error.to_string());
                }
            }
        }
    };

    {
        let mut streams = runtime.acp_session_streams.lock().await;
        streams.insert(acp_session_id.clone(), stream_id.clone());
    }

    let mut sessions = runtime.local_sessions.lock().await;
    let session = sessions
        .entry(session_id.clone())
        .or_insert_with(|| reprod_core::ai::session::LocalAgentSession::new(session_id.clone()));

    let (final_content, context_for_prompt) = if let Some(ctx) = context.clone() {
        (
            build_context_prompt(runtime, ctx)
                .await
                .unwrap_or(content.clone()),
            None,
        )
    } else {
        (content.clone(), context)
    };

    session.add_message(ChatMessage {
        role: "user".to_string(),
        content: final_content,
    });

    let history = session.history().to_vec();
    drop(sessions);

    let messages_with_prompts = with_system_prompts(&history, mode);
    let acp_messages: Vec<AcpPromptMessage> = messages_with_prompts
        .iter()
        .map(|message| AcpPromptMessage {
            role: message.role.clone(),
            content: message.content.clone(),
        })
        .collect();

    let responses =
        handle_acp_session_prompt(runtime, &acp_session_id, &acp_messages, context_for_prompt)
            .await;
    if let Some(sender) = sender {
        for response in responses {
            let _ = sender.send(response);
        }
        Vec::new()
    } else {
        responses
    }
}

pub async fn handle_acp_session_prompt(
    runtime: &Arc<ProjectRuntime>,
    session_id: &str,
    messages: &[AcpPromptMessage],
    context: Option<reprod_core::acp::types::AcpContextRequest>,
) -> Vec<WSResponse> {
    let mut chat_messages: Vec<ChatMessage> = messages
        .iter()
        .map(|message| ChatMessage {
            role: message.role.clone(),
            content: message.content.clone(),
        })
        .collect();

    // If context is provided, build the latest user message and append it
    if let Some(ctx) = context {
        // Build user prompt from context (mirrors ai_handler logic)
        let mut parts = Vec::new();

        // 1. Console Context
        if let Some(limit) = ctx.console_history_limit {
            if limit > 0 {
                let runs = runtime
                    .execution_repo
                    .latest_runs(limit)
                    .await
                    .unwrap_or_default();
                if !runs.is_empty() {
                    let mut console_text =
                        String::from("Recent console output (newest first, truncated):\n");
                    for run in runs {
                        console_text.push_str(&format!(
                            "- [{}] in {}ms\n",
                            run.created_at_ms,
                            run.duration_ms.unwrap_or(0)
                        ));
                        if !run.result.output.is_empty() {
                            console_text.push_str(&format!(
                                "stdout: {}\n",
                                run.result
                                    .output
                                    .lines()
                                    .take(20)
                                    .collect::<Vec<_>>()
                                    .join("\n")
                            ));
                        }
                        console_text.push('\n');
                    }
                    parts.push(console_text);
                }
            }
        }

        // 2. File Context
        if let Some(path) = ctx.active_buffer_path {
            if !path.is_empty() {
                if let Ok(result) = runtime.edit_service.read_text_file(&path).await {
                    parts.push(format!(
                        "Current file ({}):\n\n```r\n{}\n```\n",
                        path, result.text
                    ));
                }
            }
        }

        // 3. User Input
        parts.push(ctx.user_input);

        chat_messages.push(ChatMessage {
            role: "user".to_string(),
            content: parts.join("\n"),
        });
    }

    let has_system = chat_messages.iter().any(|message| message.role == "system");
    let messages_with_prompts = if has_system {
        chat_messages
    } else {
        with_system_prompts(&chat_messages, AIMode::Agent)
    };

    let contents: Vec<String> = messages_with_prompts
        .iter()
        .map(|message| {
            if !has_system && message.role == "system" {
                format!("[System]: {}", message.content)
            } else {
                message.content.clone()
            }
        })
        .collect();

    match runtime.acp.send_prompt(session_id, contents).await {
        Ok(()) => Vec::new(),
        Err(error) => error_response(error.to_string()),
    }
}

pub async fn handle_acp_session_cancel(
    runtime: &Arc<ProjectRuntime>,
    session_id: &str,
) -> Vec<WSResponse> {
    match runtime.acp.cancel(session_id).await {
        Ok(()) => Vec::new(),
        Err(error) => error_response(error.to_string()),
    }
}

pub async fn handle_acp_permission_decision(
    runtime: &Arc<ProjectRuntime>,
    decision: AcpPermissionDecision,
) -> Vec<WSResponse> {
    match runtime.acp.respond_permission(decision).await {
        Ok(()) => Vec::new(),
        Err(error) => error_response(error.to_string()),
    }
}

pub async fn translate_acp_update(
    runtime: &Arc<ProjectRuntime>,
    session_id: &str,
    update: AcpSessionUpdate,
) -> Vec<WSResponse> {
    let stream_id = {
        let streams = runtime.acp_session_streams.lock().await;
        streams.get(session_id).cloned()
    };
    let Some(stream_id) = stream_id else {
        return Vec::new();
    };

    match update {
        AcpSessionUpdate::UserMessageChunk { .. } => Vec::new(),
        AcpSessionUpdate::AgentMessageChunk { text } => {
            let chunk = format_chunk(runtime, &stream_id, "message", text.clone()).await;
            {
                let mut acc = runtime.acp_accumulated_text.lock().await;
                acc.entry(stream_id.clone()).or_default().push_str(&text);
            }
            vec![WSResponse::AIResponseChunk {
                id: stream_id,
                chunk,
            }]
        }
        AcpSessionUpdate::AgentThoughtChunk { text } => {
            let chunk = format_chunk(runtime, &stream_id, "thought", text).await;
            vec![WSResponse::AIResponseChunk {
                id: stream_id,
                chunk,
            }]
        }
        AcpSessionUpdate::Plan { steps } => vec![WSResponse::AgentEvent {
            id: stream_id,
            event: AgentEventPayload::PlanUpdate {
                steps: map_plan_steps(steps),
            },
        }],
        AcpSessionUpdate::ToolCall {
            id,
            title,
            kind,
            status,
            input,
            output,
            error,
            ..
        } => {
            {
                let mut titles = runtime.acp_tool_titles.lock().await;
                titles
                    .entry(session_id.to_string())
                    .or_default()
                    .insert(id.clone(), title.clone());
            }
            let log = ToolLogPayload {
                id: id.clone(),
                name: title.clone(),
                status: map_tool_status(&status),
                kind: Some(kind.clone()),
                input,
                output,
                error,
                started_at: Some(now_millis()),
                finished_at: None,
            };
            vec![
                WSResponse::AIToolStarted {
                    id: stream_id.clone(),
                    tool: log.clone(),
                },
                WSResponse::AgentEvent {
                    id: stream_id,
                    event: AgentEventPayload::ToolRequest {
                        id: Uuid::new_v4().to_string(),
                        status: AgentEventStatus::Running,
                        timestamp: now_millis(),
                        tool: title,
                        input: log.input.clone().unwrap_or(Value::Null),
                        requires_approval: false,
                        preview: None,
                        parent_id: None,
                    },
                },
            ]
        }
        AcpSessionUpdate::ToolCallUpdate {
            id,
            status,
            content,
            input,
            output,
            error,
        } => {
            let status_text = status.unwrap_or_else(|| "running".to_string());
            let mapped_status = map_tool_status(&status_text);
            let name = {
                let titles = runtime.acp_tool_titles.lock().await;
                titles
                    .get(session_id)
                    .and_then(|map| map.get(&id))
                    .cloned()
                    .unwrap_or_default()
            };
            let log = ToolLogPayload {
                id: id.clone(),
                name: name.clone(),
                status: mapped_status,
                kind: None,
                input,
                output: output.clone(),
                error: error.clone(),
                started_at: None,
                finished_at: Some(now_millis()),
            };

            let mut responses = vec![WSResponse::AIToolFinished {
                id: stream_id.clone(),
                tool: log.clone(),
            }];

            let status_event = match log.status {
                ToolLogStatus::Done => AgentEventStatus::Done,
                ToolLogStatus::Error => AgentEventStatus::Error,
                _ => AgentEventStatus::Running,
            };

            let output_payload = output
                .clone()
                .or_else(|| content.clone().map(Value::String));

            responses.push(WSResponse::AgentEvent {
                id: stream_id,
                event: AgentEventPayload::ToolResult {
                    id: Uuid::new_v4().to_string(),
                    status: status_event,
                    timestamp: now_millis(),
                    request_id: id,
                    tool: name,
                    output: output_payload,
                    error,
                    parent_id: None,
                },
            });
            if let Some(output) = output.as_ref() {
                if let Some(edit) = pending_edit_payload_from_output(output) {
                    responses.push(WSResponse::PendingEditCreated { edit });
                }
            }
            responses
        }
        AcpSessionUpdate::AvailableCommands { .. } => Vec::new(),
        AcpSessionUpdate::Done => {
            {
                let mut streams = runtime.acp_session_streams.lock().await;
                streams.remove(session_id);
            }
            {
                let mut titles = runtime.acp_tool_titles.lock().await;
                titles.remove(session_id);
            }
            {
                let mut last = runtime.acp_last_chunk_kind.lock().await;
                last.remove(&stream_id);
            }
            let accumulated = {
                let mut acc = runtime.acp_accumulated_text.lock().await;
                acc.remove(&stream_id).unwrap_or_default()
            };
            let blocks = extract_code_blocks(&accumulated);
            let code_blocks = if blocks.is_empty() { None } else { Some(blocks) };
            vec![WSResponse::AIResponseComplete {
                id: stream_id,
                final_text: String::new(),
                code_blocks,
            }]
        }
    }
}

async fn format_chunk(
    runtime: &Arc<ProjectRuntime>,
    stream_id: &str,
    kind: &str,
    text: String,
) -> String {
    let mut prefix = String::new();
    let mut last = runtime.acp_last_chunk_kind.lock().await;
    let last_kind = last.get(stream_id).map(String::as_str);
    if kind == "thought" {
        if last_kind != Some("thought") {
            prefix = format!(
                "{}[Thought]\n",
                if last_kind.is_some() { "\n\n" } else { "" }
            );
        }
    } else if kind == "tool" {
        if last_kind != Some("tool") {
            prefix = format!("{}[Tool]\n", if last_kind.is_some() { "\n\n" } else { "" });
        }
    } else if last_kind.is_some() && last_kind != Some("message") {
        prefix = "\n\n".to_string();
    }
    last.insert(stream_id.to_string(), kind.to_string());
    format!("{prefix}{text}")
}

pub async fn translate_acp_permission_request(
    state: &super::common::AppState,
    runtime: &Arc<ProjectRuntime>,
    request: AcpPermissionRequestPayload,
) -> Option<WSResponse> {
    let stream_id = {
        let streams = runtime.acp_session_streams.lock().await;
        streams.get(&request.session_id).cloned()
    }?;

    {
        let mut pending = state.acp_permission_requests.lock().await;
        pending.insert(request.request_id.clone(), request.clone());
    }

    let preview = super::common::ToolPreviewPayload {
        kind: "command".to_string(),
        filepath: None,
        diff: None,
        command: request.raw_input.clone(),
        affected_lines: None,
    };

    let options = map_permission_options(&request.options);
    let approval = build_approval_request_payload(
        request.request_id.clone(),
        request.tool_title.clone().unwrap_or_else(|| {
            request
                .tool_kind
                .clone()
                .unwrap_or_else(|| "tool".to_string())
        }),
        preview,
        options,
        None,
        None,
        None,
    );

    Some(WSResponse::ApprovalRequest {
        id: stream_id,
        request: approval,
    })
}

pub async fn resolve_acp_permission_decision(
    state: &super::common::AppState,
    runtime: &Arc<ProjectRuntime>,
    decision: super::common::ApprovalDecisionPayload,
) -> Option<Vec<WSResponse>> {
    let request = {
        let mut pending = state.acp_permission_requests.lock().await;
        pending.remove(&decision.event_id)
    }?;

    let (outcome, option_id, remember_scope) =
        map_permission_decision(&decision.decision, &request.options);

    let acp_decision = AcpPermissionDecision {
        request_id: request.request_id,
        outcome,
        option_id,
        remember_scope,
    };

    match runtime.acp.respond_permission(acp_decision).await {
        Ok(()) => Some(Vec::new()),
        Err(error) => Some(error_response(error.to_string())),
    }
}

fn map_plan_steps(steps: Vec<AcpPlanStep>) -> Vec<PlanStepPayload> {
    steps
        .into_iter()
        .map(|step| PlanStepPayload {
            id: step.id,
            title: step.title,
            status: match step.status {
                AcpPlanStepStatus::Pending => PlanStepStatus::Pending,
                AcpPlanStepStatus::Running => PlanStepStatus::Running,
                AcpPlanStepStatus::Done => PlanStepStatus::Done,
                AcpPlanStepStatus::Error => PlanStepStatus::Error,
            },
            kind: step.kind.as_deref().map(|_| PlanStepKind::Plan),
            error: step.error,
            started_at: step.started_at,
            finished_at: step.finished_at,
            waiting_reason: step.waiting_reason,
        })
        .collect()
}

fn map_tool_status(status: &str) -> ToolLogStatus {
    let lower = status.to_lowercase();
    if lower.contains("progress") || lower.contains("pending") || lower.contains("running") {
        return ToolLogStatus::Running;
    }
    if lower.contains("completed") || lower.contains("done") {
        return ToolLogStatus::Done;
    }
    if lower.contains("failed") || lower.contains("error") || lower.contains("rejected") {
        return ToolLogStatus::Error;
    }
    ToolLogStatus::Pending
}

fn map_permission_options(options: &[AcpPermissionOption]) -> Vec<ApprovalOption> {
    let mut mapped = Vec::new();
    if options.iter().any(|opt| opt.kind == "allow_once") {
        mapped.push(ApprovalOption::ApproveOnce);
    }
    if options.iter().any(|opt| opt.kind == "allow_always") {
        mapped.push(ApprovalOption::ApproveSession);
    }
    if options
        .iter()
        .any(|opt| opt.kind == "reject_once" || opt.kind == "reject_always")
    {
        mapped.push(ApprovalOption::Deny);
    }
    if mapped.is_empty() {
        mapped.push(ApprovalOption::ApproveOnce);
        mapped.push(ApprovalOption::Deny);
    }
    mapped
}

fn map_permission_decision(
    decision: &ApprovalOption,
    options: &[AcpPermissionOption],
) -> (
    AcpPermissionDecisionOutcome,
    Option<String>,
    Option<AcpPermissionDecisionScope>,
) {
    match decision {
        ApprovalOption::ApproveSession => {
            if let Some(opt) = options.iter().find(|opt| opt.kind == "allow_always") {
                return (
                    AcpPermissionDecisionOutcome::AllowAlways,
                    Some(opt.option_id.clone()),
                    Some(AcpPermissionDecisionScope::Session),
                );
            }
            if let Some(opt) = options.iter().find(|opt| opt.kind == "allow_once") {
                return (
                    AcpPermissionDecisionOutcome::AllowOnce,
                    Some(opt.option_id.clone()),
                    None,
                );
            }
        }
        ApprovalOption::ApproveOnce | ApprovalOption::Edit => {
            if let Some(opt) = options.iter().find(|opt| opt.kind == "allow_once") {
                return (
                    AcpPermissionDecisionOutcome::AllowOnce,
                    Some(opt.option_id.clone()),
                    None,
                );
            }
        }
        ApprovalOption::Deny => {
            if let Some(opt) = options.iter().find(|opt| opt.kind == "reject_once") {
                return (
                    AcpPermissionDecisionOutcome::RejectOnce,
                    Some(opt.option_id.clone()),
                    None,
                );
            }
            if let Some(opt) = options.iter().find(|opt| opt.kind == "reject_always") {
                return (
                    AcpPermissionDecisionOutcome::RejectAlways,
                    Some(opt.option_id.clone()),
                    Some(AcpPermissionDecisionScope::Session),
                );
            }
        }
    }

    let fallback = options.first().map(|opt| opt.option_id.clone());
    (AcpPermissionDecisionOutcome::Cancelled, fallback, None)
}

pub async fn handle_acp_pending_edit_accept(
    runtime: &Arc<ProjectRuntime>,
    edit_id: &str,
) -> Vec<WSResponse> {
    let handled = pending_edits::has_pending_edit(&runtime.pending_edits, edit_id).await;
    let result = if handled {
        pending_edits::accept_pending_edit(&runtime.edit_service, &runtime.pending_edits, edit_id)
            .await
    } else {
        runtime
            .acp
            .accept_pending_edit(edit_id)
            .await
            .map_err(|e| e.to_string())
    };
    match result {
        Ok(()) => single_response(WSResponse::AcpPendingEditResolved {
            edit_id: edit_id.to_string(),
            success: true,
            error: None,
        }),
        Err(error) => single_response(WSResponse::AcpPendingEditResolved {
            edit_id: edit_id.to_string(),
            success: false,
            error: Some(error),
        }),
    }
}

pub async fn handle_acp_pending_edit_reject(
    runtime: &Arc<ProjectRuntime>,
    edit_id: &str,
) -> Vec<WSResponse> {
    let handled = pending_edits::has_pending_edit(&runtime.pending_edits, edit_id).await;
    let result = if handled {
        pending_edits::reject_pending_edit(&runtime.pending_edits, edit_id).await
    } else {
        runtime
            .acp
            .reject_pending_edit(edit_id)
            .await
            .map_err(|e| e.to_string())
    };
    match result {
        Ok(()) => single_response(WSResponse::AcpPendingEditResolved {
            edit_id: edit_id.to_string(),
            success: true,
            error: None,
        }),
        Err(error) => single_response(WSResponse::AcpPendingEditResolved {
            edit_id: edit_id.to_string(),
            success: false,
            error: Some(error),
        }),
    }
}

pub async fn handle_acp_pending_edit_update(
    runtime: &Arc<ProjectRuntime>,
    edit_id: &str,
    new_text: &str,
) -> Vec<WSResponse> {
    let handled = pending_edits::has_pending_edit(&runtime.pending_edits, edit_id).await;
    let result = if handled {
        pending_edits::update_pending_edit(&runtime.pending_edits, edit_id, new_text).await
    } else {
        runtime
            .acp
            .update_pending_edit(edit_id, new_text)
            .await
            .map_err(|e| e.to_string())
    };
    match result {
        Ok(()) => single_response(WSResponse::AcpPendingEditUpdated {
            edit_id: edit_id.to_string(),
            success: true,
            error: None,
        }),
        Err(error) => single_response(WSResponse::AcpPendingEditUpdated {
            edit_id: edit_id.to_string(),
            success: false,
            error: Some(error),
        }),
    }
}
