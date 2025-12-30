use reprod_core::{RunOutputChunk, RunStream};
use std::collections::HashMap;

/// In-memory buffer for streaming run output.
pub struct StreamBuffer {
    chunks: HashMap<String, Vec<RunOutputChunk>>,
}

impl StreamBuffer {
    pub fn new() -> Self {
        Self {
            chunks: HashMap::new(),
        }
    }

    pub fn append(&mut self, chunk: RunOutputChunk) {
        self.chunks
            .entry(chunk.run_id.clone())
            .or_default()
            .push(chunk);
    }

    pub fn get(&self, run_id: &str) -> Vec<RunOutputChunk> {
        self.chunks.get(run_id).cloned().unwrap_or_default()
    }

    /// Finalize a run and return aggregated stdout/stderr.
    pub fn finalize(&mut self, run_id: &str) -> (String, Option<String>) {
        let chunks = self.chunks.remove(run_id).unwrap_or_default();
        let mut stdout = String::new();
        let mut stderr = String::new();

        for chunk in chunks {
            match chunk.stream {
                RunStream::Stdout => stdout.push_str(&chunk.chunk),
                RunStream::Stderr => stderr.push_str(&chunk.chunk),
            }
        }

        let error = if stderr.is_empty() {
            None
        } else {
            Some(stderr)
        };
        (stdout, error)
    }

    pub fn clear(&mut self) {
        self.chunks.clear();
    }

    pub fn remove_run(&mut self, run_id: &str) {
        self.chunks.remove(run_id);
    }
}
