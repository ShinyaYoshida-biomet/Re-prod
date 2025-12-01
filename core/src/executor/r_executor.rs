use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use crate::{
    plot_history::{
        PlotHistoryEntry, PlotHistoryManager, DEFAULT_PLOT_HEIGHT, DEFAULT_PLOT_WIDTH,
        PLOT_HISTORY_SUBDIR,
    },
    CodeBlockKind, CodeBlockMetadata, EnvironmentSnapshot, ExecutionContext, ExecutionEvent,
    ExecutionRequest, ExecutionResult, ExecutionSource, PlotInfo,
};
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use base64::Engine;
use std::process::Stdio;
use tokio::{
    fs,
    io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, Command},
    sync::Mutex as AsyncMutex,
    task::JoinHandle,
    time::{timeout, Duration},
};
use tracing::info;
use uuid::Uuid;

use super::{segment_r_code, NoopTimeline, SegmentationInput, TimelineSink};

type SharedChild = Arc<AsyncMutex<Child>>;

#[derive(Clone)]
struct CapturedPlot {
    info: PlotInfo,
    data: Vec<u8>,
    snapshot: Option<Vec<u8>>,
}

#[derive(Clone)]
struct ActiveChild {
    child: SharedChild,
    interrupted: Arc<AtomicBool>,
}

const PERSISTENT_DELIMITER: &str = "---REPROD-PERSIST-END---";

impl ActiveChild {
    fn new(child: Child) -> Self {
        Self {
            child: Arc::new(AsyncMutex::new(child)),
            interrupted: Arc::new(AtomicBool::new(false)),
        }
    }

    async fn wait(&self) -> std::io::Result<std::process::ExitStatus> {
        let mut child = self.child.lock().await;
        child.wait().await
    }

    async fn interrupt(&self) -> Result<()> {
        {
            let mut child = self.child.lock().await;
            if let Err(error) = child.start_kill() {
                // If the process already exited, treat it as a successful interrupt.
                if error.kind() != std::io::ErrorKind::InvalidInput {
                    return Err(anyhow!(error));
                }
            }
        }
        self.interrupted.store(true, Ordering::SeqCst);
        Ok(())
    }

    fn matches(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.child, &other.child)
    }

    fn was_interrupted(&self) -> bool {
        self.interrupted.load(Ordering::SeqCst)
    }
}

pub struct RExecutor {
    temp_dir: PathBuf,
    r_path: String,
    working_dir: PathBuf,
    timeline: Arc<dyn TimelineSink>,
    command_runner: Arc<dyn CommandRunner>,
    plot_history: Option<Arc<AsyncMutex<PlotHistoryManager>>>,
    persistent_mode: bool,
}

impl RExecutor {
    pub fn new(temp_dir: PathBuf, r_path: String) -> Self {
        Self {
            temp_dir,
            r_path,
            working_dir: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            timeline: Arc::new(NoopTimeline),
            command_runner: Arc::new(ProcessCommandRunner::default()),
            plot_history: None,
            persistent_mode: false,
        }
    }

    pub fn builder(temp_dir: PathBuf, r_path: String) -> RExecutorBuilder {
        RExecutorBuilder::new(temp_dir, r_path)
    }

    pub async fn execute(&self, request: ExecutionRequest) -> Result<ExecutionResult> {
        let (result, _, _) = self.execute_with_event_with_history(request).await?;
        Ok(result)
    }

    pub async fn execute_with_event(
        &self,
        request: ExecutionRequest,
    ) -> Result<(ExecutionResult, ExecutionEvent)> {
        let (result, event, _) = self.execute_with_event_with_history(request).await?;
        Ok((result, event))
    }

    pub async fn execute_with_event_with_history(
        &self,
        request: ExecutionRequest,
    ) -> Result<(ExecutionResult, ExecutionEvent, Vec<PlotHistoryEntry>)> {
        let start = Instant::now();

        let mut blocks = ensure_blocks(&request);
        for (idx, block) in blocks.iter_mut().enumerate() {
            block.index = idx as u32;
            if block.label.is_none() {
                block.label = Some(format!("Block {}", idx + 1));
            }
        }

        let timestamp = Uuid::new_v4().to_string();
        let plot_prefix = format!("plot_{}", timestamp);
        let script_path = self.temp_dir.join(format!("script_{}.R", timestamp));

        info!(
            target: "reprod.r.exec",
            persistent = self.persistent_mode,
            "wrapping code for execution"
        );

        let wrapped_code = if self.persistent_mode {
            self.wrap_code_with_plot_capture_persistent(&request.code, &plot_prefix)
        } else {
            self.wrap_code_with_plot_capture(&request.code, &plot_prefix)
        };
        fs::write(&script_path, wrapped_code).await?;

        let command_output = self
            .command_runner
            .run(&self.r_path, &script_path, &self.working_dir)
            .await?;

        let captures = self.collect_plots(&plot_prefix).await?;
        let _ = fs::remove_file(&script_path).await;

        let execution_time_ms = start.elapsed().as_millis() as u64;
        let stdout_raw = String::from_utf8_lossy(&command_output.stdout).to_string();
        let stderr_raw = String::from_utf8_lossy(&command_output.stderr).to_string();
        info!(
            target: "reprod.r.exec",
            stdout = %stdout_raw,
            stderr = %stderr_raw,
            "R execution output (raw)"
        );

        let stdout = stdout_raw;
        let stderr = stderr_raw;
        let stdout_clean = Self::strip_internal_lines(&stdout);
        let stderr_clean = Self::strip_internal_lines(&stderr);

        let error_output = if command_output.interrupted {
            Some("Execution interrupted by user.".to_string())
        } else if stderr_clean.is_empty() {
            None
        } else {
            Some(stderr_clean.clone())
        };
        // Ensure console sees stderr as well as stdout.
        let display_output = if stderr_clean.is_empty() {
            stdout_clean.clone()
        } else {
            format!("{stdout_clean}\n{stderr_clean}")
        };

        let mut plots = Vec::with_capacity(captures.len());
        let mut history_entries = Vec::new();

        for mut capture in captures {
            capture.info.code = Some(request.code.clone());

            if let Some(manager) = &self.plot_history {
                let mut manager = manager.lock().await;
                let meta = manager.add_plot(
                    Some(capture.info.id.clone()),
                    capture.info.width.unwrap_or(DEFAULT_PLOT_WIDTH),
                    capture.info.height.unwrap_or(DEFAULT_PLOT_HEIGHT),
                    &capture.data,
                    capture.snapshot.as_deref(),
                    Some(request.code.clone()),
                    capture.info.timestamp.map(|t| t as i64),
                )?;

                let storage_relative = format!("{}/{}", PLOT_HISTORY_SUBDIR, meta.filename);
                capture.info.filename = storage_relative.clone();
                capture.info.storage_path = Some(storage_relative.clone());
                if let Some(snapshot_filename) = meta.snapshot_filename {
                    let snapshot_rel = format!("{}/{}", PLOT_HISTORY_SUBDIR, snapshot_filename);
                    capture.info.snapshot_path = Some(snapshot_rel);
                }

                history_entries.push(PlotHistoryEntry {
                    id: meta.id.clone(),
                    timestamp: meta.timestamp,
                    width: meta.width,
                    height: meta.height,
                    filename: storage_relative.clone(),
                    storage_path: storage_relative,
                    data: capture.info.base64_data.clone(),
                    code: meta.code.clone(),
                    snapshot_path: capture.info.snapshot_path.clone(),
                });
            }

            plots.push(capture.info);
        }

        let result = ExecutionResult {
            success: command_output.success && !command_output.interrupted,
            output: display_output,
            error: error_output,
            plots,
            execution_time_ms,
        };

        let environment = self.environment_snapshot();
        let event = build_event(&request, &result, environment.clone(), blocks.clone());
        self.timeline.record(event.clone()).await?;

        Ok((result, event, history_entries))
    }

    pub async fn interrupt(&self) -> Result<bool> {
        self.command_runner.interrupt().await
    }

    pub async fn reset(&self) -> Result<()> {
        let _ = self.interrupt().await?;
        if self.persistent_mode {
            let reset_prefix = "reset";
            let script_path = self.temp_dir.join("reset_persistent.R");
            let reset_code = self.wrap_code_with_plot_capture_persistent(
                r#"
rm(list = ls(all.names = TRUE))
if (length(dev.list()) > 0) {
  dev.off(which = dev.list())
}
"#,
                reset_prefix,
            );
            fs::write(&script_path, reset_code).await?;
            let _ = self
                .command_runner
                .run(&self.r_path, &script_path, &self.working_dir)
                .await?;
            let _ = fs::remove_file(&script_path).await;
        }
        self.cleanup_temp_dir().await?;
        Ok(())
    }

    /// Kill and respawn the persistent process.
    pub async fn restart(&self) -> Result<()> {
        if !self.persistent_mode {
            return Ok(());
        }
        // Interrupt existing process
        let _ = self.interrupt().await?;
        Ok(())
    }

    async fn cleanup_temp_dir(&self) -> Result<()> {
        let mut entries = fs::read_dir(&self.temp_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            let file_type = entry.file_type().await?;
            if file_type.is_dir() {
                fs::remove_dir_all(&path).await?;
            } else {
                fs::remove_file(&path).await?;
            }
        }
        Ok(())
    }

    fn wrap_code_with_plot_capture_persistent(&self, code: &str, plot_prefix: &str) -> String {
        let temp_dir_str = r_escape(&self.temp_dir.to_string_lossy());

        format!(
            r#"
# Auto-generated plot capture wrapper (persistent session)
cat("REPROD_WRAPPER_ENTER: persistent\n")
.reprod_plot_dir <- "{temp_dir}"
.reprod_plot_prefix <- "{plot_prefix}"

if (!dir.exists(.reprod_plot_dir)) {{
  dir.create(.reprod_plot_dir, recursive = TRUE, showWarnings = FALSE)
}}

.reprod_open_device <- function(index) {{
  filename <- sprintf("%s_%d.png", .reprod_plot_prefix, index)
  png(
    file.path(.reprod_plot_dir, filename),
    width = {plot_width}, height = {plot_height},
    type = "cairo"
  )
}}

.reprod_capture_plot <- function(index) {{
  if (length(dev.list()) == 0 || names(dev.cur()) == "null device") {{
    return(FALSE)
  }}
  tryCatch({{
    snapshot <- recordPlot()
    if (is.null(snapshot)) {{
      return(FALSE)
    }}
    snapshot_path <- file.path(.reprod_plot_dir, sprintf("%s_%d.rds", .reprod_plot_prefix, index))
    saveRDS(snapshot, snapshot_path)
    cat("__REPROD_PLOT__|",
        sprintf("%s_%d", .reprod_plot_prefix, index), "|",
        snapshot_path, "|",
        file.path(.reprod_plot_dir, sprintf("%s_%d.png", .reprod_plot_prefix, index)),
        "\n", sep = "")
    TRUE
  }}, error = function(e) {{
    cat("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e), "\n", file=stderr())
    FALSE
  }})
}}

reprod_png_available <- FALSE
tryCatch({{
  .reprod_open_device(1)
  reprod_png_available <<- TRUE
  cat("REPROD_PNG_DEVICE: ", file.path(.reprod_plot_dir, sprintf("%s_1.png", .reprod_plot_prefix)), "\n", file=stderr())
  cat("REPROD_PNG_DEVICE: ", file.path(.reprod_plot_dir, sprintf("%s_1.png", .reprod_plot_prefix)), "\n") # stdout mirror
}}, error = function(e) {{
  cat("REPROD_PNG_ERROR: ", conditionMessage(e), "\n", file=stderr())
  cat("REPROD_PNG_ERROR: ", conditionMessage(e), "\n") # stdout mirror
}})

tryCatch(
  {{
    {code}
  }},
  error = function(e) {{
    assign(".reprod_last_error", e, envir = .GlobalEnv)
    cat("REPROD_ERROR: ", conditionMessage(e), "\n", file=stderr())
    cat("REPROD_TRACEBACK: ", paste(utils::capture.output(traceback()), collapse = " | "), "\n", file=stderr())
    cat("REPROD_DEVICES: ", paste(names(dev.list()), collapse = ","), "\n", file=stderr())
    cat("REPROD_PLOT_DIR: ", .reprod_plot_dir, "\n", file=stderr())
    cat("REPROD_GETWD: ", getwd(), "\n", file=stderr())
    cat("REPROD_ERROR: ", conditionMessage(e), "\n") # stdout mirror
    cat("REPROD_TRACEBACK: ", paste(utils::capture.output(traceback()), collapse = " | "), "\n") # stdout mirror
    cat("REPROD_DEVICES: ", paste(names(dev.list()), collapse = ","), "\n") # stdout mirror
    cat("REPROD_PLOT_DIR: ", .reprod_plot_dir, "\n") # stdout mirror
    cat("REPROD_GETWD: ", getwd(), "\n") # stdout mirror
  }}
)

if (reprod_png_available && names(dev.cur()) != "null device") {{
  tryCatch(.reprod_capture_plot(1), error = function(e) {{
    cat("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e), "\n", file=stderr())
  }})
  tryCatch(dev.off(), error = function(e) message("REPROD_DEVICE_CLOSE_ERROR: ", conditionMessage(e)))
}}

if (reprod_png_available) {{
  tryCatch({{
    existing_plots <- list.files(
      .reprod_plot_dir,
      pattern = sprintf("^%s_\\d+\\.png$", .reprod_plot_prefix)
    )
    if (length(existing_plots) == 0 &&
        requireNamespace("ggplot2", quietly = TRUE)) {{
      last_plot <- tryCatch(ggplot2::last_plot(), error = function(e) NULL)
      if (inherits(last_plot, "ggplot")) {{
        next_index <- length(existing_plots) + 1
        .reprod_open_device(next_index)
        print(last_plot)
        dev.off()
      }}
    }}
  }}, error = function(e) {{
    cat("REPROD_PNG_POST_ERROR: ", conditionMessage(e), "\n", file=stderr())
    cat("REPROD_PNG_POST_ERROR: ", conditionMessage(e), "\n")
  }})
}}

cat("REPROD_STATE: PNG_AVAILABLE=", reprod_png_available, " PLOT_DIR=", .reprod_plot_dir,
    " GETWD=", getwd(), " DEVICES=", paste(names(dev.list()), collapse=","), "\n",
    file=stderr())
cat("REPROD_STATE: PNG_AVAILABLE=", reprod_png_available, " PLOT_DIR=", .reprod_plot_dir,
    " GETWD=", getwd(), " DEVICES=", paste(names(dev.list()), collapse=","), "\n")

cat("{delimiter}\n")
"#,
            temp_dir = temp_dir_str,
            plot_prefix = plot_prefix,
            plot_width = DEFAULT_PLOT_WIDTH,
            plot_height = DEFAULT_PLOT_HEIGHT,
            code = code,
            delimiter = PERSISTENT_DELIMITER,
        )
    }

    fn wrap_code_with_plot_capture(&self, code: &str, plot_prefix: &str) -> String {
        let temp_dir_str = r_escape(&self.temp_dir.to_string_lossy());

        format!(
            r#"
# Auto-generated plot capture wrapper
cat("REPROD_WRAPPER_ENTER: oneshot\n")
.reprod_plot_dir <- "{temp_dir}"
.reprod_state_path <- file.path(.reprod_plot_dir, ".reprod_state.RData")

# Ensure plot directory exists
if (!dir.exists(.reprod_plot_dir)) {{
  dir.create(.reprod_plot_dir, recursive = TRUE, showWarnings = FALSE)
}}

# Restore workspace if it exists
if (file.exists(.reprod_state_path)) {{
  tryCatch(
    load(.reprod_state_path, envir = .GlobalEnv),
    error = function(e) message("Failed to restore workspace: ", e)
  )
}}

# Reset run-scoped state to avoid stale values from previous sessions
.reprod_plot_dir <- "{temp_dir}"
.reprod_plot_prefix <- "{plot_prefix}"
.reprod_state_path <- file.path(.reprod_plot_dir, ".reprod_state.RData")
.reprod_exit_code <- 0

# Open PNG device
.reprod_open_device <- function(index) {{
  filename <- sprintf("%s_%d.png", .reprod_plot_prefix, index)
  png(
    file.path(.reprod_plot_dir, filename),
    width = {plot_width}, height = {plot_height},
    type = "cairo"
  )
}}

.reprod_capture_plot <- function(index) {{
  if (length(dev.list()) == 0 || names(dev.cur()) == "null device") {{
    return(FALSE)
  }}
  tryCatch({{
    snapshot <- recordPlot()
    if (is.null(snapshot)) {{
      return(FALSE)
    }}
    snapshot_path <- file.path(.reprod_plot_dir, sprintf("%s_%d.rds", .reprod_plot_prefix, index))
    saveRDS(snapshot, snapshot_path)
    cat("__REPROD_PLOT__|",
        sprintf("%s_%d", .reprod_plot_prefix, index), "|",
        snapshot_path, "|",
        file.path(.reprod_plot_dir, sprintf("%s_%d.png", .reprod_plot_prefix, index)),
        "\n", sep = "")
    TRUE
  }}, error = function(e) {{
    message("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e))
    FALSE
  }})
}}

.reprod_open_device(1)

# User code
tryCatch(
  {{
    {code}
  }},
  error = function(e) {{
    .reprod_exit_code <<- 1
    assign(".reprod_last_error", e, envir = .GlobalEnv)
    message("REPROD_ERROR: ", conditionMessage(e))
  }}
)

# If a device is open, close it to flush the PNG
if (names(dev.cur()) != "null device") {{
  tryCatch(.reprod_capture_plot(1), error = function(e) {{
    message("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e))
  }})
  dev.off()
}}

# If no plots were produced, try to render the last ggplot object automatically
try({{
  existing_plots <- list.files(
    .reprod_plot_dir,
    pattern = sprintf("^%s_\\d+\\.png$", .reprod_plot_prefix)
  )
  if (length(existing_plots) == 0 &&
      requireNamespace("ggplot2", quietly = TRUE)) {{
    last_plot <- tryCatch(ggplot2::last_plot(), error = function(e) NULL)
    if (inherits(last_plot, "ggplot")) {{
      next_index <- length(existing_plots) + 1
      .reprod_open_device(next_index)
      print(last_plot)
      tryCatch(.reprod_capture_plot(next_index), error = function(e) {{
        message("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e))
      }})
      dev.off()
    }}
  }}
}}, silent = TRUE)

# Persist workspace for next run
tryCatch(
  save.image(file = .reprod_state_path),
  error = function(e) message("Failed to save workspace: ", e)
)

quit(status = .reprod_exit_code, runLast = FALSE)
"#,
            temp_dir = temp_dir_str,
            plot_prefix = plot_prefix,
            plot_width = DEFAULT_PLOT_WIDTH,
            plot_height = DEFAULT_PLOT_HEIGHT,
            code = code
        )
    }

    async fn collect_plots(&self, plot_prefix: &str) -> Result<Vec<CapturedPlot>> {
        let mut plots = Vec::new();
        let mut index = 1u32;

        loop {
            let filename = format!("{}_{}.png", plot_prefix, index);
            let path = self.temp_dir.join(&filename);
            let snapshot_path = self.temp_dir.join(format!("{}_{}.rds", plot_prefix, index));

            if !path.exists() {
                break;
            }

            let data = fs::read(&path).await?;
            let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);
            let timestamp = Self::now_ms();
            let snapshot_bytes = if snapshot_path.exists() {
                let bytes = fs::read(&snapshot_path).await.ok();
                let _ = fs::remove_file(&snapshot_path).await;
                bytes
            } else {
                None
            };
            let snapshot_path_str = snapshot_bytes
                .as_ref()
                .and_then(|_| snapshot_path.to_str().map(|s| s.to_string()));

            plots.push(CapturedPlot {
                info: PlotInfo {
                    id: Uuid::new_v4().to_string(),
                    filename,
                    base64_data,
                    index,
                    width: Some(DEFAULT_PLOT_WIDTH),
                    height: Some(DEFAULT_PLOT_HEIGHT),
                    timestamp: Some(timestamp),
                    code: None,
                    storage_path: None,
                    snapshot_path: snapshot_path_str.clone(),
                },
                data,
                snapshot: snapshot_bytes,
            });

            let _ = fs::remove_file(&path).await;

            index += 1;
        }

        Ok(plots)
    }

    fn environment_snapshot(&self) -> EnvironmentSnapshot {
        EnvironmentSnapshot {
            r_path: self.r_path.clone(),
            working_dir: self.working_dir.to_string_lossy().into_owned(),
            temp_dir: self.temp_dir.to_string_lossy().into_owned(),
        }
    }

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}

fn r_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn is_internal_line(line: &str) -> bool {
    const NOISE_PREFIXES: [&str; 5] = [
        "REPROD_PNG_",
        "REPROD_STATE",
        "REPROD_WRAPPER_ENTER",
        "REPROD_PLOT_CAPTURE_ERROR",
        "__REPROD_PLOT__",
    ];
    NOISE_PREFIXES.iter().any(|p| line.starts_with(p))
}

fn strip_lines_matching(s: &str, predicate: impl Fn(&str) -> bool) -> String {
    s.lines()
        .filter(|line| !predicate(line))
        .collect::<Vec<_>>()
        .join("\n")
}

impl RExecutor {
    fn strip_internal_lines(s: &str) -> String {
        strip_lines_matching(s, is_internal_line)
    }
}

pub struct RExecutorBuilder {
    temp_dir: PathBuf,
    r_path: String,
    working_dir: PathBuf,
    timeline: Arc<dyn TimelineSink>,
    command_runner: Arc<dyn CommandRunner>,
    plot_history: Option<Arc<AsyncMutex<PlotHistoryManager>>>,
    persistent_mode: bool,
}

impl RExecutorBuilder {
    fn new(temp_dir: PathBuf, r_path: String) -> Self {
        Self {
            temp_dir,
            r_path,
            working_dir: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            timeline: Arc::new(NoopTimeline),
            command_runner: Arc::new(ProcessCommandRunner::default()),
            plot_history: None,
            persistent_mode: false,
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

    pub fn build(self) -> RExecutor {
        let command_runner: Arc<dyn CommandRunner> = if self.persistent_mode {
            Arc::new(PersistentProcessCommandRunner::new(
                self.r_path.clone(),
                self.working_dir.clone(),
            ))
        } else {
            self.command_runner
        };

        RExecutor {
            temp_dir: self.temp_dir,
            r_path: self.r_path,
            working_dir: self.working_dir,
            timeline: self.timeline,
            command_runner,
            plot_history: self.plot_history,
            persistent_mode: self.persistent_mode,
        }
    }
}

#[async_trait]
pub trait CommandRunner: Send + Sync {
    async fn run(
        &self,
        r_path: &str,
        script_path: &Path,
        working_dir: &Path,
    ) -> Result<CommandOutput>;
    async fn interrupt(&self) -> Result<bool>;
}

#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub success: bool,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub interrupted: bool,
}

#[derive(Default)]
struct ProcessCommandRunner {
    active_child: AsyncMutex<Option<ActiveChild>>,
}

struct PersistentChild {
    process: Child,
    stdin: tokio::process::ChildStdin,
    stdout: BufReader<tokio::process::ChildStdout>,
    stderr: BufReader<tokio::process::ChildStderr>,
}

struct PersistentProcessCommandRunner {
    child: AsyncMutex<Option<PersistentChild>>,
    in_flight: AsyncMutex<()>,
    working_dir: PathBuf,
    r_path: String,
    interrupted: Arc<AtomicBool>,
}

impl PersistentProcessCommandRunner {
    fn new(r_path: String, working_dir: PathBuf) -> Self {
        Self {
            child: AsyncMutex::new(None),
            in_flight: AsyncMutex::new(()),
            working_dir,
            r_path,
            interrupted: Arc::new(AtomicBool::new(false)),
        }
    }

    fn repl_command(&self) -> String {
        if self.r_path.to_lowercase().contains("rscript") {
            "R".to_string()
        } else {
            self.r_path.clone()
        }
    }

    async fn ensure_child(&self) -> Result<()> {
        let mut guard = self.child.lock().await;
        let needs_spawn = guard
            .as_mut()
            .map(|child| match child.process.try_wait() {
                Ok(Some(_)) => true,
                Ok(None) => false,
                Err(_) => true,
            })
            .unwrap_or(true);

        if needs_spawn {
            let repl = self.repl_command();
            let mut process = Command::new(&repl)
                .args(["--no-save", "--no-restore", "--quiet", "--slave"])
                .current_dir(&self.working_dir)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()?;

            let stdin = process
                .stdin
                .take()
                .ok_or_else(|| anyhow!("Missing stdin"))?;
            let stdout = process
                .stdout
                .take()
                .ok_or_else(|| anyhow!("Missing stdout"))?;
            let stderr = process
                .stderr
                .take()
                .ok_or_else(|| anyhow!("Missing stderr"))?;

            *guard = Some(PersistentChild {
                process,
                stdin,
                stdout: BufReader::new(stdout),
                stderr: BufReader::new(stderr),
            });
        }

        Ok(())
    }

    async fn read_until_delimiter(
        child: &mut PersistentChild,
        timeout_duration: Duration,
    ) -> Result<(Vec<u8>, Vec<u8>, bool)> {
        let mut stdout_buf = Vec::new();
        let mut stderr_buf = Vec::new();
        let mut saw_error_marker = false;
        let mut stdout_line = String::new();
        let mut stderr_line = String::new();

        loop {
            let read_result = timeout(timeout_duration, async {
                tokio::select! {
                    res = child.stdout.read_line(&mut stdout_line) => res.map(|n| ("stdout", n)),
                    res = child.stderr.read_line(&mut stderr_line) => res.map(|n| ("stderr", n)),
                }
            })
            .await??;

            match read_result {
                ("stdout", 0) => {
                    break;
                }
                ("stdout", _) => {
                    if stdout_line.contains(PERSISTENT_DELIMITER) {
                        stdout_line.clear();
                        break;
                    }

                    stdout_buf.extend_from_slice(stdout_line.as_bytes());
                    stdout_line.clear();
                }
                ("stderr", 0) => {
                    continue;
                }
                ("stderr", _) => {
                    stderr_buf.extend_from_slice(stderr_line.as_bytes());
                    if stderr_line.contains("REPROD_ERROR:") {
                        saw_error_marker = true;
                    }
                    stderr_line.clear();
                }
                _ => {}
            }
        }

        loop {
            match timeout(
                Duration::from_millis(50),
                child.stderr.read_line(&mut stderr_line),
            )
            .await
            {
                Ok(Ok(0)) | Err(_) => break,
                Ok(Ok(_)) => {
                    stderr_buf.extend_from_slice(stderr_line.as_bytes());
                    stderr_line.clear();
                }
                Ok(Err(e)) => return Err(anyhow!(e)),
            }
        }

        Ok((stdout_buf, stderr_buf, !saw_error_marker))
    }
}

#[async_trait]
impl CommandRunner for ProcessCommandRunner {
    async fn run(
        &self,
        r_path: &str,
        script_path: &Path,
        working_dir: &Path,
    ) -> Result<CommandOutput> {
        let script_str = script_path
            .to_str()
            .ok_or_else(|| anyhow!("Invalid path"))?;
        let mut child = Command::new(r_path)
            .args(["--vanilla", "--quiet", script_str])
            .current_dir(working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let active = ActiveChild::new(child);

        {
            let mut guard = self.active_child.lock().await;
            *guard = Some(active.clone());
        }

        let stdout_task = spawn_pipe_reader(stdout);
        let stderr_task = spawn_pipe_reader(stderr);

        let status = active
            .wait()
            .await
            .context("Failed to wait for R process")?;

        {
            let mut guard = self.active_child.lock().await;
            if let Some(current) = guard.as_ref() {
                if current.matches(&active) {
                    guard.take();
                }
            }
        }

        let stdout_bytes = stdout_task
            .await
            .map_err(|e| anyhow!("Failed to join stdout task: {}", e))??;
        let stderr_bytes = stderr_task
            .await
            .map_err(|e| anyhow!("Failed to join stderr task: {}", e))??;

        Ok(CommandOutput {
            success: status.success(),
            stdout: stdout_bytes,
            stderr: stderr_bytes,
            interrupted: active.was_interrupted(),
        })
    }

    async fn interrupt(&self) -> Result<bool> {
        let active = {
            let guard = self.active_child.lock().await;
            guard.clone()
        };

        if let Some(child) = active {
            child.interrupt().await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

#[async_trait]
impl CommandRunner for PersistentProcessCommandRunner {
    async fn run(
        &self,
        _r_path: &str,
        script_path: &Path,
        _working_dir: &Path,
    ) -> Result<CommandOutput> {
        let _guard = self.in_flight.lock().await;
        self.ensure_child().await?;

        let mut child_guard = self.child.lock().await;
        let child = child_guard
            .as_mut()
            .ok_or_else(|| anyhow!("Persistent process missing"))?;

        // Send the entire script as a single block to avoid line-by-line execution issues.
        let script_str = fs::read_to_string(script_path).await?;
        let mut block = String::with_capacity(script_str.len() + 4);
        block.push_str("{\n");
        block.push_str(&script_str);
        if !block.ends_with('\n') {
            block.push('\n');
        }
        block.push_str("}\n");

        child.stdin.write_all(block.as_bytes()).await?;
        child.stdin.flush().await?;

        let (stdout_bytes, stderr_bytes, status_ok) =
            Self::read_until_delimiter(child, Duration::from_secs(30)).await?;
        let was_interrupted = self.interrupted.swap(false, Ordering::SeqCst);

        Ok(CommandOutput {
            success: status_ok && !was_interrupted,
            stdout: stdout_bytes,
            stderr: stderr_bytes,
            interrupted: was_interrupted,
        })
    }

    async fn interrupt(&self) -> Result<bool> {
        let mut guard = self.child.lock().await;
        if let Some(child) = guard.as_mut() {
            if let Some(id) = child.process.id() {
                #[cfg(unix)]
                {
                    use nix::sys::signal::{kill, Signal};
                    use nix::unistd::Pid;
                    let _ = kill(Pid::from_raw(id as i32), Signal::SIGINT);
                }

                #[cfg(windows)]
                {
                    let _ = child.process.start_kill();
                }

                self.interrupted.store(true, Ordering::SeqCst);
                return Ok(true);
            }
        }

        Ok(false)
    }
}

fn ensure_blocks(request: &ExecutionRequest) -> Vec<CodeBlockMetadata> {
    if !request.blocks.is_empty() {
        return request.blocks.clone();
    }

    if matches!(request.context.source, ExecutionSource::Selection) {
        let line_count = request.code.lines().count().max(1) as u32;
        return vec![CodeBlockMetadata {
            id: Uuid::new_v4().to_string(),
            index: 0,
            kind: CodeBlockKind::Selection,
            label: Some("Selection".into()),
            start_line: 1,
            end_line: line_count,
            code: request.code.clone(),
        }];
    }

    let filename = request.context.document_path.as_deref();
    let mut blocks = segment_r_code(SegmentationInput {
        content: &request.code,
        filename,
    });

    if blocks.is_empty() {
        let line_count = request.code.lines().count().max(1) as u32;
        blocks.push(CodeBlockMetadata {
            id: Uuid::new_v4().to_string(),
            index: 0,
            kind: CodeBlockKind::Document,
            label: Some("Document".into()),
            start_line: 1,
            end_line: line_count,
            code: request.code.clone(),
        });
    }

    blocks
}

fn build_event(
    request: &ExecutionRequest,
    result: &ExecutionResult,
    environment: EnvironmentSnapshot,
    blocks: Vec<CodeBlockMetadata>,
) -> ExecutionEvent {
    ExecutionEvent {
        event_id: Uuid::new_v4().to_string(),
        context: ExecutionContext {
            source: request.context.source.clone(),
            document_path: request.context.document_path.clone(),
            cell_index: request.context.cell_index,
            triggered_at_ms: request.context.triggered_at_ms,
            actor: request.context.actor.clone(),
        },
        blocks,
        result: result.clone(),
        environment,
        created_at_ms: RExecutor::now_ms(),
    }
}

fn spawn_pipe_reader<T>(pipe: Option<T>) -> JoinHandle<anyhow::Result<Vec<u8>>>
where
    T: AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        if let Some(mut reader) = pipe {
            let mut buffer = Vec::new();
            reader.read_to_end(&mut buffer).await?;
            Ok(buffer)
        } else {
            Ok(Vec::new())
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::executor::InMemoryTimeline;
    use crate::{ExecutionActor, ExecutionContext};
    use anyhow::Result;
    use tokio::sync::Mutex;

    struct MockRunner {
        output: Mutex<CommandOutput>,
    }

    #[async_trait]
    impl CommandRunner for MockRunner {
        async fn run(
            &self,
            _r_path: &str,
            _script_path: &Path,
            _working_dir: &Path,
        ) -> Result<CommandOutput> {
            let output = self.output.lock().await;
            Ok(CommandOutput {
                success: output.success,
                stdout: output.stdout.clone(),
                stderr: output.stderr.clone(),
                interrupted: output.interrupted,
            })
        }

        async fn interrupt(&self) -> Result<bool> {
            Ok(false)
        }
    }

    #[test]
    fn persistent_wrapper_does_not_quit_or_save_image() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let exec = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".into())
            .use_persistent_mode()
            .build();

        let wrapped = exec.wrap_code_with_plot_capture_persistent("x <- 1", "pfx");
        assert!(
            !wrapped.contains("save.image"),
            "Persistent wrapper should not save image per call"
        );
        assert!(
            !wrapped.contains("quit("),
            "Persistent wrapper should not quit the R process"
        );
        assert!(
            wrapped.contains(PERSISTENT_DELIMITER),
            "Persistent wrapper must emit delimiter"
        );
    }

    #[test]
    fn builder_sets_persistent_flag() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let exec = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".into())
            .use_persistent_mode()
            .build();
        assert!(
            exec.persistent_mode,
            "builder should set persistent mode flag"
        );
    }

    #[tokio::test]
    async fn records_event_with_provided_blocks() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let timeline = InMemoryTimeline::new();
        let runner = MockRunner {
            output: Mutex::new(CommandOutput {
                success: true,
                stdout: b"hello".to_vec(),
                stderr: Vec::new(),
                interrupted: false,
            }),
        };

        let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".into())
            .with_timeline(timeline.clone())
            .with_command_runner(runner)
            .build();

        let request = ExecutionRequest {
            code: "print('hello')".into(),
            context: ExecutionContext {
                source: ExecutionSource::Cell,
                document_path: Some("analysis.R".into()),
                cell_index: Some(0),
                triggered_at_ms: 1,
                actor: ExecutionActor::User,
            },
            blocks: vec![CodeBlockMetadata {
                id: "block-1".into(),
                index: 0,
                kind: CodeBlockKind::Section,
                label: Some("Setup".into()),
                start_line: 1,
                end_line: 2,
                code: "print('hello')".into(),
            }],
        };

        let result = executor.execute(request.clone()).await;
        assert!(result.is_ok());

        let events = timeline.events();
        assert_eq!(events.len(), 1);
        let event = &events[0];
        assert_eq!(event.context.source, ExecutionSource::Cell);
        assert_eq!(event.blocks.len(), 1);
        assert_eq!(event.blocks[0].id, "block-1");
        assert_eq!(event.result.output, "hello");
        assert!(event.result.error.is_none());
    }

    #[tokio::test]
    async fn segments_blocks_when_not_provided() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let timeline = InMemoryTimeline::new();
        let runner = MockRunner {
            output: Mutex::new(CommandOutput {
                success: false,
                stdout: b"".to_vec(),
                stderr: b"error".to_vec(),
                interrupted: false,
            }),
        };

        let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".into())
            .with_timeline(timeline.clone())
            .with_command_runner(runner)
            .build();

        let request = ExecutionRequest {
            code: "# Step ----\nprint('x')".into(),
            context: ExecutionContext {
                source: ExecutionSource::WholeDocument,
                document_path: Some("analysis.R".into()),
                cell_index: None,
                triggered_at_ms: 2,
                actor: ExecutionActor::User,
            },
            blocks: Vec::new(),
        };

        let result = executor.execute(request).await.expect("execution");
        assert!(!result.success);
        assert_eq!(result.error.as_deref(), Some("error"));

        let events = timeline.events();
        assert_eq!(events.len(), 1);
        let event = &events[0];
        assert_eq!(event.blocks.len(), 1);
        let block = &event.blocks[0];
        assert_eq!(block.kind, CodeBlockKind::Section);
        assert!(block.code.contains("print('x')"));
        assert!(event.environment.r_path.contains("Rscript"));
    }
}
