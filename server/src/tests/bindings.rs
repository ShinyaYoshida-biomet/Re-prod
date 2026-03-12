use crate::handlers::common::{
    AIMode, AgentEventPayload, ApprovalDecisionPayload, ApprovalOption, ApprovalRequestPayload,
    PendingEditPayload, ToolLogPayload, WSRequest, WSResponse,
};
use reprod_core::{DiffChange, DiffChangeType, DiffHunk, DiffLine, DiffLineType};
use std::path::Path;
use ts_rs::TS;

#[test]
fn export_bindings() {
    WSRequest::export().expect("Failed to export WSRequest");
    WSResponse::export().expect("Failed to export WSResponse");

    // Export server-local dependencies referenced by WSRequest/WSResponse.
    AIMode::export().expect("Failed to export AIMode");
    ApprovalOption::export().expect("Failed to export ApprovalOption");
    ApprovalRequestPayload::export().expect("Failed to export ApprovalRequestPayload");
    ApprovalDecisionPayload::export().expect("Failed to export ApprovalDecisionPayload");
    AgentEventPayload::export().expect("Failed to export AgentEventPayload");
    PendingEditPayload::export().expect("Failed to export PendingEditPayload");
    ToolLogPayload::export().expect("Failed to export ToolLogPayload");
    DiffChange::export().expect("Failed to export DiffChange");
    DiffChangeType::export().expect("Failed to export DiffChangeType");
    DiffLine::export().expect("Failed to export DiffLine");
    DiffLineType::export().expect("Failed to export DiffLineType");
    DiffHunk::export().expect("Failed to export DiffHunk");

    rewrite_acp_imports("WSRequest.ts");
    rewrite_acp_imports("WSResponse.ts");
}

fn rewrite_acp_imports(filename: &str) {
    let base = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../client/src/types/generated")
        .join(filename);
    let Ok(contents) = std::fs::read_to_string(&base) else {
        return;
    };
    let updated = contents.replace("../../../../../client/src/types/generated/", "./");
    if updated != contents {
        let _ = std::fs::write(&base, updated);
    }
}
