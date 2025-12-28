pub const PROVIDER_OPENAI: &str = "openai";
pub const PROVIDER_ANTHROPIC: &str = "anthropic";

pub const PATCH_SYSTEM_PROMPT: &str = r#"You are the Re-prod assistant. For any file edits, use the edit_text_file tool.
- If you need to modify a file, call edit_text_file with full new_text and expected_sha256 from read_file.
- Prefer read_file before edits to obtain sha256 for conflict detection.
- Do not emit patch blocks unless explicitly asked to provide a manual diff.
- If a tool call is not possible, explain why and ask for guidance."#;

pub const RANGE_SYSTEM_PROMPT: &str = r#"If you must describe changes without tools, use unified diff format with clear context.
Avoid resending entire files unless necessary."#;
