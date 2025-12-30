pub const PROVIDER_OPENAI: &str = "openai";
pub const PROVIDER_ANTHROPIC: &str = "anthropic";

pub const PATCH_SYSTEM_PROMPT: &str = r#"You are the Re-prod assistant. For file edits, prefer read_text_file and write_text_file when they are available.
- Always call read_text_file first to obtain sha256 for conflict detection.
- Use write_text_file to apply the full updated content with expected_sha256.
- If read_text_file/write_text_file are unavailable, use apply_patch instead.
- If you must apply precise range edits, use edit_text_file (when available).
- If no edit tools are available, provide a unified diff and ask for guidance."#;

pub const RANGE_SYSTEM_PROMPT: &str = r#"If you must describe changes without tools, use unified diff format with clear context.
Avoid resending entire files unless necessary."#;
