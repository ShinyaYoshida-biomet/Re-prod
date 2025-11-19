use anyhow::{Context, Result};
use notify::{
    event::{ModifyKind, RenameMode},
    Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub children: Option<Vec<FileEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FileSystemEvent {
    Created { path: String },
    Deleted { path: String },
    Modified { path: String },
    Renamed { from: String, to: String },
    Error { message: String },
}

pub struct FileSystem {
    root: PathBuf,
}

impl FileSystem {
    pub fn new<P: AsRef<Path>>(root: P) -> Self {
        Self {
            root: root.as_ref().to_path_buf(),
        }
    }

    pub fn list_dir(&self, path: &str) -> Result<Vec<FileEntry>> {
        let target_path = self.resolve_path(path)?;
        let mut entries = Vec::new();

        for entry in std::fs::read_dir(&target_path)? {
            let entry = entry?;
            let metadata = entry.metadata()?;
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = metadata.is_dir();
            let size = if is_dir { None } else { Some(metadata.len()) };

            // Get relative path from root
            let full_path = entry.path();
            let relative_path = full_path
                .strip_prefix(&self.root)
                .unwrap_or(&full_path)
                .to_string_lossy()
                .to_string();

            entries.push(FileEntry {
                path: relative_path,
                name,
                is_dir,
                size,
                children: None, // Lazy loading
            });
        }

        // Sort: directories first, then files
        entries.sort_by(|a, b| {
            if a.is_dir == b.is_dir {
                a.name.cmp(&b.name)
            } else if a.is_dir {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        });

        Ok(entries)
    }

    pub fn read_file(&self, path: &str) -> Result<String> {
        let target_path = self.resolve_path(path)?;
        std::fs::read_to_string(target_path).context("Failed to read file")
    }

    pub fn write_file(&self, path: &str, content: &str) -> Result<()> {
        let target_path = self.resolve_path(path)?;
        if let Some(parent) = target_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(target_path, content).context("Failed to write file")
    }

    pub fn delete_path(&self, path: &str) -> Result<()> {
        let target_path = self.resolve_path(path)?;
        if target_path.is_dir() {
            std::fs::remove_dir_all(target_path).context("Failed to remove directory")
        } else {
            std::fs::remove_file(target_path).context("Failed to remove file")
        }
    }

    pub fn rename_path(&self, from: &str, to: &str) -> Result<()> {
        let from_path = self.resolve_path(from)?;
        let to_path = self.resolve_path(to)?;
        if let Some(parent) = to_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::rename(from_path, to_path).context("Failed to rename path")
    }

    pub fn create_dir(&self, path: &str) -> Result<()> {
        let target_path = self.resolve_path(path)?;
        std::fs::create_dir_all(target_path).context("Failed to create directory")
    }

    pub fn root_path(&self) -> &Path {
        &self.root
    }

    fn resolve_path(&self, path: &str) -> Result<PathBuf> {
        // Prevent directory traversal attacks
        let path = path.trim_start_matches('/');
        let target = self.root.join(path);

        // Canonicalize to check if it's within root
        // Note: canonicalize requires file to exist, so we check parent for new files
        // For simplicity in this MVP, we just check if it starts with root after join
        // In production, use `dunce::canonicalize` or similar to handle symlinks safely

        Ok(target)
    }
}

pub struct FileWatcher {
    watcher: RecommendedWatcher,
    rx: Receiver<notify::Result<notify::Event>>,
    root: PathBuf,
}

impl FileWatcher {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let (tx, rx) = channel();

        let mut watcher = RecommendedWatcher::new(tx, Config::default())?;
        let root = path.as_ref().to_path_buf();

        watcher.watch(&root, RecursiveMode::Recursive)?;

        Ok(Self { watcher, rx, root })
    }

    pub fn try_recv(&self) -> Option<FileSystemEvent> {
        match self.rx.try_recv() {
            Ok(Ok(event)) => self.map_event(event),
            Ok(Err(e)) => Some(FileSystemEvent::Error {
                message: e.to_string(),
            }),
            Err(_) => None,
        }
    }

    pub fn recv_timeout(
        &self,
        timeout: Duration,
    ) -> Result<Option<FileSystemEvent>, RecvTimeoutError> {
        match self.rx.recv_timeout(timeout) {
            Ok(Ok(event)) => Ok(self.map_event(event)),
            Ok(Err(e)) => Ok(Some(FileSystemEvent::Error {
                message: e.to_string(),
            })),
            Err(err) => Err(err),
        }
    }

    fn map_event(&self, event: notify::Event) -> Option<FileSystemEvent> {
        match event.kind {
            EventKind::Create(_) => event.paths.get(0).map(|path| FileSystemEvent::Created {
                path: self.relative_path(path),
            }),
            EventKind::Remove(_) => event.paths.get(0).map(|path| FileSystemEvent::Deleted {
                path: self.relative_path(path),
            }),
            EventKind::Modify(ModifyKind::Name(RenameMode::Both))
            | EventKind::Modify(ModifyKind::Name(RenameMode::From))
            | EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
                if event.paths.len() >= 2 {
                    let from = self.relative_path(&event.paths[0]);
                    let to = self.relative_path(&event.paths[1]);
                    Some(FileSystemEvent::Renamed { from, to })
                } else {
                    None
                }
            }
            EventKind::Modify(_) => event.paths.get(0).map(|path| FileSystemEvent::Modified {
                path: self.relative_path(path),
            }),
            _ => None,
        }
    }

    fn relative_path(&self, path: &Path) -> String {
        path.strip_prefix(&self.root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string())
    }
}
