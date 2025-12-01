use crate::{
    executor::timeline::{SortOrder, TimelineQuery},
    protocol::{ExecutionEvent, ExecutionSource},
    timeline::JsonTimeline,
    ReprodError,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const DEFAULT_LIMIT: u32 = 5;
const MAX_LIMIT: u32 = 20;
const DEFAULT_MAX_CHARS: usize = 1200;
const MAX_ALLOWED_CHARS: usize = 4000;

#[derive(Debug, Serialize, Deserialize)]
pub struct GetConsoleLogsRequest {
    pub limit: Option<u32>,
    pub max_chars_per_entry: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct ConsoleLogSummary {
    pub created_at_ms: u64,
    pub success: bool,
    pub source: String,
    pub document_path: Option<String>,
    pub duration_ms: u64,
    pub code: String,
    pub output: String,
    pub error: Option<String>,
    pub plot_count: usize,
}

impl ConsoleLogSummary {
    fn from_event(event: &ExecutionEvent, max_chars: usize) -> Self {
        Self {
            created_at_ms: event.created_at_ms,
            success: event.result.success,
            source: source_to_string(&event.context.source),
            document_path: event.context.document_path.clone(),
            duration_ms: event.result.execution_time_ms,
            code: truncate(&collect_code(event), max_chars),
            output: truncate(event.result.output.trim(), max_chars),
            error: event
                .result
                .error
                .as_ref()
                .map(|err| truncate(err.trim(), max_chars)),
            plot_count: event.result.plots.len(),
        }
    }
}

fn collect_code(event: &ExecutionEvent) -> String {
    event
        .blocks
        .iter()
        .map(|block| block.code.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

fn truncate(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }

    let truncated: String = text.chars().take(max_chars).collect();
    format!("{}...(truncated)", truncated)
}

fn source_to_string(source: &ExecutionSource) -> String {
    match source {
        ExecutionSource::Selection => "selection",
        ExecutionSource::Cell => "cell",
        ExecutionSource::WholeDocument => "whole_document",
        ExecutionSource::Unknown => "unknown",
    }
    .to_string()
}

fn clamp_limit(limit: Option<u32>) -> u32 {
    limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

fn clamp_max_chars(max_chars: Option<usize>) -> usize {
    max_chars
        .unwrap_or(DEFAULT_MAX_CHARS)
        .clamp(1, MAX_ALLOWED_CHARS)
}

pub fn fetch_console_logs(
    timeline: &JsonTimeline,
    request: &GetConsoleLogsRequest,
) -> Result<Vec<ConsoleLogSummary>, ReprodError> {
    let limit = clamp_limit(request.limit);
    let max_chars = clamp_max_chars(request.max_chars_per_entry);

    let query = TimelineQuery {
        filters: None,
        sort: Some(SortOrder::Desc),
        limit: Some(limit),
        offset: None,
    };

    let response = timeline
        .query(query)
        .map_err(|e| ReprodError::IOError(format!("Timeline query failed: {}", e)))?;

    let summaries = response
        .events
        .into_iter()
        .map(|event| ConsoleLogSummary::from_event(&event, max_chars))
        .collect();

    Ok(summaries)
}

/// Tool definitions for AI provider to access console output.
pub fn get_console_tools() -> Vec<Value> {
    serde_json::json!([
        {
            "name": "get_recent_console_logs",
            "description": "Fetch recent R console outputs (stdout, stderr, plots count) from the execution timeline. Newest first and truncated for brevity.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 20,
                        "description": "Number of recent execution entries to return. Defaults to 5."
                    },
                    "max_chars_per_entry": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 4000,
                        "description": "Maximum characters to include for code and output fields per entry. Defaults to 1200."
                    }
                }
            }
        }
    ])
    .as_array()
    .expect("get_console_tools: json! array literal should always be an array")
    .clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{
        CodeBlockKind, CodeBlockMetadata, EnvironmentSnapshot, ExecutionActor, ExecutionContext,
        ExecutionResult, PlotInfo,
    };
    use crate::timeline::TimelineSink;

    fn build_event(event_id: &str, created_at_ms: u64) -> ExecutionEvent {
        ExecutionEvent {
            event_id: event_id.to_string(),
            context: ExecutionContext {
                source: ExecutionSource::Cell,
                document_path: Some("analysis.R".to_string()),
                cell_index: Some(0),
                triggered_at_ms: created_at_ms,
                actor: ExecutionActor::User,
            },
            blocks: vec![CodeBlockMetadata {
                id: "block-1".to_string(),
                index: 0,
                kind: CodeBlockKind::Section,
                label: Some("Test".to_string()),
                start_line: 1,
                end_line: 2,
                code: "print('ok')".to_string(),
            }],
            result: ExecutionResult {
                success: true,
                output: "line one\nline two".to_string(),
                error: None,
                plots: vec![PlotInfo {
                    id: "plot-1".to_string(),
                    filename: "plot.png".to_string(),
                    base64_data: "data".to_string(),
                    index: 0,
                    width: None,
                    height: None,
                    timestamp: Some(created_at_ms),
                    code: None,
                    storage_path: None,
                    snapshot_path: None,
                }],
                execution_time_ms: 123,
            },
            environment: EnvironmentSnapshot {
                r_path: "Rscript".to_string(),
                working_dir: "/tmp".to_string(),
                temp_dir: "/tmp/reprod".to_string(),
            },
            created_at_ms,
        }
    }

    #[tokio::test]
    async fn fetches_recent_logs_with_defaults() {
        let timeline = JsonTimeline::new_in_memory().expect("create timeline");
        timeline
            .record(build_event("evt-1", 10))
            .await
            .expect("record");
        timeline
            .record(build_event("evt-2", 20))
            .await
            .expect("record");

        let logs = fetch_console_logs(
            &timeline,
            &GetConsoleLogsRequest {
                limit: None,
                max_chars_per_entry: None,
            },
        )
        .expect("fetch logs");

        assert_eq!(logs.len(), 2);
        assert_eq!(logs[0].created_at_ms, 20);
        assert_eq!(logs[0].plot_count, 1);
    }

    #[tokio::test]
    async fn applies_truncation() {
        let timeline = JsonTimeline::new_in_memory().expect("create timeline");
        let mut event = build_event("evt-1", 30);
        event.result.output = "abcdefg".repeat(300);
        timeline.record(event).await.expect("record");

        let logs = fetch_console_logs(
            &timeline,
            &GetConsoleLogsRequest {
                limit: Some(1),
                max_chars_per_entry: Some(50),
            },
        )
        .expect("fetch logs");

        assert_eq!(logs.len(), 1);
        assert!(logs[0].output.ends_with("(truncated)"));
        assert!(logs[0].output.len() <= 64); // 50 chars + suffix
    }
}
