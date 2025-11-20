use crate::ReprodError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use tokio::fs;

const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB limit

/// FileSystem tool for AI to interact with workspace files
/// CRITICAL: All operations are restricted to workspace directory only
#[derive(Debug, Clone)]
pub struct FileSystemTool {
    workspace_root: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadFileRequest {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WriteFileRequest {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListFilesRequest {
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

impl FileSystemTool {
    pub const fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }

    /// Validates that a path is within workspace boundaries
    /// Returns canonicalized path if valid, error otherwise
    /// CRITICAL SECURITY: This prevents directory traversal attacks
    fn validate_path(&self, relative_path: &str) -> Result<PathBuf, ReprodError> {
        // Check for absolute paths (Unix and Windows styles)
        let path_obj = Path::new(relative_path);
        if path_obj.is_absolute() {
            return Err(ReprodError::SecurityError(
                "Absolute paths are not allowed".to_string(),
            ));
        }

        // Check for Windows-style absolute paths (e.g., C:\)
        if relative_path.contains(':') {
            return Err(ReprodError::SecurityError(
                "Absolute paths are not allowed".to_string(),
            ));
        }

        // Check for parent directory references
        if relative_path.contains("..") {
            return Err(ReprodError::SecurityError(
                "Parent directory references (..) are not allowed".to_string(),
            ));
        }

        // Build the full path
        let full_path = self.workspace_root.join(relative_path);

        // Canonicalize both paths to resolve symlinks
        let canonical_workspace = self
            .workspace_root
            .canonicalize()
            .map_err(|e| ReprodError::IOError(format!("Invalid workspace: {}", e)))?;

        // For existing paths, canonicalize and check
        if full_path.exists() {
            let canonical_path = full_path
                .canonicalize()
                .map_err(|e| ReprodError::IOError(format!("Invalid path: {}", e)))?;

            // Ensure the path is within workspace
            if !canonical_path.starts_with(&canonical_workspace) {
                return Err(ReprodError::SecurityError(
                    "Path is outside workspace".to_string(),
                ));
            }

            Ok(canonical_path)
        } else {
            // For new files, we've already validated:
            // 1. Not an absolute path
            // 2. No ".." components
            // 3. Path is constructed from workspace_root + relative_path
            // Therefore, it must be within workspace
            Ok(full_path)
        }
    }

    /// Read a file from workspace
    pub async fn read_file(&self, request: ReadFileRequest) -> Result<String, ReprodError> {
        let path = self.validate_path(&request.path)?;

        // Check file size before reading
        let metadata = fs::metadata(&path)
            .await
            .map_err(|e| ReprodError::IOError(format!("Cannot read file metadata: {}", e)))?;

        if metadata.len() > MAX_FILE_SIZE {
            return Err(ReprodError::SecurityError(format!(
                "File size {} exceeds maximum allowed size of {} bytes",
                metadata.len(),
                MAX_FILE_SIZE
            )));
        }

        let content = fs::read_to_string(&path)
            .await
            .map_err(|e| ReprodError::IOError(format!("Cannot read file: {}", e)))?;

        Ok(content)
    }

    /// Write a file to workspace
    pub async fn write_file(&self, request: WriteFileRequest) -> Result<(), ReprodError> {
        let path = self.validate_path(&request.path)?;

        // Check content size
        if request.content.len() > MAX_FILE_SIZE as usize {
            return Err(ReprodError::SecurityError(format!(
                "Content size {} exceeds maximum allowed size of {} bytes",
                request.content.len(),
                MAX_FILE_SIZE
            )));
        }

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await.map_err(|e| {
                ReprodError::IOError(format!("Cannot create parent directory: {}", e))
            })?;
        }

        fs::write(&path, request.content)
            .await
            .map_err(|e| ReprodError::IOError(format!("Cannot write file: {}", e)))?;

        Ok(())
    }

    /// List files in a directory
    pub async fn list_files(
        &self,
        request: ListFilesRequest,
    ) -> Result<Vec<FileInfo>, ReprodError> {
        let path = if let Some(ref p) = request.path {
            self.validate_path(p)?
        } else {
            self.workspace_root.clone()
        };

        if !path.is_dir() {
            return Err(ReprodError::IOError("Path is not a directory".to_string()));
        }

        let mut entries = fs::read_dir(&path)
            .await
            .map_err(|e| ReprodError::IOError(format!("Cannot read directory: {}", e)))?;

        let mut files = Vec::new();

        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| ReprodError::IOError(format!("Cannot read directory entry: {}", e)))?
        {
            let metadata = entry
                .metadata()
                .await
                .map_err(|e| ReprodError::IOError(format!("Cannot read entry metadata: {}", e)))?;

            let relative_path = entry
                .path()
                .strip_prefix(&self.workspace_root)
                .map_err(|_| ReprodError::IOError("Cannot compute relative path".to_string()))?
                .to_string_lossy()
                .to_string();

            files.push(FileInfo {
                name: entry.file_name().to_string_lossy().to_string(),
                path: relative_path,
                is_dir: metadata.is_dir(),
                size: metadata.len(),
            });
        }

        Ok(files)
    }
}

/// Tool definitions for AI provider
pub fn get_filesystem_tools() -> Vec<Value> {
    serde_json::json!([
        {
            "name": "read_file",
            "description": "Read the contents of a file in the workspace. Only files within the workspace directory can be accessed.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to the file within workspace (e.g., 'data/input.csv')"
                    }
                },
                "required": ["path"]
            }
        },
        {
            "name": "write_file",
            "description": "Write content to a file in the workspace. Only files within the workspace directory can be written. Maximum file size is 10MB.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to the file within workspace (e.g., 'output/results.txt')"
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to write to the file"
                    }
                },
                "required": ["path", "content"]
            }
        },
        {
            "name": "list_files",
            "description": "List files and directories in the workspace. Only workspace contents can be listed.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to directory within workspace. If not provided, lists workspace root."
                    }
                }
            }
        }
    ])
    .as_array()
    .expect("get_filesystem_tools: json! array literal should always be an array")
    .clone()
}

// Include comprehensive security tests
#[cfg(test)]
#[path = "filesystem_security_tests.rs"]
mod security_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_validate_path_rejects_absolute_paths() {
        let temp = TempDir::new().unwrap();
        let tool = FileSystemTool::new(temp.path().to_path_buf());

        let result = tool.validate_path("/etc/passwd");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Absolute paths are not allowed"));
    }

    #[tokio::test]
    async fn test_validate_path_rejects_parent_references() {
        let temp = TempDir::new().unwrap();
        let tool = FileSystemTool::new(temp.path().to_path_buf());

        let result = tool.validate_path("../etc/passwd");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Parent directory references"));
    }

    #[tokio::test]
    async fn test_validate_path_rejects_symlink_escape() {
        let temp = TempDir::new().unwrap();
        let workspace = temp.path();
        let tool = FileSystemTool::new(workspace.to_path_buf());

        // Create a symlink pointing outside workspace
        #[cfg(unix)]
        {
            let link_path = workspace.join("escape_link");
            std::os::unix::fs::symlink("/etc/passwd", &link_path).unwrap();

            let result = tool.validate_path("escape_link");
            assert!(result.is_err());
        }
    }

    #[tokio::test]
    async fn test_read_file_success() {
        let temp = TempDir::new().unwrap();
        let workspace = temp.path();
        let tool = FileSystemTool::new(workspace.to_path_buf());

        // Create a test file
        let test_file = workspace.join("test.txt");
        fs::write(&test_file, "Hello, World!").await.unwrap();

        let result = tool
            .read_file(ReadFileRequest {
                path: "test.txt".to_string(),
            })
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Hello, World!");
    }

    #[tokio::test]
    async fn test_read_file_rejects_large_files() {
        let temp = TempDir::new().unwrap();
        let workspace = temp.path();
        let tool = FileSystemTool::new(workspace.to_path_buf());

        // Create a file larger than MAX_FILE_SIZE
        let test_file = workspace.join("large.txt");
        let large_content = "x".repeat((MAX_FILE_SIZE + 1) as usize);
        fs::write(&test_file, large_content).await.unwrap();

        let result = tool
            .read_file(ReadFileRequest {
                path: "large.txt".to_string(),
            })
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("exceeds maximum"));
    }

    #[tokio::test]
    async fn test_write_file_success() {
        let temp = TempDir::new().unwrap();
        let workspace = temp.path();
        let tool = FileSystemTool::new(workspace.to_path_buf());

        let result = tool
            .write_file(WriteFileRequest {
                path: "output.txt".to_string(),
                content: "Test content".to_string(),
            })
            .await;

        assert!(result.is_ok(), "Write failed: {:?}", result.err());

        let content = fs::read_to_string(workspace.join("output.txt"))
            .await
            .unwrap();
        assert_eq!(content, "Test content");
    }

    #[tokio::test]
    async fn test_write_file_creates_parent_dirs() {
        let temp = TempDir::new().unwrap();
        let workspace = temp.path();
        let tool = FileSystemTool::new(workspace.to_path_buf());

        let result = tool
            .write_file(WriteFileRequest {
                path: "nested/dir/file.txt".to_string(),
                content: "Nested content".to_string(),
            })
            .await;

        assert!(result.is_ok());

        let content = fs::read_to_string(workspace.join("nested/dir/file.txt"))
            .await
            .unwrap();
        assert_eq!(content, "Nested content");
    }

    #[tokio::test]
    async fn test_write_file_rejects_large_content() {
        let temp = TempDir::new().unwrap();
        let workspace = temp.path();
        let tool = FileSystemTool::new(workspace.to_path_buf());

        let large_content = "x".repeat((MAX_FILE_SIZE + 1) as usize);

        let result = tool
            .write_file(WriteFileRequest {
                path: "large.txt".to_string(),
                content: large_content,
            })
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("exceeds maximum"));
    }

    #[tokio::test]
    async fn test_list_files_success() {
        let temp = TempDir::new().unwrap();
        let workspace = temp.path();
        let tool = FileSystemTool::new(workspace.to_path_buf());

        // Create test files
        fs::write(workspace.join("file1.txt"), "content1")
            .await
            .unwrap();
        fs::write(workspace.join("file2.txt"), "content2")
            .await
            .unwrap();
        fs::create_dir(workspace.join("subdir")).await.unwrap();

        let result = tool.list_files(ListFilesRequest { path: None }).await;

        assert!(result.is_ok());
        let files = result.unwrap();
        assert_eq!(files.len(), 3);

        let names: Vec<_> = files.iter().map(|f| f.name.as_str()).collect();
        assert!(names.contains(&"file1.txt"));
        assert!(names.contains(&"file2.txt"));
        assert!(names.contains(&"subdir"));
    }

    #[tokio::test]
    async fn test_path_traversal_attack_blocked() {
        let temp = TempDir::new().unwrap();
        let workspace = temp.path();
        let tool = FileSystemTool::new(workspace.to_path_buf());

        // Try various path traversal attacks
        let attacks = vec![
            "../../../etc/passwd",
            "foo/../../etc/passwd",
            "./../../etc/passwd",
            "..\\..\\..\\etc\\passwd",
        ];

        for attack in attacks {
            let result = tool.validate_path(attack);
            assert!(
                result.is_err(),
                "Path traversal attack should be blocked: {}",
                attack
            );
        }
    }
}
