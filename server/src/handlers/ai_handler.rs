use std::sync::{atomic::Ordering, Arc};

use crate::projects::ProjectRuntime;
use reprod_core::{
    ai::{
        self,
        tools::{get_console_tools, get_filesystem_tools, get_r_context_tools},
    },
    ChatMessage,
};
use serde_json::json;

use super::{
    common::{
        build_streaming_payload, error_response, now_millis, tool_log_from_call,
        with_system_prompts, AIMode, AppState, PlanStepPayload, PlanStepStatus, ToolLogStatus,
        WSResponse,
    },
    tool_handler::execute_ai_tool_call,
};

const PLAN_STEP_DISPATCH: &str = "plan-dispatch";
const PLAN_STEP_FETCH: &str = "locate-data";
const PLAN_STEP_INSPECT: &str = "inspect-data";
const PLAN_STEP_EXECUTE: &str = "execute-task";
const PLAN_STEP_SUMMARIZE: &str = "summarize";

fn build_initial_plan() -> Vec<PlanStepPayload> {
    let mut steps = vec![
        PlanStepPayload::new(PLAN_STEP_DISPATCH, "Plan request", Some("plan".to_string())),
        PlanStepPayload::new(
            PLAN_STEP_FETCH,
            "Fetch or locate data (download/path check)",
            Some("exec".to_string()),
        ),
        PlanStepPayload {
            waiting_reason: Some("Waiting for data or permission; resume once available".into()),
            ..PlanStepPayload::new(
                PLAN_STEP_INSPECT,
                "Inspect data structure (head/sample)",
                Some("peek".to_string()),
            )
        },
        PlanStepPayload::new(
            PLAN_STEP_EXECUTE,
            "Execute requested task (analysis/plots)",
            Some("exec".to_string()),
        ),
        PlanStepPayload::new(
            PLAN_STEP_SUMMARIZE,
            "Summarize results and next steps",
            Some("exec".to_string()),
        ),
    ];

    if let Some(dispatch) = steps.iter_mut().find(|s| s.id == PLAN_STEP_DISPATCH) {
        dispatch.mark_status(PlanStepStatus::Running);
    }

    steps
}

fn push_plan_update(responses: &mut Vec<WSResponse>, request_id: &str, plan: &[PlanStepPayload]) {
    responses.push(WSResponse::AIPlanUpdated {
        id: request_id.to_string(),
        plan: plan.to_vec(),
    });
}

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

    let mut plan = build_initial_plan();
    let mut outbound = Vec::new();
    push_plan_update(&mut outbound, &stream_id, &plan);

    let responses = if enable_tools {
        let mut tools = get_filesystem_tools();
        tools.extend(get_r_context_tools());
        tools.extend(get_console_tools());
        let mut responses = Vec::new();

        match provider
            .send_message_with_tools(messages_with_prompts.clone(), tools.clone())
            .await
        {
            Ok(response) => {
                if let Some(ref tool_calls) = response.tool_calls {
                    let mut tool_results = Vec::new();

                    for tool_call in tool_calls {
                        let mut log = tool_log_from_call(tool_call);
                        responses.push(WSResponse::AIToolStarted {
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
                        responses.push(WSResponse::AIToolFinished {
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
                            responses.extend(build_streaming_payload(
                                stream,
                                &stream_id,
                                final_response,
                            ));
                            responses
                        }
                        Err(e) => {
                            responses.push(WSResponse::Error {
                                message: format!("Failed to get final response: {}", e),
                            });
                            responses
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
    };

    let first_error_message = responses.iter().find_map(|response| {
        if let WSResponse::Error { message } = response {
            Some(message.clone())
        } else {
            None
        }
    });

    if let Some(step) = plan.iter_mut().find(|step| step.id == PLAN_STEP_DISPATCH) {
        if let Some(error_message) = first_error_message {
            step.error = Some(error_message);
            step.mark_status(PlanStepStatus::Error);
        } else {
            step.mark_status(PlanStepStatus::Done);
        }
    }
    outbound.extend(responses);
    push_plan_update(&mut outbound, &stream_id, &plan);

    outbound
}
