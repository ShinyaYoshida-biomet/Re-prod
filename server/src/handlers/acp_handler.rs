use std::sync::Arc;

use super::common::{error_response, single_response, with_system_prompts, AIMode, WSResponse};
use crate::projects::ProjectRuntime;
use reprod_acp::types::{AcpPermissionDecision, AcpPromptMessage};
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
) -> Vec<WSResponse> {
    // Convert AcpPromptMessage to ChatMessage for system prompt injection
    let chat_messages: Vec<ChatMessage> = messages
        .iter()
        .map(|message| ChatMessage {
            role: message.role.clone(),
            content: message.content.clone(),
        })
        .collect();

    // Apply system prompts (same as API flow) for consistent behavior
    let messages_with_prompts = with_system_prompts(&chat_messages, AIMode::Agent);

    // Extract contents for the ACP gateway
    let contents: Vec<String> = messages_with_prompts
        .iter()
        .map(|message| {
            if message.role == "system" {
                // Format system prompts with role prefix for clarity
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
