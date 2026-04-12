use leptos::prelude::*;

#[derive(Clone, Debug, PartialEq)]
pub struct Buffer {
    pub id: String,
    pub filepath: Option<String>,
    pub content: String,
    pub is_dirty: bool,
    pub cursor_line: u32,
    pub cursor_column: u32,
    pub display_name: Option<String>,
}

const DEFAULT_R_SCRIPT: &str = "# Welcome to Re-prod\n# Write your R code here\n\n# Section 1 ----\nprint(\"Hello, Re-prod!\")\n";

impl Default for Buffer {
    fn default() -> Self {
        Self {
            id: "default".to_string(),
            filepath: None,
            content: DEFAULT_R_SCRIPT.to_string(),
            is_dirty: false,
            cursor_line: 1,
            cursor_column: 1,
            display_name: Some("Untitled.R".to_string()),
        }
    }
}

#[derive(Clone, Copy)]
pub struct EditorState {
    pub buffers: RwSignal<Vec<Buffer>>,
    pub active_buffer_id: RwSignal<Option<String>>,
}

impl EditorState {
    pub fn new() -> Self {
        Self {
            buffers: RwSignal::new(vec![Buffer::default()]),
            active_buffer_id: RwSignal::new(Some("default".to_string())),
        }
    }

    pub fn active_buffer(&self) -> Option<Buffer> {
        let id = self.active_buffer_id.get();
        let buffers = self.buffers.get();
        id.and_then(|id| buffers.iter().find(|b| b.id == id).cloned())
    }

    pub fn update_content(&self, buffer_id: &str, content: String) {
        self.buffers.update(|buffers| {
            if let Some(buf) = buffers.iter_mut().find(|b| b.id == buffer_id) {
                buf.content = content;
                buf.is_dirty = true;
            }
        });
    }

    pub fn add_buffer(&self, buffer: Buffer) {
        self.buffers.update(|buffers| {
            if !buffers.iter().any(|b| b.id == buffer.id) {
                buffers.push(buffer);
            }
        });
    }

    pub fn remove_buffer(&self, buffer_id: &str) {
        self.buffers.update(|buffers| {
            buffers.retain(|b| b.id != buffer_id);
        });
    }

    pub fn set_active(&self, buffer_id: String) {
        self.active_buffer_id.set(Some(buffer_id));
    }
}
