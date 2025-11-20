use thiserror::Error;

#[derive(Debug, Error)]
pub enum ReprodError {
    #[error("Execution error: {0}")]
    ExecutionError(String),

    #[error("IO error: {0}")]
    IoError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("AI provider error: {0}")]
    AIError(String),

    #[error("Security error: {0}")]
    SecurityError(String),

    #[error("IO error: {0}")]
    IOError(String),

    #[error("Protocol error: {0}")]
    ProtocolError(String),
}

impl From<std::io::Error> for ReprodError {
    fn from(err: std::io::Error) -> Self {
        Self::IoError(err.to_string())
    }
}

impl From<anyhow::Error> for ReprodError {
    fn from(err: anyhow::Error) -> Self {
        Self::ExecutionError(err.to_string())
    }
}
