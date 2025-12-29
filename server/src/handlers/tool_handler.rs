use std::{collections::HashMap, sync::Arc};

use crate::projects::ProjectRuntime;
use reprod_core::{
    ai::tools::*,
    edit::{EditOperation, EditTextFileRequest},
    ToolCall,
};
use serde_json::Value;

use super::common::{error_response, single_response, AppState, WSResponse};

pub(super) fn handle_list_tools(state: &AppState) -> Vec<WSResponse> {
    let tools = state.tool_registry.iter().cloned().collect();
    single_response(WSResponse::Tools { tools })
}

pub(super) async fn handle_execute_tool(
    state: &AppState,
    runtime: &Arc<ProjectRuntime>,
    tool_id: String,
    capability_id: String,
    parameters: HashMap<String, Value>,
) -> Vec<WSResponse> {
    let r_executor = runtime.r_executor.lock().await;
    match state
        .tool_executor
        .execute(&tool_id, &capability_id, parameters, &r_executor)
        .await
    {
        Ok(result) => single_response(WSResponse::ToolExecutionResult {
            tool_id: result.tool_id,
            capability_id: result.capability_id,
            success: result.success,
            stdout: result.stdout,
            stderr: result.stderr,
            execution_time_ms: result.execution_time_ms,
            error: result.error,
        }),
        Err(e) => error_response(e.to_string()),
    }
}

pub(super) struct ToolCallOutcome {
    pub output: Value,
    pub summary: String,
}

pub(super) async fn execute_ai_tool_call(
    tool_call: &ToolCall,
    runtime: &Arc<ProjectRuntime>,
) -> Result<ToolCallOutcome, String> {
    match tool_call.name.as_str() {
        "read_text_file" => {
            let request: ReadTextFileRequest = serde_json::from_value(tool_call.input.clone())
                .map_err(|e| format!("Invalid request: {}", e))?;

            let result = runtime
                .edit_service
                .read_text_file(&request.path)
                .await
                .map_err(|e| e.to_string())?;

            let output = serde_json::to_value(result)
                .map_err(|e| format!("Failed to serialize read result: {}", e))?;
            Ok(ToolCallOutcome {
                output: output.clone(),
                summary: output.to_string(),
            })
        }
        "write_text_file" => {
            let request: WriteTextFileRequest = serde_json::from_value(tool_call.input.clone())
                .map_err(|e| format!("Invalid request: {}", e))?;

            let edit_request = EditTextFileRequest {
                path: request.path,
                operation: EditOperation::Replace,
                expected_sha256: request.expected_sha256,
                new_text: Some(request.content),
                edits: None,
            };
            let result = runtime
                .edit_service
                .edit_text_file(edit_request)
                .await
                .map_err(|e| e.to_string())?;
            let summary = if result.unified_diff.is_empty() {
                serde_json::to_string(&result).unwrap_or_default()
            } else {
                result.unified_diff.clone()
            };
            let output = serde_json::to_value(result)
                .map_err(|e| format!("Failed to serialize edit result: {}", e))?;
            Ok(ToolCallOutcome {
                output,
                summary,
            })
        }
        "edit_text_file" => {
            let request: EditTextFileRequest = serde_json::from_value(tool_call.input.clone())
                .map_err(|e| format!("Invalid request: {}", e))?;

            let result = runtime
                .edit_service
                .edit_text_file(request)
                .await
                .map_err(|e| e.to_string())?;
            let summary = if result.unified_diff.is_empty() {
                serde_json::to_string(&result).unwrap_or_default()
            } else {
                result.unified_diff.clone()
            };
            let output = serde_json::to_value(result)
                .map_err(|e| format!("Failed to serialize edit result: {}", e))?;
            Ok(ToolCallOutcome {
                output,
                summary,
            })
        }
        "list_files" => {
            let request: ListFilesRequest = serde_json::from_value(tool_call.input.clone())
                .map_err(|e| format!("Invalid request: {}", e))?;

            runtime
                .filesystem_tool
                .list_files(request)
                .await
                .and_then(|files| {
                    serde_json::to_value(&files)
                        .map_err(|e| reprod_core::ReprodError::IOError(e.to_string()))
                })
                .map_err(|e| e.to_string())
                .map(|output| ToolCallOutcome {
                    summary: output.to_string(),
                    output,
                })
        }
        "get_r_variables" => {
            let request: GetVariablesRequest = serde_json::from_value(tool_call.input.clone())
                .map_err(|e| format!("Invalid request: {}", e))?;

            let mut executor = runtime.r_executor.lock().await;
            runtime
                .r_context_tool
                .get_variables(request, &mut executor)
                .await
                .and_then(|vars| {
                    serde_json::to_value(&vars)
                        .map_err(|e| reprod_core::ReprodError::IOError(e.to_string()))
                })
                .map_err(|e| e.to_string())
                .map(|output| ToolCallOutcome {
                    summary: output.to_string(),
                    output,
                })
        }
        "get_working_directory" => {
            let request: GetWorkingDirRequest = serde_json::from_value(tool_call.input.clone())
                .map_err(|e| format!("Invalid request: {}", e))?;

            let mut executor = runtime.r_executor.lock().await;
            let output = runtime
                .r_context_tool
                .get_working_dir(request, &mut executor)
                .await
                .map_err(|e| e.to_string())
                .map(Value::String)?;
            Ok(ToolCallOutcome {
                summary: output.to_string(),
                output,
            })
        }
        "get_installed_packages" => {
            let request: GetInstalledPackagesRequest =
                serde_json::from_value(tool_call.input.clone())
                    .map_err(|e| format!("Invalid request: {}", e))?;

            let mut executor = runtime.r_executor.lock().await;
            runtime
                .r_context_tool
                .get_installed_packages(request, &mut executor)
                .await
                .and_then(|pkgs| {
                    serde_json::to_value(&pkgs)
                        .map_err(|e| reprod_core::ReprodError::IOError(e.to_string()))
                })
                .map_err(|e| e.to_string())
                .map(|output| ToolCallOutcome {
                    summary: output.to_string(),
                    output,
                })
        }
        "get_recent_console_logs" => {
            let request: GetConsoleLogsRequest = serde_json::from_value(tool_call.input.clone())
                .map_err(|e| format!("Invalid request: {}", e))?;

            let logs = fetch_console_logs(runtime.timeline.as_ref(), &request)
                .map_err(|e| e.to_string())?;

            let output = serde_json::to_value(&logs).map_err(|e| e.to_string())?;
            Ok(ToolCallOutcome {
                summary: output.to_string(),
                output,
            })
        }
        _ => Err(format!("Unknown tool: {}", tool_call.name)),
    }
}
