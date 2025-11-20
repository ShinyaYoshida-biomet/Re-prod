use std::collections::HashMap;
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use reprod_core::terminal::{detect_shell, PtyError, PtyProcess, ShellDetectionError};
use thiserror::Error;
use tokio::sync::{mpsc, Mutex as TokioMutex};
use tokio::task::JoinHandle;
use uuid::Uuid;

#[derive(Debug)]
pub enum TerminalEvent {
    Output(String),
    Exit(Option<i32>),
    Error(String),
    KeepAlive,
}

#[derive(Debug)]
pub struct TerminalSessionMeta {
    pub id: String,
}

struct TerminalSessionHandle {
    process: Arc<Mutex<PtyProcess>>,
    reader_task: JoinHandle<()>,
    keepalive_task: JoinHandle<()>,
}

#[derive(Debug, Error)]
pub enum TerminalManagerError {
    #[error("terminal session {0} not found")]
    NotFound(String),
    #[error("PTY lock was poisoned")]
    LockPoisoned,
    #[error("PTY operation failed: {0}")]
    Pty(PtyError),
    #[error("shell detection failed: {0}")]
    ShellDetection(ShellDetectionError),
    #[error("async task failed")]
    TaskFailed,
}

impl From<PtyError> for TerminalManagerError {
    fn from(err: PtyError) -> Self {
        Self::Pty(err)
    }
}

impl From<ShellDetectionError> for TerminalManagerError {
    fn from(err: ShellDetectionError) -> Self {
        Self::ShellDetection(err)
    }
}

impl From<std::sync::PoisonError<std::sync::MutexGuard<'_, PtyProcess>>> for TerminalManagerError {
    fn from(_: std::sync::PoisonError<std::sync::MutexGuard<'_, PtyProcess>>) -> Self {
        Self::LockPoisoned
    }
}

pub struct TerminalManager {
    sessions: TokioMutex<HashMap<String, TerminalSessionHandle>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: TokioMutex::new(HashMap::new()),
        }
    }

    pub async fn create_session(
        &self,
        shell: Option<String>,
        output_tx: mpsc::UnboundedSender<TerminalEvent>,
    ) -> Result<TerminalSessionMeta, TerminalManagerError> {
        let shell_info = detect_shell(shell)?;

        let (process, reader) = PtyProcess::spawn(shell_info.clone())?;
        let process_handle = Arc::new(Mutex::new(process));

        let session_id = Uuid::new_v4().to_string();

        let reader_task = spawn_reader(
            process_handle.clone(),
            reader,
            output_tx.clone(),
            session_id.clone(),
        );

        let keepalive_task = spawn_keepalive(output_tx.clone());

        let session = TerminalSessionHandle {
            process: process_handle,
            reader_task,
            keepalive_task,
        };

        self.sessions
            .lock()
            .await
            .insert(session_id.clone(), session);

        Ok(TerminalSessionMeta { id: session_id })
    }

    pub async fn write(&self, session_id: &str, data: &str) -> Result<(), TerminalManagerError> {
        let session = {
            let guard = self.sessions.lock().await;
            guard
                .get(session_id)
                .map(|handle| handle.process.clone())
                .ok_or_else(|| TerminalManagerError::NotFound(session_id.to_string()))?
        };

        let payload = data.to_owned();

        let inner = tokio::task::spawn_blocking(move || {
            session
                .lock()
                .map_err(|_| TerminalManagerError::LockPoisoned)?
                .write(&payload)?;
            Ok::<(), TerminalManagerError>(())
        })
        .await
        .map_err(|_| TerminalManagerError::TaskFailed)?;

        inner
    }

    pub async fn resize(
        &self,
        session_id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<(), TerminalManagerError> {
        let session = {
            let guard = self.sessions.lock().await;
            guard
                .get(session_id)
                .map(|handle| handle.process.clone())
                .ok_or_else(|| TerminalManagerError::NotFound(session_id.to_string()))?
        };

        let inner = tokio::task::spawn_blocking(move || {
            session
                .lock()
                .map_err(|_| TerminalManagerError::LockPoisoned)?
                .resize(cols, rows)?;
            Ok::<(), TerminalManagerError>(())
        })
        .await
        .map_err(|_| TerminalManagerError::TaskFailed)?;

        inner
    }

    pub async fn close(&self, session_id: &str) -> Result<(), TerminalManagerError> {
        let session = self
            .sessions
            .lock()
            .await
            .remove(session_id)
            .ok_or_else(|| TerminalManagerError::NotFound(session_id.to_string()))?;

        session.reader_task.abort();
        session.keepalive_task.abort();

        session.process.lock()?.kill()?;

        Ok(())
    }
}

fn spawn_reader(
    process: Arc<Mutex<PtyProcess>>,
    mut reader: Box<dyn Read + Send>,
    output_tx: mpsc::UnboundedSender<TerminalEvent>,
    session_id: String,
) -> JoinHandle<()> {
    tokio::task::spawn_blocking(move || {
        let mut buffer = [0u8; 1024];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buffer[..n]).to_string();
                    if output_tx.send(TerminalEvent::Output(chunk)).is_err() {
                        break;
                    }
                }
                Err(err) => {
                    let _ = output_tx.send(TerminalEvent::Error(err.to_string()));
                    break;
                }
            }
        }

        let exit_code = process
            .lock()
            .map_or(None, |mut guard| guard.wait().ok().flatten());

        let _ = output_tx.send(TerminalEvent::Exit(exit_code));
        let _ = output_tx.send(TerminalEvent::KeepAlive); // signal watchers that we're still alive
        tracing::debug!("Terminal session {session_id} reader terminated");
    })
}

fn spawn_keepalive(output_tx: mpsc::UnboundedSender<TerminalEvent>) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(25));

        loop {
            interval.tick().await;
            if output_tx.send(TerminalEvent::KeepAlive).is_err() {
                break;
            }
        }
    })
}
