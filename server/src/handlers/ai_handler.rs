use std::sync::{atomic::Ordering, Arc};

use crate::projects::ProjectRuntime;
use reprod_core::{
    ai::{
        self,
        tools::{get_filesystem_tools, get_r_context_tools},
    },
    ChatMessage,
};
use serde_json::json;

use super::{
    common::{
        build_streaming_payload, error_response, now_millis, tool_log_from_call,
        with_system_prompts, AIMode, AppState, ToolLogStatus, WSResponse,
    },
    tool_handler::execute_ai_tool_call,
};

pub(super) async fn handle_ai_message(
    state: &AppState,
    runtime: &Arc<ProjectRuntime>,
    messages: Vec<ChatMessage>,
    enable_tools: bool,
    request_id: Option<String>,
    stream: bool,
    mode: AIMode,
) -> Vec<WSResponse> {
    let cfg = state.config.lock().await.clone();
    let provider = ai::from_config(&cfg);
    let stream_id = request_id.unwrap_or_else(|| {
        let count = state.request_counter.fetch_add(1, Ordering::Relaxed);
        format!("req-{}", count)
    });
    let messages_with_prompts = with_system_prompts(&messages, mode);

    if enable_tools {
        let mut tools = get_filesystem_tools();
        tools.extend(get_r_context_tools());
        let mut outbound = Vec::new();

        match provider
            .send_message_with_tools(messages_with_prompts.clone(), tools.clone())
            .await
        {
            Ok(response) => {
                if let Some(ref tool_calls) = response.tool_calls {
                    let mut tool_results = Vec::new();

                    for tool_call in tool_calls {
                        let mut log = tool_log_from_call(tool_call);
                        outbound.push(WSResponse::AIToolStarted {
                            id: stream_id.clone(),
                            tool: log.clone(),
                        });

                        let tool_result = execute_ai_tool_call(tool_call, runtime).await;
                        match tool_result {
                            Ok(content) => {
                                log.status = ToolLogStatus::Done;
                                log.output = Some(json!({ "result": content }));
                                tool_results.push((tool_call.id.clone(), content));
                            }
                            Err(err) => {
                                log.status = ToolLogStatus::Error;
                                log.error = Some(err.clone());
                                tool_results
                                    .push((tool_call.id.clone(), format!("Error: {}", err)));
                            }
                        }
                        log.finished_at = Some(now_millis());
                        outbound.push(WSResponse::AIToolFinished {
                            id: stream_id.clone(),
                            tool: log,
                        });
                    }

                    let mut follow_up_messages = messages.clone();
                    follow_up_messages.push(ChatMessage {
                        role: "assistant".to_string(),
                        content: response.content.clone(),
                    });

                    for (tool_id, result) in tool_results {
                        follow_up_messages.push(ChatMessage {
                            role: "user".to_string(),
                            content: format!("Tool '{}' result: {}", tool_id, result),
                        });
                    }

                    let follow_up_with_prompts = with_system_prompts(&follow_up_messages, mode);
                    match provider.send_message(follow_up_with_prompts).await {
                        Ok(final_response) => {
                            outbound.extend(build_streaming_payload(
                                stream,
                                &stream_id,
                                final_response,
                            ));
                            outbound
                        }
                        Err(e) => {
                            outbound.push(WSResponse::Error {
                                message: format!("Failed to get final response: {}", e),
                            });
                            outbound
                        }
                    }
                } else {
                    let mut responses =
                        build_streaming_payload(stream, &stream_id, response.content.clone());
                    responses.push(WSResponse::AIResponseWithTools { response });
                    responses
                }
            }
            Err(e) => error_response(e.to_string()),
        }
    } else {
        match provider.send_message(messages_with_prompts).await {
            Ok(response) => build_streaming_payload(stream, &stream_id, response),
            Err(e) => error_response(e.to_string()),
        }
    }
}
