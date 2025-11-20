use axum::extract::ws::{Message, WebSocket};
use reprod_core::fs::{FileSystemEvent, FileWatcher};
use std::{
    path::PathBuf,
    sync::{
        mpsc::{self, RecvTimeoutError, TryRecvError},
        Arc,
    },
    thread,
    time::Duration,
};
use tokio::sync::mpsc as tokio_mpsc;

use super::{common::WSResponse, ProjectRuntime};

const FILE_WATCHER_POLL_INTERVAL_MS: u64 = 250;

pub struct FsWatcherHandle {
    stop_tx: mpsc::Sender<()>,
    handle: thread::JoinHandle<()>,
}

impl FsWatcherHandle {
    pub fn stop(self) {
        let _ = self.stop_tx.send(());
        let _ = self.handle.join();
    }
}

pub fn spawn_fs_watcher(
    root: PathBuf,
    tx: tokio_mpsc::UnboundedSender<FileSystemEvent>,
) -> FsWatcherHandle {
    let (stop_tx, stop_rx) = mpsc::channel();
    let handle = thread::spawn(move || match FileWatcher::new(root) {
        Ok(watcher) => loop {
            match stop_rx.try_recv() {
                Ok(_) | Err(TryRecvError::Disconnected) => break,
                Err(TryRecvError::Empty) => {}
            }

            match watcher.recv_timeout(Duration::from_millis(FILE_WATCHER_POLL_INTERVAL_MS)) {
                Ok(Some(event)) => {
                    if tx.send(event).is_err() {
                        break;
                    }
                }
                Ok(None) => {}
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
        },
        Err(err) => {
            let _ = tx.send(FileSystemEvent::Error {
                message: err.to_string(),
            });
        }
    });

    FsWatcherHandle { stop_tx, handle }
}

pub async fn handle_fs_event(
    maybe_event: &Option<FileSystemEvent>,
    socket: &mut WebSocket,
) -> bool {
    match maybe_event {
        Some(event) => match serde_json::to_string(&WSResponse::FileSystemEvent {
            event: event.clone(),
        }) {
            Ok(payload) => socket.send(Message::Text(payload)).await.is_ok(),
            Err(error) => {
                tracing::error!("Failed to serialize file system event: {}", error);
                true
            }
        },
        None => false,
    }
}

pub fn restart_fs_watcher(
    current_runtime: &Arc<ProjectRuntime>,
    fs_watcher: &mut Option<FsWatcherHandle>,
    fs_event_tx: &tokio_mpsc::UnboundedSender<FileSystemEvent>,
    fs_events_closed: &mut bool,
) {
    if let Some(handle) = fs_watcher.take() {
        handle.stop();
    }
    *fs_watcher = Some(spawn_fs_watcher(
        current_runtime.descriptor.root_path.clone(),
        fs_event_tx.clone(),
    ));
    *fs_events_closed = false;
}
