use std::{collections::HashMap, path::PathBuf, process::Stdio, time::Duration};

use anyhow::{anyhow, Result};
use tokio::process::{Child, Command};
use tokio::time::sleep;
use tracing::{debug, error};

use crate::detection::find_agent_binary;

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
}

impl AcpChild {
    pub fn new(child: Child) -> Result<Self> {
        Ok(Self { child })
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
        if let Err(err) = self.child.kill().await {
            error!("Failed to kill ACP child process: {err}");
        }
    }
}

pub async fn spawn_agent(config: ProcessConfig) -> Result<SpawnedPipes> {
    let command_path = find_agent_binary(&config.command)
        .ok_or_else(|| anyhow!("Agent binary not found: {}", config.command))?;

    let mut cmd = Command::new(command_path);
    cmd.args(config.args);
    cmd.current_dir(config.cwd);
    cmd.envs(config.env);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|err| anyhow!("Failed to spawn ACP agent: {err}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow!("Failed to take agent stdout"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| anyhow!("Failed to take agent stdin"))?;

    Ok(SpawnedPipes {
        child: AcpChild::new(child)?,
        reader: stdout,
        writer: stdin,
    })
}
