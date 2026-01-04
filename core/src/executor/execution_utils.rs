use crate::{
    CodeBlockKind, CodeBlockMetadata, EnvironmentSnapshot, ExecutionContext, ExecutionEvent,
    ExecutionRequest, ExecutionResult, ExecutionSource, RunStatus,
};
use uuid::Uuid;

use super::{segment_r_code, SegmentationInput};

pub fn ensure_blocks(request: &ExecutionRequest) -> Vec<CodeBlockMetadata> {
    if !request.blocks.is_empty() {
        return request.blocks.clone();
    }

    if matches!(request.context.source, ExecutionSource::Selection) {
        let line_count = request.code.lines().count().max(1) as u32;
        return vec![CodeBlockMetadata {
            id: Uuid::new_v4().to_string(),
            index: 0,
            kind: CodeBlockKind::Selection,
            label: Some("Selection".into()),
            start_line: 1,
            end_line: line_count,
            code: request.code.clone(),
        }];
    }

    let filename = request.context.document_path.as_deref();
    let mut blocks = segment_r_code(SegmentationInput {
        content: &request.code,
        filename,
    });

    if blocks.is_empty() {
        let line_count = request.code.lines().count().max(1) as u32;
        blocks.push(CodeBlockMetadata {
            id: Uuid::new_v4().to_string(),
            index: 0,
            kind: CodeBlockKind::Document,
            label: Some("Document".into()),
            start_line: 1,
            end_line: line_count,
            code: request.code.clone(),
        });
    }

    blocks
}

pub fn build_event(
    request: &ExecutionRequest,
    result: &ExecutionResult,
    environment: EnvironmentSnapshot,
    blocks: Vec<CodeBlockMetadata>,
) -> ExecutionEvent {
    let finished_at = now_ms();
    let started_at = request.context.triggered_at_ms;
    let status = if result.success {
        RunStatus::Succeeded
    } else {
        RunStatus::Failed
    };
    ExecutionEvent {
        event_id: Uuid::new_v4().to_string(),
        context: ExecutionContext {
            source: request.context.source.clone(),
            document_path: request.context.document_path.clone(),
            cell_index: request.context.cell_index,
            triggered_at_ms: request.context.triggered_at_ms,
            actor: request.context.actor.clone(),
        },
        blocks,
        result: result.clone(),
        environment,
        created_at_ms: finished_at,
        status,
        started_at_ms: started_at,
        finished_at_ms: Some(finished_at),
        duration_ms: Some(finished_at.saturating_sub(started_at)),
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ExecutionActor, ExecutionContext};

    #[test]
    fn selection_request_creates_single_block() {
        let request = ExecutionRequest {
            code: "x <- 1".into(),
            context: ExecutionContext {
                source: ExecutionSource::Selection,
                document_path: None,
                cell_index: None,
                triggered_at_ms: 0,
                actor: ExecutionActor::User,
            },
            blocks: Vec::new(),
            plot_width: None,
            plot_height: None,
        };

        let blocks = ensure_blocks(&request);
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].kind, CodeBlockKind::Selection);
        assert_eq!(blocks[0].start_line, 1);
    }

    #[test]
    fn build_event_copies_metadata() {
        let request = ExecutionRequest {
            code: "x <- 1".into(),
            context: ExecutionContext {
                source: ExecutionSource::Cell,
                document_path: Some("analysis.R".into()),
                cell_index: Some(2),
                triggered_at_ms: 42,
                actor: ExecutionActor::User,
            },
            blocks: Vec::new(),
            plot_width: None,
            plot_height: None,
        };
        let result = ExecutionResult {
            success: true,
            output: "ok".into(),
            error: None,
            plots: Vec::new(),
            execution_time_ms: 10,
        };
        let environment = EnvironmentSnapshot {
            r_version: None,
            r_path: "Rscript".into(),
            working_dir: "/tmp".into(),
            temp_dir: "/tmp".into(),
        };

        let blocks = ensure_blocks(&request);
        let event = build_event(&request, &result, environment.clone(), blocks.clone());

        assert_eq!(event.context.source, ExecutionSource::Cell);
        assert_eq!(event.context.cell_index, Some(2));
        assert_eq!(event.blocks.len(), 1);
        assert_eq!(event.environment.r_path, environment.r_path);
        assert_eq!(event.result.output, "ok");
        assert_eq!(event.status, RunStatus::Succeeded);
        assert!(event.finished_at_ms.is_some());
    }
}
