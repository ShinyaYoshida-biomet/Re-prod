pub mod agents;
pub mod client;
pub mod config;
pub mod connection;
pub mod detection;
mod download;
pub mod gateway;
pub mod process;
pub mod runtime;
pub mod session;
pub mod types;

pub use gateway::{build_process_config, AcpGateway};
pub use process::{AcpChild, ProcessConfig, SpawnedPipes};
pub use runtime::AcpRuntime;

#[cfg(test)]
mod test_support;
