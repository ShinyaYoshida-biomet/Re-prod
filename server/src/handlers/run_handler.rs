use std::sync::Arc;

use crate::projects::ProjectRuntime;
use reprod_core::{run_store::RunStore, RunOutputChunk, RunSummary};

use super::common::{error_response, single_response, WSResponse};

pub(super) fn handle_run_query(
    runtime: &Arc<ProjectRuntime>,
    limit: Option<usize>,
) -> Vec<WSResponse> {
    match runtime.run_store.latest(limit) {
        Ok(runs) => single_response(WSResponse::RunState { runs }),
        Err(e) => error_response(format!("Run query failed: {}", e)),
    }
}

pub(super) fn handle_run_started(run: RunSummary) -> Vec<WSResponse> {
    single_response(WSResponse::RunStarted { run })
}

pub(super) fn handle_run_output(chunk: RunOutputChunk) -> Vec<WSResponse> {
    single_response(WSResponse::RunOutput(chunk))
}

pub(super) fn handle_run_finished(run: RunSummary) -> Vec<WSResponse> {
    single_response(WSResponse::RunFinished { run })
}
