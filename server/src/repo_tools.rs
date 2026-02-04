use std::path::{Component, Path, PathBuf};
use tokio::process::Command;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use reprod_core::ReprodError;

#[derive(Debug, Deserialize)]
pub struct SearchRepoRequest {
    pub query: String,
    pub path: Option<String>,
    pub max_results: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct SearchMatch {
    pub path: String,
    pub line: u32,
    pub text: String,
}

#[derive(Debug, Serialize)]
pub struct SearchRepoResponse {
    pub matches: Vec<SearchMatch>,
}

#[derive(Debug, Deserialize)]
pub struct GitStatusRequest {
    pub path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GitDiffRequest {
    pub path: Option<String>,
    pub staged: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct GitLogRequest {
    pub path: Option<String>,
    pub max_entries: Option<u32>,
}

const DEFAULT_MAX_RESULTS: u32 = 200;
const MAX_RESULTS_LIMIT: u32 = 500;
const MAX_OUTPUT_BYTES: usize = 64 * 1024;
const DEFAULT_LOG_ENTRIES: u32 = 20;
const MAX_LOG_ENTRIES: u32 = 200;

fn clamp_results(limit: Option<u32>, default_value: u32, max_value: u32) -> u32 {
    let value = limit.unwrap_or(default_value);
    value.min(max_value).max(1)
}

fn output_to_string(output: &[u8]) -> String {
    let text = String::from_utf8_lossy(output).to_string();
    limit_output(text)
}

fn limit_output(text: String) -> String {
    if text.len() > MAX_OUTPUT_BYTES {
        let mut truncated = text;
        truncated.truncate(MAX_OUTPUT_BYTES);
        truncated
    } else {
        text
    }
}

fn ensure_workspace_path(root: &Path, path: &Path) -> Result<PathBuf, ReprodError> {
    let canonical_root = root
        .canonicalize()
        .map_err(|e| ReprodError::IOError(format!("Invalid workspace root: {}", e)))?;

    if path.exists() {
        let canonical = path
            .canonicalize()
            .map_err(|e| ReprodError::IOError(format!("Invalid path: {}", e)))?;
        if !canonical.starts_with(&canonical_root) {
            return Err(ReprodError::SecurityError(
                "Path is outside workspace".to_string(),
            ));
        }
        Ok(canonical)
    } else {
        let candidate = if path.is_absolute() {
            path.to_path_buf()
        } else {
            root.join(path)
        };
        if !candidate.starts_with(&canonical_root) {
            return Err(ReprodError::SecurityError(
                "Path is outside workspace".to_string(),
            ));
        }
        Ok(candidate)
    }
}

fn validate_relative_path(path: &str) -> Result<PathBuf, ReprodError> {
    if path.contains(':') {
        return Err(ReprodError::SecurityError(
            "Absolute paths are not allowed".to_string(),
        ));
    }
    let mut cleaned = PathBuf::new();
    for component in Path::new(path).components() {
        match component {
            Component::Normal(segment) => cleaned.push(segment),
            Component::CurDir => {}
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err(ReprodError::SecurityError(
                    "Access outside the workspace is not allowed".to_string(),
                ))
            }
        }
    }
    Ok(cleaned)
}

fn resolve_optional_path(root: &Path, path: &Option<String>) -> Result<PathBuf, ReprodError> {
    match path {
        Some(value) => {
            let candidate = validate_relative_path(value)?;
            if candidate.as_os_str().is_empty() {
                return Ok(root.to_path_buf());
            }
            let full = root.join(candidate);
            ensure_workspace_path(root, &full)?;
            Ok(full)
        }
        None => Ok(root.to_path_buf()),
    }
}

fn resolve_pathspec(root: &Path, path: &Option<String>) -> Result<Option<String>, ReprodError> {
    match path {
        Some(value) => {
            let candidate = validate_relative_path(value)?;
            if candidate.as_os_str().is_empty() {
                return Ok(None);
            }
            let full = root.join(&candidate);
            ensure_workspace_path(root, &full)?;
            Ok(Some(candidate.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

pub async fn search_repo(root: &Path, request: SearchRepoRequest) -> Result<Value, String> {
    if request.query.trim().is_empty() {
        return Err("Query is required".to_string());
    }
    let max_results = clamp_results(request.max_results, DEFAULT_MAX_RESULTS, MAX_RESULTS_LIMIT);
    let search_root = resolve_optional_path(root, &request.path).map_err(|e| e.to_string())?;

    let output = Command::new("rg")
        .arg("--no-heading")
        .arg("--line-number")
        .arg("--color")
        .arg("never")
        .arg("--max-count")
        .arg(max_results.to_string())
        .arg(&request.query)
        .arg(search_root.as_os_str())
        .output()
        .await
        .map_err(|e| format!("Failed to execute rg: {}", e))?;

    if !output.status.success() {
        if output.status.code() == Some(1) {
            // rg exits 1 when no matches; treat as empty result.
        } else {
            return Err(format!("rg failed: {}", output_to_string(&output.stderr)));
        }
    }

    let stdout = output_to_string(&output.stdout);
    let mut matches = Vec::new();
    for line in stdout.lines() {
        let mut parts = line.splitn(3, ':');
        let path = match parts.next() {
            Some(value) if !value.is_empty() => value,
            _ => continue,
        };
        let line_number = match parts.next() {
            Some(value) => value.parse::<u32>().ok(),
            None => None,
        };
        let text = parts.next().unwrap_or("").to_string();
        if let Some(line_number) = line_number {
            matches.push(SearchMatch {
                path: path.to_string(),
                line: line_number,
                text,
            });
        }
    }

    Ok(serde_json::to_value(SearchRepoResponse { matches }).map_err(|e| e.to_string())?)
}

pub async fn git_status(root: &Path, request: GitStatusRequest) -> Result<Value, String> {
    let pathspec = resolve_pathspec(root, &request.path).map_err(|e| e.to_string())?;
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(root.as_os_str())
        .arg("status")
        .arg("--short")
        .arg("--branch");
    if let Some(pathspec) = pathspec {
        command.arg("--").arg(pathspec);
    }
    let output = command
        .output()
        .await
        .map_err(|e| format!("Failed to execute git status: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git status failed: {}",
            output_to_string(&output.stderr)
        ));
    }

    Ok(serde_json::json!({ "stdout": output_to_string(&output.stdout) }))
}

pub async fn git_diff(root: &Path, request: GitDiffRequest) -> Result<Value, String> {
    let pathspec = resolve_pathspec(root, &request.path).map_err(|e| e.to_string())?;
    let mut command = Command::new("git");
    command.arg("-C").arg(root.as_os_str()).arg("diff");
    if request.staged.unwrap_or(false) {
        command.arg("--staged");
    }
    if let Some(pathspec) = pathspec {
        command.arg("--").arg(pathspec);
    }
    let output = command
        .output()
        .await
        .map_err(|e| format!("Failed to execute git diff: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git diff failed: {}",
            output_to_string(&output.stderr)
        ));
    }

    Ok(serde_json::json!({ "stdout": output_to_string(&output.stdout) }))
}

pub async fn git_log(root: &Path, request: GitLogRequest) -> Result<Value, String> {
    let pathspec = resolve_pathspec(root, &request.path).map_err(|e| e.to_string())?;
    let max_entries = clamp_results(request.max_entries, DEFAULT_LOG_ENTRIES, MAX_LOG_ENTRIES);
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(root.as_os_str())
        .arg("log")
        .arg(format!("-n{}", max_entries))
        .arg("--oneline");
    if let Some(pathspec) = pathspec {
        command.arg("--").arg(pathspec);
    }
    let output = command
        .output()
        .await
        .map_err(|e| format!("Failed to execute git log: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git log failed: {}",
            output_to_string(&output.stderr)
        ));
    }

    Ok(serde_json::json!({ "stdout": output_to_string(&output.stdout) }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_results() {
        assert_eq!(clamp_results(None, 10, 20), 10);
        assert_eq!(clamp_results(Some(0), 10, 20), 1);
        assert_eq!(clamp_results(Some(50), 10, 20), 20);
        assert_eq!(clamp_results(Some(5), 10, 20), 5);
    }

    #[test]
    fn limit_output_truncates() {
        let text = "a".repeat(MAX_OUTPUT_BYTES + 10);
        let trimmed = limit_output(text);
        assert_eq!(trimmed.len(), MAX_OUTPUT_BYTES);
    }

    #[test]
    fn validate_relative_path_rejects_escape() {
        assert!(validate_relative_path("../secrets").is_err());
        assert!(validate_relative_path("/etc/passwd").is_err());
        assert!(validate_relative_path("C:\\windows").is_err());
    }

    #[test]
    fn validate_relative_path_accepts_normal() {
        let path = validate_relative_path("src/lib.rs").expect("valid path");
        assert_eq!(path.to_string_lossy(), "src/lib.rs");
    }
}
