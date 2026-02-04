use std::sync::Arc;

use reprod_core::{
    acp::pending_edit::{PendingEdit, PendingEditStore},
    edit::{sha256_hex, EditOperation, EditService, EditStatus, EditTextFileRequest},
};
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(serde::Deserialize)]
pub struct ApplyPendingEditRequest {
    pub edit_id: String,
}

#[derive(serde::Serialize)]
pub struct ApplyPendingEditResult {
    pub success: bool,
}

pub async fn propose_pending_edit(
    edit_service: &Arc<EditService>,
    store: &Arc<Mutex<PendingEditStore>>,
    session_id: &str,
    tool_call_id: &str,
    request: EditTextFileRequest,
) -> Result<PendingEdit, String> {
    let preview = edit_service
        .preview_text_file(request.clone(), None)
        .await
        .map_err(|e| e.to_string())?;

    if matches!(preview.status, EditStatus::Conflict) {
        return Err("Pending edit base mismatch: file changed since edit was created".to_string());
    }

    let edit = PendingEdit {
        id: format!("api-edit-{}", Uuid::new_v4()),
        session_id: session_id.to_string(),
        tool_call_id: tool_call_id.to_string(),
        file_path: request.path.clone(),
        old_text: preview.old_text.clone(),
        new_text: preview.new_text.clone(),
        unified_diff: preview.unified_diff.clone(),
        base_sha256: preview.old_sha256.clone(),
        expected_sha256: request.expected_sha256.clone(),
    };

    let mut pending = store.lock().await;
    pending
        .register_pending_edit(edit.clone(), &preview)
        .map_err(|e| e.to_string())?;

    Ok(edit)
}

pub async fn accept_pending_edit(
    edit_service: &Arc<EditService>,
    store: &Arc<Mutex<PendingEditStore>>,
    edit_id: &str,
) -> Result<(), String> {
    let edit = {
        let pending = store.lock().await;
        pending
            .get_edit(edit_id)
            .ok_or_else(|| "Pending edit not found".to_string())?
    };

    let current_sha = match edit_service.read_text_file(&edit.file_path).await {
        Ok(result) => result.sha256,
        Err(error) => {
            let message = error.to_string();
            if message.contains("Cannot read file metadata")
                || message.contains("No such file or directory")
            {
                sha256_hex("")
            } else {
                return Err(message);
            }
        }
    };
    if current_sha != edit.base_sha256 {
        return Err("Pending edit base mismatch: file changed since edit was created".to_string());
    }

    let request = EditTextFileRequest {
        path: edit.file_path.clone(),
        operation: EditOperation::Replace,
        expected_sha256: edit
            .expected_sha256
            .clone()
            .or_else(|| Some(edit.base_sha256.clone())),
        new_text: Some(edit.new_text.clone()),
        edits: None,
    };
    let result = edit_service
        .edit_text_file(request)
        .await
        .map_err(|e| e.to_string())?;
    if matches!(result.status, EditStatus::Conflict) {
        return Err("Conflict detected while applying pending edit".to_string());
    }

    let mut pending = store.lock().await;
    pending.remove_edit(edit_id);
    Ok(())
}

pub async fn reject_pending_edit(
    store: &Arc<Mutex<PendingEditStore>>,
    edit_id: &str,
) -> Result<(), String> {
    let mut pending = store.lock().await;
    if pending.remove_edit(edit_id).is_none() {
        return Err("Pending edit not found".to_string());
    }
    Ok(())
}

pub async fn update_pending_edit(
    store: &Arc<Mutex<PendingEditStore>>,
    edit_id: &str,
    new_text: &str,
) -> Result<(), String> {
    let mut pending = store.lock().await;
    pending
        .update_edit_text(edit_id, new_text.to_string())
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn has_pending_edit(store: &Arc<Mutex<PendingEditStore>>, edit_id: &str) -> bool {
    let pending = store.lock().await;
    pending.get_edit(edit_id).is_some()
}

pub async fn get_pending_edit(
    store: &Arc<Mutex<PendingEditStore>>,
    edit_id: &str,
) -> Option<PendingEdit> {
    let pending = store.lock().await;
    pending.get_edit(edit_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn propose_and_accept_pending_edit() {
        let temp = TempDir::new().unwrap();
        let edit_service = Arc::new(EditService::new(temp.path().to_path_buf()));
        let store = Arc::new(Mutex::new(PendingEditStore::default()));

        let request = EditTextFileRequest {
            path: "note.txt".to_string(),
            operation: EditOperation::Replace,
            expected_sha256: None,
            new_text: Some("hello".to_string()),
            edits: None,
        };

        let edit = propose_pending_edit(&edit_service, &store, "session-1", "tool-1", request)
            .await
            .expect("pending edit");

        assert!(has_pending_edit(&store, &edit.id).await);
        accept_pending_edit(&edit_service, &store, &edit.id)
            .await
            .expect("accept");
        assert!(!has_pending_edit(&store, &edit.id).await);
    }
}
