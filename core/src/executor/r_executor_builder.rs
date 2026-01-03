use super::RExecutor;
use crate::executor::command_runner::{
    CommandRunner, PersistentProcessCommandRunner, ProcessCommandRunner,
};
use crate::executor::TimelineSink;
use crate::plot_history::PlotHistoryManager;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;

pub struct RExecutorBuilder {
    pub(crate) temp_dir: PathBuf,
    pub(crate) r_path: String,
    pub(crate) working_dir: PathBuf,
    pub(crate) timeline: Arc<dyn TimelineSink>,
    pub(crate) command_runner: Arc<dyn CommandRunner>,
    pub(crate) plot_history: Option<Arc<AsyncMutex<PlotHistoryManager>>>,
    pub(crate) persistent_mode: bool,
    pub(crate) record_runs: bool,
}

impl RExecutorBuilder {
    pub fn new(temp_dir: PathBuf, r_path: String) -> Self {
        Self {
            temp_dir,
            r_path,
            working_dir: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            timeline: Arc::new(crate::executor::NoopTimeline),
            command_runner: Arc::new(ProcessCommandRunner::default()),
            plot_history: None,
            persistent_mode: false,
            record_runs: true,
        }
    }

    pub fn with_timeline<T>(mut self, timeline: T) -> Self
    where
        T: TimelineSink + 'static,
    {
        self.timeline = Arc::new(timeline);
        self
    }

    pub fn with_shared_timeline(mut self, timeline: Arc<dyn TimelineSink>) -> Self {
        self.timeline = timeline;
        self
    }

    pub fn with_command_runner<T>(mut self, runner: T) -> Self
    where
        T: CommandRunner + 'static,
    {
        self.command_runner = Arc::new(runner);
        self
    }

    pub fn with_plot_history(mut self, plot_history: Arc<AsyncMutex<PlotHistoryManager>>) -> Self {
        self.plot_history = Some(plot_history);
        self
    }

    pub fn with_working_dir<P>(mut self, working_dir: P) -> Self
    where
        P: Into<PathBuf>,
    {
        self.working_dir = working_dir.into();
        self
    }

    pub fn use_persistent_mode(mut self) -> Self {
        self.persistent_mode = true;
        self
    }

    /// Disable writing execution events to the configured timeline sink.
    /// Callers that persist runs elsewhere (e.g., server-side repositories) can opt out to avoid duplicate records.
    pub fn disable_run_recording(mut self) -> Self {
        self.record_runs = false;
        self
    }

    pub fn build(self) -> RExecutor {
        let command_runner: Arc<dyn CommandRunner> = if self.persistent_mode {
            Arc::new(PersistentProcessCommandRunner::new(
                self.r_path.clone(),
                self.working_dir.clone(),
            ))
        } else {
            self.command_runner
        };

        let r_version = RExecutor::detect_r_version(&self.r_path);

        RExecutor {
            temp_dir: self.temp_dir,
            r_path: self.r_path,
            r_version,
            working_dir: self.working_dir,
            timeline: self.timeline,
            command_runner,
            plot_history: self.plot_history,
            persistent_mode: self.persistent_mode,
            record_runs: self.record_runs,
        }
    }
}
