//! AI response code-block extraction.
//!
//! Ports the TypeScript parsing pipeline from:
//! - client/src/core/ai/codeBlockUtils.ts
//! - client/src/core/ai/patchParser.ts
//! - client/src/core/ai/simpleChangeParser.ts

use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

// ── Data structures ───────────────────────────────────────────────────────────

#[derive(Serialize, Debug, Clone)]
pub struct PatchChunk {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
    #[serde(rename = "oldLines")]
    pub old_lines: Vec<String>,
    #[serde(rename = "newLines")]
    pub new_lines: Vec<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct SimpleCodeChange {
    #[serde(rename = "beforeContext")]
    pub before_context: Vec<String>,
    #[serde(rename = "afterContext")]
    pub after_context: Vec<String>,
    #[serde(rename = "oldLines")]
    pub old_lines: Vec<String>,
    #[serde(rename = "newLines")]
    pub new_lines: Vec<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct CodeRange {
    #[serde(rename = "startLine")]
    pub start_line: u32,
    #[serde(rename = "startColumn")]
    pub start_column: u32,
    #[serde(rename = "endLine")]
    pub end_line: u32,
    #[serde(rename = "endColumn")]
    pub end_column: u32,
}

#[derive(Serialize, Debug, Clone)]
pub struct CodeBlock {
    pub id: String,
    pub code: String,
    pub language: String,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filepath: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "targetRange")]
    pub target_range: Option<CodeRange>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "patchChunks")]
    pub patch_chunks: Option<Vec<PatchChunk>>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "simpleChanges")]
    pub simple_changes: Option<Vec<SimpleCodeChange>>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "patchText")]
    pub patch_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checksum: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "originalCode")]
    pub original_code: Option<String>,
}

// ── Diff helpers ──────────────────────────────────────────────────────────────

fn is_diff_addition(line: &str) -> bool {
    line.starts_with('+') && !line.starts_with("+++")
}

fn is_diff_removal(line: &str) -> bool {
    line.starts_with('-') && !line.starts_with("---")
}

fn is_diff_context(line: &str) -> bool {
    line.starts_with(' ')
}

// ── Timestamp helper ──────────────────────────────────────────────────────────

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

// ── Patch format parsing (port of patchParser.ts) ─────────────────────────────

struct PatchHunk {
    hunk_type: &'static str,
    filepath: String,
    chunks: Vec<PatchChunk>,
}

fn parse_patch_format(text: &str) -> Vec<PatchHunk> {
    let mut hunks = Vec::new();
    let begin_marker = "*** Begin Patch";
    let end_marker = "*** End Patch";
    let mut pos = 0;

    while pos < text.len() {
        let Some(begin_rel) = text[pos..].find(begin_marker) else {
            break;
        };
        let begin = pos + begin_rel;
        let after_begin = begin + begin_marker.len();

        let content_start = if text.get(after_begin..after_begin + 1) == Some("\n") {
            after_begin + 1
        } else {
            after_begin
        };

        let (content_end, next_pos) = if let Some(end_rel) = text[content_start..].find(end_marker)
        {
            let abs = content_start + end_rel;
            (abs, abs + end_marker.len())
        } else {
            (text.len(), text.len())
        };

        parse_patch_block(&text[content_start..content_end], &mut hunks);
        pos = next_pos;
    }

    hunks
}

fn parse_patch_block(block: &str, out: &mut Vec<PatchHunk>) {
    let mut current_hunk: Option<PatchHunk> = None;
    let mut current_chunk: Option<PatchChunk> = None;

    for line in block.lines() {
        // File header: "*** Add File: path", "*** Update File: path", "*** Delete File: path"
        if let Some(rest) = line.strip_prefix("*** ") {
            if let Some(sep) = rest.find(" File: ") {
                let action = &rest[..sep];
                let filepath = rest[sep + " File: ".len()..].trim();

                if let Some(mut h) = current_hunk.take() {
                    if let Some(c) = current_chunk.take() {
                        h.chunks.push(c);
                    }
                    out.push(h);
                } else {
                    current_chunk = None;
                }

                let hunk_type = match action {
                    "Add" => "add",
                    "Delete" => "delete",
                    _ => "update",
                };
                current_hunk = Some(PatchHunk {
                    hunk_type,
                    filepath: filepath.to_string(),
                    chunks: Vec::new(),
                });
                continue;
            }
        }

        let Some(ref mut hunk) = current_hunk else {
            continue;
        };

        if line.starts_with("@@") {
            if let Some(c) = current_chunk.take() {
                hunk.chunks.push(c);
            }
            current_chunk = Some(PatchChunk {
                context: Some(line.to_string()),
                old_lines: Vec::new(),
                new_lines: Vec::new(),
            });
            continue;
        }

        let chunk = current_chunk.get_or_insert_with(|| PatchChunk {
            context: None,
            old_lines: Vec::new(),
            new_lines: Vec::new(),
        });

        if is_diff_removal(line) {
            chunk.old_lines.push(line[1..].to_string());
        } else if is_diff_addition(line) {
            chunk.new_lines.push(line[1..].to_string());
        } else if is_diff_context(line) {
            let ctx = &line[1..];
            chunk.old_lines.push(ctx.to_string());
            chunk.new_lines.push(ctx.to_string());
        } else {
            chunk.old_lines.push(line.to_string());
            chunk.new_lines.push(line.to_string());
        }
    }

    if let Some(mut h) = current_hunk.take() {
        if let Some(c) = current_chunk.take() {
            h.chunks.push(c);
        }
        out.push(h);
    }
}

fn format_patch_text(hunk: &PatchHunk) -> String {
    let action_word = match hunk.hunk_type {
        "add" => "Add",
        "delete" => "Delete",
        _ => "Update",
    };
    let mut out = format!(
        "*** Begin Patch\n*** {} File: {}\n",
        action_word, hunk.filepath
    );
    let body_parts: Vec<String> = hunk
        .chunks
        .iter()
        .map(|chunk| {
            let context_line = chunk
                .context
                .as_deref()
                .map(|c| format!("{c}\n"))
                .unwrap_or_default();
            let old = chunk
                .old_lines
                .iter()
                .map(|l| format!("-{l}"))
                .collect::<Vec<_>>()
                .join("\n");
            let new = chunk
                .new_lines
                .iter()
                .map(|l| format!("+{l}"))
                .collect::<Vec<_>>()
                .join("\n");
            format!("{context_line}{old}\n{new}")
        })
        .collect();
    out.push_str(&body_parts.join("\n\n"));
    out.push_str("\n*** End Patch");
    out
}

fn build_code_block_from_patch(hunk: &PatchHunk) -> Option<CodeBlock> {
    let new_code: String = hunk
        .chunks
        .iter()
        .flat_map(|c| c.new_lines.iter().cloned())
        .collect::<Vec<_>>()
        .join("\n");
    let new_code = new_code.trim_end().to_string();

    if new_code.is_empty() {
        return None;
    }

    let original_code: String = hunk
        .chunks
        .iter()
        .flat_map(|c| c.old_lines.iter().cloned())
        .collect::<Vec<_>>()
        .join("\n");
    let original_code = original_code.trim_end().to_string();

    let action = match hunk.hunk_type {
        "add" => "create-file",
        "delete" => "delete-range",
        _ => "replace-range",
    };

    let ts = now_millis();
    let mut block = CodeBlock {
        id: format!("patch-{ts}-{}", hunk.filepath),
        code: new_code,
        language: "r".to_string(),
        action: action.to_string(),
        filepath: Some(hunk.filepath.clone()),
        patch_chunks: Some(hunk.chunks.clone()),
        patch_text: Some(format_patch_text(hunk)),
        target_range: None,
        simple_changes: None,
        checksum: None,
        explanation: None,
        original_code: None,
    };

    if !original_code.is_empty() {
        block.original_code = Some(original_code);
    }

    Some(block)
}

// ── Code fence utilities ──────────────────────────────────────────────────────

/// Find ` ```<lang>\n...\n``` ` blocks in text (requires newline before closing fence).
/// Returns Vec<(start_byte, end_byte, content)>.
fn find_typed_fences(text: &str, lang: &str) -> Vec<(usize, usize, String)> {
    let open_marker = format!("```{lang}\n");
    let mut results = Vec::new();
    let mut pos = 0;

    while pos < text.len() {
        let Some(open_rel) = text[pos..].find(&open_marker) else {
            break;
        };
        let open_abs = pos + open_rel;
        let content_start = open_abs + open_marker.len();

        let Some(close_rel) = text[content_start..].find("\n```") else {
            pos = content_start;
            continue;
        };
        let content_end = content_start + close_rel;
        let close_end = content_end + "\n```".len();

        let content = text[content_start..content_end].to_string();
        results.push((open_abs, close_end, content));
        pos = close_end;
    }

    results
}

/// Find any code fence blocks in text (for simple-change detection).
/// Returns Vec<(start_byte, end_byte, lang, content)>.
fn find_any_fences(text: &str) -> Vec<(usize, usize, String, String)> {
    let mut results = Vec::new();
    let mut pos = 0;

    while pos < text.len() {
        let Some(tick_rel) = text[pos..].find("```") else {
            break;
        };
        let tick_abs = pos + tick_rel;
        let after_ticks = tick_abs + 3;

        let newline_rel = text[after_ticks..]
            .find('\n')
            .unwrap_or(text.len().saturating_sub(after_ticks));
        let lang = text[after_ticks..after_ticks + newline_rel].to_string();
        let content_start = after_ticks + newline_rel + 1;

        if content_start > text.len() {
            break;
        }

        let Some(close_rel) = text[content_start..].find("```") else {
            pos = content_start;
            continue;
        };
        let content_end = content_start + close_rel;
        let close_end = content_end + 3;

        let content = text[content_start..content_end]
            .trim_end_matches('\n')
            .to_string();
        results.push((tick_abs, close_end, lang, content));
        pos = close_end;
    }

    results
}

// ── JSON block parsing ────────────────────────────────────────────────────────

fn make_code_range(raw: &serde_json::Map<String, Value>) -> Option<CodeRange> {
    let start_line = raw.get("startLine")?.as_u64()? as u32;
    let end_line = raw.get("endLine")?.as_u64()? as u32;
    if start_line == 0 || end_line == 0 {
        return None;
    }
    Some(CodeRange {
        start_line,
        start_column: raw.get("startColumn").and_then(|v| v.as_u64()).unwrap_or(1) as u32,
        end_line,
        end_column: raw.get("endColumn").and_then(|v| v.as_u64()).unwrap_or(1) as u32,
    })
}

fn as_opt_string(v: &Value) -> Option<String> {
    v.as_str().filter(|s| !s.is_empty()).map(str::to_string)
}

const SUPPORTED_ACTIONS: &[&str] = &[
    "replace-all",
    "replace-range",
    "insert",
    "create-file",
    "delete-range",
];

/// Parse a diff snippet embedded in a JSON code block's `code` field.
/// Returns (original_code, new_code) or None if no diff markers found.
fn parse_patch_snippet(value: &str) -> Option<(String, String)> {
    let has_diff = value
        .lines()
        .any(|l| is_diff_addition(l) || is_diff_removal(l));
    if !has_diff {
        return None;
    }

    let mut original: Vec<String> = Vec::new();
    let mut new: Vec<String> = Vec::new();

    for line in value.lines() {
        if line.starts_with("@@") || line.starts_with("---") || line.starts_with("+++") {
            continue;
        }
        if is_diff_removal(line) {
            original.push(line[1..].to_string());
        } else if is_diff_addition(line) {
            new.push(line[1..].to_string());
        } else if is_diff_context(line) {
            let ctx = &line[1..];
            original.push(ctx.to_string());
            new.push(ctx.to_string());
        } else {
            original.push(line.to_string());
            new.push(line.to_string());
        }
    }

    if original.is_empty() && new.is_empty() {
        return None;
    }

    let orig = original.join("\n").trim_end().to_string();
    let n = new.join("\n").trim_end().to_string();
    Some((orig, n))
}

fn normalize_code_block(raw: &serde_json::Map<String, Value>) -> Option<CodeBlock> {
    let action_str = raw.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let action = if SUPPORTED_ACTIONS.contains(&action_str) {
        action_str.to_string()
    } else {
        "replace-all".to_string()
    };

    let code = raw
        .get("code")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())?
        .to_string();

    let ts = now_millis();
    let id = raw
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("code-{ts}-json"));

    let target_range = raw
        .get("targetRange")
        .and_then(|v| v.as_object())
        .and_then(make_code_range);

    let mut block = CodeBlock {
        id,
        code: code.clone(),
        language: "r".to_string(),
        action,
        filepath: raw.get("filepath").and_then(as_opt_string),
        target_range,
        patch_chunks: None,
        simple_changes: None,
        patch_text: None,
        checksum: raw.get("checksum").and_then(as_opt_string),
        explanation: raw.get("explanation").and_then(as_opt_string),
        original_code: raw.get("originalCode").and_then(as_opt_string),
    };

    if let Some((orig, new_code)) = parse_patch_snippet(&code) {
        if block.original_code.is_none() && !orig.is_empty() {
            block.original_code = Some(orig);
        }
        block.code = new_code;
    }

    Some(block)
}

fn parse_json_blocks(text: &str) -> (Vec<CodeBlock>, Vec<(usize, usize)>) {
    let mut blocks = Vec::new();
    let mut ranges = Vec::new();

    for (start, end, content) in find_typed_fences(text, "json") {
        ranges.push((start, end));
        let Ok(parsed) = serde_json::from_str::<Value>(&content) else {
            continue;
        };
        match &parsed {
            Value::Array(arr) => {
                for entry in arr {
                    if let Some(obj) = entry.as_object() {
                        if let Some(b) = normalize_code_block(obj) {
                            blocks.push(b);
                        }
                    }
                }
            }
            Value::Object(obj) => {
                if let Some(Value::Array(inner)) = obj.get("codeBlocks") {
                    for entry in inner {
                        if let Some(inner_obj) = entry.as_object() {
                            if let Some(b) = normalize_code_block(inner_obj) {
                                blocks.push(b);
                            }
                        }
                    }
                } else if let Some(b) = normalize_code_block(obj) {
                    blocks.push(b);
                }
            }
            _ => {}
        }
    }

    (blocks, ranges)
}

// ── Simple changes parsing (port of simpleChangeParser.ts) ───────────────────

fn parse_diff_block(block: &str) -> Option<SimpleCodeChange> {
    let mut lines: Vec<String> = block
        .lines()
        .map(|l| {
            let stripped = l.trim_end_matches('\r');
            // Remove embedded code-fence markers (mirrors normalizeBlock in TS)
            if stripped.starts_with("```") {
                String::new()
            } else {
                stripped.trim_end().to_string()
            }
        })
        .collect();

    // Trim leading/trailing blank lines
    while lines.first().map(|l| l.trim().is_empty()).unwrap_or(false) {
        lines.remove(0);
    }
    while lines.last().map(|l| l.trim().is_empty()).unwrap_or(false) {
        lines.pop();
    }

    let diff_indices: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter(|(_, l)| is_diff_addition(l) || is_diff_removal(l))
        .map(|(i, _)| i)
        .collect();

    if diff_indices.is_empty() {
        return None;
    }

    let has_additions = lines.iter().any(|l| is_diff_addition(l));
    let has_removals = lines.iter().any(|l| is_diff_removal(l));
    if !has_additions || !has_removals {
        return None;
    }

    let first_diff = *diff_indices.first()?;
    let last_diff = *diff_indices.last()?;

    let before_context: Vec<String> = lines[..first_diff]
        .iter()
        .filter(|l| !l.trim().is_empty())
        .cloned()
        .collect();
    let after_context: Vec<String> = lines[last_diff + 1..]
        .iter()
        .filter(|l| !l.trim().is_empty())
        .cloned()
        .collect();

    let mut old_lines: Vec<String> = Vec::new();
    let mut new_lines: Vec<String> = Vec::new();

    for line in lines.iter().take(last_diff + 1).skip(first_diff) {
        if is_diff_removal(line) {
            old_lines.push(line[1..].to_string());
        } else if is_diff_addition(line) {
            new_lines.push(line[1..].to_string());
        } else {
            let ctx = if is_diff_context(line) {
                line[1..].to_string()
            } else {
                line.clone()
            };
            old_lines.push(ctx.clone());
            new_lines.push(ctx);
        }
    }

    if old_lines.is_empty() && new_lines.is_empty() {
        return None;
    }

    Some(SimpleCodeChange {
        before_context,
        after_context,
        old_lines,
        new_lines,
    })
}

fn gather_segments<'a>(text: &'a str, ranges: &[(usize, usize)]) -> Vec<&'a str> {
    if ranges.is_empty() {
        return vec![text];
    }
    let mut segments = Vec::new();
    let mut cursor = 0;
    for &(start, end) in ranges {
        if cursor < start {
            let seg = &text[cursor..start];
            if !seg.trim().is_empty() {
                segments.push(seg);
            }
        }
        cursor = end;
    }
    if cursor < text.len() {
        let seg = &text[cursor..];
        if !seg.trim().is_empty() {
            segments.push(seg);
        }
    }
    segments
}

fn parse_simple_changes(text: &str) -> Vec<SimpleCodeChange> {
    let mut changes = Vec::new();
    let fences = find_any_fences(text);
    let fence_ranges: Vec<(usize, usize)> = fences.iter().map(|(s, e, _, _)| (*s, *e)).collect();

    for (_, _, _, content) in &fences {
        if let Some(change) = parse_diff_block(content) {
            changes.push(change);
        }
    }

    for segment in gather_segments(text, &fence_ranges) {
        for chunk in segment.split("\n\n") {
            if chunk.trim().is_empty() {
                continue;
            }
            if let Some(change) = parse_diff_block(chunk) {
                changes.push(change);
            }
        }
    }

    changes
}

// ── Attach simple changes ─────────────────────────────────────────────────────

fn attach_simple_changes(blocks: &mut [CodeBlock], simple_changes: Vec<SimpleCodeChange>) {
    if simple_changes.is_empty() || blocks.is_empty() {
        return;
    }
    let last_index = blocks.len() - 1;
    let mut cursor = 0usize;

    for (index, block) in blocks.iter_mut().enumerate() {
        let remaining = simple_changes.len().saturating_sub(cursor);
        if remaining == 0 {
            break;
        }

        let patch_budget = block.patch_chunks.as_ref().map(|c| c.len()).unwrap_or(0);
        let is_last = index == last_index;
        let budget = if patch_budget > 0 {
            if is_last {
                remaining
            } else {
                remaining.min(patch_budget)
            }
        } else if is_last {
            remaining
        } else {
            let divisor = last_index - index + 1;
            1_usize.max((remaining as f64 / divisor as f64).ceil() as usize)
        };

        let take = budget.min(remaining);
        let assigned: Vec<SimpleCodeChange> = simple_changes[cursor..cursor + take].to_vec();
        cursor += assigned.len();
        if !assigned.is_empty() {
            block.simple_changes = Some(assigned);
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Extract code blocks from AI response text.
/// Equivalent to `extractCodeBlocks` in `codeBlockUtils.ts`.
pub fn extract_code_blocks(text: &str) -> Vec<Value> {
    let simple_changes = parse_simple_changes(text);
    let patch_hunks = parse_patch_format(text);

    if !patch_hunks.is_empty() {
        let mut patch_blocks: Vec<CodeBlock> = patch_hunks
            .iter()
            .filter_map(build_code_block_from_patch)
            .collect();
        attach_simple_changes(&mut patch_blocks, simple_changes);
        return patch_blocks
            .into_iter()
            .filter_map(|b| serde_json::to_value(b).ok())
            .collect();
    }

    let mut code_blocks = Vec::new();
    let (json_blocks, json_ranges) = parse_json_blocks(text);
    code_blocks.extend(json_blocks);

    let ts = now_millis();
    let r_fences = find_typed_fences(text, "r")
        .into_iter()
        .chain(find_typed_fences(text, "R"));
    for (start, _end, content) in r_fences {
        let overlaps = json_ranges
            .iter()
            .any(|&(js, je)| start >= js && start < je);
        if overlaps {
            continue;
        }
        code_blocks.push(CodeBlock {
            id: format!("code-{ts}-{start}"),
            code: content,
            language: "r".to_string(),
            action: "insert".to_string(),
            filepath: None,
            target_range: None,
            patch_chunks: None,
            simple_changes: None,
            patch_text: None,
            checksum: None,
            explanation: None,
            original_code: None,
        });
    }

    attach_simple_changes(&mut code_blocks, simple_changes);
    code_blocks
        .into_iter()
        .filter_map(|b| serde_json::to_value(b).ok())
        .collect()
}
