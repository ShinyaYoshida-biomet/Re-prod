use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use similar::TextDiff;

use crate::edit::{sha256_hex, EditTextFileResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PendingEdit {
    pub id: String,
    pub session_id: String,
    pub tool_call_id: String,
    pub file_path: String,
    pub old_text: String,
    pub new_text: String,
    pub unified_diff: String,
    pub base_sha256: String,
    pub expected_sha256: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PendingOverlay {
    pub text: String,
    pub sha256: String,
}

#[derive(Default)]
pub struct PendingEditStore {
    edits_by_id: HashMap<String, PendingEdit>,
    edit_by_file: HashMap<String, String>,
    overlays: HashMap<String, PendingOverlay>,
}

impl PendingEditStore {
    pub fn overlay_for(&self, session_id: &str, file_path: &str) -> Option<PendingOverlay> {
        let key = overlay_key(session_id, file_path);
        self.overlays.get(&key).cloned()
    }

    pub fn has_pending_for_file(&self, session_id: &str, file_path: &str) -> bool {
        let key = file_key(session_id, file_path);
        self.edit_by_file.contains_key(&key)
    }

    pub fn register_pending_edit(
        &mut self,
        edit: PendingEdit,
        result: &EditTextFileResult,
    ) -> Result<(), String> {
        let key = file_key(&edit.session_id, &edit.file_path);
        if self.edit_by_file.contains_key(&key) {
            return Err("Pending edit already exists for this file".to_string());
        }

        let overlay_key = overlay_key(&edit.session_id, &edit.file_path);
        self.overlays.insert(
            overlay_key,
            PendingOverlay {
                text: edit.new_text.clone(),
                sha256: result.new_sha256.clone(),
            },
        );
        self.edit_by_file.insert(key, edit.id.clone());
        self.edits_by_id.insert(edit.id.clone(), edit);
        Ok(())
    }

    pub fn get_edit(&self, edit_id: &str) -> Option<PendingEdit> {
        self.edits_by_id.get(edit_id).cloned()
    }

    pub fn update_edit_text(
        &mut self,
        edit_id: &str,
        new_text: String,
    ) -> Result<PendingEdit, String> {
        let edit = self
            .edits_by_id
            .get_mut(edit_id)
            .ok_or_else(|| "Pending edit not found".to_string())?;

        edit.new_text = new_text.clone();
        edit.unified_diff = unified_diff(&edit.file_path, &edit.old_text, &new_text);

        let overlay_key = overlay_key(&edit.session_id, &edit.file_path);
        self.overlays.insert(
            overlay_key,
            PendingOverlay {
                text: new_text,
                sha256: sha256_hex(&edit.new_text),
            },
        );

        Ok(edit.clone())
    }

    pub fn remove_edit(&mut self, edit_id: &str) -> Option<PendingEdit> {
        let edit = self.edits_by_id.remove(edit_id)?;
        let file_key = file_key(&edit.session_id, &edit.file_path);
        self.edit_by_file.remove(&file_key);
        let overlay_key = overlay_key(&edit.session_id, &edit.file_path);
        self.overlays.remove(&overlay_key);
        Some(edit)
    }

    pub fn clear_overlay(&mut self, session_id: &str, file_path: &str) {
        let key = overlay_key(session_id, file_path);
        self.overlays.remove(&key);
    }
}

fn file_key(session_id: &str, file_path: &str) -> String {
    format!("{session_id}:{file_path}")
}

fn overlay_key(session_id: &str, file_path: &str) -> String {
    format!("{session_id}:{file_path}")
}

fn unified_diff(path: &str, old_text: &str, new_text: &str) -> String {
    TextDiff::from_lines(old_text, new_text)
        .unified_diff()
        .header(&format!("a/{}", path), &format!("b/{}", path))
        .to_string()
}
