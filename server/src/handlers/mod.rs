use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use reprod_core::ExecutionRequest;
use serde_json;

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

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    while let Some(msg) = socket.recv().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(request) = serde_json::from_str::<WSRequest>(&text) {
                    let responses = handle_ws_request(request, &state).await;

                    for response in responses {
                        if let Ok(response_text) = serde_json::to_string(&response) {
                            if socket.send(Message::Text(response_text)).await.is_err() {
                                return;
                            }
                        }
                    }
                } else {
                    tracing::warn!("Failed to parse WebSocket request: {}", text);
                }
            }
            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => {}
        }
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
