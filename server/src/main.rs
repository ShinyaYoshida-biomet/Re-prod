// Allow expect for critical initialization failures where panic is appropriate
#![allow(clippy::expect_used)]

mod conversions;
mod handlers;
mod http;
mod routes;

use axum::{routing::get, Router};
use reprod_core::{
    ai::tools::{FileSystemTool, RContextTool},
    executor::timeline::{JsonTimeline, TimelineSink},
    Config, RExecutor, ToolExecutor, ToolRegistry,
};
use std::path::PathBuf;
use std::sync::{atomic::AtomicU64, Arc};
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Load config
    let config = Config::load().unwrap_or_default();

    // Initialize services
    let temp_dir = std::env::temp_dir().join("reprod");
    if let Err(e) = std::fs::create_dir_all(&temp_dir) {
        eprintln!("Failed to create temp directory: {}", e);
    }

    // Initialize timeline storage (shared between executor and websocket pushes)
    let timeline_file_path = temp_dir.join("timeline.ndjson");
    let timeline = JsonTimeline::new(timeline_file_path).unwrap_or_else(|error| {
        tracing::warn!(
            "Failed to initialize timeline storage: {}. Using in-memory timeline.",
            error
        );
        JsonTimeline::new_in_memory().expect("Failed to create in-memory timeline")
    });
    let timeline = Arc::new(timeline);
    let shared_timeline: Arc<dyn TimelineSink> = timeline.clone();
    tracing::info!("Timeline storage initialized");

    let r_executor = Arc::new(Mutex::new(
        RExecutor::builder(temp_dir.clone(), config.r_path.clone())
            .with_shared_timeline(shared_timeline.clone())
            .build(),
    ));

    let config_state = Arc::new(Mutex::new(config));

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../core/tools");
    tracing::info!(
        "Attempting to load tool manifests from: {}",
        manifest_dir.display()
    );
    let tool_registry = ToolRegistry::load_from_dir(&manifest_dir).unwrap_or_else(|error| {
        tracing::warn!(
            "Failed to load tool manifests from {}: {}. Continuing with empty registry.",
            manifest_dir.display(),
            error
        );
        ToolRegistry::new()
    });
    tracing::info!("Loaded {} tool manifests", tool_registry.len());
    let tool_registry = Arc::new(tool_registry);

    let tool_executor = Arc::new(ToolExecutor::new(tool_registry.clone()));

    // Initialize AI tools
    let workspace_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let filesystem_tool = Arc::new(FileSystemTool::new(workspace_root.clone()));
    let r_context_tool = Arc::new(RContextTool::new());
    tracing::info!(
        "AI tools initialized with workspace: {}",
        workspace_root.display()
    );

    // Build application
    let app = Router::new()
        .route("/health", get(routes::health))
        .route("/api/execute", axum::routing::post(routes::execute_r_code))
        .route(
            "/api/ai/message",
            axum::routing::post(routes::send_ai_message),
        )
        .route("/api/config/key/:provider", get(routes::get_api_key))
        .route(
            "/api/config/key/:provider",
            axum::routing::put(routes::set_api_key),
        )
        .route("/api/config/provider", get(routes::get_provider))
        .route(
            "/api/config/provider",
            axum::routing::put(routes::set_provider),
        )
        .route("/api/tools", get(routes::list_tools))
        .route(
            "/api/tools/execute",
            axum::routing::post(routes::execute_tool),
        )
        .route("/ws", get(handlers::ws_handler))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(handlers::AppState {
            r_executor,
            config: config_state,
            tool_registry: tool_registry.clone(),
            tool_executor: tool_executor.clone(),
            timeline: timeline.clone(),
            filesystem_tool: filesystem_tool.clone(),
            r_context_tool: r_context_tool.clone(),
            request_counter: Arc::new(AtomicU64::new(0)),
        });

    let addr = "127.0.0.1:3001";
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap_or_else(|e| panic!("Failed to bind to {}: {}", addr, e));

    tracing::info!("Re-prod server running on http://{}", addr);
    tracing::info!("WebSocket available at ws://{}/ws", addr);

    axum::serve(listener, app)
        .await
        .unwrap_or_else(|e| panic!("Server error: {}", e));
}
