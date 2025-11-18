pub mod pty_process;
pub mod shell_detector;

pub use pty_process::{PtyError, PtyProcess};
pub use shell_detector::{detect_shell, ShellDetectionError, ShellInfo};
