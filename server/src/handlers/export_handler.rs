use super::common::{error_response, single_response, AppState, WSResponse};
use reprod_core::{
    api::timeline::{ExportRMarkdownRequest, ExportRMarkdownResponse},
    executor::timeline::{SortOrder, TimelineQuery},
    export::{BundleMetadata, ExportMode, RMarkdownGenerator, ReproductionBundle},
};

pub(super) async fn handle_export_request(
    state: &AppState,
    request: ExportRMarkdownRequest,
) -> Vec<WSResponse> {
    eprintln!(
        "[handlers] Processing export_rmarkdown request: mode={:?}",
        request.mode()
    );

    match process_export_request(request, state).await {
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
    state: &AppState,
) -> Result<ExportRMarkdownResponse, String> {
    let document_path = request.document_path();

    let (mode, options, output_path) = request
        .into_options()
        .map_err(|e| format!("Invalid export options: {}", e))?;

    let generator = RMarkdownGenerator::new(options);

    let content = match mode {
        ExportMode::Timeline => {
            let query = TimelineQuery {
                filters: None,
                sort: Some(SortOrder::Asc),
                limit: Some(10_000),
                offset: None,
            };

            let response = state
                .timeline
                .query(query)
                .map_err(|e| format!("Failed to query timeline: {}", e))?;

            let bundle = ReproductionBundle::from_events(response.events);
            generator.from_timeline(&bundle)
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

            generator.from_document(&doc_path, &doc_content, &metadata)
        }
    };

    tokio::fs::write(&output_path, content)
        .await
        .map_err(|e| format!("Failed to write RMarkdown file: {}", e))?;

    Ok(ExportRMarkdownResponse::success(output_path))
}
