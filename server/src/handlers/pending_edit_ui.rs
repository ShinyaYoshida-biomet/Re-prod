use reprod_core::acp::pending_edit::PendingEdit;
use serde_json::Value;

use super::common::PendingEditPayload;

pub(super) fn pending_edit_payload_from_output(output: &Value) -> Option<PendingEditPayload> {
    if output.get("type")?.as_str()? != "pending_edit" {
        return None;
    }
    let edit_value = output.get("edit")?.clone();
    let edit: PendingEdit = serde_json::from_value(edit_value).ok()?;
    Some(pending_edit_payload_from_edit(&edit))
}

pub(super) fn pending_edit_payload_from_edit(edit: &PendingEdit) -> PendingEditPayload {
    let normalized_path = normalize_relative_path(&edit.file_path)
        .unwrap_or_else(|| edit.file_path.clone());
    PendingEditPayload {
        id: edit.id.clone(),
        session_id: edit.session_id.clone(),
        tool_call_id: edit.tool_call_id.clone(),
        file_path: normalized_path,
        old_text: edit.old_text.clone(),
        new_text: edit.new_text.clone(),
        unified_diff: edit.unified_diff.clone(),
        base_sha256: edit.base_sha256.clone(),
        expected_sha256: edit.expected_sha256.clone(),
    }
}

fn normalize_relative_path(path: &str) -> Option<String> {
    use std::path::Component;
    let mut parts = Vec::new();
    let path = std::path::Path::new(path);
    for component in path.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
            Component::CurDir => {}
            _ => return None,
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_edit(path: &str) -> PendingEdit {
        PendingEdit {
            id: "edit-1".to_string(),
            session_id: "session-1".to_string(),
            tool_call_id: "tool-1".to_string(),
            file_path: path.to_string(),
            old_text: "old".to_string(),
            new_text: "new".to_string(),
            unified_diff: "@@ -1 +1 @@".to_string(),
            base_sha256: "base".to_string(),
            expected_sha256: Some("expected".to_string()),
        }
    }

    #[test]
    fn payload_normalizes_path() {
        let edit = build_edit("./foo/./bar.txt");
        let payload = pending_edit_payload_from_edit(&edit);
        assert_eq!(payload.file_path, "foo/bar.txt");
    }

    #[test]
    fn payload_from_output_detects_pending_edit() {
        let edit = build_edit("notes.txt");
        let output = serde_json::json!({
            "type": "pending_edit",
            "edit": edit,
        });
        let payload = pending_edit_payload_from_output(&output).expect("payload");
        assert_eq!(payload.file_path, "notes.txt");
        assert_eq!(payload.id, "edit-1");
    }
}
