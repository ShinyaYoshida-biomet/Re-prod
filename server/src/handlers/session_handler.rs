use super::common::{error_response, single_response, AppState, WSResponse};

pub(super) async fn handle_interrupt(state: &AppState) -> Vec<WSResponse> {
    let executor = state.r_executor.lock().await;
    match executor.interrupt().await {
        Ok(success) => single_response(WSResponse::ExecutionInterrupted { success }),
        Err(e) => error_response(format!("Failed to interrupt execution: {}", e)),
    }
}

pub(super) async fn handle_restart(state: &AppState) -> Vec<WSResponse> {
    let restart_result = async {
        {
            let executor = state.r_executor.lock().await;
            executor.reset().await.map_err(|e| e.to_string())?;
        }
        let cleared = state.timeline.reset().map_err(|e| e.to_string())?;
        Ok::<u64, String>(cleared as u64)
    }
    .await;

    match restart_result {
        Ok(cleared_events) => single_response(WSResponse::SessionRestarted { cleared_events }),
        Err(message) => error_response(format!("Failed to restart session: {}", message)),
    }
}
