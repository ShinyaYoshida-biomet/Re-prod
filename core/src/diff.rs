use serde::{Deserialize, Serialize};
use similar::{ChangeTag, TextDiff};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DiffChange {
    pub id: String,
    #[serde(rename = "type")]
    #[ts(rename = "type")]
    pub change_type: DiffChangeType,
    pub original_start_line: u32,
    pub original_end_line: u32,
    pub modified_start_line: u32,
    pub modified_end_line: u32,
    pub old_lines: Vec<String>,
    pub new_lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub enum DiffChangeType {
    Add,
    Remove,
    Modify,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    #[serde(rename = "type")]
    #[ts(rename = "type")]
    pub line_type: DiffLineType,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_line: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub enum DiffLineType {
    Context,
    Add,
    Remove,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub id: String,
    pub index: u32,
    pub change: DiffChange,
    pub lines: Vec<DiffLine>,
}

/// Compute diff changes between old and new content using line-level diffing.
/// Returns a list of changed hunks (additions, removals, modifications).
pub fn compute_diff(old: &str, new: &str) -> Vec<DiffChange> {
    let diff = TextDiff::from_lines(old, new);

    // Collect grouped ops: each group is a contiguous run of non-equal changes
    let mut changes: Vec<DiffChange> = Vec::new();
    let mut change_index = 0u32;

    // We'll track line numbers (1-based) as we walk through the ops
    let mut old_line: u32 = 1;
    let mut new_line: u32 = 1;

    for group in diff.grouped_ops(0) {
        // Each group may contain multiple ops (insert, delete, replace, equal)
        // We skip equal groups entirely
        let has_change = group
            .iter()
            .any(|op| !matches!(op, similar::DiffOp::Equal { .. }));
        if !has_change {
            // advance line cursors
            for op in &group {
                if let similar::DiffOp::Equal { len, .. } = op {
                    old_line += *len as u32;
                    new_line += *len as u32;
                }
            }
            continue;
        }

        let mut old_lines: Vec<String> = Vec::new();
        let mut new_lines: Vec<String> = Vec::new();
        let original_start = old_line;
        let modified_start = new_line;

        for op in &group {
            match op {
                similar::DiffOp::Equal { len, .. } => {
                    old_line += *len as u32;
                    new_line += *len as u32;
                }
                similar::DiffOp::Delete { old_len, .. } => {
                    for change in diff.iter_changes(op) {
                        if change.tag() == ChangeTag::Delete {
                            old_lines.push(
                                change
                                    .value()
                                    .trim_end_matches('\n')
                                    .trim_end_matches('\r')
                                    .to_string(),
                            );
                        }
                    }
                    old_line += *old_len as u32;
                }
                similar::DiffOp::Insert { new_len, .. } => {
                    for change in diff.iter_changes(op) {
                        if change.tag() == ChangeTag::Insert {
                            new_lines.push(
                                change
                                    .value()
                                    .trim_end_matches('\n')
                                    .trim_end_matches('\r')
                                    .to_string(),
                            );
                        }
                    }
                    new_line += *new_len as u32;
                }
                similar::DiffOp::Replace {
                    old_len, new_len, ..
                } => {
                    for change in diff.iter_changes(op) {
                        match change.tag() {
                            ChangeTag::Delete => old_lines.push(
                                change
                                    .value()
                                    .trim_end_matches('\n')
                                    .trim_end_matches('\r')
                                    .to_string(),
                            ),
                            ChangeTag::Insert => new_lines.push(
                                change
                                    .value()
                                    .trim_end_matches('\n')
                                    .trim_end_matches('\r')
                                    .to_string(),
                            ),
                            ChangeTag::Equal => {}
                        }
                    }
                    old_line += *old_len as u32;
                    new_line += *new_len as u32;
                }
            }
        }

        let original_end = if old_lines.is_empty() {
            0
        } else {
            original_start + old_lines.len() as u32 - 1
        };
        let modified_end = if new_lines.is_empty() {
            0
        } else {
            modified_start + new_lines.len() as u32 - 1
        };

        let change_type = if old_lines.is_empty() {
            DiffChangeType::Add
        } else if new_lines.is_empty() {
            DiffChangeType::Remove
        } else {
            DiffChangeType::Modify
        };

        let id = format!(
            "change-{}-{}-{}-{}-{}",
            original_start, original_end, modified_start, modified_end, change_index
        );

        changes.push(DiffChange {
            id,
            change_type,
            original_start_line: original_start,
            original_end_line: original_end,
            modified_start_line: modified_start,
            modified_end_line: modified_end,
            old_lines,
            new_lines,
        });

        change_index += 1;
    }

    changes
}

/// Build display hunks from a list of diff changes.
pub fn build_diff_hunks(changes: &[DiffChange]) -> Vec<DiffHunk> {
    changes
        .iter()
        .enumerate()
        .map(|(index, change)| {
            let mut lines: Vec<DiffLine> = Vec::new();
            let mut old_line = change.original_start_line;
            let mut new_line = change.modified_start_line;

            for line in &change.old_lines {
                lines.push(DiffLine {
                    line_type: DiffLineType::Remove,
                    content: line.clone(),
                    old_line: Some(old_line),
                    new_line: None,
                });
                old_line += 1;
            }

            for line in &change.new_lines {
                lines.push(DiffLine {
                    line_type: DiffLineType::Add,
                    content: line.clone(),
                    old_line: None,
                    new_line: Some(new_line),
                });
                new_line += 1;
            }

            DiffHunk {
                id: change.id.clone(),
                index: index as u32,
                change: change.clone(),
                lines,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_simple_modification() {
        let old = "line1\nline2\nline3\n";
        let new = "line1\nchanged\nline3\n";
        let changes = compute_diff(old, new);
        assert_eq!(changes.len(), 1);
        let c = &changes[0];
        assert!(matches!(c.change_type, DiffChangeType::Modify));
        assert_eq!(c.old_lines, vec!["line2"]);
        assert_eq!(c.new_lines, vec!["changed"]);
    }

    #[test]
    fn detects_addition() {
        let old = "line1\nline3\n";
        let new = "line1\nline2\nline3\n";
        let changes = compute_diff(old, new);
        assert_eq!(changes.len(), 1);
        assert!(matches!(changes[0].change_type, DiffChangeType::Add));
        assert_eq!(changes[0].new_lines, vec!["line2"]);
    }

    #[test]
    fn detects_removal() {
        let old = "line1\nline2\nline3\n";
        let new = "line1\nline3\n";
        let changes = compute_diff(old, new);
        assert_eq!(changes.len(), 1);
        assert!(matches!(changes[0].change_type, DiffChangeType::Remove));
        assert_eq!(changes[0].old_lines, vec!["line2"]);
    }

    #[test]
    fn no_changes_for_identical() {
        let content = "line1\nline2\n";
        let changes = compute_diff(content, content);
        assert!(changes.is_empty());
    }

    #[test]
    fn builds_hunks_from_changes() {
        let old = "line1\nline2\nline3\n";
        let new = "line1\nchanged\nline3\n";
        let changes = compute_diff(old, new);
        let hunks = build_diff_hunks(&changes);
        assert_eq!(hunks.len(), 1);
        let hunk = &hunks[0];
        assert_eq!(hunk.lines.len(), 2); // one remove + one add
        assert!(matches!(hunk.lines[0].line_type, DiffLineType::Remove));
        assert!(matches!(hunk.lines[1].line_type, DiffLineType::Add));
    }
}
