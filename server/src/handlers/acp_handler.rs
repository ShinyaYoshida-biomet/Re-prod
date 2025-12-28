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
    let chat_messages: Vec<ChatMessage> = messages
        .iter()
        .map(|message| ChatMessage {
            role: message.role.clone(),
            content: message.content.clone(),
        })
        .collect();

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
