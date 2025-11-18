use std::collections::HashMap;

use reprod_core::{ai::tools::*, ToolCall};
use serde_json::Value;

use super::common::{error_response, single_response, AppState, WSResponse};

pub(super) fn handle_list_tools(state: &AppState) -> Vec<WSResponse> {
    let tools = state.tool_registry.iter().cloned().collect();
    single_response(WSResponse::Tools { tools })
}

pub(super) async fn handle_execute_tool(
    state: &AppState,
    tool_id: String,
    capability_id: String,
    parameters: HashMap<String, Value>,
) -> Vec<WSResponse> {
    let mut r_executor = state.r_executor.lock().await;
    match state
        .tool_executor
        .execute(&tool_id, &capability_id, parameters, &mut r_executor)
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

pub(super) async fn execute_ai_tool_call(
    tool_call: &ToolCall,
    state: &AppState,
) -> Result<String, String> {
    match tool_call.name.as_str() {
        "read_file" => {
            let request: ReadFileRequest = serde_json::from_value(tool_call.input.clone())
                .map_err(|e| format!("Invalid request: {}", e))?;

            state
                .filesystem_tool
                .read_file(request)
                .await
                .map_err(|e| e.to_string())
        }
        "write_file" => {
            let request: WriteFileRequest = serde_json::from_value(tool_call.input.clone())
                .map_err(|e| format!("Invalid request: {}", e))?;

            state
                .filesystem_tool
                .write_file(request)
                .await
                .map(|_| "File written successfully".to_string())
                .map_err(|e| e.to_string())
        }
        "list_files" => {
            let request: ListFilesRequest = serde_json::from_value(tool_call.input.clone())
                .map_err(|e| format!("Invalid request: {}", e))?;

            state
                .filesystem_tool
                .list_files(request)
                .await
                .and_then(|files| {
                    serde_json::to_string(&files)
                        .map_err(|e| reprod_core::ReprodError::IOError(e.to_string()))
                })
                .map_err(|e| e.to_string())
        }
        "get_r_variables" => {
            let request: GetVariablesRequest = serde_json::from_value(tool_call.input.clone())
                .map_err(|e| format!("Invalid request: {}", e))?;

            let mut executor = state.r_executor.lock().await;
            state
                .r_context_tool
                .get_variables(request, &mut executor)
                .await
                .and_then(|vars| {
                    serde_json::to_string(&vars)
                        .map_err(|e| reprod_core::ReprodError::IOError(e.to_string()))
                })
                .map_err(|e| e.to_string())
        }
        "get_working_directory" => {
            let request: GetWorkingDirRequest = serde_json::from_value(tool_call.input.clone())
                .map_err(|e| format!("Invalid request: {}", e))?;

            let mut executor = state.r_executor.lock().await;
            state
                .r_context_tool
                .get_working_dir(request, &mut executor)
                .await
                .map_err(|e| e.to_string())
        }
        "get_installed_packages" => {
            let request: GetInstalledPackagesRequest =
                serde_json::from_value(tool_call.input.clone())
                    .map_err(|e| format!("Invalid request: {}", e))?;

            let mut executor = state.r_executor.lock().await;
            state
                .r_context_tool
                .get_installed_packages(request, &mut executor)
                .await
                .and_then(|pkgs| {
                    serde_json::to_string(&pkgs)
                        .map_err(|e| reprod_core::ReprodError::IOError(e.to_string()))
                })
                .map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown tool: {}", tool_call.name)),
    }
}
