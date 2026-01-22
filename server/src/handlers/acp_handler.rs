use std::sync::Arc;

use super::common::{error_response, single_response, with_system_prompts, AIMode, WSResponse};
use crate::pending_edits;
use crate::projects::ProjectRuntime;
use reprod_core::acp::types::{AcpPermissionDecision, AcpPromptMessage};
use reprod_core::ChatMessage;

pub async fn handle_acp_session_create(runtime: &Arc<ProjectRuntime>) -> Vec<WSResponse> {
    match runtime.acp.create_session().await {
        Ok(session_id) => single_response(WSResponse::AcpSessionCreated { session_id }),
        Err(error) => error_response(error.to_string()),
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
                let runs = runtime.execution_repo.latest_runs(limit).await.unwrap_or_default();
                if !runs.is_empty() {
                    let mut console_text = String::from("Recent console output (newest first, truncated):\n");
                    for run in runs {
                        console_text.push_str(&format!("- [{}] in {}ms\n", run.created_at_ms, run.duration_ms.unwrap_or(0)));
                        if !run.result.output.is_empty() { console_text.push_str(&format!("stdout: {}\n", run.result.output.lines().take(20).collect::<Vec<_>>().join("\n"))); }
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
                    parts.push(format!("Current file ({}):\n\n```r\n{}\n```\n", path, result.text));
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

pub async fn handle_acp_pending_edit_accept(
    runtime: &Arc<ProjectRuntime>,
    edit_id: &str,
) -> Vec<WSResponse> {
    let handled = pending_edits::has_pending_edit(&runtime.pending_edits, edit_id).await;
    let result = if handled {
        pending_edits::accept_pending_edit(
            &runtime.edit_service,
            &runtime.pending_edits,
            edit_id,
        )
        .await
    } else {
        runtime.acp.accept_pending_edit(edit_id).await.map_err(|e| e.to_string())
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
        runtime.acp.reject_pending_edit(edit_id).await.map_err(|e| e.to_string())
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
        runtime.acp.update_pending_edit(edit_id, new_text).await.map_err(|e| e.to_string())
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
