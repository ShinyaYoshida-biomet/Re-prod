//! RMarkdown export functionality for Re-prod.
//!
//! This module provides two export modes:
//! - Timeline-based: Exports actual execution history from the timeline
//! - Document-based: Exports the current state of an R document
//!
//! # Example
//!
//! ```no_run
//! use reprod_core::export::{RMarkdownGenerator, RMarkdownOptions, ExportMode};
//! use reprod_core::export::ReproductionBundle;
//!
//! let options = RMarkdownOptions {
//!     mode: ExportMode::Timeline,
//!     embed_plots: true,
//!     ..RMarkdownOptions::default()
//! };
//!
//! let generator = RMarkdownGenerator::new(options);
//! let bundle = ReproductionBundle::from_events(vec![]);
//! let rmd_content = generator.from_timeline(&bundle);
//! ```

use super::bundle::ReproductionBundle;
use super::metadata::BundleMetadata;
use crate::protocol::{ExecutionActor, ExecutionEvent};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tempfile::tempdir;
use tokio::{fs, process::Command};

/// Export mode for RMarkdown generation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum ExportMode {
    /// Export from timeline (actual execution history)
    #[default]
    Timeline,
    /// Export from current document (edited file)
    Document,
}

/// Output format for exports.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportFormat {
    RMarkdown,
    Pdf,
}

impl Default for ExportFormat {
    fn default() -> Self {
        Self::RMarkdown
    }
}

/// Code folding preference for HTML output.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CodeFolding {
    Show,
    Hide,
}

impl Default for CodeFolding {
    fn default() -> Self {
        Self::Show
    }
}

/// Options specific to PDF rendering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfRenderOptions {
    pub toc: bool,
    pub include_source: bool,
    pub highlight_theme: String,
    pub fig_width: f64,
    pub fig_height: f64,
    #[serde(default)]
    pub latex_preamble: Option<String>,
}

impl Default for PdfRenderOptions {
    fn default() -> Self {
        Self {
            toc: true,
            include_source: true,
            highlight_theme: "tango".to_string(),
            fig_width: 7.0,
            fig_height: 5.0,
            latex_preamble: None,
        }
    }
}

/// Options for RMarkdown export.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RMarkdownOptions {
    pub mode: ExportMode,
    pub show_code: bool,
    pub code_folding: CodeFolding,
    pub include_timestamps: bool,
    pub show_actor: bool,
    pub embed_plots: bool,
    pub include_outputs: bool,
    pub include_errors: bool,
    pub include_summary: bool,
    pub output_head_lines: usize,
    pub output_tail_lines: usize,
    pub output_max_lines: usize,
}

impl Default for RMarkdownOptions {
    fn default() -> Self {
        Self {
            mode: ExportMode::Timeline,
            show_code: true,
            code_folding: CodeFolding::Show,
            include_timestamps: true,
            show_actor: true,
            embed_plots: true,
            include_outputs: true,
            include_errors: false,
            include_summary: true,
            output_head_lines: 20,
            output_tail_lines: 8,
            output_max_lines: 200,
        }
    }
}

/// RMarkdown generator for Re-prod exports.
pub struct RMarkdownGenerator {
    options: RMarkdownOptions,
}

impl RMarkdownGenerator {
    /// Create a new RMarkdown generator with the given options.
    pub const fn new(options: RMarkdownOptions) -> Self {
        Self { options }
    }

    /// Generate RMarkdown from timeline events (Mode A: Timeline-based).
    pub fn from_timeline(&self, bundle: &ReproductionBundle) -> String {
        let mut rmd = self.generate_yaml_header_timeline(bundle);
        rmd.push_str(&self.generate_session_info(bundle));
        rmd.push_str(&self.generate_timeline_events(bundle));
        if self.options.include_summary {
            rmd.push_str(&self.generate_summary(bundle));
        }
        rmd.push_str(&self.generate_footer());
        rmd
    }

    /// Generate RMarkdown from current document (Mode B: Document-based).
    pub fn from_document(
        &self,
        document_path: &str,
        document_content: &str,
        metadata: &BundleMetadata,
    ) -> String {
        let mut rmd = self.generate_yaml_header_document(document_path);
        rmd.push_str(&self.generate_document_overview(document_path));
        rmd.push_str(&self.extract_code_chunks(document_content));
        rmd.push_str(&self.generate_footer_document(metadata));
        rmd
    }

    // ===== Timeline Mode Helpers =====

    fn chunk_header(&self, chunk_id: &str) -> String {
        if self.options.show_code {
            format!("```{{r {}}}\n", chunk_id)
        } else {
            format!("```{{r {}, echo=FALSE}}\n", chunk_id)
        }
    }

    fn generate_yaml_header_timeline(&self, bundle: &ReproductionBundle) -> String {
        let code_folding = match self.options.code_folding {
            CodeFolding::Show => "show",
            CodeFolding::Hide => "hide",
        };

        format!(
            r#"---
title: "Re-prod Analysis Report (Timeline Export)"
author: "Generated by Re-prod"
date: "{}"
output:
  html_document:
    toc: true
    toc_depth: 2
    code_folding: {}
    theme: united
geometry: "margin=1in"
fontsize: 11pt
header-includes:
  - |
    \usepackage{{xcolor}}
    \usepackage{{helvet}}
    \renewcommand{{\familydefault}}{{\sfdefault}}
    \newenvironment{{rpoutput}}{{\begin{{quote}}\colorbox{{gray!10}}{{\begin{{minipage}}{{0.97\linewidth}}}}}}{{\end{{minipage}}\end{{quote}}}}
    \newenvironment{{rperror}}{{\begin{{quote}}\colorbox{{red!5}}{{\begin{{minipage}}{{0.97\linewidth}}}}}}{{\end{{minipage}}\end{{quote}}}}
---

"#,
            bundle.metadata.created_at, code_folding
        )
    }

    fn generate_session_info(&self, bundle: &ReproductionBundle) -> String {
        let duration_sec = bundle.metadata.session.duration_ms as f64 / 1000.0;
        format!(
            r#"# Session Information

- **Bundle ID**: {}
- **Created**: {}
- **Total Events**: {}
- **Duration**: {:.1} seconds

"#,
            bundle.metadata.bundle_id,
            bundle.metadata.created_at,
            bundle.metadata.session.total_events,
            duration_sec
        )
    }

    fn generate_timeline_events(&self, bundle: &ReproductionBundle) -> String {
        let mut content = String::from("# Timeline Export\n\n");
        content.push_str(
            "This document represents the **actual execution history** \
             captured by Re-prod. All code chunks were executed in the \
             order shown below.\n\n---\n\n",
        );

        for (i, event) in bundle.events.iter().enumerate() {
            content.push_str(&self.format_event(i + 1, event));
        }

        content
    }

    fn format_event(&self, index: usize, event: &ExecutionEvent) -> String {
        let mut section = String::new();

        // Actor heading
        if self.options.show_actor {
            let actor = match event.context.actor {
                ExecutionActor::User => "User",
                ExecutionActor::Ai => "AI Assistant",
            };
            section.push_str(&format!("## Event {} - {}\n\n", index, actor));
        } else {
            section.push_str(&format!("## Event {}\n\n", index));
        }

        // Metadata
        if self.options.include_timestamps {
            section.push_str(&format!(
                "**Executed**: {}  \n",
                format_timestamp(event.context.triggered_at_ms)
            ));
        }
        section.push_str(&format!("**Source**: {:?}  \n", event.context.source));
        if let Some(doc) = &event.context.document_path {
            section.push_str(&format!("**Document**: {}  \n", doc));
        }
        section.push('\n');

        // Code chunks
        for (block_idx, block) in event.blocks.iter().enumerate() {
            let chunk_id = format!("event-{}-block-{}", index, block_idx);
            section.push_str(&self.chunk_header(&chunk_id));
            section.push_str(&block.code);
            if !block.code.ends_with('\n') {
                section.push('\n');
            }
            section.push_str("```\n\n");

            // Output
            if self.options.include_outputs && !event.result.output.is_empty() {
                let (trimmed, truncated) = self.trim_output(&event.result.output);
                section.push_str("::: {.rp-output}\n```\n");
                section.push_str(&trimmed);
                if !trimmed.ends_with('\n') {
                    section.push('\n');
                }
                if truncated {
                    section.push_str("... (output truncated)\n");
                }
                section.push_str("```\n:::\n\n");
            }

            // Error
            if self.options.include_errors {
                if let Some(error) = &event.result.error {
                    let (trimmed, truncated) = self.trim_output(error);
                    section.push_str("::: {.rp-error}\n```\n");
                    section.push_str(&trimmed);
                    if !trimmed.ends_with('\n') {
                        section.push('\n');
                    }
                    if truncated {
                        section.push_str("... (error truncated)\n");
                    }
                    section.push_str("```\n:::\n\n");
                }
            }
        }

        // Plots
        if self.options.embed_plots && !event.result.plots.is_empty() {
            for plot in &event.result.plots {
                section.push_str(&format!("![Plot]({})\n\n", plot.filename));
            }
        }

        section.push_str("---\n\n");
        section
    }

    fn trim_output(&self, text: &str) -> (String, bool) {
        let lines: Vec<&str> = text.lines().collect();
        let total = lines.len();
        if total <= self.options.output_max_lines {
            return (text.to_string(), false);
        }

        let head = self.options.output_head_lines.min(total);
        let tail = self
            .options
            .output_tail_lines
            .min(total.saturating_sub(head));

        if head + tail >= total {
            return (text.to_string(), false);
        }

        let mut result = String::new();
        for line in lines.iter().take(head) {
            result.push_str(line);
            result.push('\n');
        }
        let skipped = total.saturating_sub(head + tail);
        result.push_str(&format!("... ({} lines truncated) ...\n", skipped));
        if tail > 0 {
            for line in lines.iter().skip(total - tail) {
                result.push_str(line);
                result.push('\n');
            }
        }
        (result, true)
    }

    fn generate_summary(&self, bundle: &ReproductionBundle) -> String {
        let stats = &bundle.metadata.statistics;
        let total = stats.total_executions as f64;

        let user_pct = if total > 0.0 {
            (stats.user_actions as f64 / total) * 100.0
        } else {
            0.0
        };

        let ai_pct = if total > 0.0 {
            (stats.ai_actions as f64 / total) * 100.0
        } else {
            0.0
        };

        let duration_sec = bundle.metadata.session.duration_ms as f64 / 1000.0;

        format!(
            r#"# Session Summary

## Statistics

- **Total Executions**: {}
- **User Actions**: {} ({:.1}%)
- **AI Actions**: {} ({:.1}%)
- **Total Plots**: {}
- **Errors**: {}
- **Duration**: {:.2} seconds

## Environment

- **R Path**: {}
- **Platform**: {}
- **Working Directory**: {}
- **Re-prod Version**: {}

"#,
            stats.total_executions,
            stats.user_actions,
            user_pct,
            stats.ai_actions,
            ai_pct,
            stats.total_plots,
            stats.total_errors,
            duration_sec,
            bundle.metadata.environment.r_path,
            bundle.metadata.environment.platform,
            bundle.metadata.environment.working_dir,
            bundle.metadata.re_prod_version,
        )
    }

    fn generate_footer(&self) -> String {
        "\n---\n\n*Generated by Re-prod - Reproducible R Analysis Environment*\n".to_string()
    }

    // ===== Document Mode Helpers =====

    fn generate_yaml_header_document(&self, document_path: &str) -> String {
        let code_folding = match self.options.code_folding {
            CodeFolding::Show => "show",
            CodeFolding::Hide => "hide",
        };

        let title = std::path::Path::new(document_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("R Analysis");

        format!(
            r#"---
title: "{}"
author: "Generated by Re-prod"
date: "{}"
output:
  html_document:
    toc: true
    code_folding: {}
geometry: "margin=1in"
fontsize: 11pt
header-includes:
  - |
    \usepackage{{xcolor}}
    \usepackage{{helvet}}
    \renewcommand{{\familydefault}}{{\sfdefault}}
    \newenvironment{{rpoutput}}{{\begin{{quote}}\colorbox{{gray!10}}{{\begin{{minipage}}{{0.97\linewidth}}}}}}{{\end{{minipage}}\end{{quote}}}}
    \newenvironment{{rperror}}{{\begin{{quote}}\colorbox{{red!5}}{{\begin{{minipage}}{{0.97\linewidth}}}}}}{{\end{{minipage}}\end{{quote}}}}
---

"#,
            title,
            chrono::Utc::now().format("%Y-%m-%d"),
            code_folding
        )
    }

    fn generate_document_overview(&self, document_path: &str) -> String {
        format!(
            r#"# Overview

This document contains the R code from `{}`.

"#,
            document_path
        )
    }

    fn extract_code_chunks(&self, document_content: &str) -> String {
        let mut content = String::from("# Code\n\n");

        // Split by R section markers (# ---- or # ==== comments)
        let lines: Vec<&str> = document_content.lines().collect();
        let mut current_section = String::new();
        let mut section_number = 0;

        for line in lines {
            // Check for section headers (# Section ---- or # Section ====)
            if line.starts_with('#') && (line.contains("----") || line.contains("====")) {
                // Flush previous section if any
                if !current_section.trim().is_empty() {
                    section_number += 1;
                    content.push_str(&self.chunk_header(&format!("chunk-{}", section_number)));
                    content.push_str(&current_section);
                    if !current_section.ends_with('\n') {
                        content.push('\n');
                    }
                    content.push_str("```\n\n");
                    current_section.clear();
                }

                // Add section header as markdown
                let section_title = line
                    .trim_start_matches('#')
                    .replace("----", "")
                    .replace("====", "")
                    .trim()
                    .to_string();
                if !section_title.is_empty() {
                    content.push_str(&format!("## {}\n\n", section_title));
                }
            } else {
                current_section.push_str(line);
                current_section.push('\n');
            }
        }

        // Flush final section
        if !current_section.trim().is_empty() {
            section_number += 1;
            content.push_str(&self.chunk_header(&format!("chunk-{}", section_number)));
            content.push_str(&current_section);
            if !current_section.ends_with('\n') {
                content.push('\n');
            }
            content.push_str("```\n\n");
        }

        content
    }

    fn generate_footer_document(&self, metadata: &BundleMetadata) -> String {
        format!(
            r#"---

*Generated by Re-prod*
*Exported: {}*
*Re-prod Version: {}*
"#,
            metadata.created_at, metadata.re_prod_version
        )
    }
}

/// Format timestamp in milliseconds to human-readable format.
fn format_timestamp(ms: u64) -> String {
    let duration = chrono::Duration::milliseconds(ms as i64);
    let datetime = chrono::DateTime::<chrono::Utc>::from_timestamp(
        duration.num_seconds(),
        (duration.num_milliseconds() % 1000 * 1_000_000) as u32,
    )
    .unwrap_or_else(chrono::Utc::now);

    datetime.format("%Y-%m-%d %H:%M:%S UTC").to_string()
}

/// Render a PDF from RMarkdown content using R.
pub async fn render_pdf_document(
    r_path: &str,
    working_dir: &Path,
    rmd_content: &str,
    output_path: &Path,
    pdf_options: &PdfRenderOptions,
) -> Result<(), String> {
    let resolved_output = if output_path.is_relative() {
        working_dir.join(output_path)
    } else {
        output_path.to_path_buf()
    };
    let output_dir = resolved_output
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| working_dir.to_path_buf());

    if let Some(parent) = resolved_output.parent() {
        fs::create_dir_all(parent).await.map_err(|e| {
            format!(
                "Failed to create output directory {}: {}",
                parent.display(),
                e
            )
        })?;
    }

    let temp_dir = tempdir().map_err(|e| format!("Failed to create temp directory: {}", e))?;
    let rmd_path = temp_dir.path().join("export.Rmd");
    let script_path = temp_dir.path().join("render.R");

    fs::write(&rmd_path, rmd_content)
        .await
        .map_err(|e| format!("Failed to write temporary RMarkdown: {}", e))?;

    let preamble_path = if let Some(preamble) = &pdf_options.latex_preamble {
        let path = temp_dir.path().join("preamble.tex");
        fs::write(&path, preamble)
            .await
            .map_err(|e| format!("Failed to write LaTeX preamble: {}", e))?;
        Some(path)
    } else {
        None
    };

    let script = build_pdf_render_script(
        &rmd_path,
        &resolved_output,
        working_dir,
        &output_dir,
        pdf_options,
        preamble_path.as_ref().map(|p| p.as_path()),
    );

    fs::write(&script_path, script)
        .await
        .map_err(|e| format!("Failed to write render script: {}", e))?;

    let output = Command::new(r_path)
        .args([
            "--vanilla",
            "--quiet",
            script_path.to_string_lossy().as_ref(),
        ])
        .current_dir(working_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to start Rscript for PDF export: {}", e))?;

    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let combined = [stdout.trim(), stderr.trim()]
            .iter()
            .filter(|s| !s.is_empty())
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");
        let message = if combined.is_empty() {
            "PDF export failed. Check R logs for details.".to_string()
        } else {
            combined
        };
        return Err(message);
    }

    Ok(())
}

fn build_pdf_render_script(
    rmd_path: &Path,
    output_path: &Path,
    working_dir: &Path,
    output_dir: &Path,
    options: &PdfRenderOptions,
    preamble_path: Option<&Path>,
) -> String {
    let include_source = if options.include_source {
        "TRUE"
    } else {
        "FALSE"
    };
    let toc = if options.toc { "TRUE" } else { "FALSE" };
    let includes = preamble_path.map_or_else(
        || "rmarkdown::includes()".to_string(),
        |path| {
            format!(
                "rmarkdown::includes(in_header = \"{}\")",
                escape_r_string(&path.to_string_lossy())
            )
        },
    );

    let root_dir = escape_r_string(&working_dir.to_string_lossy());
    let rmd_path = escape_r_string(&rmd_path.to_string_lossy());
    let output_dir = escape_r_string(&output_dir.to_string_lossy());
    let output_file = output_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(escape_r_string)
        .unwrap_or_else(|| "analysis.pdf".to_string());
    let highlight = escape_r_string(&options.highlight_theme);

    format!(
        r#"
render_pdf <- function() {{
  old_wd <- getwd()
  on.exit(setwd(old_wd), add = TRUE)
  setwd("{root_dir}")

  if (!requireNamespace("rmarkdown", quietly = TRUE)) {{
    stop("PDF export requires the 'rmarkdown' package. Install it with install.packages('rmarkdown').")
  }}

  has_latex <- nzchar(Sys.which("pdflatex"))
  if (!has_latex && requireNamespace("tinytex", quietly = TRUE)) {{
    has_latex <- tinytex::is_tinytex_installed() || tinytex::is_latex_installed()
  }}

  if (!has_latex) {{
    stop("PDF export requires LaTeX. Install TinyTeX by running: tinytex::install_tinytex()")
  }}

  knitr::opts_knit$set(root.dir = "{root_dir}")
  knitr::opts_chunk$set(
    echo = {include_source},
    fig.width = {fig_width},
    fig.height = {fig_height},
    message = FALSE,
    warning = FALSE
  )

  output_format <- rmarkdown::pdf_document(
    toc = {toc},
    highlight = "{highlight}",
    fig_width = {fig_width},
    fig_height = {fig_height},
    includes = {includes}
  )

  rmarkdown::render(
    input = "{rmd_path}",
    output_file = "{output_file}",
    output_dir = "{output_dir}",
    output_format = output_format,
    quiet = TRUE,
    envir = new.env(parent = globalenv())
  )
}}

tryCatch(
  render_pdf(),
  error = function(e) {{
    message(e$message)
    quit(status = 1)
  }}
)
"#,
        root_dir = root_dir,
        include_source = include_source,
        fig_width = options.fig_width,
        fig_height = options.fig_height,
        toc = toc,
        highlight = highlight,
        includes = includes,
        rmd_path = rmd_path,
        output_file = output_file,
        output_dir = output_dir
    )
}

fn escape_r_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{
        CodeBlockKind, CodeBlockMetadata, EnvironmentSnapshot, ExecutionContext, ExecutionResult,
        ExecutionSource, PlotInfo,
    };

    fn create_test_event(event_id: &str, actor: ExecutionActor, has_plot: bool) -> ExecutionEvent {
        ExecutionEvent {
            event_id: event_id.to_string(),
            context: ExecutionContext {
                source: ExecutionSource::Cell,
                document_path: Some("test.R".to_string()),
                cell_index: Some(1),
                triggered_at_ms: 1699200000000,
                actor,
            },
            blocks: vec![CodeBlockMetadata {
                id: "block-1".to_string(),
                index: 0,
                kind: CodeBlockKind::Section,
                label: Some("Test".to_string()),
                start_line: 1,
                end_line: 3,
                code: "x <- 1:10\nprint(x)".to_string(),
            }],
            result: ExecutionResult {
                success: true,
                output: "[1] 1 2 3 4 5".to_string(),
                error: None,
                plots: if has_plot {
                    vec![PlotInfo {
                        id: "plot-id".to_string(),
                        filename: "plots/plot_001.png".to_string(),
                        base64_data: "iVBORw0KG...".to_string(),
                        index: 0,
                        width: None,
                        height: None,
                        timestamp: None,
                        code: None,
                        storage_path: None,
                        snapshot_path: None,
                    }]
                } else {
                    vec![]
                },
                execution_time_ms: 42,
            },
            environment: EnvironmentSnapshot {
                r_path: "Rscript".to_string(),
                working_dir: "/tmp/test".to_string(),
                temp_dir: "/tmp/reprod".to_string(),
            },
            created_at_ms: 1699200001000,
        }
    }

    #[test]
    fn test_timeline_export_basic() {
        let options = RMarkdownOptions::default();
        let generator = RMarkdownGenerator::new(options);

        let events = vec![
            create_test_event("evt-1", ExecutionActor::User, false),
            create_test_event("evt-2", ExecutionActor::Ai, false),
        ];
        let bundle = ReproductionBundle::from_events(events);
        let rmd = generator.from_timeline(&bundle);

        // Check YAML header
        assert!(rmd.contains("---"));
        assert!(rmd.contains("title:"));
        assert!(rmd.contains("Re-prod Analysis Report"));

        // Check code chunks
        assert!(rmd.contains("```{r"));
        assert!(rmd.contains("x <- 1:10"));
        assert!(rmd.contains("print(x)"));

        // Check session summary
        assert!(rmd.contains("# Session Summary"));
        assert!(rmd.contains("Total Executions"));
    }

    #[test]
    fn test_timeline_export_with_actors() {
        let options = RMarkdownOptions {
            show_actor: true,
            ..Default::default()
        };
        let generator = RMarkdownGenerator::new(options);

        let events = vec![
            create_test_event("evt-1", ExecutionActor::User, false),
            create_test_event("evt-2", ExecutionActor::Ai, false),
        ];
        let bundle = ReproductionBundle::from_events(events);
        let rmd = generator.from_timeline(&bundle);

        assert!(rmd.contains("Event 1 - User"));
        assert!(rmd.contains("Event 2 - AI Assistant"));
    }

    #[test]
    fn test_timeline_export_without_actors() {
        let options = RMarkdownOptions {
            show_actor: false,
            ..Default::default()
        };
        let generator = RMarkdownGenerator::new(options);

        let events = vec![create_test_event("evt-1", ExecutionActor::User, false)];
        let bundle = ReproductionBundle::from_events(events);
        let rmd = generator.from_timeline(&bundle);

        assert!(rmd.contains("## Event 1\n"));
        // Check that actor labels are not in event headings
        assert!(!rmd.contains("## Event 1 - User"));
        assert!(!rmd.contains("## Event 1 - AI Assistant"));
    }

    #[test]
    fn test_timeline_export_with_plots() {
        let options = RMarkdownOptions {
            embed_plots: true,
            ..Default::default()
        };
        let generator = RMarkdownGenerator::new(options);

        let events = vec![create_test_event("evt-1", ExecutionActor::User, true)];
        let bundle = ReproductionBundle::from_events(events);
        let rmd = generator.from_timeline(&bundle);

        assert!(rmd.contains("![Plot](plots/plot_001.png)"));
    }

    #[test]
    fn test_timeline_export_without_plots() {
        let options = RMarkdownOptions {
            embed_plots: false,
            ..Default::default()
        };
        let generator = RMarkdownGenerator::new(options);

        let events = vec![create_test_event("evt-1", ExecutionActor::User, true)];
        let bundle = ReproductionBundle::from_events(events);
        let rmd = generator.from_timeline(&bundle);

        assert!(!rmd.contains("![Plot]"));
    }

    #[test]
    fn test_timeline_export_with_outputs() {
        let options = RMarkdownOptions {
            include_outputs: true,
            ..Default::default()
        };
        let generator = RMarkdownGenerator::new(options);

        let events = vec![create_test_event("evt-1", ExecutionActor::User, false)];
        let bundle = ReproductionBundle::from_events(events);
        let rmd = generator.from_timeline(&bundle);

        assert!(rmd.contains("::: {.rp-output}"));
        assert!(rmd.contains("[1] 1 2 3 4 5"));
    }

    #[test]
    fn test_timeline_export_without_outputs() {
        let options = RMarkdownOptions {
            include_outputs: false,
            ..Default::default()
        };
        let generator = RMarkdownGenerator::new(options);

        let events = vec![create_test_event("evt-1", ExecutionActor::User, false)];
        let bundle = ReproductionBundle::from_events(events);
        let rmd = generator.from_timeline(&bundle);

        assert!(!rmd.contains("**Output**:"));
        assert!(!rmd.contains("[1] 1 2 3 4 5"));
    }

    #[test]
    fn test_timeline_export_with_errors() {
        let options = RMarkdownOptions {
            include_errors: true,
            ..Default::default()
        };
        let generator = RMarkdownGenerator::new(options);

        let mut event = create_test_event("evt-1", ExecutionActor::User, false);
        event.result.error = Some("Error: object not found".to_string());

        let bundle = ReproductionBundle::from_events(vec![event]);
        let rmd = generator.from_timeline(&bundle);

        assert!(rmd.contains("::: {.rp-error}"));
        assert!(rmd.contains("Error: object not found"));
    }

    #[test]
    fn test_timeline_export_without_summary() {
        let options = RMarkdownOptions {
            include_summary: false,
            ..Default::default()
        };
        let generator = RMarkdownGenerator::new(options);

        let events = vec![create_test_event("evt-1", ExecutionActor::User, false)];
        let bundle = ReproductionBundle::from_events(events);
        let rmd = generator.from_timeline(&bundle);

        assert!(!rmd.contains("# Session Summary"));
    }

    #[test]
    fn test_document_export_basic() {
        let options = RMarkdownOptions {
            mode: ExportMode::Document,
            ..Default::default()
        };
        let generator = RMarkdownGenerator::new(options);

        let doc_content = "library(ggplot2)\nggplot(mtcars, aes(x = wt, y = mpg)) + geom_point()";
        let metadata = BundleMetadata::new("test-bundle".to_string());
        let rmd = generator.from_document("analysis.R", doc_content, &metadata);

        assert!(rmd.contains("---"));
        assert!(rmd.contains("title:"));
        assert!(rmd.contains("analysis"));
        assert!(rmd.contains("library(ggplot2)"));
        assert!(rmd.contains("ggplot(mtcars"));
    }

    #[test]
    fn test_document_export_with_sections() {
        let options = RMarkdownOptions {
            mode: ExportMode::Document,
            ..Default::default()
        };
        let generator = RMarkdownGenerator::new(options);

        let doc_content = r#"# Setup ----
library(ggplot2)

# Analysis ----
ggplot(mtcars, aes(x = wt, y = mpg)) + geom_point()
"#;
        let metadata = BundleMetadata::new("test-bundle".to_string());
        let rmd = generator.from_document("analysis.R", doc_content, &metadata);

        assert!(rmd.contains("## Setup"));
        assert!(rmd.contains("## Analysis"));
        assert!(rmd.contains("library(ggplot2)"));
        assert!(rmd.contains("ggplot(mtcars"));
    }

    #[test]
    fn test_document_export_empty_content() {
        let options = RMarkdownOptions {
            mode: ExportMode::Document,
            ..Default::default()
        };
        let generator = RMarkdownGenerator::new(options);

        let doc_content = "";
        let metadata = BundleMetadata::new("test-bundle".to_string());
        let rmd = generator.from_document("empty.R", doc_content, &metadata);

        assert!(rmd.contains("---"));
        assert!(rmd.contains("title:"));
        assert!(rmd.contains("empty"));
    }

    #[test]
    fn test_format_timestamp() {
        let ms = 1699200000000u64; // 2023-11-05 14:40:00 UTC
        let formatted = format_timestamp(ms);

        assert!(formatted.contains("2023"));
        assert!(formatted.contains("UTC"));
    }

    #[test]
    fn test_export_mode_default() {
        let mode = ExportMode::default();
        assert_eq!(mode, ExportMode::Timeline);
    }

    #[test]
    fn test_rmarkdown_options_default() {
        let options = RMarkdownOptions::default();
        assert_eq!(options.mode, ExportMode::Timeline);
        assert!(options.show_code);
        assert_eq!(options.code_folding, CodeFolding::Show);
        assert!(options.include_timestamps);
        assert!(options.show_actor);
        assert!(options.embed_plots);
        assert!(options.include_outputs);
        assert!(!options.include_errors);
        assert!(options.include_summary);
        assert_eq!(options.output_head_lines, 20);
        assert_eq!(options.output_tail_lines, 8);
        assert_eq!(options.output_max_lines, 200);
    }
}
