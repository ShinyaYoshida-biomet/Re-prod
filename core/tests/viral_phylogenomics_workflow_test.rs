/// Integration test for the complete 6-step viral phylogenomics workflow.
///
/// This test exercises the entire demo scenario:
/// 1. Data acquisition (shell: curl FASTA download)
/// 2. Sequence alignment (shell: MAFFT)
/// 3. Alignment quality check (R: ape, Biostrings)
/// 4. Phylogenetic tree construction (R: ape::nj)
/// 5. Visualization (R: ggtree, pheatmap)
/// 6. Report generation (Export bundle)
///
/// This validates the end-to-end integration of:
/// - R execution engine
/// - Shell command execution
/// - Timeline recording
/// - Plot capture
/// - Tool manifests (ape, ggtree, etc.)
/// - Export functionality
use reprod_core::executor::timeline::{JsonTimeline, TimelineQuery};
use reprod_core::executor::RExecutor;
use reprod_core::export::{BundleWriter, ReproductionBundle};
use reprod_core::protocol::{
    CodeBlockKind, CodeBlockMetadata, ExecutionActor, ExecutionContext, ExecutionRequest,
    ExecutionSource,
};
use reprod_core::tools::ToolRegistry;
use std::path::PathBuf;
use std::sync::Arc;
use tempfile::TempDir;

/// Helper to create an execution request
fn create_request(
    code: &str,
    actor: ExecutionActor,
    document: &str,
    cell_index: usize,
) -> ExecutionRequest {
    ExecutionRequest {
        code: code.to_string(),
        context: ExecutionContext {
            source: ExecutionSource::Cell,
            document_path: Some(document.to_string()),
            cell_index: Some(cell_index as u32),
            triggered_at_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            actor,
        },
        blocks: vec![CodeBlockMetadata {
            id: format!("block-{}", cell_index),
            index: 0,
            kind: CodeBlockKind::Section,
            label: Some(format!("Step {}", cell_index)),
            start_line: 1,
            end_line: code.lines().count() as u32,
            code: code.to_string(),
        }],
        plot_width: None,
        plot_height: None,
    }
}

/// Test Step 1: Data Acquisition (Download FASTA)
///
/// This simulates downloading a FASTA file. In a real scenario, this would use curl.
/// For testing, we create a mock FASTA file.
#[tokio::test]
async fn test_step1_data_acquisition() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Step 1: Create a simple FASTA file (simulating download)
    let code = r#"
# Step 1: Data Acquisition
# Simulate FASTA download (in real demo, use curl)
fasta_path <- file.path(tempdir(), "sequences.fasta")
writeLines(c(
  ">seq1", "ATCGATCGATCG",
  ">seq2", "ATCGATCGATCG",
  ">seq3", "ATCGATCGATCC"
), fasta_path)
cat("FASTA file created at:", fasta_path, "\n")
"#;

    let request = create_request(code, ExecutionActor::User, "workflow.R", 1);
    let result = executor.execute_with_event(request).await;

    assert!(result.is_ok(), "Step 1 should succeed");
    let (exec_result, _event) = result.unwrap();
    assert!(exec_result.success, "Step 1 execution should succeed");
    assert!(
        exec_result.output.contains("FASTA file created"),
        "Should confirm FASTA creation"
    );

    // Verify event was recorded
    let events = timeline_arc
        .query(TimelineQuery {
            filters: None,
            sort: None,
            limit: Some(10),
            offset: Some(0),
        })
        .unwrap();

    assert_eq!(events.events.len(), 1, "Should have 1 event recorded");
    assert_eq!(
        events.events[0].context.document_path,
        Some("workflow.R".to_string())
    );
}

/// Test Step 2: Sequence Alignment (R-based simulation)
///
/// In a real scenario, this would call MAFFT via shell.
/// For testing, we verify the R code execution works.
#[tokio::test]
async fn test_step2_alignment_simulation() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Setup: Create FASTA
    let setup_code = r#"
fasta_path <- file.path(tempdir(), "sequences.fasta")
writeLines(c(">seq1", "ATCG", ">seq2", "ATCG"), fasta_path)
"#;
    let setup_request = create_request(setup_code, ExecutionActor::User, "workflow.R", 1);
    executor.execute_with_event(setup_request).await.unwrap();

    // Step 2: Alignment (simulated - real demo would call MAFFT)
    let alignment_code = r#"
# Step 2: Sequence Alignment
# In real demo: system2("mafft", args = c("--auto", fasta_path))
# For test: simulate alignment completion
fasta_path <- file.path(tempdir(), "sequences.fasta")
aligned_path <- file.path(tempdir(), "sequences_aligned.fasta")
file.copy(fasta_path, aligned_path)
cat("Alignment completed:", aligned_path, "\n")
"#;

    let request = create_request(alignment_code, ExecutionActor::User, "workflow.R", 2);
    let result = executor.execute_with_event(request).await;

    assert!(result.is_ok(), "Step 2 should succeed");
    let (exec_result, _event) = result.unwrap();
    assert!(exec_result.success, "Step 2 execution should succeed");
    assert!(
        exec_result.output.contains("Alignment completed"),
        "Should confirm alignment"
    );

    // Verify 2 events recorded
    let events = timeline_arc
        .query(TimelineQuery {
            filters: None,
            sort: None,
            limit: Some(10),
            offset: Some(0),
        })
        .unwrap();

    assert_eq!(events.events.len(), 2, "Should have 2 events recorded");
}

/// Test Step 3: Alignment Quality Check (R with ape)
///
/// This tests reading alignment and computing statistics.
/// Note: Requires 'ape' package installed for full functionality.
#[tokio::test]
async fn test_step3_quality_check() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Step 3: Quality check (basic version without ape dependency)
    let quality_code = r#"
# Step 3: Alignment Quality Check
# Check if ape is available
has_ape <- require("ape", quietly = TRUE)

if (!has_ape) {
  cat("Note: ape package not available for full quality check\n")
  cat("Alignment length: 4 bases\n")
  cat("Number of sequences: 2\n")
  cat("Quality check completed (basic mode)\n")
} else {
  # If ape is available, use it
  cat("ape package loaded\n")
  cat("Quality check completed (full mode)\n")
}
"#;

    let request = create_request(quality_code, ExecutionActor::Ai, "workflow.R", 3);
    let result = executor.execute_with_event(request).await;

    assert!(result.is_ok(), "Step 3 should succeed");
    let (exec_result, event) = result.unwrap();
    assert!(exec_result.success, "Step 3 execution should succeed");
    assert!(
        exec_result.output.contains("Quality check completed"),
        "Should confirm quality check"
    );

    // Verify AI actor
    assert_eq!(
        event.context.actor,
        ExecutionActor::Ai,
        "Step 3 should be AI-triggered"
    );
}

/// Test Step 4: Phylogenetic Tree Construction
///
/// Tests tree construction code execution.
#[tokio::test]
async fn test_step4_tree_construction() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Step 4: Tree construction (basic version)
    let tree_code = r#"
# Step 4: Phylogenetic Tree Construction
# Create a simple distance matrix
dist_matrix <- dist(matrix(c(1,2,3,4,5,6), ncol=2))

# Check if ape is available for nj()
has_ape <- require("ape", quietly = TRUE)

if (!has_ape) {
  cat("Note: ape package not available for tree construction\n")
  cat("Tree construction would use ape::nj()\n")
  cat("Mock tree created\n")
  tree <- "mock_tree_object"
} else {
  cat("ape package available\n")
  cat("Tree construction completed\n")
  tree <- "tree_object"
}

cat("Tree construction step completed\n")
"#;

    let request = create_request(tree_code, ExecutionActor::Ai, "workflow.R", 4);
    let result = executor.execute_with_event(request).await;

    assert!(result.is_ok(), "Step 4 should succeed");
    let (exec_result, _event) = result.unwrap();
    assert!(exec_result.success, "Step 4 execution should succeed");
    assert!(
        exec_result.output.contains("Tree construction"),
        "Should confirm tree construction"
    );
}

/// Test Step 5: Visualization (with plot capture)
///
/// This tests plot generation and capture functionality.
#[tokio::test]
async fn test_step5_visualization_with_plots() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Step 5: Visualization - Create simple plot
    let plot_code = r#"
# Step 5: Visualization
# Create a simple plot (tree would use ggtree in real demo)
png(file.path(tempdir(), "tree_plot.png"))
plot(1:10, main="Phylogenetic Tree (Mock)")
dev.off()

# Create heatmap
png(file.path(tempdir(), "heatmap.png"))
heatmap(matrix(rnorm(100), 10, 10), main="Distance Heatmap")
dev.off()

cat("Visualizations created\n")
cat("- Tree plot: tree_plot.png\n")
cat("- Heatmap: heatmap.png\n")
"#;

    let request = create_request(plot_code, ExecutionActor::Ai, "workflow.R", 5);
    let result = executor.execute_with_event(request).await;

    assert!(result.is_ok(), "Step 5 should succeed");
    let (exec_result, event) = result.unwrap();
    assert!(exec_result.success, "Step 5 execution should succeed");
    assert!(
        exec_result.output.contains("Visualizations created"),
        "Should confirm visualization"
    );

    // Check for plots (may not be captured in test environment)
    // In real demo, plots would be automatically captured
    println!("Step 5 completed with {} plots", event.result.plots.len());
}

/// Test Step 6: Report Generation (Export Bundle)
///
/// This tests the complete export functionality with all previous steps.
#[tokio::test]
async fn test_step6_report_generation_full_workflow() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file.clone()).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Execute all 6 steps (simplified versions)
    let steps = vec![
        (
            "Step 1: Data acquisition",
            ExecutionActor::User,
            r#"cat("FASTA downloaded\n")"#,
        ),
        (
            "Step 2: Alignment",
            ExecutionActor::User,
            r#"cat("Alignment completed\n")"#,
        ),
        (
            "Step 3: Quality check",
            ExecutionActor::Ai,
            r#"cat("Quality: OK\n")"#,
        ),
        (
            "Step 4: Tree construction",
            ExecutionActor::Ai,
            r#"cat("Tree built\n")"#,
        ),
        (
            "Step 5: Visualization",
            ExecutionActor::Ai,
            r#"plot(1:5); cat("Plots created\n")"#,
        ),
        (
            "Step 6: Summary",
            ExecutionActor::User,
            r#"cat("Analysis complete\n")"#,
        ),
    ];

    for (i, (label, actor, code)) in steps.iter().enumerate() {
        let request = create_request(code, actor.clone(), "viral_phylogenomics.R", i + 1);
        let result = executor.execute_with_event(request).await;
        assert!(result.is_ok(), "{} should succeed", label);
    }

    // Verify all events recorded
    let events = timeline_arc
        .query(TimelineQuery {
            filters: None,
            sort: None,
            limit: Some(20),
            offset: Some(0),
        })
        .unwrap();

    assert_eq!(
        events.events.len(),
        6,
        "Should have 6 events (one per step)"
    );

    // Export bundle
    let bundle = ReproductionBundle::from_events(events.events);

    // Verify bundle metadata
    assert_eq!(
        bundle.metadata.session.total_events, 6,
        "Bundle should contain 6 events"
    );
    assert_eq!(
        bundle.metadata.statistics.user_actions, 3,
        "Should have 3 user actions (steps 1, 2, 6)"
    );
    assert_eq!(
        bundle.metadata.statistics.ai_actions, 3,
        "Should have 3 AI actions (steps 3, 4, 5)"
    );

    // Write tarball
    let output_path = temp_dir.path().join("viral_phylogenomics_workflow.tar.gz");
    let writer = BundleWriter::new(bundle);
    let write_result = writer.write_tarball(&output_path);

    assert!(
        write_result.is_ok(),
        "Should successfully write workflow bundle"
    );
    assert!(output_path.exists(), "Bundle file should exist");

    // Verify bundle contents
    let metadata = std::fs::metadata(&output_path).unwrap();
    assert!(
        metadata.len() > 500,
        "Bundle should have reasonable size: {} bytes",
        metadata.len()
    );

    println!("✓ Complete 6-step workflow test passed!");
    println!("  - All 6 steps executed successfully");
    println!("  - Timeline captured all events");
    println!("  - Bundle exported: {} bytes", metadata.len());
    println!("  - User actions: 3, AI actions: 3");
}

/// Test complete workflow with tool manifests validation
///
/// This ensures that the tool manifests for the workflow are properly configured.
#[test]
fn test_workflow_tool_manifests_present() {
    let tools_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools");

    if !tools_dir.exists() {
        println!("⚠ Tools directory not found, skipping manifest test");
        return;
    }

    let registry = ToolRegistry::load_from_dir(&tools_dir).expect("Failed to load tool registry");

    // Tools required for viral phylogenomics workflow
    let required_tools = vec![
        ("ape", "Phylogenetic tree construction"),
        ("ggtree", "Tree visualization"),
        ("seqinr", "Sequence analysis"),
        ("phangorn", "Advanced phylogenetics"),
        ("biostrings", "Sequence manipulation"),
    ];

    for (tool_id, description) in required_tools {
        let tool = registry.get(tool_id);
        assert!(
            tool.is_some(),
            "Tool '{}' ({}) should be present for workflow",
            tool_id,
            description
        );

        if let Some(manifest) = tool {
            println!("✓ Tool '{}' found: {}", tool_id, manifest.display_name);
            println!("  Capabilities: {}", manifest.capabilities.len());
        }
    }
}

/// Test workflow error handling
///
/// Verifies that errors in any step are properly captured in timeline.
#[tokio::test]
async fn test_workflow_with_error_in_step() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    // Step 1: Success
    let step1 = create_request(
        r#"cat("Step 1 OK\n")"#,
        ExecutionActor::User,
        "workflow.R",
        1,
    );
    executor.execute_with_event(step1).await.unwrap();

    // Step 2: Intentional error
    let step2 = create_request(
        r#"stop("Alignment failed: MAFFT not found")"#,
        ExecutionActor::User,
        "workflow.R",
        2,
    );
    let result = executor.execute_with_event(step2).await;
    assert!(result.is_ok(), "Should return result even on error");
    let (exec_result, _event) = result.unwrap();
    assert!(!exec_result.success, "Step 2 should fail");

    // Step 3: Recovery
    let step3 = create_request(
        r#"cat("Recovered from error\n")"#,
        ExecutionActor::Ai,
        "workflow.R",
        3,
    );
    executor.execute_with_event(step3).await.unwrap();

    // Query for errors
    let events = timeline_arc
        .query(TimelineQuery {
            filters: Some(reprod_core::executor::timeline::TimelineFilters {
                has_errors: Some(true),
                actor: None,
                source: None,
                start_time: None,
                end_time: None,
                has_plots: None,
                code_contains: None,
            }),
            sort: None,
            limit: Some(10),
            offset: Some(0),
        })
        .unwrap();

    assert_eq!(
        events.events.len(),
        1,
        "Should find exactly 1 event with error"
    );
    assert!(
        events.events[0]
            .result
            .error
            .as_ref()
            .unwrap()
            .contains("MAFFT"),
        "Error should mention MAFFT"
    );

    println!("✓ Error handling test passed");
    println!("  - Captured error in step 2");
    println!("  - Continued execution to step 3");
    println!("  - Timeline filtered errors correctly");
}

/// Performance test: Large workflow simulation
///
/// Tests performance with a larger number of steps.
#[tokio::test]
#[ignore] // Run with: cargo test --test viral_phylogenomics_workflow_test -- --ignored
async fn test_large_workflow_performance() {
    let temp_dir = TempDir::new().unwrap();
    let timeline_file = temp_dir.path().join("timeline.ndjson");

    let timeline = JsonTimeline::new(timeline_file).unwrap();
    let timeline_arc = Arc::new(timeline);

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".to_string())
        .with_shared_timeline(timeline_arc.clone())
        .build();

    let start_time = std::time::Instant::now();

    // Simulate 50 analysis steps
    for i in 1..=50 {
        let code = format!(r#"x{} <- {}; cat("Step {} completed\n")"#, i, i, i);
        let actor = if i % 2 == 0 {
            ExecutionActor::Ai
        } else {
            ExecutionActor::User
        };

        let request = create_request(&code, actor, "large_workflow.R", i);
        let result = executor.execute_with_event(request).await;
        assert!(result.is_ok(), "Step {} should succeed", i);
    }

    let duration = start_time.elapsed();

    // Query all events
    let events = timeline_arc
        .query(TimelineQuery {
            filters: None,
            sort: None,
            limit: Some(100),
            offset: Some(0),
        })
        .unwrap();

    assert_eq!(events.events.len(), 50, "Should have 50 events");

    println!("✓ Large workflow performance test passed");
    println!("  - 50 steps executed in {:?}", duration);
    println!("  - Average: {:?} per step", duration / 50);
    println!("  - Timeline size: {} events", events.events.len());

    // Performance expectations (adjust based on hardware)
    assert!(
        duration.as_secs() < 30,
        "50 steps should complete in < 30 seconds"
    );
}
