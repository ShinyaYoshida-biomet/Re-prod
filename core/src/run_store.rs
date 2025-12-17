use crate::{ArtifactInfo, PlotInfo};
use crate::{RunOutputChunk, RunStatus, RunStream, RunSummary};
use anyhow::{Context, Result};
use std::collections::VecDeque;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const DEFAULT_HISTORY_LIMIT: usize = 200;

/// Trait for persisting and querying runs.
pub trait RunStore: Send + Sync {
    fn create(&self, meta: RunSummary) -> Result<RunSummary>;
    fn append_output(&self, run_id: &str, chunk: RunOutputChunk) -> Result<()>;
    fn finish(&self, summary: RunSummary) -> Result<RunSummary>;
    fn latest(&self, limit: Option<usize>) -> Result<Vec<RunSummary>>;
}

/// File-per-run store under .reprod/runs
pub struct FsRunStore {
    root: PathBuf,
    index_path: PathBuf,
    history: Mutex<VecDeque<RunSummary>>,
    history_limit: usize,
}

impl FsRunStore {
    pub fn new(root: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&root)
            .with_context(|| format!("Failed to create runs root: {}", root.display()))?;
        let index_path = root.join("index.ndjson");
        if !index_path.exists() {
            File::create(&index_path)
                .with_context(|| format!("Failed to create run index: {}", index_path.display()))?;
        }

        let history = Self::load_index(&index_path)?;

        Ok(Self {
            root,
            index_path,
            history: Mutex::new(history),
            history_limit: DEFAULT_HISTORY_LIMIT,
        })
    }

    fn run_dir(&self, run_id: &str) -> PathBuf {
        self.root.join(run_id)
    }

    fn meta_path(&self, run_id: &str) -> PathBuf {
        self.run_dir(run_id).join("meta.json")
    }

    fn stdout_path(&self, run_id: &str) -> PathBuf {
        self.run_dir(run_id).join("stdout.ndjson")
    }

    fn stderr_path(&self, run_id: &str) -> PathBuf {
        self.run_dir(run_id).join("stderr.ndjson")
    }

    fn ensure_run_dir(&self, run_id: &str) -> Result<()> {
        let dir = self.run_dir(run_id);
        std::fs::create_dir_all(&dir)
            .with_context(|| format!("Failed to create run dir: {}", dir.display()))
    }

    fn write_meta(&self, run: &RunSummary) -> Result<()> {
        let path = self.meta_path(&run.run_id);
        let file = File::create(&path)
            .with_context(|| format!("Failed to create meta file: {}", path.display()))?;
        serde_json::to_writer_pretty(file, run)
            .with_context(|| format!("Failed to write meta file: {}", path.display()))
    }

    fn append_line(path: &Path, line: &str) -> Result<()> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .with_context(|| format!("Failed to open {} for append", path.display()))?;
        writeln!(file, "{}", line).with_context(|| format!("Failed to write to {}", path.display()))
    }

    fn load_index(index_path: &Path) -> Result<VecDeque<RunSummary>> {
        if !index_path.exists() {
            return Ok(VecDeque::new());
        }
        let file = File::open(index_path)
            .with_context(|| format!("Failed to open run index: {}", index_path.display()))?;
        let reader = BufReader::new(file);
        let mut runs = VecDeque::new();
        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }
            let run: RunSummary = serde_json::from_str(&line)
                .with_context(|| format!("Failed to parse run summary: {}", line))?;
            runs.push_back(run);
        }
        Ok(runs)
    }

    fn rewrite_index(&self) -> Result<()> {
        let history = self.history.lock().expect("run history lock poisoned");
        let mut file = File::create(&self.index_path).with_context(|| {
            format!("Failed to rewrite run index: {}", self.index_path.display())
        })?;
        for run in history.iter() {
            let line = serde_json::to_string(run)?;
            writeln!(file, "{}", line)?;
        }
        Ok(())
    }

    fn upsert_history(&self, run: RunSummary) -> RunSummary {
        let mut history = self.history.lock().expect("run history lock poisoned");
        if let Some(pos) = history.iter().position(|r| r.run_id == run.run_id) {
            history[pos] = run.clone();
        } else {
            history.push_back(run.clone());
        }
        while history.len() > self.history_limit {
            history.pop_front();
        }
        run
    }
}

impl RunStore for FsRunStore {
    fn create(&self, meta: RunSummary) -> Result<RunSummary> {
        self.ensure_run_dir(&meta.run_id)?;
        self.write_meta(&meta)?;
        self.upsert_history(meta.clone());
        self.rewrite_index()?;
        Ok(meta)
    }

    fn append_output(&self, run_id: &str, chunk: RunOutputChunk) -> Result<()> {
        self.ensure_run_dir(run_id)?;
        let path = match chunk.stream {
            RunStream::Stdout => self.stdout_path(run_id),
            RunStream::Stderr => self.stderr_path(run_id),
        };
        let line = serde_json::to_string(&chunk)?;
        Self::append_line(&path, &line)
    }

    fn finish(&self, summary: RunSummary) -> Result<RunSummary> {
        self.write_meta(&summary)?;
        let updated = self.upsert_history(summary.clone());
        self.rewrite_index()?;
        Ok(updated)
    }

    fn latest(&self, limit: Option<usize>) -> Result<Vec<RunSummary>> {
        let history = self.history.lock().expect("run history lock poisoned");
        let lim = limit.unwrap_or(self.history_limit);
        let len = history.len();
        let start = len.saturating_sub(lim);
        Ok(history.iter().skip(start).cloned().collect())
    }
}

/// Helper to build an initial RunSummary when a run starts.
pub fn new_run_summary(run_id: impl Into<String>, started_at_ms: u64) -> RunSummary {
    RunSummary {
        run_id: run_id.into(),
        status: RunStatus::Running,
        started_at_ms,
        finished_at_ms: None,
        duration_ms: None,
        has_stdout: false,
        has_stderr: false,
        artifacts: None,
        plots: None,
        error: None,
    }
}

/// Helper to finalize a RunSummary.
pub fn finalize_run_summary(
    mut run: RunSummary,
    status: RunStatus,
    finished_at_ms: u64,
    artifacts: Option<Vec<ArtifactInfo>>,
    plots: Option<Vec<PlotInfo>>,
    error: Option<String>,
) -> RunSummary {
    run.status = status;
    run.finished_at_ms = Some(finished_at_ms);
    run.duration_ms = Some(finished_at_ms.saturating_sub(run.started_at_ms));
    run.artifacts = artifacts;
    run.plots = plots;
    run.error = error;
    run
}
