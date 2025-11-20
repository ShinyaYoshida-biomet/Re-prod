use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use thiserror::Error;

use crate::terminal::shell_detector::ShellInfo;

const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;

pub struct PtyProcess {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Box<dyn portable_pty::Child + Send>,
}

impl std::fmt::Debug for PtyProcess {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PtyProcess")
            .field("master", &"<MasterPty>")
            .field("writer", &"<Writer>")
            .field("child", &"<Child>")
            .finish()
    }
}

#[derive(Debug, Error)]
pub enum PtyError {
    #[error("PTY error: {0}")]
    Error(String),
}

impl From<anyhow::Error> for PtyError {
    fn from(err: anyhow::Error) -> Self {
        Self::Error(err.to_string())
    }
}

impl From<std::io::Error> for PtyError {
    fn from(err: std::io::Error) -> Self {
        Self::Error(err.to_string())
    }
}

impl PtyProcess {
    pub fn spawn(shell: ShellInfo) -> Result<(Self, Box<dyn Read + Send>), PtyError> {
        let size = PtySize {
            rows: DEFAULT_ROWS,
            cols: DEFAULT_COLS,
            pixel_height: 0,
            pixel_width: 0,
        };

        let pty_system = native_pty_system();
        let pair = pty_system.openpty(size)?;
        let ShellInfo { program, args } = shell;

        let mut command = CommandBuilder::new(program);

        if !args.is_empty() {
            command.args(args);
        }

        command.env("TERM", "xterm-256color");
        let child = pair.slave.spawn_command(command)?;

        let reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;

        Ok((
            Self {
                master: pair.master,
                writer: Arc::new(Mutex::new(writer)),
                child,
            },
            reader,
        ))
    }

    pub fn write(&self, data: &str) -> Result<(), PtyError> {
        let mut writer = self
            .writer
            .lock()
            .map_err(|_| PtyError::Error("PTY writer lock poisoned".into()))?;

        writer.write_all(data.as_bytes())?;
        writer.flush()?;
        drop(writer);

        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), PtyError> {
        self.master.resize(PtySize {
            rows,
            cols,
            pixel_height: 0,
            pixel_width: 0,
        })?;
        Ok(())
    }

    pub fn kill(&mut self) -> Result<(), PtyError> {
        self.child.kill()?;
        Ok(())
    }

    pub fn wait(&mut self) -> Result<Option<i32>, PtyError> {
        let status = self.child.wait()?;
        // portable-pty 0.9 ExitStatus doesn't have code() method,
        // use success() to determine if process exited cleanly
        if status.success() {
            Ok(Some(0))
        } else {
            // Return a generic non-zero exit code
            Ok(Some(1))
        }
    }
}
