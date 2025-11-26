use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::projects::ProjectRuntime;

use super::common::{error_response, single_response, AppState, WSResponse};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use reprod_core::{
    api::timeline::{ExportRMarkdownRequest, ExportRMarkdownResponse},
    executor::timeline::{SortOrder, TimelineQuery},
    export::{
        render_pdf_document, BundleMetadata, ExportFormat, ExportMode, PdfRenderOptions,
        RMarkdownGenerator, ReproductionBundle,
    },
};

pub(super) async fn handle_export_request(
    state: &AppState,
    runtime: &Arc<ProjectRuntime>,
    request: ExportRMarkdownRequest,
) -> Vec<WSResponse> {
    eprintln!(
        "[handlers] Processing export_rmarkdown request: mode={:?}, format={}",
        request.mode(),
        request.format
    );

    let r_path = {
        let config = state.config.lock().await;
        config.r_path.clone()
    };

    match process_export_request(request, runtime, &r_path).await {
        Ok(response) => {
            eprintln!("[handlers] Export successful: {}", response.output_path());
            single_response(WSResponse::ExportRMarkdownResponse { response })
        }
        Err(e) => {
            eprintln!("[handlers] Export failed: {}", e);
            error_response(format!("RMarkdown export failed: {}", e))
        }
    }
}

async fn process_export_request(
    request: ExportRMarkdownRequest,
    runtime: &Arc<ProjectRuntime>,
    r_path: &str,
) -> Result<ExportRMarkdownResponse, String> {
    let document_path = request.document_path();

    let (mode, format, options, pdf_options, output_path) = request
        .into_options()
        .map_err(|e| format!("Invalid export options: {}", e))?;

    let generator = RMarkdownGenerator::new(options.clone());

    let (mut content, bundle_opt) = match mode {
        ExportMode::Timeline => {
            let query = TimelineQuery {
                filters: None,
                sort: Some(SortOrder::Asc),
                limit: Some(10_000),
                offset: None,
            };

            let response = runtime
                .timeline
                .query(query)
                .map_err(|e| format!("Failed to query timeline: {}", e))?;

            let bundle = ReproductionBundle::from_events(response.events);
            (generator.from_timeline(&bundle), Some(bundle))
        }
        ExportMode::Document => {
            let doc_path = document_path.ok_or("Document path is required for document mode")?;

            let doc_content = tokio::fs::read_to_string(&doc_path)
                .await
                .map_err(|e| format!("Failed to read document: {}", e))?;

            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let metadata = BundleMetadata::new(format!("export-{}", timestamp));

            (
                generator.from_document(&doc_path, &doc_content, &metadata),
                None,
            )
        }
    };

    match format {
        ExportFormat::RMarkdown => {
            tokio::fs::write(&output_path, content)
                .await
                .map_err(|e| format!("Failed to write RMarkdown file: {}", e))?;

            Ok(ExportRMarkdownResponse::success(output_path))
        }
        ExportFormat::Pdf => {
            let working_dir = runtime.descriptor.root_path.clone();
            let pdf_options = pdf_options.unwrap_or_else(PdfRenderOptions::default);
            let output_path = PathBuf::from(output_path);

            if options.embed_plots {
                if let Some(bundle) = bundle_opt.as_ref() {
                    materialize_plots(bundle, &working_dir)
                        .await
                        .map_err(|e| format!("Failed to prepare plot images: {}", e))?;

                    // Rewrite plot paths to absolute paths to avoid LaTeX lookup issues.
                    for event in &bundle.events {
                        for plot in &event.result.plots {
                            let filename = plot.filename.trim();
                            let abs_path = working_dir.join(filename);
                            let abs_str = abs_path.to_string_lossy();
                            content = content.replace(filename, &abs_str);
                        }
                    }
                }
            }

            render_pdf_document(r_path, &working_dir, &content, &output_path, &pdf_options)
                .await
                .map_err(|e| format!("Failed to render PDF: {}", e))?;

            Ok(ExportRMarkdownResponse::success(
                output_path.to_string_lossy().to_string(),
            ))
        }
    }
}

async fn materialize_plots(bundle: &ReproductionBundle, working_dir: &Path) -> Result<(), String> {
    for event in &bundle.events {
        for plot in &event.result.plots {
            let filename = plot.filename.trim();
            let mut targets = Vec::new();

            let primary = working_dir.join(filename);
            targets.push(primary.clone());

            if primary.parent().is_none() {
                targets.push(working_dir.join("plots").join(filename));
            }

            let bytes = BASE64_STANDARD
                .decode(plot.base64_data.trim())
                .map_err(|e| format!("Failed to decode plot {}: {}", plot.filename, e))?;

            for target_path in targets {
                if let Some(parent) = target_path.parent() {
                    tokio::fs::create_dir_all(parent).await.map_err(|e| {
                        format!(
                            "Failed to create plot directory {}: {}",
                            parent.display(),
                            e
                        )
                    })?;
                }

                tokio::fs::write(&target_path, &bytes)
                    .await
                    .map_err(|e| format!("Failed to write plot {}: {}", plot.filename, e))?;
            }
        }
    }

    Ok(())
}
