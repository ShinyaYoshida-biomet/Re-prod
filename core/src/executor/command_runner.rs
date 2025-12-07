use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use crate::graphics::plot_capture::PERSISTENT_DELIMITER;
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use tokio::{
    fs,
    io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, Command},
    sync::Mutex as AsyncMutex,
    task::JoinHandle,
    time::{timeout, Duration},
};

use super::constants::PERSISTENT_EXECUTION_TIMEOUT;

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
pub struct ProcessCommandRunner {
    active_child: AsyncMutex<Option<ActiveChild>>,
}

struct PersistentChild {
    process: Child,
    stdin: tokio::process::ChildStdin,
    stdout: BufReader<tokio::process::ChildStdout>,
    stderr: BufReader<tokio::process::ChildStderr>,
}

pub struct PersistentProcessCommandRunner {
    child: AsyncMutex<Option<PersistentChild>>,
    in_flight: AsyncMutex<()>,
    working_dir: PathBuf,
    r_path: String,
    interrupted: Arc<AtomicBool>,
}

type SharedChild = Arc<AsyncMutex<Child>>;

impl PersistentProcessCommandRunner {
    pub fn new(r_path: String, working_dir: PathBuf) -> Self {
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
            Self::read_until_delimiter(child, PERSISTENT_EXECUTION_TIMEOUT).await?;
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

    #[tokio::test]
    async fn process_runner_interrupt_is_noop_without_child() {
        let runner = ProcessCommandRunner::default();
        let interrupted = runner.interrupt().await.expect("interrupt");
        assert!(!interrupted);
    }

    #[tokio::test]
    async fn persistent_runner_interrupt_is_noop_without_child() {
        let runner = PersistentProcessCommandRunner::new("Rscript".into(), std::env::temp_dir());
        let interrupted = runner.interrupt().await.expect("interrupt");
        assert!(!interrupted);
    }
}
