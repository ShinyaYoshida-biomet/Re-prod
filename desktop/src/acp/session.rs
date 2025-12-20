use std::collections::HashMap;
use std::path::PathBuf;

/// Simple in-memory tracker for ACP sessions.
pub struct AcpSessionManager {
    sessions: HashMap<String, PathBuf>,
}

impl AcpSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    pub fn register(&mut self, id: String, cwd: PathBuf) {
        self.sessions.insert(id, cwd);
    }

    pub fn exists(&self, id: &str) -> bool {
        self.sessions.contains_key(id)
    }

    pub fn remove(&mut self, id: &str) {
        self.sessions.remove(id);
    }
}
