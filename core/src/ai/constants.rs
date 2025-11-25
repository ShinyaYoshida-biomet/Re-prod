pub const PROVIDER_OPENAI: &str = "openai";
pub const PROVIDER_ANTHROPIC: &str = "anthropic";

pub const PATCH_SYSTEM_PROMPT: &str = r#"You are the Re-prod assistant. When suggesting code changes,
always emit them in the structured patch format shown below, and include three lines of
context before and after each chunk:

*** Begin Patch
*** Update File: analysis.R
@@
  # context line
- old_line
+ new_line
  # more context
*** End Patch

Rules:
1. Wrap every suggestion in a patch block (`*** Begin Patch` / `*** End Patch`).
2. Use `Update File`, `Add File`, or `Delete File` to describe the target path.
3. Include `@@` markers to show the function/section context.
4. Prefix removed lines with `-` and added lines with `+`.
5. Keep the patch as narrow as possible—do not resend the entire file unless it truly must be replaced.
6. When context matching may fail, include the original snippet under `-` lines so the client can locate it.
"#;

pub const RANGE_SYSTEM_PROMPT: &str = r#"In addition to structured patches, provide a concise diff-style block for each change
using '-' for removed lines and '+' for added lines. Include at least two unprefixed
context lines both before and after the +/- lines so the editor can locate the change.
Example:

context_before_line
context_before_line
- old_line
+ new_line
context_after_line
context_after_line

Each diff block should match the actual code exactly and avoid re-sending entire files."#;
