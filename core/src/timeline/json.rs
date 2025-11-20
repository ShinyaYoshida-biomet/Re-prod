use crate::protocol::{ExecutionActor, ExecutionEvent, ExecutionSource};
use crate::timeline::{
    SortOrder, TimelineFilters, TimelineQuery, TimelineResponse, TimelineSink, TimelineStats,
};
use anyhow::{Context, Result};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Internal representation of a timeline event with indexed fields for efficient querying
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct TimelineRecord {
    /// Indexed fields for filtering
    event_id: String,
    actor: String,
    source: String,
    document_path: Option<String>,
    created_at_ms: u64,
    triggered_at_ms: u64,
    success: bool,
    has_plots: bool,
    has_errors: bool,
    code_text: String,

    /// Full event data
    event: ExecutionEvent,
}

/// JSON-based timeline storage using NDJSON (newline-delimited JSON) format
///
/// This implementation stores events as one JSON object per line in a file,
/// enabling append-only writes and language-agnostic access without database dependencies.
pub struct JsonTimeline {
    file_path: PathBuf,
    /// Mutex protects concurrent writes to the file
    writer: Arc<Mutex<Option<File>>>,
}

impl JsonTimeline {
    /// Create a new JSON timeline with a file-backed storage
    pub fn new(file_path: PathBuf) -> Result<Self> {
        // Ensure parent directory exists
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent).context("Failed to create timeline directory")?;
        }

        // Open file in append mode (create if not exists)
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)
            .context("Failed to open timeline file")?;

        Ok(Self {
            file_path,
            writer: Arc::new(Mutex::new(Some(file))),
        })
    }

    /// Create an in-memory JSON timeline for testing
    pub fn new_in_memory() -> Result<Self> {
        let temp_dir = std::env::temp_dir();
        let temp_file = temp_dir.join(format!("reprod-timeline-{}.ndjson", uuid::Uuid::new_v4()));
        Self::new(temp_file)
    }

    /// Extract searchable code text from all blocks
    fn extract_code_text(event: &ExecutionEvent) -> String {
        event
            .blocks
            .iter()
            .map(|block| block.code.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Convert ExecutionActor to string for storage
    const fn actor_to_string(actor: &ExecutionActor) -> &'static str {
        match actor {
            ExecutionActor::User => "user",
            ExecutionActor::Ai => "ai",
        }
    }

    /// Convert ExecutionSource to string for storage
    const fn source_to_string(source: &ExecutionSource) -> &'static str {
        match source {
            ExecutionSource::Selection => "selection",
            ExecutionSource::Cell => "cell",
            ExecutionSource::WholeDocument => "whole_document",
            ExecutionSource::Unknown => "unknown",
        }
    }

    /// Create a timeline record from an execution event
    fn create_record(event: ExecutionEvent) -> TimelineRecord {
        let actor = Self::actor_to_string(&event.context.actor).to_string();
        let source = Self::source_to_string(&event.context.source).to_string();
        let has_plots = !event.result.plots.is_empty();
        let has_errors = event.result.error.is_some();
        let code_text = Self::extract_code_text(&event);

        TimelineRecord {
            event_id: event.event_id.clone(),
            actor,
            source,
            document_path: event.context.document_path.clone(),
            created_at_ms: event.created_at_ms,
            triggered_at_ms: event.context.triggered_at_ms,
            success: event.result.success,
            has_plots,
            has_errors,
            code_text,
            event,
        }
    }

    /// Read all records from the file
    fn read_records(&self) -> Result<Vec<TimelineRecord>> {
        if !self.file_path.exists() {
            return Ok(Vec::new());
        }

        let file =
            File::open(&self.file_path).context("Failed to open timeline file for reading")?;
        let reader = BufReader::new(file);

        let mut records = Vec::new();
        for (line_num, line) in reader.lines().enumerate() {
            let line = line.context("Failed to read line from timeline file")?;

            // Skip empty lines
            if line.trim().is_empty() {
                continue;
            }

            let record: TimelineRecord = serde_json::from_str(&line).with_context(|| {
                format!("Failed to parse timeline record at line {}", line_num + 1)
            })?;
            records.push(record);
        }

        Ok(records)
    }

    /// Apply filters to records
    fn apply_filters(
        &self,
        records: &[TimelineRecord],
        filters: &TimelineFilters,
    ) -> Vec<TimelineRecord> {
        records
            .iter()
            .filter(|record| {
                // Filter by actor
                if let Some(ref actor) = filters.actor {
                    if record.actor != Self::actor_to_string(actor) {
                        return false;
                    }
                }

                // Filter by source
                if let Some(ref source) = filters.source {
                    if record.source != Self::source_to_string(source) {
                        return false;
                    }
                }

                // Filter by time range
                if let Some(start_time) = filters.start_time {
                    if record.created_at_ms < start_time {
                        return false;
                    }
                }

                if let Some(end_time) = filters.end_time {
                    if record.created_at_ms > end_time {
                        return false;
                    }
                }

                // Filter by plots
                if let Some(has_plots) = filters.has_plots {
                    if record.has_plots != has_plots {
                        return false;
                    }
                }

                // Filter by errors
                if let Some(has_errors) = filters.has_errors {
                    if record.has_errors != has_errors {
                        return false;
                    }
                }

                // Filter by code content
                if let Some(ref code_contains) = filters.code_contains {
                    if !record.code_text.contains(code_contains) {
                        return false;
                    }
                }

                true
            })
            .cloned()
            .collect()
    }

    /// Sort records
    fn sort_records(
        &self,
        mut records: Vec<TimelineRecord>,
        sort_order: SortOrder,
    ) -> Vec<TimelineRecord> {
        match sort_order {
            SortOrder::Asc => {
                records.sort_by_key(|r| r.created_at_ms);
            }
            SortOrder::Desc => {
                records.sort_by_key(|r| std::cmp::Reverse(r.created_at_ms));
            }
        }
        records
    }

    /// Query timeline events with filters, sorting, and pagination
    pub fn query(&self, query: TimelineQuery) -> Result<TimelineResponse> {
        // Read all records
        let mut records = self.read_records()?;

        // Apply filters
        if let Some(ref filters) = query.filters {
            records = self.apply_filters(&records, filters);
        }

        let total = records.len() as u32;

        // Apply sorting
        let sort_order = query.sort.unwrap_or_default();
        records = self.sort_records(records, sort_order);

        // Apply pagination
        let limit = query.limit.unwrap_or(50).min(200) as usize;
        let offset = query.offset.unwrap_or(0) as usize;

        let has_more = offset + limit < total as usize;

        let events: Vec<ExecutionEvent> = records
            .into_iter()
            .skip(offset)
            .take(limit)
            .map(|record| record.event)
            .collect();

        Ok(TimelineResponse {
            events,
            total,
            has_more,
            query,
        })
    }

    /// Get timeline statistics
    pub fn stats(&self) -> Result<TimelineStats> {
        let records = self.read_records()?;

        if records.is_empty() {
            return Ok(TimelineStats {
                total_events: 0,
                total_plots: 0,
                total_errors: 0,
                user_actions: 0,
                ai_actions: 0,
                session_start_time: 0,
                session_end_time: 0,
                session_duration: 0,
            });
        }

        let total_events = records.len() as u32;
        let total_plots = records.iter().filter(|r| r.has_plots).count() as u32;
        let total_errors = records.iter().filter(|r| r.has_errors).count() as u32;
        let user_actions = records.iter().filter(|r| r.actor == "user").count() as u32;
        let ai_actions = records.iter().filter(|r| r.actor == "ai").count() as u32;

        let session_start_time = records.iter().map(|r| r.created_at_ms).min().unwrap_or(0);
        let session_end_time = records.iter().map(|r| r.created_at_ms).max().unwrap_or(0);
        let session_duration = session_end_time.saturating_sub(session_start_time);

        Ok(TimelineStats {
            total_events,
            total_plots,
            total_errors,
            user_actions,
            ai_actions,
            session_start_time,
            session_end_time,
            session_duration,
        })
    }

    /// Clear all events from the timeline storage.
    pub fn reset(&self) -> Result<usize> {
        let count = self.read_records()?.len();

        // Truncate the file
        let mut writer = self.writer.lock().expect("timeline lock poisoned");
        drop(writer.take()); // Close the current file handle

        std::fs::write(&self.file_path, "").context("Failed to clear timeline file")?;

        // Reopen in append mode
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)
            .context("Failed to reopen timeline file")?;

        *writer = Some(file);
        drop(writer);

        Ok(count)
    }
}

#[async_trait::async_trait]
impl TimelineSink for JsonTimeline {
    async fn record(&self, event: ExecutionEvent) -> Result<()> {
        let record = Self::create_record(event);
        let json = serde_json::to_string(&record).context("Failed to serialize timeline record")?;

        let mut writer = self.writer.lock().expect("timeline lock poisoned");
        if let Some(ref mut file) = *writer {
            writeln!(file, "{}", json).context("Failed to write timeline record")?;
            file.flush().context("Failed to flush timeline file")?;
        }
        drop(writer);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{
        CodeBlockKind, CodeBlockMetadata, EnvironmentSnapshot, ExecutionActor, ExecutionContext,
        ExecutionEvent, ExecutionResult, ExecutionSource, PlotInfo,
    };

    fn create_test_event(
        event_id: &str,
        actor: ExecutionActor,
        source: ExecutionSource,
        created_at_ms: u64,
        has_plot: bool,
        has_error: bool,
        code: &str,
    ) -> ExecutionEvent {
        ExecutionEvent {
            event_id: event_id.into(),
            context: ExecutionContext {
                source,
                document_path: Some("test.R".into()),
                cell_index: Some(0),
                triggered_at_ms: created_at_ms,
                actor,
            },
            blocks: vec![CodeBlockMetadata {
                id: "block-1".into(),
                index: 0,
                kind: CodeBlockKind::Section,
                label: Some("Test".into()),
                start_line: 1,
                end_line: 2,
                code: code.into(),
            }],
            result: ExecutionResult {
                success: !has_error,
                output: "test output".into(),
                error: if has_error {
                    Some("test error".into())
                } else {
                    None
                },
                plots: if has_plot {
                    vec![PlotInfo {
                        filename: "plot.png".into(),
                        base64_data: "data".into(),
                        index: 0,
                    }]
                } else {
                    vec![]
                },
                execution_time_ms: 100,
            },
            environment: EnvironmentSnapshot {
                r_path: "Rscript".into(),
                working_dir: "/tmp".into(),
                temp_dir: "/tmp/reprod".into(),
            },
            created_at_ms,
        }
    }

    #[tokio::test]
    async fn test_json_record_and_retrieve() {
        let timeline = JsonTimeline::new_in_memory().expect("create timeline");

        let event = create_test_event(
            "evt-1",
            ExecutionActor::User,
            ExecutionSource::Cell,
            1000,
            false,
            false,
            "print('hello')",
        );

        timeline.record(event.clone()).await.expect("record event");

        let response = timeline
            .query(TimelineQuery::default())
            .expect("query events");

        assert_eq!(response.events.len(), 1);
        assert_eq!(response.total, 1);
        assert_eq!(response.events[0].event_id, "evt-1");
    }

    #[tokio::test]
    async fn test_json_filter_by_actor() {
        let timeline = JsonTimeline::new_in_memory().expect("create timeline");

        timeline
            .record(create_test_event(
                "evt-user",
                ExecutionActor::User,
                ExecutionSource::Cell,
                1000,
                false,
                false,
                "user code",
            ))
            .await
            .expect("record user event");

        timeline
            .record(create_test_event(
                "evt-ai",
                ExecutionActor::Ai,
                ExecutionSource::Cell,
                2000,
                false,
                false,
                "ai code",
            ))
            .await
            .expect("record ai event");

        let query = TimelineQuery {
            filters: Some(TimelineFilters {
                actor: Some(ExecutionActor::User),
                ..Default::default()
            }),
            ..Default::default()
        };

        let response = timeline.query(query).expect("query by actor");

        assert_eq!(response.events.len(), 1);
        assert_eq!(response.events[0].event_id, "evt-user");
    }

    #[tokio::test]
    async fn test_json_pagination() {
        let timeline = JsonTimeline::new_in_memory().expect("create timeline");

        // Insert 10 events
        for i in 0..10 {
            timeline
                .record(create_test_event(
                    &format!("evt-{}", i),
                    ExecutionActor::User,
                    ExecutionSource::Cell,
                    (i + 1) * 1000,
                    false,
                    false,
                    &format!("code {}", i),
                ))
                .await
                .expect("record event");
        }

        // First page
        let query1 = TimelineQuery {
            limit: Some(3),
            offset: Some(0),
            sort: Some(SortOrder::Desc),
            ..Default::default()
        };

        let response1 = timeline.query(query1).expect("query page 1");

        assert_eq!(response1.events.len(), 3);
        assert_eq!(response1.total, 10);
        assert!(response1.has_more);
        assert_eq!(response1.events[0].event_id, "evt-9");
    }

    #[tokio::test]
    async fn test_json_stats() {
        let timeline = JsonTimeline::new_in_memory().expect("create timeline");

        timeline
            .record(create_test_event(
                "evt-1",
                ExecutionActor::User,
                ExecutionSource::Cell,
                1000,
                true,
                false,
                "code 1",
            ))
            .await
            .expect("record event 1");

        timeline
            .record(create_test_event(
                "evt-2",
                ExecutionActor::Ai,
                ExecutionSource::Cell,
                2000,
                false,
                true,
                "code 2",
            ))
            .await
            .expect("record event 2");

        timeline
            .record(create_test_event(
                "evt-3",
                ExecutionActor::User,
                ExecutionSource::Cell,
                3000,
                true,
                false,
                "code 3",
            ))
            .await
            .expect("record event 3");

        let stats = timeline.stats().expect("get stats");

        assert_eq!(stats.total_events, 3);
        assert_eq!(stats.total_plots, 2);
        assert_eq!(stats.total_errors, 1);
        assert_eq!(stats.user_actions, 2);
        assert_eq!(stats.ai_actions, 1);
        assert_eq!(stats.session_start_time, 1000);
        assert_eq!(stats.session_end_time, 3000);
        assert_eq!(stats.session_duration, 2000);
    }

    #[tokio::test]
    async fn test_json_code_search() {
        let timeline = JsonTimeline::new_in_memory().expect("create timeline");

        timeline
            .record(create_test_event(
                "evt-1",
                ExecutionActor::User,
                ExecutionSource::Cell,
                1000,
                false,
                false,
                "x <- 1:10",
            ))
            .await
            .expect("record event 1");

        timeline
            .record(create_test_event(
                "evt-2",
                ExecutionActor::User,
                ExecutionSource::Cell,
                2000,
                false,
                false,
                "y <- 20:30",
            ))
            .await
            .expect("record event 2");

        let query = TimelineQuery {
            filters: Some(TimelineFilters {
                code_contains: Some("1:10".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };

        let response = timeline.query(query).expect("query by code");

        assert_eq!(response.events.len(), 1);
        assert_eq!(response.events[0].event_id, "evt-1");
    }
}
