use anyhow::{anyhow, Context, Result};
use dunce::canonicalize;
use notify::{
    event::{ModifyKind, RenameMode},
    Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
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
    canonical_root: PathBuf,
}

impl FileSystem {
    pub fn new<P: AsRef<Path>>(root: P) -> Self {
        let root_path = root.as_ref().to_path_buf();
        let canonical_root = canonicalize(&root_path).unwrap_or(root_path.clone());
        Self {
            root: root_path,
            canonical_root,
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

    pub fn copy_path(&self, from: &str, to: &str) -> Result<()> {
        let from_path = self.resolve_path(from)?;
        let to_path = self.resolve_path(to)?;

        if from_path.is_dir() {
            copy_dir_recursive(&from_path, &to_path)
        } else {
            if let Some(parent) = to_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&from_path, &to_path)
                .with_context(|| format!("Failed to copy file {}", from))?;
            Ok(())
        }
    }

    pub fn root_path(&self) -> &Path {
        &self.root
    }

    pub fn canonical_root(&self) -> &Path {
        &self.canonical_root
    }

    fn resolve_path(&self, path: &str) -> Result<PathBuf> {
        let sanitized = self.sanitize_relative(path)?;
        let full_path = if sanitized.as_os_str().is_empty() {
            self.root.clone()
        } else {
            self.root.join(&sanitized)
        };

        if full_path.exists() {
            let canonical_target = canonicalize(&full_path)
                .with_context(|| format!("Failed to resolve path {}", full_path.display()))?;
            self.ensure_within_root(&canonical_target)?;
            Ok(canonical_target)
        } else {
            if let Some(parent) = full_path.parent() {
                if parent.exists() {
                    let canonical_parent = canonicalize(parent).with_context(|| {
                        format!("Failed to resolve parent directory {}", parent.display())
                    })?;
                    self.ensure_within_root(&canonical_parent)?;
                } else {
                    self.ensure_descendant(parent)?;
                }
            }
            self.ensure_descendant(&full_path)?;
            Ok(full_path)
        }
    }

    fn sanitize_relative(&self, path: &str) -> Result<PathBuf> {
        let mut relative = PathBuf::new();
        for component in Path::new(path).components() {
            match component {
                Component::Prefix(_) => {
                    return Err(anyhow!("Absolute paths are not allowed"));
                }
                Component::RootDir => {
                    relative.clear();
                }
                Component::CurDir => {}
                Component::ParentDir => {
                    if !relative.pop() {
                        return Err(anyhow!("Access outside the workspace is not allowed"));
                    }
                }
                Component::Normal(segment) => relative.push(segment),
            }
        }
        Ok(relative)
    }

    fn ensure_descendant(&self, path: &Path) -> Result<()> {
        if !path.starts_with(&self.root) {
            return Err(anyhow!("Access outside the workspace is not allowed"));
        }
        Ok(())
    }

    fn ensure_within_root(&self, path: &Path) -> Result<()> {
        if !path.starts_with(&self.canonical_root) {
            return Err(anyhow!("Access outside the workspace is not allowed"));
        }
        Ok(())
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
            .unwrap_or_else(|_| path.to_string_lossy().to_string())
    }
}

fn copy_dir_recursive(from: &Path, to: &Path) -> Result<()> {
    std::fs::create_dir_all(to)?;

    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = to.join(entry.file_name());

        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &destination_path)?;
        } else {
            if let Some(parent) = destination_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&source_path, &destination_path).with_context(|| {
                format!(
                    "Failed to copy file {} to {}",
                    source_path.display(),
                    destination_path.display()
                )
            })?;
        }
    }

    Ok(())
}
