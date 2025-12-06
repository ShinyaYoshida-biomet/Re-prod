use flate2::read::GzDecoder;
use reprod_core::export::BundleWriter;
use reprod_core::export::ReproductionBundle;
use reprod_core::protocol::{
    CodeBlockKind, CodeBlockMetadata, EnvironmentSnapshot, ExecutionActor, ExecutionContext,
    ExecutionEvent, ExecutionResult, ExecutionSource, PlotInfo,
};
use std::fs::File;
use std::io::Read;

/// Create a realistic execution event for testing.
fn create_test_event(
    event_id: &str,
    document: &str,
    code: &str,
    actor: ExecutionActor,
    has_plot: bool,
    has_error: bool,
    timestamp: u64,
) -> ExecutionEvent {
    let plots = if has_plot {
        vec![PlotInfo {
            id: format!("{}-plot", event_id),
            filename: format!("{}_plot.png", event_id),
            // Small 1x1 red PNG
            base64_data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==".to_string(),
            index: 0,
            width: None,
            height: None,
            timestamp: Some(timestamp),
            code: Some(code.to_string()),
            storage_path: Some(format!(".reprod/plots/{}_plot.png", event_id)),
            snapshot_path: None,
        }]
    } else {
        vec![]
    };

    ExecutionEvent {
        event_id: event_id.to_string(),
        context: ExecutionContext {
            source: ExecutionSource::Cell,
            document_path: Some(document.to_string()),
            cell_index: Some(1),
            triggered_at_ms: timestamp,
            actor,
        },
        blocks: vec![CodeBlockMetadata {
            id: format!("{}-block", event_id),
            index: 0,
            kind: CodeBlockKind::Section,
            label: Some("Test Block".to_string()),
            start_line: 1,
            end_line: 3,
            code: code.to_string(),
        }],
        result: ExecutionResult {
            success: !has_error,
            output: if has_error {
                String::new()
            } else {
                "[1] Success".to_string()
            },
            error: if has_error {
                Some("Error: test error".to_string())
            } else {
                None
            },
            plots,
            execution_time_ms: 42,
        },
        environment: EnvironmentSnapshot {
            r_path: "Rscript".to_string(),
            working_dir: "/tmp/test-project".to_string(),
            temp_dir: "/tmp/reprod-test".to_string(),
        },
        created_at_ms: timestamp + 100,
    }
}

#[test]
fn test_full_export_workflow() {
    // Create a realistic timeline with multiple events
    let start_time = 1699200000000_u64;

    let events = vec![
        create_test_event(
            "evt-001",
            "analysis.R",
            "# Load data\ndata <- read.csv('input.csv')\nhead(data)",
            ExecutionActor::User,
            false,
            false,
            start_time,
        ),
        create_test_event(
            "evt-002",
            "analysis.R",
            "# Data summary\nsummary(data)",
            ExecutionActor::User,
            false,
            false,
            start_time + 1000,
        ),
        create_test_event(
            "evt-003",
            "plots.R",
            "# Create plot\nplot(data$x, data$y)\ntitle('Test Plot')",
            ExecutionActor::Ai,
            true,
            false,
            start_time + 2000,
        ),
        create_test_event(
            "evt-004",
            "models.R",
            "# Build model\nmodel <- lm(y ~ x, data = data)",
            ExecutionActor::User,
            false,
            false,
            start_time + 3000,
        ),
        create_test_event(
            "evt-005",
            "plots.R",
            "# Plot residuals\nplot(residuals(model))",
            ExecutionActor::Ai,
            true,
            false,
            start_time + 4000,
        ),
        create_test_event(
            "evt-006",
            "analysis.R",
            "# This will fail\nstop('test error')",
            ExecutionActor::User,
            false,
            true,
            start_time + 5000,
        ),
    ];

    // Create bundle
    let bundle = ReproductionBundle::from_events(events);

    // Verify bundle metadata
    assert_eq!(bundle.metadata.session.total_events, 6);
    assert_eq!(bundle.metadata.statistics.total_executions, 6);
    assert_eq!(bundle.metadata.statistics.user_actions, 4);
    assert_eq!(bundle.metadata.statistics.ai_actions, 2);
    assert_eq!(bundle.metadata.statistics.total_plots, 2);
    assert_eq!(bundle.metadata.statistics.total_errors, 1);
    assert_eq!(bundle.metadata.statistics.unique_documents, 3);

    // Validate bundle
    let validation = bundle.validate();
    assert!(
        validation.valid,
        "Bundle validation failed: {:?}",
        validation.errors
    );

    // Write to tarball
    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join("integration-test-bundle.tar.gz");

    let writer = BundleWriter::new(bundle);
    let write_result = writer.write_tarball(&output_path);
    assert!(
        write_result.is_ok(),
        "Failed to write bundle: {:?}",
        write_result.err()
    );

    // Verify file exists and has content
    assert!(output_path.exists());
    let file_size = std::fs::metadata(&output_path).unwrap().len();
    assert!(
        file_size > 1000,
        "Bundle file is too small: {} bytes",
        file_size
    );

    // Extract and verify contents
    let file = File::open(&output_path).unwrap();
    let decoder = GzDecoder::new(file);
    let mut archive = tar::Archive::new(decoder);

    let mut found_files = std::collections::HashSet::new();
    let mut metadata_content = String::new();
    let mut timeline_content = String::new();

    for entry in archive.entries().unwrap() {
        let mut entry = entry.unwrap();
        let path = entry.path().unwrap().to_string_lossy().to_string();
        found_files.insert(path.clone());

        // Read specific files
        if path == "metadata.json" {
            entry.read_to_string(&mut metadata_content).unwrap();
        } else if path == "timeline.json" {
            entry.read_to_string(&mut timeline_content).unwrap();
        }
    }

    // Verify required files exist
    assert!(
        found_files.contains("metadata.json"),
        "Missing metadata.json"
    );
    assert!(
        found_files.contains("timeline.json"),
        "Missing timeline.json"
    );
    assert!(found_files.contains("README.md"), "Missing README.md");
    assert!(found_files.contains("validate.sh"), "Missing validate.sh");
    assert!(found_files.contains("replay.R"), "Missing replay.R");

    // Verify code files
    assert!(
        found_files.contains("code/analysis.R"),
        "Missing code/analysis.R"
    );
    assert!(found_files.contains("code/plots.R"), "Missing code/plots.R");
    assert!(
        found_files.contains("code/models.R"),
        "Missing code/models.R"
    );

    // Verify plot files
    assert!(
        found_files.iter().any(|f| f.starts_with("plots/")),
        "No plot files found"
    );

    // Parse and verify metadata JSON
    let metadata: serde_json::Value =
        serde_json::from_str(&metadata_content).expect("Failed to parse metadata.json");

    assert_eq!(metadata["format_version"], "1.0");
    assert_eq!(metadata["session"]["total_events"], 6);
    assert_eq!(metadata["statistics"]["user_actions"], 4);
    assert_eq!(metadata["statistics"]["ai_actions"], 2);
    assert_eq!(metadata["statistics"]["total_plots"], 2);
    assert_eq!(metadata["statistics"]["total_errors"], 1);

    // Parse and verify timeline JSON
    let timeline: serde_json::Value =
        serde_json::from_str(&timeline_content).expect("Failed to parse timeline.json");

    assert_eq!(timeline["format_version"], "1.0");
    let events_array = timeline["events"].as_array().unwrap();
    assert_eq!(events_array.len(), 6);

    // Verify first event structure
    let first_event = &events_array[0];
    assert_eq!(first_event["event_id"], "evt-001");
    assert_eq!(first_event["context"]["actor"], "user");
    assert_eq!(first_event["context"]["document_path"], "analysis.R");

    // Cleanup
    std::fs::remove_file(output_path).ok();

    println!("✓ Integration test passed!");
    println!("  - Created bundle with 6 events");
    println!("  - Verified metadata structure");
    println!("  - Verified timeline structure");
    println!("  - Verified all required files in tarball");
}

#[test]
fn test_empty_bundle_export() {
    // Test that we can export an empty bundle
    let bundle = ReproductionBundle::from_events(vec![]);

    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join("empty-bundle-test.tar.gz");

    let writer = BundleWriter::new(bundle);
    let result = writer.write_tarball(&output_path);

    assert!(result.is_ok(), "Failed to write empty bundle");

    // Verify file exists
    assert!(output_path.exists());

    // Cleanup
    std::fs::remove_file(output_path).ok();
}

#[test]
fn test_bundle_with_large_session() {
    // Test with a larger number of events
    let start_time = 1699200000000_u64;
    let mut events = Vec::new();

    for i in 0..100 {
        events.push(create_test_event(
            &format!("evt-{:03}", i),
            "large-analysis.R",
            &format!("x <- {}", i),
            if i % 2 == 0 {
                ExecutionActor::User
            } else {
                ExecutionActor::Ai
            },
            i % 10 == 0, // Plot every 10th event
            i % 20 == 0, // Error every 20th event
            start_time + (i as u64 * 1000),
        ));
    }

    let bundle = ReproductionBundle::from_events(events);

    assert_eq!(bundle.metadata.session.total_events, 100);
    assert_eq!(bundle.metadata.statistics.user_actions, 50);
    assert_eq!(bundle.metadata.statistics.ai_actions, 50);
    assert_eq!(bundle.metadata.statistics.total_plots, 10);
    assert_eq!(bundle.metadata.statistics.total_errors, 5);

    // Write bundle
    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join("large-bundle-test.tar.gz");

    let writer = BundleWriter::new(bundle);
    let result = writer.write_tarball(&output_path);

    assert!(result.is_ok(), "Failed to write large bundle");

    // Cleanup
    std::fs::remove_file(output_path).ok();
}
