use std::sync::Arc;

use crate::projects::ProjectRuntime;

pub(super) async fn build_context_prompt(
    runtime: &Arc<ProjectRuntime>,
    context: reprod_core::acp::types::AcpContextRequest,
) -> Result<String, anyhow::Error> {
    let mut parts = Vec::new();

    // 1. Console Context
    if let Some(limit) = context.console_history_limit {
        if limit > 0 {
            let runs = runtime
                .execution_repo
                .latest_runs(limit)
                .await
                .unwrap_or_default();

            if !runs.is_empty() {
                let mut console_text =
                    String::from("Recent console output (newest first, truncated):\n");
                for run in runs {
                    let status = format!("{:?}", run.status).to_lowercase();
                    let duration = run.duration_ms.unwrap_or(0);
                    console_text.push_str(&format!(
                        "- [{}] {} in {}ms\n",
                        run.created_at_ms, status, duration
                    ));
                    if !run.result.output.is_empty() {
                        let trimmed = run
                            .result
                            .output
                            .lines()
                            .take(20)
                            .collect::<Vec<_>>()
                            .join("\n");
                        let truncated = if trimmed.len() > 800 {
                            &trimmed[..800]
                        } else {
                            &trimmed
                        };
                        console_text.push_str(&format!("stdout: {}\n", truncated));
                    }
                    if let Some(err) = &run.result.error {
                        let trimmed = err.lines().take(20).collect::<Vec<_>>().join("\n");
                        let truncated = if trimmed.len() > 800 {
                            &trimmed[..800]
                        } else {
                            &trimmed
                        };
                        console_text.push_str(&format!("stderr: {}\n", truncated));
                    }
                    console_text.push('\n');
                }
                parts.push(console_text);
            }
        }
    }

    // 2. File Context
    if let Some(path) = context.active_buffer_path {
        if !path.is_empty() {
            match runtime.edit_service.read_text_file(&path).await {
                Ok(result) => {
                    parts.push(format!(
                        "Current file ({}):\n\n```r\n{}\n```\n",
                        path, result.text
                    ));
                }
                Err(e) => {
                    tracing::warn!("Failed to read context file {}: {}", path, e);
                }
            }
        }
    }

    // 3. User Input
    parts.push(context.user_input);

    Ok(parts.join("\n"))
}
