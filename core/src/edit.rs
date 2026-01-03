use crate::ReprodError;
use serde::{Deserialize, Serialize};
use similar::TextDiff;
use std::path::{Path, PathBuf};
use tokio::fs;

const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB limit

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EditOperation {
    Create,
    Replace,
    ApplyEdits,
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextRange {
    pub start_line: u32,
    pub start_col: u32,
    pub end_line: u32,
    pub end_col: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextEdit {
    pub range: TextRange,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadTextFileResult {
    pub path: String,
    pub text: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EditStatus {
    Applied,
    NoOp,
    Conflict,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditConflict {
    pub current_sha256: String,
    pub current_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditTextFileResult {
    pub status: EditStatus,
    pub path: String,
    pub old_text: String,
    pub new_text: String,
    pub old_sha256: String,
    pub new_sha256: String,
    pub structured_edits: Vec<TextEdit>,
    pub unified_diff: String,
    pub conflict: Option<EditConflict>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditTextFileRequest {
    pub path: String,
    pub operation: EditOperation,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edits: Option<Vec<TextEdit>>,
}

#[derive(Debug, Clone)]
pub struct EditService {
    workspace_root: PathBuf,
}

impl EditService {
    pub const fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }

    pub async fn read_text_file(&self, path: &str) -> Result<ReadTextFileResult, ReprodError> {
        let resolved = self.validate_path(path)?;
        let metadata = fs::metadata(&resolved)
            .await
            .map_err(|e| ReprodError::IOError(format!("Cannot read file metadata: {}", e)))?;

        if metadata.len() > MAX_FILE_SIZE {
            return Err(ReprodError::SecurityError(format!(
                "File size {} exceeds maximum allowed size of {} bytes",
                metadata.len(),
                MAX_FILE_SIZE
            )));
        }

        let text = fs::read_to_string(&resolved)
            .await
            .map_err(|e| ReprodError::IOError(format!("Cannot read file: {}", e)))?;
        let sha256 = sha256_hex(&text);

        Ok(ReadTextFileResult {
            path: path.to_string(),
            text,
            sha256,
        })
    }

    pub async fn edit_text_file(
        &self,
        request: EditTextFileRequest,
    ) -> Result<EditTextFileResult, ReprodError> {
        let resolved = self.validate_path(&request.path)?;
        let (old_text, old_sha256) = read_existing(&resolved).await?;

        if let Some(expected) = request.expected_sha256.as_ref() {
            if &old_sha256 != expected {
                let new_text_snapshot = derive_new_text(&old_text, &request)?;
                let unified_diff = unified_diff(&request.path, &old_text, &new_text_snapshot);
                let new_sha256 = sha256_hex(&new_text_snapshot);
                let old_sha256_snapshot = old_sha256.clone();
                let structured_edits = match request.operation {
                    EditOperation::ApplyEdits => request.edits.clone().unwrap_or_default(),
                    _ => vec![TextEdit {
                        range: full_range(&old_text),
                        text: new_text_snapshot.clone(),
                    }],
                };
                return Ok(EditTextFileResult {
                    status: EditStatus::Conflict,
                    path: request.path,
                    old_text: old_text.clone(),
                    new_text: new_text_snapshot,
                    old_sha256: old_sha256.clone(),
                    new_sha256,
                    structured_edits,
                    unified_diff,
                    conflict: Some(EditConflict {
                        current_sha256: old_sha256_snapshot,
                        current_text: old_text,
                    }),
                });
            }
        }

        let new_text = derive_new_text(&old_text, &request)?;
        if new_text.len() > MAX_FILE_SIZE as usize {
            return Err(ReprodError::SecurityError(format!(
                "Content size {} exceeds maximum allowed size of {} bytes",
                new_text.len(),
                MAX_FILE_SIZE
            )));
        }

        let status = if new_text == old_text {
            EditStatus::NoOp
        } else {
            apply_edit_to_disk(&resolved, &request.operation, &new_text).await?;
            EditStatus::Applied
        };

        let structured_edits = match request.operation {
            EditOperation::ApplyEdits => request.edits.unwrap_or_default(),
            _ => vec![TextEdit {
                range: full_range(&old_text),
                text: new_text.clone(),
            }],
        };

        let unified_diff = unified_diff(&request.path, &old_text, &new_text);
        let new_sha256 = sha256_hex(&new_text);

        Ok(EditTextFileResult {
            status,
            path: request.path,
            old_text,
            new_text,
            old_sha256,
            new_sha256,
            structured_edits,
            unified_diff,
            conflict: None,
        })
    }

    fn validate_path(&self, relative_path: &str) -> Result<PathBuf, ReprodError> {
        let path_obj = Path::new(relative_path);
        if path_obj.is_absolute() {
            return Err(ReprodError::SecurityError(
                "Absolute paths are not allowed".to_string(),
            ));
        }

        if relative_path.contains(':') {
            return Err(ReprodError::SecurityError(
                "Absolute paths are not allowed".to_string(),
            ));
        }

        if relative_path.contains("..") {
            return Err(ReprodError::SecurityError(
                "Parent directory references (..) are not allowed".to_string(),
            ));
        }

        let full_path = self.workspace_root.join(relative_path);
        let canonical_workspace = self
            .workspace_root
            .canonicalize()
            .map_err(|e| ReprodError::IOError(format!("Invalid workspace: {}", e)))?;

        if full_path.exists() {
            let canonical_path = full_path
                .canonicalize()
                .map_err(|e| ReprodError::IOError(format!("Invalid path: {}", e)))?;

            if !canonical_path.starts_with(&canonical_workspace) {
                return Err(ReprodError::SecurityError(
                    "Path is outside workspace".to_string(),
                ));
            }

            Ok(canonical_path)
        } else {
            Ok(full_path)
        }
    }
}

async fn read_existing(path: &Path) -> Result<(String, String), ReprodError> {
    if !path.exists() {
        let empty = String::new();
        return Ok((empty.clone(), sha256_hex(&empty)));
    }

    let metadata = fs::metadata(path)
        .await
        .map_err(|e| ReprodError::IOError(format!("Cannot read file metadata: {}", e)))?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(ReprodError::SecurityError(format!(
            "File size {} exceeds maximum allowed size of {} bytes",
            metadata.len(),
            MAX_FILE_SIZE
        )));
    }

    let text = fs::read_to_string(path)
        .await
        .map_err(|e| ReprodError::IOError(format!("Cannot read file: {}", e)))?;
    let hash = sha256_hex(&text);
    Ok((text, hash))
}

fn derive_new_text(old_text: &str, request: &EditTextFileRequest) -> Result<String, ReprodError> {
    match request.operation {
        EditOperation::Delete => Ok(String::new()),
        EditOperation::ApplyEdits => {
            let edits = request.edits.clone().unwrap_or_default();
            apply_edits(old_text, &edits)
        }
        EditOperation::Create | EditOperation::Replace => request
            .new_text
            .clone()
            .ok_or_else(|| ReprodError::IOError("Missing new_text for edit".to_string())),
    }
}

async fn apply_edit_to_disk(
    path: &Path,
    operation: &EditOperation,
    new_text: &str,
) -> Result<(), ReprodError> {
    match operation {
        EditOperation::Delete => {
            if path.exists() {
                fs::remove_file(path)
                    .await
                    .map_err(|e| ReprodError::IOError(format!("Cannot delete file: {}", e)))?;
            }
            Ok(())
        }
        EditOperation::Create | EditOperation::Replace | EditOperation::ApplyEdits => {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).await.map_err(|e| {
                    ReprodError::IOError(format!("Cannot create parent directory: {}", e))
                })?;
            }
            fs::write(path, new_text)
                .await
                .map_err(|e| ReprodError::IOError(format!("Cannot write file: {}", e)))
        }
    }
}

fn apply_edits(original: &str, edits: &[TextEdit]) -> Result<String, ReprodError> {
    let mut result = original.to_string();
    let mut sorted = edits.to_vec();
    sorted.sort_by(|a, b| {
        (
            b.range.start_line,
            b.range.start_col,
            b.range.end_line,
            b.range.end_col,
        )
            .cmp(&(
                a.range.start_line,
                a.range.start_col,
                a.range.end_line,
                a.range.end_col,
            ))
    });

    for edit in sorted {
        let start = line_col_to_index(&result, edit.range.start_line, edit.range.start_col)?;
        let end = line_col_to_index(&result, edit.range.end_line, edit.range.end_col)?;
        if start > end {
            return Err(ReprodError::IOError(
                "Edit range start is after end".to_string(),
            ));
        }
        result.replace_range(start..end, &edit.text);
    }

    Ok(result)
}

fn line_col_to_index(text: &str, line: u32, col: u32) -> Result<usize, ReprodError> {
    if line == 0 || col == 0 {
        return Err(ReprodError::IOError(
            "Line/column indices must be 1-based".to_string(),
        ));
    }
    let mut current_line = 1u32;
    let mut byte_index = 0usize;
    for raw_line in text.split_inclusive('\n') {
        if current_line == line {
            let target_col = col.saturating_sub(1) as usize;
            let mut current_col = 0usize;
            for (idx, _) in raw_line.char_indices() {
                if current_col == target_col {
                    return Ok(byte_index + idx);
                }
                current_col += 1;
            }
            if current_col == target_col {
                return Ok(byte_index + raw_line.len());
            }
            return Err(ReprodError::IOError("Column out of range".to_string()));
        }
        byte_index += raw_line.len();
        current_line += 1;
    }

    if current_line == line {
        return Ok(byte_index);
    }

    Err(ReprodError::IOError("Line out of range".to_string()))
}

fn full_range(text: &str) -> TextRange {
    let mut line_count = 1u32;
    let mut last_col = 1u32;
    for line in text.split('\n') {
        last_col = line.chars().count() as u32 + 1;
        line_count += 1;
    }
    TextRange {
        start_line: 1,
        start_col: 1,
        end_line: line_count.saturating_sub(1).max(1),
        end_col: last_col,
    }
}

fn unified_diff(path: &str, old_text: &str, new_text: &str) -> String {
    TextDiff::from_lines(old_text, new_text)
        .unified_diff()
        .header(&format!("a/{}", path), &format!("b/{}", path))
        .to_string()
}

fn sha256_hex(text: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let digest = hasher.finalize();
    format!("{:x}", digest)
}
