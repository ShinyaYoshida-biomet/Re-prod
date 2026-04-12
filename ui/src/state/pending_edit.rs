use leptos::prelude::*;
use std::collections::HashMap;
use reprod_protocol::{DiffChange, DiffHunk};

#[derive(Clone, Debug)]
pub struct PendingEdit {
    pub id: String,
    pub source_type: String,
    pub session_id: Option<String>,
    pub file_path: String,
    pub old_content: String,
    pub new_content: String,
    pub unified_diff: String,
    pub base_hash: String,
    pub expected_sha: Option<String>,
    pub created_at: f64,
    pub changes: Vec<DiffChange>,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Clone, Copy)]
pub struct PendingEditState {
    pub edits: RwSignal<HashMap<String, PendingEdit>>,
}

impl PendingEditState {
    pub fn new() -> Self {
        Self {
            edits: RwSignal::new(HashMap::new()),
        }
    }

    pub fn register(&self, edit: PendingEdit) {
        let key = edit.file_path.clone();
        self.edits.update(|edits| {
            edits.insert(key, edit);
        });
    }

    pub fn clear(&self, file_path: &str) {
        self.edits.update(|edits| {
            edits.remove(file_path);
        });
    }

    pub fn get(&self, file_path: &str) -> Option<PendingEdit> {
        self.edits.get().get(file_path).cloned()
    }
}
