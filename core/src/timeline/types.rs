use crate::protocol::{ExecutionActor, ExecutionEvent, ExecutionSource};
use std::sync::{Arc, Mutex};

/// Trait for recording execution events to a timeline
#[async_trait::async_trait]
pub trait TimelineSink: Send + Sync {
    async fn record(&self, event: ExecutionEvent) -> anyhow::Result<()>;
}

/// Query parameters for timeline events
#[derive(Debug, Clone, Default)]
pub struct TimelineQuery {
    pub filters: Option<TimelineFilters>,
    pub sort: Option<SortOrder>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// Filters for timeline queries
#[derive(Debug, Clone, Default)]
pub struct TimelineFilters {
    pub actor: Option<ExecutionActor>,
    pub source: Option<ExecutionSource>,
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
    pub has_plots: Option<bool>,
    pub has_errors: Option<bool>,
    pub code_contains: Option<String>,
}

/// Sort order for timeline queries
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SortOrder {
    Asc,
    #[default]
    Desc,
}

/// Response with pagination metadata
#[derive(Debug, Clone)]
pub struct TimelineResponse {
    pub events: Vec<ExecutionEvent>,
    pub total: u32,
    pub has_more: bool,
    pub query: TimelineQuery,
}

/// Timeline statistics
#[derive(Debug, Clone)]
pub struct TimelineStats {
    pub total_events: u32,
    pub total_plots: u32,
    pub total_errors: u32,
    pub user_actions: u32,
    pub ai_actions: u32,
    pub session_start_time: u64,
    pub session_end_time: u64,
    pub session_duration: u64,
}

/// No-op implementation used until the timeline service is wired.
pub struct NoopTimeline;

#[async_trait::async_trait]
impl TimelineSink for NoopTimeline {
    async fn record(&self, _event: ExecutionEvent) -> anyhow::Result<()> {
        Ok(())
    }
}

/// In-memory timeline recorder for tests.
#[derive(Clone, Default)]
pub struct InMemoryTimeline {
    events: Arc<Mutex<Vec<ExecutionEvent>>>,
}

impl InMemoryTimeline {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn events(&self) -> Vec<ExecutionEvent> {
        self.events.lock().expect("timeline lock poisoned").clone()
    }
}

#[async_trait::async_trait]
impl TimelineSink for InMemoryTimeline {
    async fn record(&self, event: ExecutionEvent) -> anyhow::Result<()> {
        self.events
            .lock()
            .expect("timeline lock poisoned")
            .push(event);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{
        CodeBlockKind, CodeBlockMetadata, EnvironmentSnapshot, ExecutionActor, ExecutionContext,
        ExecutionEvent, ExecutionResult, ExecutionSource, PlotInfo, RunStatus,
    };

    #[tokio::test]
    async fn stores_events_in_memory() {
        let timeline = InMemoryTimeline::new();

        let event = ExecutionEvent {
            event_id: "evt-test".into(),
            context: ExecutionContext {
                source: ExecutionSource::Cell,
                document_path: Some("analysis.R".into()),
                cell_index: Some(1),
                triggered_at_ms: 1,
                actor: ExecutionActor::User,
            },
            blocks: vec![CodeBlockMetadata {
                id: "block-1".into(),
                index: 0,
                kind: CodeBlockKind::Section,
                label: Some("Section".into()),
                start_line: 1,
                end_line: 3,
                code: "# Section ----\nprint('test')".into(),
            }],
            result: ExecutionResult {
                success: true,
                output: "ok".into(),
                error: None,
                plots: vec![PlotInfo {
                    id: "plot-1".into(),
                    filename: "plot.png".into(),
                    base64_data: "ZGF0YQ==".into(),
                    index: 1,
                    width: None,
                    height: None,
                    timestamp: None,
                    code: None,
                    storage_path: None,
                    snapshot_path: None,
                }],
                execution_time_ms: 10,
            },
            environment: EnvironmentSnapshot {
                r_version: None,
                r_path: "Rscript".into(),
                working_dir: "/tmp".into(),
                temp_dir: "/tmp/reprod".into(),
            },
            created_at_ms: 2,
            status: RunStatus::Succeeded,
            started_at_ms: 1,
            finished_at_ms: Some(2),
            duration_ms: Some(1),
        };

        timeline
            .record(event.clone())
            .await
            .expect("record timeline");

        let events = timeline.events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0], event);
    }
}
