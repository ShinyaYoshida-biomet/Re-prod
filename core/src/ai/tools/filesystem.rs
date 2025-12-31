use crate::ReprodError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use tokio::fs;

/// FileSystem tool for AI to interact with workspace files
/// CRITICAL: All operations are restricted to workspace directory only
#[derive(Debug, Clone)]
pub struct FileSystemTool {
    workspace_root: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadTextFileRequest {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WriteTextFileRequest {
    pub path: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_sha256: Option<String>,
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
            "name": "read_text_file",
            "description": "Read the contents of a file in the workspace and return text plus sha256 (ACP-compatible name).",
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
            "name": "write_text_file",
            "description": "Write content to a file in the workspace (ACP-compatible name). Returns unified diff output.",
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
                    },
                    "expected_sha256": {
                        "type": "string",
                        "description": "Optional SHA-256 of the file content from read_text_file for conflict detection"
                    }
                },
                "required": ["path", "content"]
            }
        },
        {
            "name": "edit_text_file",
            "description": "Apply an edit inside the workspace and return old/new text plus unified diff. Prefer this for file edits.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to the file within workspace (e.g., 'analysis.R')"
                    },
                    "operation": {
                        "type": "string",
                        "enum": ["create", "replace", "apply_edits", "delete"],
                        "description": "Edit operation to perform"
                    },
                    "expected_sha256": {
                        "type": "string",
                        "description": "Optional SHA-256 of the file content from read_text_file for conflict detection"
                    },
                    "new_text": {
                        "type": "string",
                        "description": "Full new file contents (required for create/replace)"
                    },
                    "edits": {
                        "type": "array",
                        "description": "Range-based edits (required for apply_edits)",
                        "items": {
                            "type": "object",
                            "properties": {
                                "range": {
                                    "type": "object",
                                    "properties": {
                                        "start_line": { "type": "integer" },
                                        "start_col": { "type": "integer" },
                                        "end_line": { "type": "integer" },
                                        "end_col": { "type": "integer" }
                                    },
                                    "required": ["start_line", "start_col", "end_line", "end_col"]
                                },
                                "text": { "type": "string" }
                            },
                            "required": ["range", "text"]
                        }
                    }
                },
                "required": ["path", "operation"]
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
