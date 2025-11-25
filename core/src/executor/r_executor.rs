use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use crate::{
    CodeBlockKind, CodeBlockMetadata, EnvironmentSnapshot, ExecutionContext, ExecutionEvent,
    ExecutionRequest, ExecutionResult, ExecutionSource, PlotInfo,
};
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use base64::Engine;
use std::process::Stdio;
use tokio::{
    fs,
    io::{AsyncRead, AsyncReadExt},
    process::{Child, Command},
    sync::Mutex as AsyncMutex,
    task::JoinHandle,
};
use uuid::Uuid;

use super::{segment_r_code, NoopTimeline, SegmentationInput, TimelineSink};

type SharedChild = Arc<AsyncMutex<Child>>;

#[derive(Clone)]
struct ActiveChild {
    child: SharedChild,
    interrupted: Arc<AtomicBool>,
}

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
}

impl RExecutor {
    pub fn new(temp_dir: PathBuf, r_path: String) -> Self {
        Self {
            temp_dir,
            r_path,
            working_dir: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            timeline: Arc::new(NoopTimeline),
            command_runner: Arc::new(ProcessCommandRunner::default()),
        }
    }

    pub fn builder(temp_dir: PathBuf, r_path: String) -> RExecutorBuilder {
        RExecutorBuilder::new(temp_dir, r_path)
    }

    pub async fn execute(&self, request: ExecutionRequest) -> Result<ExecutionResult> {
        let (result, _) = self.execute_with_event(request).await?;
        Ok(result)
    }

    pub async fn execute_with_event(
        &self,
        request: ExecutionRequest,
    ) -> Result<(ExecutionResult, ExecutionEvent)> {
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

        let wrapped_code = self.wrap_code_with_plot_capture(&request.code, &plot_prefix);
        fs::write(&script_path, wrapped_code).await?;

        let command_output = self
            .command_runner
            .run(&self.r_path, &script_path, &self.working_dir)
            .await?;

        let plots = self.collect_plots(&plot_prefix).await?;
        let _ = fs::remove_file(&script_path).await;

        let execution_time_ms = start.elapsed().as_millis() as u64;
        let stdout = String::from_utf8_lossy(&command_output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&command_output.stderr).to_string();

        let error_output = if command_output.interrupted {
            Some("Execution interrupted by user.".to_string())
        } else if command_output.stderr.is_empty() {
            None
        } else {
            Some(stderr)
        };

        let result = ExecutionResult {
            success: command_output.success && !command_output.interrupted,
            output: stdout,
            error: error_output,
            plots,
            execution_time_ms,
        };

        let environment = self.environment_snapshot();
        let event = build_event(&request, &result, environment.clone(), blocks.clone());
        self.timeline.record(event.clone()).await?;

        Ok((result, event))
    }

    pub async fn interrupt(&self) -> Result<bool> {
        self.command_runner.interrupt().await
    }

    pub async fn reset(&self) -> Result<()> {
        let _ = self.interrupt().await?;
        self.cleanup_temp_dir().await?;
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

    fn wrap_code_with_plot_capture(&self, code: &str, plot_prefix: &str) -> String {
        let temp_dir_str = self.temp_dir.to_str().unwrap_or("");

        format!(
            r#"
# Auto-generated plot capture wrapper
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
    width = 800, height = 600,
    type = "cairo"
  )
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
            code = code
        )
    }

    async fn collect_plots(&self, plot_prefix: &str) -> Result<Vec<PlotInfo>> {
        let mut plots = Vec::new();
        let mut index = 1u32;

        loop {
            let filename = format!("{}_{}.png", plot_prefix, index);
            let path = self.temp_dir.join(&filename);

            if !path.exists() {
                break;
            }

            let data = fs::read(&path).await?;
            let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);

            plots.push(PlotInfo {
                filename,
                base64_data,
                index,
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

pub struct RExecutorBuilder {
    temp_dir: PathBuf,
    r_path: String,
    working_dir: PathBuf,
    timeline: Arc<dyn TimelineSink>,
    command_runner: Arc<dyn CommandRunner>,
}

impl RExecutorBuilder {
    fn new(temp_dir: PathBuf, r_path: String) -> Self {
        Self {
            temp_dir,
            r_path,
            working_dir: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            timeline: Arc::new(NoopTimeline),
            command_runner: Arc::new(ProcessCommandRunner::default()),
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

    pub fn with_working_dir<P>(mut self, working_dir: P) -> Self
    where
        P: Into<PathBuf>,
    {
        self.working_dir = working_dir.into();
        self
    }

    pub fn build(self) -> RExecutor {
        RExecutor {
            temp_dir: self.temp_dir,
            r_path: self.r_path,
            working_dir: self.working_dir,
            timeline: self.timeline,
            command_runner: self.command_runner,
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
