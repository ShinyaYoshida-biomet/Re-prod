use leptos::prelude::*;
use reprod_protocol::{RunSummary, RunOutputChunk};

#[derive(Clone, Debug)]
pub struct ExecutionLogEntry {
    pub run_id: Option<String>,
    pub code: String,
    pub stdout: String,
    pub stderr: String,
    pub plots: Vec<ExecutionLogPlot>,
    pub timestamp: f64,
    pub duration: f64,
    pub success: bool,
    pub pending: bool,
}

#[derive(Clone, Debug)]
pub struct ExecutionLogPlot {
    pub data: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Clone, Copy)]
pub struct ExecutionState {
    pub is_running: RwSignal<bool>,
    pub results: RwSignal<Vec<ExecutionLogEntry>>,
    pub history: RwSignal<Vec<ExecutionLogEntry>>,
    pub current_cell: RwSignal<Option<u32>>,
    pub last_error: RwSignal<Option<String>>,
}

impl ExecutionState {
    pub fn new() -> Self {
        Self {
            is_running: RwSignal::new(false),
            results: RwSignal::new(Vec::new()),
            history: RwSignal::new(Vec::new()),
            current_cell: RwSignal::new(None),
            last_error: RwSignal::new(None),
        }
    }

    pub fn apply_run_started(&self, run: RunSummary) {
        self.is_running.set(true);
        let entry = ExecutionLogEntry {
            run_id: Some(run.run_id),
            code: run.code.unwrap_or_default(),
            stdout: String::new(),
            stderr: String::new(),
            plots: Vec::new(),
            timestamp: run.started_at_ms as f64,
            duration: 0.0,
            success: true,
            pending: true,
        };
        self.results.update(|results| results.push(entry));
    }

    pub fn apply_run_output(&self, chunk: RunOutputChunk) {
        self.results.update(|results| {
            if let Some(entry) = results.iter_mut().find(|e| e.run_id.as_deref() == Some(&chunk.run_id)) {
                match chunk.stream {
                    reprod_protocol::RunStream::Stdout => entry.stdout.push_str(&chunk.chunk),
                    reprod_protocol::RunStream::Stderr => entry.stderr.push_str(&chunk.chunk),
                }
            }
        });
    }

    pub fn apply_run_finished(&self, run: RunSummary) {
        self.is_running.set(false);
        self.results.update(|results| {
            if let Some(entry) = results.iter_mut().find(|e| e.run_id.as_deref() == Some(&run.run_id)) {
                entry.pending = false;
                entry.success = matches!(run.status, reprod_protocol::RunStatus::Succeeded);
                entry.duration = run.duration_ms.unwrap_or(0) as f64;
                if let Some(err) = &run.error {
                    entry.stderr.push_str(err);
                }
                if let Some(plots) = &run.plots {
                    entry.plots = plots.iter().map(|p| ExecutionLogPlot {
                        data: p.base64_data.clone(),
                        width: p.width,
                        height: p.height,
                    }).collect();
                }
            }
        });
        // Copy to history
        let results = self.results.get();
        if let Some(entry) = results.iter().find(|e| e.run_id.as_deref() == Some(&run.run_id)) {
            self.history.update(|history| history.push(entry.clone()));
        }
    }

    pub fn clear_results(&self) {
        self.results.set(Vec::new());
    }

    pub fn reset(&self) {
        self.is_running.set(false);
        self.results.set(Vec::new());
        self.history.set(Vec::new());
        self.current_cell.set(None);
        self.last_error.set(None);
    }
}
