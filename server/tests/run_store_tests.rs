use std::fs;

use reprod_core::run_store::{finalize_run_summary, new_run_summary, FsRunStore, RunStore};
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
    let finished = finalize_run_summary(run, RunStatus::Succeeded, 20, None, None, None);
    let finished = store.finish(finished).expect("finish run");
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
