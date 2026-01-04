use super::metadata::{BundleFiles, BundleMetadata, EnvironmentInfo, SessionInfo, Statistics};
use crate::protocol::{ExecutionActor, ExecutionEvent};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Timeline export structure for JSON serialization.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TimelineExport {
    pub format_version: String,
    pub events: Vec<ExecutionEvent>,
}

/// A complete reproduction bundle containing all session data.
#[derive(Debug, Clone)]
pub struct ReproductionBundle {
    pub metadata: BundleMetadata,
    pub events: Vec<ExecutionEvent>,
}

/// Validation report for a bundle.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationReport {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

impl ReproductionBundle {
    /// Create a reproduction bundle from a list of execution events.
    pub fn from_events(events: Vec<ExecutionEvent>) -> Self {
        let bundle_id = Self::generate_bundle_id();
        let mut metadata = BundleMetadata::new(bundle_id);

        // Calculate session info
        metadata.session = Self::calculate_session_info(&events);

        // Extract environment info from first event
        if let Some(first_event) = events.first() {
            metadata.environment = EnvironmentInfo {
                r_version: first_event.environment.r_version.clone(),
                r_path: first_event.environment.r_path.clone(),
                platform: Self::get_platform_string(),
                working_dir: first_event.environment.working_dir.clone(),
                temp_dir: first_event.environment.temp_dir.clone(),
            };
        }

        // Calculate statistics
        metadata.statistics = Self::calculate_statistics(&events);

        // Collect file references
        metadata.files = Self::collect_file_references(&events);

        Self { metadata, events }
    }

    /// Generate a unique bundle ID.
    fn generate_bundle_id() -> String {
        let timestamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
        let random_suffix = uuid::Uuid::new_v4()
            .to_string()
            .split('-')
            .next()
            .unwrap_or("000000")
            .to_string();
        format!("bundle-{}-{}", timestamp, random_suffix)
    }

    /// Calculate session information from events.
    fn calculate_session_info(events: &[ExecutionEvent]) -> SessionInfo {
        if events.is_empty() {
            return SessionInfo {
                start_time: 0,
                end_time: 0,
                duration_ms: 0,
                total_events: 0,
            };
        }

        let start_time = events
            .iter()
            .map(|e| e.context.triggered_at_ms)
            .min()
            .unwrap_or(0);

        let end_time = events.iter().map(|e| e.created_at_ms).max().unwrap_or(0);

        SessionInfo {
            start_time,
            end_time,
            duration_ms: end_time.saturating_sub(start_time),
            total_events: events.len(),
        }
    }

    /// Calculate statistics from events.
    fn calculate_statistics(events: &[ExecutionEvent]) -> Statistics {
        let user_actions = events
            .iter()
            .filter(|e| matches!(e.context.actor, ExecutionActor::User))
            .count();

        let ai_actions = events
            .iter()
            .filter(|e| matches!(e.context.actor, ExecutionActor::Ai))
            .count();

        let total_plots = events.iter().map(|e| e.result.plots.len()).sum();

        let total_errors = events.iter().filter(|e| e.result.error.is_some()).count();

        let unique_documents = events
            .iter()
            .filter_map(|e| e.context.document_path.as_ref())
            .collect::<HashSet<_>>()
            .len();

        Statistics {
            total_executions: events.len(),
            user_actions,
            ai_actions,
            total_plots,
            total_errors,
            unique_documents,
        }
    }

    /// Collect file references from events.
    fn collect_file_references(events: &[ExecutionEvent]) -> BundleFiles {
        let mut code_files = HashSet::new();
        let mut plot_files = Vec::new();

        for event in events {
            // Collect code files
            if let Some(doc_path) = &event.context.document_path {
                let normalized_path = format!("code/{}", doc_path);
                code_files.insert(normalized_path);
            }

            // Collect plot files
            for (idx, _plot) in event.result.plots.iter().enumerate() {
                let plot_filename = format!("plots/{}_plot_{}.png", event.event_id, idx);
                plot_files.push(plot_filename);
            }
        }

        BundleFiles {
            timeline: "timeline.json".to_string(),
            code_files: code_files.into_iter().collect(),
            plot_files,
            artifact_files: Vec::new(),
        }
    }

    /// Get platform string (e.g., "macos-arm64", "linux-x86_64").
    fn get_platform_string() -> String {
        format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
    }

    /// Create timeline export structure.
    pub fn create_timeline_export(&self) -> TimelineExport {
        TimelineExport {
            format_version: "1.0".to_string(),
            events: self.events.clone(),
        }
    }

    /// Validate the bundle structure.
    pub fn validate(&self) -> ValidationReport {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // Check if we have events
        if self.events.is_empty() {
            warnings.push("Bundle contains no events".to_string());
        }

        // Validate each event has required fields
        for (idx, event) in self.events.iter().enumerate() {
            if event.event_id.is_empty() {
                errors.push(format!("Event {} has empty event_id", idx));
            }

            if event.blocks.is_empty() {
                warnings.push(format!("Event {} has no code blocks", event.event_id));
            }

            // Validate plot references
            for (plot_idx, plot) in event.result.plots.iter().enumerate() {
                if plot.filename.is_empty() {
                    errors.push(format!(
                        "Event {} plot {} has empty filename",
                        event.event_id, plot_idx
                    ));
                }

                if plot.base64_data.is_empty() {
                    errors.push(format!(
                        "Event {} plot {} has empty data",
                        event.event_id, plot_idx
                    ));
                }
            }
        }

        // Check metadata consistency
        if self.metadata.session.total_events != self.events.len() {
            errors.push(format!(
                "Metadata reports {} events but bundle contains {}",
                self.metadata.session.total_events,
                self.events.len()
            ));
        }

        ValidationReport {
            valid: errors.is_empty(),
            errors,
            warnings,
        }
    }

    /// Extract code files grouped by document path.
    pub fn extract_code_files(&self) -> HashMap<String, String> {
        let mut code_by_document: HashMap<String, Vec<String>> = HashMap::new();

        // Collect code blocks by document
        for event in &self.events {
            if let Some(doc_path) = &event.context.document_path {
                for block in &event.blocks {
                    code_by_document
                        .entry(doc_path.clone())
                        .or_default()
                        .push(block.code.clone());
                }
            }
        }

        // Deduplicate and join code blocks
        code_by_document
            .into_iter()
            .map(|(path, mut codes)| {
                codes.sort();
                codes.dedup();
                let combined = codes.join("\n\n");
                (path, combined)
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{
        CodeBlockKind, CodeBlockMetadata, EnvironmentSnapshot, ExecutionContext, ExecutionResult,
        ExecutionSource, PlotInfo, RunStatus,
    };

    fn create_test_event(event_id: &str, actor: ExecutionActor, has_plot: bool) -> ExecutionEvent {
        ExecutionEvent {
            event_id: event_id.to_string(),
            context: ExecutionContext {
                source: ExecutionSource::Cell,
                document_path: Some("test.R".to_string()),
                cell_index: Some(1),
                triggered_at_ms: 1699200000000,
                actor,
            },
            blocks: vec![CodeBlockMetadata {
                id: "block-1".to_string(),
                index: 0,
                kind: CodeBlockKind::Section,
                label: Some("Test".to_string()),
                start_line: 1,
                end_line: 3,
                code: "x <- 1:10\nprint(x)".to_string(),
            }],
            result: ExecutionResult {
                success: true,
                output: "[1] 1 2 3".to_string(),
                error: None,
                plots: if has_plot {
                    vec![PlotInfo {
                        id: format!("{}-plot", event_id),
                        filename: "plot.png".to_string(),
                        base64_data: "iVBORw0KG...".to_string(),
                        index: 0,
                        width: None,
                        height: None,
                        timestamp: None,
                        code: None,
                        storage_path: None,
                        snapshot_path: None,
                    }]
                } else {
                    vec![]
                },
                execution_time_ms: 42,
            },
            environment: EnvironmentSnapshot {
                r_version: None,
                r_path: "Rscript".to_string(),
                working_dir: "/tmp/test".to_string(),
                temp_dir: "/tmp/reprod".to_string(),
            },
            created_at_ms: 1699200001000,
            status: RunStatus::Succeeded,
            started_at_ms: 1699200000000,
            finished_at_ms: Some(1699200001000),
            duration_ms: Some(1000),
        }
    }

    #[test]
    fn test_bundle_from_empty_events() {
        let bundle = ReproductionBundle::from_events(vec![]);

        assert_eq!(bundle.events.len(), 0);
        assert_eq!(bundle.metadata.session.total_events, 0);
        assert_eq!(bundle.metadata.statistics.total_executions, 0);
    }

    #[test]
    fn test_bundle_from_events() {
        let events = vec![
            create_test_event("evt-1", ExecutionActor::User, true),
            create_test_event("evt-2", ExecutionActor::Ai, false),
            create_test_event("evt-3", ExecutionActor::User, true),
        ];

        let bundle = ReproductionBundle::from_events(events);

        assert_eq!(bundle.events.len(), 3);
        assert_eq!(bundle.metadata.session.total_events, 3);
        assert_eq!(bundle.metadata.statistics.total_executions, 3);
        assert_eq!(bundle.metadata.statistics.user_actions, 2);
        assert_eq!(bundle.metadata.statistics.ai_actions, 1);
        assert_eq!(bundle.metadata.statistics.total_plots, 2);
    }

    #[test]
    fn test_validation_success() {
        let events = vec![create_test_event("evt-1", ExecutionActor::User, false)];
        let bundle = ReproductionBundle::from_events(events);

        let report = bundle.validate();
        assert!(report.valid);
        assert!(report.errors.is_empty());
    }

    #[test]
    fn test_validation_empty_bundle() {
        let bundle = ReproductionBundle::from_events(vec![]);

        let report = bundle.validate();
        assert!(report.valid); // Empty is valid, just has warnings
        assert_eq!(report.warnings.len(), 1);
        assert!(report.warnings[0].contains("no events"));
    }

    #[test]
    fn test_extract_code_files() {
        let events = vec![
            create_test_event("evt-1", ExecutionActor::User, false),
            create_test_event("evt-2", ExecutionActor::User, false),
        ];
        let bundle = ReproductionBundle::from_events(events);

        let code_files = bundle.extract_code_files();
        assert_eq!(code_files.len(), 1);
        assert!(code_files.contains_key("test.R"));
    }

    #[test]
    fn test_timeline_export_creation() {
        let events = vec![create_test_event("evt-1", ExecutionActor::User, false)];
        let bundle = ReproductionBundle::from_events(events);

        let timeline = bundle.create_timeline_export();
        assert_eq!(timeline.format_version, "1.0");
        assert_eq!(timeline.events.len(), 1);
    }
}
