use crate::handlers::common::{
    AgentEventPayload, AIMode, ApprovalDecisionPayload, ApprovalOption, ApprovalRequestPayload,
    ToolLogPayload, WSRequest, WSResponse,
};
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
    ToolLogPayload::export().expect("Failed to export ToolLogPayload");

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
