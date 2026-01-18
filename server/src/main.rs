// Allow expect for critical initialization failures where panic is appropriate
#![allow(clippy::expect_used)]

mod acp;
mod conversions;
mod handlers;
mod http;
mod projects;
mod repo_tools;
mod routes;

use axum::{routing::get, Router};
use reprod_core::{Config, ToolExecutor, ToolRegistry};
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

    let projects = Arc::new(
        projects::ProjectController::new(config_state.clone())
            .await
            .expect("Failed to initialize project controller"),
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
        .route("/api/config/model/:provider", get(routes::get_model))
        .route(
            "/api/config/model/:provider",
            axum::routing::put(routes::set_model),
        )
        .route(
            "/api/config/test/:provider",
            axum::routing::post(routes::test_provider),
        )
        .route("/api/tools", get(routes::list_tools))
        .route(
            "/api/tools/execute",
            axum::routing::post(routes::execute_tool),
        )
        .route("/api/acp/agents", get(routes::acp_detect_agents))
        .route("/api/acp/config", get(routes::acp_get_config))
        .route(
            "/api/acp/config",
            axum::routing::put(routes::acp_set_config),
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
            config: config_state,
            tool_registry: tool_registry.clone(),
            tool_executor: tool_executor.clone(),
            request_counter: Arc::new(AtomicU64::new(0)),
            projects: projects.clone(),
            approvals: Arc::new(handlers::ApprovalManager::new()),
            cancels: Arc::new(handlers::CancelManager::new()),
        });

    let port = reprod_core::config::server_port_override().unwrap_or(3001);
    let addr = format!("127.0.0.1:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("Failed to bind to {}: {}", addr, e));

    tracing::info!("Re-prod server running on http://{}", addr);
    tracing::info!("WebSocket available at ws://{}/ws", addr);

    axum::serve(listener, app)
        .await
        .unwrap_or_else(|e| panic!("Server error: {}", e));
}
