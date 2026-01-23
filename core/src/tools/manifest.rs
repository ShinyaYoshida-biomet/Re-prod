use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

/// Distinguishes between R-backed and CLI-backed tooling.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "kebab-case")]
pub enum ToolKind {
    RPackage,
    Cli,
}

/// Describes the execution strategy for a capability.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "kebab-case")]
pub enum CapabilityKind {
    RFunction,
    RSnippet,
    CliCommand,
}

/// Valid parameter types a capability can expose.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "kebab-case")]
pub enum ParameterType {
    String,
    Integer,
    Float,
    Enum,
    File,
}

/// Output channel taxonomy for tool execution.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "kebab-case")]
pub enum OutputType {
    Stdout,
    Stderr,
    File,
    RObject,
}

/// Controls how generated artefacts should surface in the UI.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "kebab-case")]
pub enum ArtifactRecord {
    Artifact,
    Preview,
    Internal,
}

/// Runtime-specific configuration required to execute a tool.
#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub struct RuntimeConfig {
    #[serde(default)]
    pub r_library: Option<String>,
    #[serde(default)]
    pub imports: Vec<String>,
    #[serde(default)]
    pub cli_binary: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
}

/// Validation hooks executed before tool capabilities become available.
#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub struct ValidationConfig {
    #[serde(default)]
    pub requires_packages: Vec<String>,
    #[serde(default)]
    pub requires_cli: Vec<String>,
    #[serde(default)]
    pub preflight_r: Option<String>,
    #[serde(default)]
    pub preflight_cli: Option<String>,
}

/// Describes a single input accepted by a capability.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub struct ParameterSpec {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: ParameterType,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    #[ts(type = "any")]
    pub default: Option<Value>,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub role: Option<String>,
}

/// Describes the artefacts or channels emitted during execution.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub struct OutputSpec {
    #[serde(rename = "type")]
    pub kind: OutputType,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub class: Option<String>,
    #[serde(default)]
    pub record_as: Option<ArtifactRecord>,
}

/// A single callable capability exposed by a tool.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub struct CapabilityDescriptor {
    pub id: String,
    pub display_name: String,
    pub kind: CapabilityKind,
    pub description: String,
    pub entrypoint: String,
    #[serde(default)]
    pub template: Option<String>,
    #[serde(default)]
    pub input_spec: Vec<ParameterSpec>,
    #[serde(default)]
    pub output_spec: Vec<OutputSpec>,
    #[serde(default)]
    pub post_validation: Option<String>,
}

/// Top-level manifest loaded from `core/tools/*.toml`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub struct ToolManifest {
    pub id: String,
    pub display_name: String,
    pub kind: ToolKind,
    pub description: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub runtime: RuntimeConfig,
    #[serde(default)]
    pub validation: ValidationConfig,
    #[serde(default)]
    pub capabilities: Vec<CapabilityDescriptor>,
}
