use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Metadata for a reproduction bundle export.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BundleMetadata {
    pub format_version: String,
    pub bundle_id: String,
    pub created_at: String, // ISO 8601 timestamp
    pub re_prod_version: String,
    pub session: SessionInfo,
    pub environment: EnvironmentInfo,
    pub statistics: Statistics,
    pub files: BundleFiles,
    pub checksums: HashMap<String, String>,
}

/// Information about the session being exported.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SessionInfo {
    pub start_time: u64, // epoch milliseconds
    pub end_time: u64,   // epoch milliseconds
    pub duration_ms: u64,
    pub total_events: usize,
}

/// Environment information from the session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EnvironmentInfo {
    pub r_version: Option<String>,
    pub r_path: String,
    pub platform: String,
    pub working_dir: String,
    pub temp_dir: String,
}

/// Statistics about the session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Statistics {
    pub total_executions: usize,
    pub user_actions: usize,
    pub ai_actions: usize,
    pub total_plots: usize,
    pub total_errors: usize,
    pub unique_documents: usize,
}

/// File references in the bundle.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BundleFiles {
    pub timeline: String,
    pub code_files: Vec<String>,
    pub plot_files: Vec<String>,
    pub artifact_files: Vec<String>,
}

impl BundleMetadata {
    /// Create a new metadata instance with default values.
    pub fn new(bundle_id: String) -> Self {
        Self {
            format_version: "1.0".to_string(),
            bundle_id,
            created_at: chrono::Utc::now().to_rfc3339(),
            re_prod_version: env!("CARGO_PKG_VERSION").to_string(),
            session: SessionInfo {
                start_time: 0,
                end_time: 0,
                duration_ms: 0,
                total_events: 0,
            },
            environment: EnvironmentInfo {
                r_version: None,
                r_path: "Rscript".to_string(),
                platform: std::env::consts::OS.to_string(),
                working_dir: String::new(),
                temp_dir: String::new(),
            },
            statistics: Statistics {
                total_executions: 0,
                user_actions: 0,
                ai_actions: 0,
                total_plots: 0,
                total_errors: 0,
                unique_documents: 0,
            },
            files: BundleFiles {
                timeline: "timeline.json".to_string(),
                code_files: Vec::new(),
                plot_files: Vec::new(),
                artifact_files: Vec::new(),
            },
            checksums: HashMap::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metadata_creation() {
        let metadata = BundleMetadata::new("test-bundle-123".to_string());

        assert_eq!(metadata.format_version, "1.0");
        assert_eq!(metadata.bundle_id, "test-bundle-123");
        assert_eq!(metadata.files.timeline, "timeline.json");
    }

    #[test]
    fn test_metadata_serialization() {
        let metadata = BundleMetadata::new("test-bundle-456".to_string());
        let json = serde_json::to_string_pretty(&metadata).expect("serialize");

        assert!(json.contains("test-bundle-456"));
        assert!(json.contains("format_version"));
        assert!(json.contains("1.0"));
    }

    #[test]
    fn test_metadata_roundtrip() {
        let original = BundleMetadata::new("test-bundle-789".to_string());
        let json = serde_json::to_string(&original).expect("serialize");
        let parsed: BundleMetadata = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(parsed, original);
    }
}
