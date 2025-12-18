use std::sync::Arc;

use crate::projects::ProjectRuntime;

use super::common::{error_response, single_response, WSResponse};

pub(super) async fn handle_interrupt(runtime: &Arc<ProjectRuntime>) -> Vec<WSResponse> {
    let executor = runtime.r_executor.lock().await;
    match executor.interrupt().await {
        Ok(success) => single_response(WSResponse::ExecutionInterrupted { success }),
        Err(e) => error_response(format!("Failed to interrupt execution: {}", e)),
    }
}

pub(super) async fn handle_restart(runtime: &Arc<ProjectRuntime>) -> Vec<WSResponse> {
    let restart_result = async {
        runtime
            .r_executor
            .lock()
            .await
            .reset()
            .await
            .map_err(|e| e.to_string())?;
        runtime
            .stream_buffer
            .lock()
            .await
            .clear();
        let cleared = runtime
            .execution_repo
            .reset()
            .await
            .map_err(|e| e.to_string())?;
        Ok::<u64, String>(cleared as u64)
    }
    .await;

    match restart_result {
        Ok(cleared_events) => single_response(WSResponse::SessionRestarted { cleared_events }),
        Err(message) => error_response(format!("Failed to restart session: {}", message)),
    }
}
