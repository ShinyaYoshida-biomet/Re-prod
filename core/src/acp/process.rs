use std::{collections::HashMap, path::PathBuf, process::Stdio, time::Duration};

use anyhow::{anyhow, Result};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, ChildStderr, Command};
use tokio::task::JoinHandle;
use tokio::time::sleep;
use tracing::{debug, error, info};

use super::detection::find_agent_binary;

pub struct ProcessConfig {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub env: HashMap<String, String>,
}

pub struct SpawnedPipes {
    pub child: AcpChild,
    pub reader: tokio::process::ChildStdout,
    pub writer: tokio::process::ChildStdin,
}

pub struct AcpChild {
    child: Child,
    stderr_task: Option<JoinHandle<()>>,
}

impl AcpChild {
    pub fn new(child: Child, stderr_task: Option<JoinHandle<()>>) -> Result<Self> {
        Ok(Self { child, stderr_task })
    }

    pub async fn notify_ready(&mut self) -> Result<()> {
        // Placeholder: give the process a brief moment to start.
        // Future: replace with protocol handshake.
        sleep(Duration::from_millis(50)).await;
        Ok(())
    }

    pub async fn shutdown(&mut self) {
        if let Some(id) = self.child.id() {
            debug!("Shutting down ACP child process pid={}", id);
        }
        if let Some(handle) = self.stderr_task.take() {
            handle.abort();
        }
        if let Err(err) = self.child.kill().await {
            error!("Failed to kill ACP child process: {err}");
        }
    }
}

fn spawn_stderr_logger(stderr: ChildStderr) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        let lower = trimmed.to_ascii_lowercase();
                        if lower.contains("tool execution denied by policy")
                            || lower.contains("denied by policy")
                            || lower.contains("[dep0040]")
                            || lower.contains("punycode")
                        {
                            debug!(message = %trimmed, "ACP agent stderr");
                            continue;
                        }
                        info!(message = %line, "ACP agent stderr");
                    }
                }
                Ok(None) => break,
                Err(err) => {
                    error!("Failed to read ACP agent stderr: {err}");
                    break;
                }
            }
        }
    })
}

pub async fn spawn_agent(config: ProcessConfig) -> Result<SpawnedPipes> {
    let command_path = find_agent_binary(&config.command)
        .ok_or_else(|| anyhow!("Agent binary not found: {}", config.command))?;

    info!(
        command = %config.command,
        command_path = %command_path.display(),
        cwd = %config.cwd.display(),
        args = ?config.args,
        "Spawning ACP agent"
    );
    let mut cmd = Command::new(command_path);
    cmd.args(config.args);
    cmd.current_dir(config.cwd);
    cmd.envs(config.env);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|err| {
        error!(error = %err, "Failed to spawn ACP agent");
        anyhow!("Failed to spawn ACP agent: {err}")
    })?;

    let stderr_task = child.stderr.take().map(spawn_stderr_logger);
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow!("Failed to take agent stdout"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| anyhow!("Failed to take agent stdin"))?;

    Ok(SpawnedPipes {
        child: AcpChild::new(child, stderr_task)?,
        reader: stdout,
        writer: stdin,
    })
}
