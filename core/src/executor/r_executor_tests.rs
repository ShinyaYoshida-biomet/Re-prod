use super::RExecutor;
use crate::executor::{CommandOutput, CommandRunner, InMemoryTimeline};
use crate::{
    CodeBlockKind, CodeBlockMetadata, ExecutionActor, ExecutionContext, ExecutionRequest,
    ExecutionSource,
};
use anyhow::Result;
use std::path::Path;
use tokio::sync::Mutex;

struct MockRunner {
    output: Mutex<CommandOutput>,
}

#[async_trait::async_trait]
impl CommandRunner for MockRunner {
    async fn run(
        &self,
        _r_path: &str,
        _script_path: &Path,
        _working_dir: &Path,
    ) -> Result<CommandOutput> {
        let output = self.output.lock().await;
        Ok(CommandOutput {
            success: output.success,
            stdout: output.stdout.clone(),
            stderr: output.stderr.clone(),
            interrupted: output.interrupted,
        })
    }

    async fn interrupt(&self) -> Result<bool> {
        Ok(false)
    }
}

#[tokio::test]
async fn records_event_with_provided_blocks() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let timeline = InMemoryTimeline::new();
    let runner = MockRunner {
        output: Mutex::new(CommandOutput {
            success: true,
            stdout: b"hello".to_vec(),
            stderr: Vec::new(),
            interrupted: false,
        }),
    };

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".into())
        .with_timeline(timeline.clone())
        .with_command_runner(runner)
        .build();

    let request = ExecutionRequest {
        code: "print('hello')".into(),
        context: ExecutionContext {
            source: ExecutionSource::Cell,
            document_path: Some("analysis.R".into()),
            cell_index: Some(0),
            triggered_at_ms: 1,
            actor: ExecutionActor::User,
        },
        blocks: vec![CodeBlockMetadata {
            id: "block-1".into(),
            index: 0,
            kind: CodeBlockKind::Section,
            label: Some("Setup".into()),
            start_line: 1,
            end_line: 2,
            code: "print('hello')".into(),
        }],
        plot_width: None,
        plot_height: None,
    };

    let result = executor.execute(request.clone()).await;
    assert!(result.is_ok());

    let events = timeline.events();
    assert_eq!(events.len(), 1);
    let event = &events[0];
    assert_eq!(event.context.source, ExecutionSource::Cell);
    assert_eq!(event.blocks.len(), 1);
    assert_eq!(event.blocks[0].id, "block-1");
    assert_eq!(event.result.output, "hello");
    assert!(event.result.error.is_none());
}

#[tokio::test]
async fn segments_blocks_when_not_provided() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let timeline = InMemoryTimeline::new();
    let runner = MockRunner {
        output: Mutex::new(CommandOutput {
            success: false,
            stdout: b"".to_vec(),
            stderr: b"error".to_vec(),
            interrupted: false,
        }),
    };

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".into())
        .with_timeline(timeline.clone())
        .with_command_runner(runner)
        .build();

    let request = ExecutionRequest {
        code: "# Step ----\nprint('x')".into(),
        context: ExecutionContext {
            source: ExecutionSource::WholeDocument,
            document_path: Some("analysis.R".into()),
            cell_index: None,
            triggered_at_ms: 2,
            actor: ExecutionActor::User,
        },
        blocks: Vec::new(),
        plot_width: None,
        plot_height: None,
    };

    let result = executor.execute(request).await.expect("execution");
    assert!(!result.success);
    assert_eq!(result.error.as_deref(), Some("error"));

    let events = timeline.events();
    assert_eq!(events.len(), 1);
    let event = &events[0];
    assert_eq!(event.blocks.len(), 1);
    let block = &event.blocks[0];
    assert_eq!(block.kind, CodeBlockKind::Section);
    assert!(block.code.contains("print('x')"));
    assert!(event.environment.r_path.contains("Rscript"));
}

#[tokio::test]
async fn builder_sets_persistent_and_working_dir() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let timeline = InMemoryTimeline::new();
    let runner = MockRunner {
        output: Mutex::new(CommandOutput {
            success: true,
            stdout: b"ok".to_vec(),
            stderr: Vec::new(),
            interrupted: false,
        }),
    };

    let working_dir = temp_dir.path().join("wd");
    std::fs::create_dir_all(&working_dir).expect("mkdir");

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".into())
        .with_timeline(timeline)
        .with_command_runner(runner)
        .with_working_dir(&working_dir)
        .use_persistent_mode()
        .build();

    assert!(executor.is_persistent_mode());
    assert_eq!(executor.working_dir(), working_dir.as_path());
}

#[tokio::test]
async fn streamed_chunks_exclude_internal_noise_lines() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let timeline = InMemoryTimeline::new();
    let runner = MockRunner {
        output: Mutex::new(CommandOutput {
            success: true,
            stdout: b"REPROD_WRAPPER_ENTER: persistent\n[1] \"Hello\"\nREPROD_STATE: PNG_AVAILABLE=TRUE\n".to_vec(),
            stderr: b"REPROD_PNG_DEVICE: /tmp/x.png\n".to_vec(),
            interrupted: false,
        }),
    };

    let executor = RExecutor::builder(temp_dir.path().to_path_buf(), "Rscript".into())
        .with_timeline(timeline)
        .with_command_runner(runner)
        .build();

    let request = ExecutionRequest {
        code: "print('Hello')".into(),
        context: ExecutionContext {
            source: ExecutionSource::Selection,
            document_path: Some("analysis.R".into()),
            cell_index: None,
            triggered_at_ms: 1,
            actor: ExecutionActor::User,
        },
        blocks: Vec::new(),
        plot_width: None,
        plot_height: None,
    };

    let (_result, _event, _history, chunks) = executor
        .execute_with_event_with_history(request)
        .await
        .expect("execute");

    assert!(chunks.iter().all(|c| !c.chunk.starts_with("REPROD_")));
    assert!(chunks.iter().any(|c| c.chunk.contains("Hello")));
}
