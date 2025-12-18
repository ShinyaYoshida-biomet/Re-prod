use crate::protocol::{ExecutionEvent, RunStatus};
use crate::timeline::{
    JsonTimeline, SortOrder, TimelineQuery, TimelineResponse, TimelineSink, TimelineStats,
};
use anyhow::Result;
use async_trait::async_trait;
use std::sync::Arc;

/// Abstraction over execution/run persistence.
#[async_trait]
pub trait ExecutionRepository: Send + Sync {
    async fn create_run(&self, event: ExecutionEvent) -> Result<ExecutionEvent>;
    async fn finish_run(&self, event: ExecutionEvent) -> Result<ExecutionEvent>;
    async fn latest_runs(&self, limit: usize) -> Result<Vec<ExecutionEvent>>;
    async fn get_run(&self, event_id: &str) -> Result<Option<ExecutionEvent>>;
    async fn query(&self, query: TimelineQuery) -> Result<TimelineResponse>;
    async fn stats(&self) -> Result<TimelineStats>;
    async fn reset(&self) -> Result<usize>;
}

/// Timeline-backed execution repository.
pub struct TimelineExecutionRepository {
    timeline: Arc<JsonTimeline>,
}

impl TimelineExecutionRepository {
    pub fn new(timeline: Arc<JsonTimeline>) -> Self {
        Self { timeline }
    }

    fn with_duration(mut event: ExecutionEvent) -> ExecutionEvent {
        if let Some(finished_at_ms) = event.finished_at_ms {
            event.duration_ms = Some(finished_at_ms.saturating_sub(event.started_at_ms));
        }
        event
    }
}

#[async_trait]
impl ExecutionRepository for TimelineExecutionRepository {
    async fn create_run(&self, event: ExecutionEvent) -> Result<ExecutionEvent> {
        self.timeline.record(event.clone()).await?;
        Ok(event)
    }

    async fn finish_run(&self, event: ExecutionEvent) -> Result<ExecutionEvent> {
        let mut event = Self::with_duration(event);

        // Ensure status is set for legacy data paths that never mutated it.
        if matches!(event.status, RunStatus::Succeeded | RunStatus::Failed) {
            // already terminal
        } else {
            event.status = if event.result.success {
                RunStatus::Succeeded
            } else {
                RunStatus::Failed
            };
        }

        self.timeline.update(event.clone())?;
        Ok(event)
    }

    async fn latest_runs(&self, limit: usize) -> Result<Vec<ExecutionEvent>> {
        let response = self.timeline.query(TimelineQuery {
            filters: None,
            sort: Some(SortOrder::Desc),
            limit: Some(limit as u32),
            offset: None,
        })?;
        Ok(response.events)
    }

    async fn get_run(&self, event_id: &str) -> Result<Option<ExecutionEvent>> {
        self.timeline.get(event_id)
    }

    async fn query(&self, query: TimelineQuery) -> Result<TimelineResponse> {
        self.timeline.query(query)
    }

    async fn stats(&self) -> Result<TimelineStats> {
        self.timeline.stats()
    }

    async fn reset(&self) -> Result<usize> {
        self.timeline.reset()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{
        CodeBlockKind, CodeBlockMetadata, EnvironmentSnapshot, ExecutionActor, ExecutionContext,
        ExecutionResult, ExecutionSource, PlotInfo,
    };
    use std::path::PathBuf;
    use tempfile::tempdir;

    fn create_test_event(event_id: &str, status: RunStatus) -> ExecutionEvent {
        let created_at_ms = 1_700_000_000_000;
        ExecutionEvent {
            event_id: event_id.into(),
            context: ExecutionContext {
                source: ExecutionSource::Cell,
                document_path: Some("test.R".into()),
                cell_index: Some(0),
                triggered_at_ms: created_at_ms,
                actor: ExecutionActor::User,
            },
            blocks: vec![CodeBlockMetadata {
                id: "block-1".into(),
                index: 0,
                kind: CodeBlockKind::Section,
                label: Some("Test".into()),
                start_line: 1,
                end_line: 2,
                code: "x <- 1".into(),
            }],
            result: ExecutionResult {
                success: matches!(status, RunStatus::Succeeded),
                output: "output".into(),
                error: if matches!(status, RunStatus::Failed) {
                    Some("failed".into())
                } else {
                    None
                },
                plots: vec![PlotInfo {
                    id: "plot".into(),
                    filename: "plot.png".into(),
                    base64_data: "data".into(),
                    index: 0,
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
                r_path: "Rscript".into(),
                working_dir: "/tmp".into(),
                temp_dir: "/tmp/reprod".into(),
            },
            created_at_ms,
            status,
            started_at_ms: created_at_ms,
            finished_at_ms: Some(created_at_ms + 50),
            duration_ms: Some(50),
        }
    }

    fn setup_repo() -> (TimelineExecutionRepository, tempfile::TempDir) {
        let dir = tempdir().expect("tempdir");
        let path = PathBuf::from(dir.path()).join("timeline.ndjson");
        let timeline = JsonTimeline::new(path).expect("timeline");
        (TimelineExecutionRepository::new(Arc::new(timeline)), dir)
    }

    #[tokio::test]
    async fn writes_and_reads_runs() {
        let (repo, _dir) = setup_repo();
        let running = create_test_event("run-1", RunStatus::Running);
        repo.create_run(running.clone()).await.unwrap();

        let fetched = repo.get_run("run-1").await.unwrap();
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().event_id, "run-1");

        let mut finished = running.clone();
        finished.status = RunStatus::Succeeded;
        finished.finished_at_ms = Some(running.started_at_ms + 25);
        finished.result.success = true;
        let finished = repo.finish_run(finished).await.unwrap();
        assert_eq!(finished.duration_ms, Some(25));

        let latest = repo.latest_runs(10).await.unwrap();
        assert_eq!(latest.len(), 1);
        assert_eq!(latest[0].status, RunStatus::Succeeded);
    }

    #[tokio::test]
    async fn reset_clears_runs() {
        let (repo, _dir) = setup_repo();
        repo.create_run(create_test_event("run-1", RunStatus::Running))
            .await
            .unwrap();
        let cleared = repo.reset().await.unwrap();
        assert_eq!(cleared, 1);
        let latest = repo.latest_runs(10).await.unwrap();
        assert!(latest.is_empty());
    }
}
