use std::fs;

use reprod_core::run_store::{new_run_summary, FsRunStore, RunStore};
use reprod_core::{RunStatus, RunStream};

fn temp_dir() -> tempfile::TempDir {
    tempfile::tempdir().expect("tempdir")
}

#[test]
fn creates_and_lists_runs() {
    let tmp = temp_dir();
    let store = FsRunStore::new(tmp.path().to_path_buf()).expect("create store");

    let run = new_run_summary("run-1", 10, None);
    let created = store.create(run.clone()).expect("create run");
    assert_eq!(created.run_id, "run-1");
    assert_eq!(created.status, RunStatus::Running);

    // finish
    let finished = store
        .finish(run.finalize(reprod_core::run_store::FinalizeOpts::new(
            RunStatus::Succeeded,
            20,
        )))
        .expect("finish run");
    assert_eq!(finished.status, RunStatus::Succeeded);
    assert_eq!(finished.duration_ms, Some(10));

    let listed = store.latest(None).expect("latest");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].run_id, "run-1");
    assert_eq!(listed[0].status, RunStatus::Succeeded);
}

#[test]
fn appends_output_files() {
    let tmp = temp_dir();
    let store = FsRunStore::new(tmp.path().to_path_buf()).expect("create store");

    let run = new_run_summary("run-logs", 0, None);
    store.create(run).expect("create");

    store
        .append_output(
            "run-logs",
            reprod_core::RunOutputChunk {
                run_id: "run-logs".into(),
                stream: RunStream::Stdout,
                chunk: "hello".into(),
                at_ms: 1,
            },
        )
        .expect("append stdout");

    store
        .append_output(
            "run-logs",
            reprod_core::RunOutputChunk {
                run_id: "run-logs".into(),
                stream: RunStream::Stderr,
                chunk: "oops".into(),
                at_ms: 2,
            },
        )
        .expect("append stderr");

    let stdout =
        fs::read_to_string(tmp.path().join("run-logs").join("stdout.ndjson")).expect("stdout file");
    assert!(stdout.contains("hello"));

    let stderr =
        fs::read_to_string(tmp.path().join("run-logs").join("stderr.ndjson")).expect("stderr file");
    assert!(stderr.contains("oops"));
}

#[test]
fn reads_outputs_with_timestamps() {
    let tmp = temp_dir();
    let store = FsRunStore::new(tmp.path().to_path_buf()).expect("create store");

    let run = new_run_summary("run-read", 0, None);
    store.create(run).expect("create");

    store
        .append_output(
            "run-read",
            reprod_core::RunOutputChunk {
                run_id: "run-read".into(),
                stream: RunStream::Stdout,
                chunk: "first".into(),
                at_ms: 2,
            },
        )
        .expect("append stdout");
    store
        .append_output(
            "run-read",
            reprod_core::RunOutputChunk {
                run_id: "run-read".into(),
                stream: RunStream::Stderr,
                chunk: "err".into(),
                at_ms: 1,
            },
        )
        .expect("append stderr");

    let outputs = store.outputs("run-read").expect("outputs");
    assert_eq!(outputs.len(), 2);
    assert_eq!(outputs[0].chunk, "err");
    assert_eq!(outputs[1].chunk, "first");
}
