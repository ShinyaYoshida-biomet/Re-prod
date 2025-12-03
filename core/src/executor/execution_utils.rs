use crate::{
    CodeBlockKind, CodeBlockMetadata, EnvironmentSnapshot, ExecutionContext, ExecutionEvent,
    ExecutionRequest, ExecutionResult, ExecutionSource,
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
        created_at_ms: now_ms(),
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
