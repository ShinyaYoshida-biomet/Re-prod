use reprod_core::executor::timeline::JsonTimeline;
use reprod_core::executor::RExecutor;
use reprod_core::protocol::{
    CodeBlockKind, CodeBlockMetadata, ExecutionActor, ExecutionContext, ExecutionRequest,
    ExecutionSource,
};
use std::sync::Arc;
use tempfile::TempDir;

/// Helper to create a test execution request
fn create_execution_request(code: &str, actor: ExecutionActor) -> ExecutionRequest {
    ExecutionRequest {
        code: code.to_string(),
        context: ExecutionContext {
            source: ExecutionSource::Cell,
            document_path: Some("test.R".to_string()),
            cell_index: Some(1),
            triggered_at_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            actor,
        },
        blocks: vec![CodeBlockMetadata {
            id: "block-1".to_string(),
            index: 0,
            kind: CodeBlockKind::Section,
            label: Some("Test".to_string()),
            start_line: 1,
            end_line: 1,
            code: code.to_string(),
        }],
        plot_width: None,
        plot_height: None,
    }
}

#[tokio::test]
async fn test_r_execution_adds_event_to_timeline() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    // Create timeline
    let timeline = JsonTimeline::new(timeline_file.clone()).unwrap();
    let timeline_arc = Arc::new(timeline);

    // Create R executor with timeline
    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Execute simple R code
    let request = create_execution_request("x <- 1 + 1", ExecutionActor::User);
    let result = executor.execute_with_event(request).await;

    assert!(result.is_ok(), "Execution should succeed");
    let (exec_result, event) = result.unwrap();

    // Verify execution succeeded
    assert!(exec_result.success, "R execution should succeed");

    // Verify event was created
    assert!(!event.event_id.is_empty(), "Event should have an ID");
    assert_eq!(
        event.context.actor,
        ExecutionActor::User,
        "Actor should be User"
    );
    assert_eq!(
        event.context.source,
        ExecutionSource::Cell,
        "Source should be Cell"
    );

    // Query timeline to verify event was stored
    let query_result = timeline_arc
        .query(reprod_core::executor::timeline::TimelineQuery {
            filters: None,
            sort: None,
            limit: Some(10),
            offset: Some(0),
        })
        .unwrap();

    assert_eq!(
        query_result.events.len(),
        1,
        "Timeline should contain one event"
    );
    assert_eq!(
        query_result.events[0].event_id, event.event_id,
        "Event IDs should match"
    );
}

#[tokio::test]
async fn test_multiple_executions_create_multiple_events() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Execute multiple R commands
    for i in 1..=3 {
        let request = create_execution_request(
            &format!("x{} <- {}", i, i),
            if i % 2 == 0 {
                ExecutionActor::Ai
            } else {
                ExecutionActor::User
            },
        );
        let result = executor.execute_with_event(request).await;
        assert!(result.is_ok(), "Execution {} should succeed", i);
    }

    // Query all events
    let query_result = timeline_arc
        .query(reprod_core::executor::timeline::TimelineQuery {
            filters: None,
            sort: None,
            limit: Some(10),
            offset: Some(0),
        })
        .unwrap();

    assert_eq!(
        query_result.events.len(),
        3,
        "Timeline should contain three events"
    );
}

#[tokio::test]
async fn test_timeline_filters_by_actor() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Execute with different actors
    let user_request = create_execution_request("user_code <- 1", ExecutionActor::User);
    executor.execute_with_event(user_request).await.unwrap();

    let ai_request = create_execution_request("ai_code <- 2", ExecutionActor::Ai);
    executor.execute_with_event(ai_request).await.unwrap();

    let user_request2 = create_execution_request("user_code2 <- 3", ExecutionActor::User);
    executor.execute_with_event(user_request2).await.unwrap();

    // Query for user events only
    let query_result = timeline_arc
        .query(reprod_core::executor::timeline::TimelineQuery {
            filters: Some(reprod_core::executor::timeline::TimelineFilters {
                actor: Some(ExecutionActor::User),
                source: None,
                start_time: None,
                end_time: None,
                has_plots: None,
                has_errors: None,
                code_contains: None,
            }),
            sort: None,
            limit: Some(10),
            offset: Some(0),
        })
        .unwrap();

    assert_eq!(query_result.events.len(), 2, "Should find 2 user events");
    assert!(
        query_result
            .events
            .iter()
            .all(|e| e.context.actor == ExecutionActor::User),
        "All events should be from User"
    );

    // Query for AI events only
    let ai_query_result = timeline_arc
        .query(reprod_core::executor::timeline::TimelineQuery {
            filters: Some(reprod_core::executor::timeline::TimelineFilters {
                actor: Some(ExecutionActor::Ai),
                source: None,
                start_time: None,
                end_time: None,
                has_plots: None,
                has_errors: None,
                code_contains: None,
            }),
            sort: None,
            limit: Some(10),
            offset: Some(0),
        })
        .unwrap();

    assert_eq!(ai_query_result.events.len(), 1, "Should find 1 AI event");
}

#[tokio::test]
async fn test_timeline_filters_by_code_content() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Execute different R commands
    let requests = vec![
        "library(ggplot2)",
        "x <- 1:10",
        "plot(x, y)",
        "result <- ggplot(data, aes(x, y))",
    ];

    for code in requests {
        let request = create_execution_request(code, ExecutionActor::User);
        executor.execute_with_event(request).await.unwrap();
    }

    // Query for ggplot-related code
    let query_result = timeline_arc
        .query(reprod_core::executor::timeline::TimelineQuery {
            filters: Some(reprod_core::executor::timeline::TimelineFilters {
                actor: None,
                source: None,
                start_time: None,
                end_time: None,
                has_plots: None,
                has_errors: None,
                code_contains: Some("ggplot".to_string()),
            }),
            sort: None,
            limit: Some(10),
            offset: Some(0),
        })
        .unwrap();

    assert_eq!(
        query_result.events.len(),
        2,
        "Should find 2 events containing 'ggplot'"
    );
}

#[tokio::test]
async fn test_timeline_sorting() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Execute multiple commands with slight delays
    for i in 1..=3 {
        let request = create_execution_request(&format!("x{} <- {}", i, i), ExecutionActor::User);
        executor.execute_with_event(request).await.unwrap();
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
    }

    // Query with ascending order
    let asc_result = timeline_arc
        .query(reprod_core::executor::timeline::TimelineQuery {
            filters: None,
            sort: Some(reprod_core::executor::timeline::SortOrder::Asc),
            limit: Some(10),
            offset: Some(0),
        })
        .unwrap();

    assert_eq!(asc_result.events.len(), 3);

    // Verify ascending order (oldest first)
    for i in 0..asc_result.events.len() - 1 {
        assert!(
            asc_result.events[i].created_at_ms <= asc_result.events[i + 1].created_at_ms,
            "Events should be in ascending order"
        );
    }

    // Query with descending order
    let desc_result = timeline_arc
        .query(reprod_core::executor::timeline::TimelineQuery {
            filters: None,
            sort: Some(reprod_core::executor::timeline::SortOrder::Desc),
            limit: Some(10),
            offset: Some(0),
        })
        .unwrap();

    assert_eq!(desc_result.events.len(), 3);

    // Verify descending order (newest first)
    for i in 0..desc_result.events.len() - 1 {
        assert!(
            desc_result.events[i].created_at_ms >= desc_result.events[i + 1].created_at_ms,
            "Events should be in descending order"
        );
    }
}

#[tokio::test]
async fn test_timeline_pagination() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Create 5 events
    for i in 1..=5 {
        let request = create_execution_request(&format!("x{} <- {}", i, i), ExecutionActor::User);
        executor.execute_with_event(request).await.unwrap();
    }

    // First page (limit 2)
    let page1 = timeline_arc
        .query(reprod_core::executor::timeline::TimelineQuery {
            filters: None,
            sort: Some(reprod_core::executor::timeline::SortOrder::Desc),
            limit: Some(2),
            offset: Some(0),
        })
        .unwrap();

    assert_eq!(page1.events.len(), 2, "First page should have 2 events");
    assert_eq!(page1.total, 5, "Total should be 5");
    assert!(page1.has_more, "Should have more events");

    // Second page (limit 2, offset 2)
    let page2 = timeline_arc
        .query(reprod_core::executor::timeline::TimelineQuery {
            filters: None,
            sort: Some(reprod_core::executor::timeline::SortOrder::Desc),
            limit: Some(2),
            offset: Some(2),
        })
        .unwrap();

    assert_eq!(page2.events.len(), 2, "Second page should have 2 events");
    assert_eq!(page2.total, 5, "Total should still be 5");
    assert!(page2.has_more, "Should still have more events");

    // Third page (limit 2, offset 4)
    let page3 = timeline_arc
        .query(reprod_core::executor::timeline::TimelineQuery {
            filters: None,
            sort: Some(reprod_core::executor::timeline::SortOrder::Desc),
            limit: Some(2),
            offset: Some(4),
        })
        .unwrap();

    assert_eq!(page3.events.len(), 1, "Third page should have 1 event");
    assert_eq!(page3.total, 5, "Total should still be 5");
    assert!(!page3.has_more, "Should not have more events");
}

#[tokio::test]
async fn test_timeline_stats() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Execute various commands
    let user_request1 = create_execution_request("x <- 1", ExecutionActor::User);
    executor.execute_with_event(user_request1).await.unwrap();

    let ai_request = create_execution_request("y <- 2", ExecutionActor::Ai);
    executor.execute_with_event(ai_request).await.unwrap();

    let user_request2 = create_execution_request("z <- 3", ExecutionActor::User);
    executor.execute_with_event(user_request2).await.unwrap();

    // Get stats
    let stats = timeline_arc.stats().unwrap();

    assert_eq!(stats.total_events, 3, "Should have 3 total events");
    assert_eq!(stats.user_actions, 2, "Should have 2 user actions");
    assert_eq!(stats.ai_actions, 1, "Should have 1 AI action");
    assert!(
        stats.session_duration > 0,
        "Session duration should be positive"
    );
    assert!(
        stats.session_start_time <= stats.session_end_time,
        "Start time should be before or equal to end time"
    );
}

#[tokio::test]
async fn test_timeline_persistence_across_instances() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    // First instance - write events
    {
        let timeline = JsonTimeline::new(timeline_file.clone()).unwrap();
        let timeline_arc = Arc::new(timeline);

        let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
            .with_shared_timeline(timeline_arc.clone())
            .build();

        let request = create_execution_request("x <- 1", ExecutionActor::User);
        executor.execute_with_event(request).await.unwrap();
    }

    // Second instance - read events
    {
        let timeline = JsonTimeline::new(timeline_file.clone()).unwrap();
        let query_result = timeline
            .query(reprod_core::executor::timeline::TimelineQuery {
                filters: None,
                sort: None,
                limit: Some(10),
                offset: Some(0),
            })
            .unwrap();

        assert_eq!(
            query_result.events.len(),
            1,
            "Should read previously written event"
        );
    }
}

#[tokio::test]
async fn test_timeline_handles_execution_errors() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Execute code that will cause an error
    let error_request = create_execution_request("stop('intentional error')", ExecutionActor::User);
    let result = executor.execute_with_event(error_request).await;

    assert!(
        result.is_ok(),
        "Execution should return result even on error"
    );
    let (exec_result, _event) = result.unwrap();

    // Verify error was captured
    assert!(!exec_result.success, "Execution should not succeed");
    assert!(
        exec_result.error.is_some(),
        "Error message should be present"
    );

    // Query for events with errors
    let query_result = timeline_arc
        .query(reprod_core::executor::timeline::TimelineQuery {
            filters: Some(reprod_core::executor::timeline::TimelineFilters {
                actor: None,
                source: None,
                start_time: None,
                end_time: None,
                has_plots: None,
                has_errors: Some(true),
                code_contains: None,
            }),
            sort: None,
            limit: Some(10),
            offset: Some(0),
        })
        .unwrap();

    assert_eq!(
        query_result.events.len(),
        1,
        "Should find 1 event with error"
    );
}
