use std::{path::PathBuf, sync::Arc, time::Instant};

use crate::executor::command_runner::{CommandRunner, ProcessCommandRunner};
use crate::executor::output_parser::{is_internal_line, parse_command_output};
use crate::graphics::plot_capture::PlotCapture;
use crate::plot_history::{
    PlotHistoryEntry, PlotHistoryManager, DEFAULT_PLOT_HEIGHT, DEFAULT_PLOT_WIDTH,
};
use crate::{
    executor::execution_utils::now_ms, EnvironmentSnapshot, ExecutionEvent, ExecutionRequest,
    ExecutionResult, RunOutputChunk, RunStream,
};
use anyhow::Result;
use tokio::fs;
use tokio::sync::Mutex as AsyncMutex;
use tracing::info;
use uuid::Uuid;

use super::execution_utils::{build_event, ensure_blocks};
use super::RExecutorBuilder;
use super::{NoopTimeline, TimelineSink};

pub struct RExecutor {
    pub(crate) temp_dir: PathBuf,
    pub(crate) r_path: String,
    pub(crate) working_dir: PathBuf,
    pub(crate) timeline: Arc<dyn TimelineSink>,
    pub(crate) command_runner: Arc<dyn CommandRunner>,
    pub(crate) plot_history: Option<Arc<AsyncMutex<PlotHistoryManager>>>,
    pub(crate) persistent_mode: bool,
    pub(crate) record_runs: bool,
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
            record_runs: true,
        }
    }

    pub fn builder(temp_dir: PathBuf, r_path: String) -> RExecutorBuilder {
        RExecutorBuilder::new(temp_dir, r_path)
    }

    pub fn is_persistent_mode(&self) -> bool {
        self.persistent_mode
    }

    pub fn working_dir(&self) -> &std::path::Path {
        &self.working_dir
    }

    pub async fn execute(&self, request: ExecutionRequest) -> Result<ExecutionResult> {
        let (result, _, _, _) = self.execute_with_event_with_history(request).await?;
        Ok(result)
    }

    pub async fn execute_with_event(
        &self,
        request: ExecutionRequest,
    ) -> Result<(ExecutionResult, ExecutionEvent)> {
        let (result, event, _, _) = self.execute_with_event_with_history(request).await?;
        Ok((result, event))
    }

    pub async fn execute_with_event_with_history(
        &self,
        request: ExecutionRequest,
    ) -> Result<(
        ExecutionResult,
        ExecutionEvent,
        Vec<PlotHistoryEntry>,
        Vec<RunOutputChunk>,
    )> {
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
        let plot_capture = self.plot_capture();

        info!(
            target: "reprod.r.exec",
            persistent = self.persistent_mode,
            "wrapping code for execution"
        );

        let plot_width = request.plot_width.unwrap_or(DEFAULT_PLOT_WIDTH);
        let plot_height = request.plot_height.unwrap_or(DEFAULT_PLOT_HEIGHT);

        let wrapped_code = plot_capture.wrap_code(
            &request.code,
            &plot_prefix,
            plot_width,
            plot_height,
            self.persistent_mode,
        );
        fs::write(&script_path, &wrapped_code).await?;

        let mut streamed_stdout: Vec<String> = Vec::new();
        let mut streamed_stderr: Vec<String> = Vec::new();

        let mut streamed_chunks: Vec<RunOutputChunk> = Vec::new();

        let command_output = self
            .command_runner
            .run_streaming(
                &self.r_path,
                &script_path,
                &self.working_dir,
                &mut |line: String, is_stdout: bool| {
                    let at_ms = now_ms();
                    if is_internal_line(&line) {
                        return;
                    }
                    if is_stdout {
                        streamed_stdout.push(line.clone());
                        streamed_chunks.push(RunOutputChunk {
                            run_id: String::new(), // filled by caller
                            stream: RunStream::Stdout,
                            chunk: line,
                            at_ms,
                        });
                    } else {
                        streamed_stderr.push(line.clone());
                        streamed_chunks.push(RunOutputChunk {
                            run_id: String::new(), // filled by caller
                            stream: RunStream::Stderr,
                            chunk: line,
                            at_ms,
                        });
                    }
                },
            )
            .await?;

        let captures = plot_capture
            .collect(&plot_prefix, plot_width, plot_height)
            .await?;
        let (plots, history_entries) = plot_capture.finalize_plots(captures, &request.code).await?;

        let _ = fs::remove_file(&script_path).await;

        // If streaming captured any lines, prefer them for display to preserve ordering.
        let mut parsed_output = parse_command_output(&command_output);
        if !streamed_stdout.is_empty() {
            parsed_output.stdout_raw = streamed_stdout.join("\n");
        }
        if !streamed_stderr.is_empty() {
            parsed_output.stderr_raw = streamed_stderr.join("\n");
        }
        info!(
            target: "reprod.r.exec",
            stdout = %parsed_output.stdout_raw,
            stderr = %parsed_output.stderr_raw,
            "R execution output (raw)"
        );

        let execution_time_ms = start.elapsed().as_millis() as u64;
        let result = ExecutionResult {
            success: command_output.success && !command_output.interrupted,
            output: parsed_output.display_output.clone(),
            error: parsed_output.error_output.clone(),
            plots,
            execution_time_ms,
        };

        let environment = self.environment_snapshot();
        let event = build_event(&request, &result, environment.clone(), blocks.clone());
        if self.record_runs {
            self.timeline.record(event.clone()).await?;
        }

        Ok((result, event, history_entries, streamed_chunks))
    }

    pub async fn interrupt(&self) -> Result<bool> {
        self.command_runner.interrupt().await
    }

    pub async fn reset(&self) -> Result<()> {
        let _ = self.interrupt().await?;
        if self.persistent_mode {
            let reset_prefix = "reset";
            let script_path = self.temp_dir.join("reset_persistent.R");
            let plot_capture = self.plot_capture();
            let reset_code = plot_capture.wrap_code(
                r#"
rm(list = ls(all.names = TRUE))
if (length(dev.list()) > 0) {
  dev.off(which = dev.list())
}
"#,
                reset_prefix,
                DEFAULT_PLOT_WIDTH,
                DEFAULT_PLOT_HEIGHT,
                true,
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

    pub async fn restart(&self) -> Result<()> {
        if !self.persistent_mode {
            return Ok(());
        }
        let _ = self.interrupt().await?;
        Ok(())
    }

    fn plot_capture(&self) -> PlotCapture {
        PlotCapture::new(self.temp_dir.clone(), self.plot_history.clone())
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

    pub fn environment_snapshot(&self) -> EnvironmentSnapshot {
        EnvironmentSnapshot {
            r_path: self.r_path.clone(),
            working_dir: self.working_dir.to_string_lossy().into_owned(),
            temp_dir: self.temp_dir.to_string_lossy().into_owned(),
        }
    }
}

#[cfg(test)]
#[path = "r_executor_tests.rs"]
mod r_executor_tests;
