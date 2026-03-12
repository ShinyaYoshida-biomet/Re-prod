// Allow expect on lock poisoning - poisoned locks indicate serious bugs
// and panicking is the correct behavior
#![allow(clippy::expect_used)]

pub mod acp;
pub mod ai;
pub mod api;
pub mod config;
pub mod diff;
pub mod edit;
pub mod error;
pub mod execution_repository;
pub mod executor;
pub mod export;
pub mod fs;
pub mod graphics;
pub mod plot_history;
pub mod project;
pub mod protocol;
pub mod terminal;
pub mod timeline;
pub mod tools;
pub mod web_search;

// Re-export protocol types (for API boundaries)
pub use diff::{
    build_diff_hunks, compute_diff, DiffChange, DiffChangeType, DiffHunk, DiffLine, DiffLineType,
};
pub use edit::*;
pub use error::*;
pub use protocol::*;

// Re-export core services
pub use ai::{AIProvider, AnthropicProvider, OpenAIProvider};
pub use config::Config;
pub use executor::{CommandOutput, CommandRunner, RExecutor, RExecutorBuilder};
pub use plot_history::*;
pub use project::{
    default_config_path, locate_config, ProjectConfig, ProjectDescriptor, ProjectRecord,
};

// Re-export tools (excluding ToolExecutionResult to avoid conflict with protocol)
pub use tools::{
    executor::{Artifact as ToolArtifact, ToolExecutor},
    manifest::*,
    registry::ToolRegistry,
    validator::{ToolValidator, ValidationResult},
};
