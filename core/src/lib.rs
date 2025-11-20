// Allow expect on lock poisoning - poisoned locks indicate serious bugs
// and panicking is the correct behavior
#![allow(clippy::expect_used)]

pub mod ai;
pub mod api;
pub mod config;
pub mod error;
pub mod executor;
pub mod export;
pub mod fs;
pub mod project;
pub mod protocol;
pub mod terminal;
pub mod timeline;
pub mod tools;

// Re-export protocol types (for API boundaries)
pub use error::*;
pub use protocol::*;

// Re-export core services
pub use ai::{AIProvider, AnthropicProvider, OpenAIProvider};
pub use config::Config;
pub use executor::{CommandOutput, CommandRunner, RExecutor, RExecutorBuilder};
pub use project::{
    default_config_path, default_registry_path, locate_config, ProjectConfig, ProjectDescriptor,
    ProjectRecord, ProjectRegistry,
};

// Re-export tools (excluding ToolExecutionResult to avoid conflict with protocol)
pub use tools::{
    executor::{Artifact as ToolArtifact, ToolExecutor},
    manifest::*,
    registry::ToolRegistry,
    validator::{ToolValidator, ValidationResult},
};
