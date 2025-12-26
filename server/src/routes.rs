use crate::handlers::AppState;
use crate::http::{err_400, err_404, err_500, HttpError, Resp};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use reprod_acp::{
    config::{load_acp_config, normalize_active_mode, save_acp_config, ACP_MODE_API},
    detection::{detect_agents, resolve_active_agent_command},
    types::{AcpAgentConfig, AcpDetectedAgent},
};
use reprod_core::{
    ai, ChatMessage, ExecutionRequest, ExecutionResult, ToolExecutionRequest, ToolExecutionResult,
    ToolManifest,
};
use serde::Deserialize;
use tracing::info;

pub async fn health() -> &'static str {
    "OK"
}

pub async fn execute_r_code(
    State(state): State<AppState>,
    Json(payload): Json<ExecutionRequest>,
) -> Resp<ExecutionResult> {
    let runtime = state.projects.default_runtime().await.map_err(err_500)?;
    let executor = runtime.r_executor.lock().await;

    executor.execute(payload).await.map(Json).map_err(err_500)
}

pub async fn send_ai_message(
    State(state): State<AppState>,
    Json(payload): Json<AIMessageRequest>,
) -> Resp<AIMessageResponse> {
    let cfg = state.config.lock().await.clone();
    let provider = ai::from_config(&cfg);

    let mut messages = Vec::with_capacity(payload.messages.len() + 2);
    messages.push(ChatMessage {
        role: "system".to_string(),
        content: ai::PATCH_SYSTEM_PROMPT.to_string(),
    });
    messages.push(ChatMessage {
        role: "system".to_string(),
        content: ai::RANGE_SYSTEM_PROMPT.to_string(),
    });
    messages.extend(payload.messages.into_iter());

    provider
        .send_message(messages)
        .await
        .map(|response| Json(AIMessageResponse { response }))
        .map_err(err_500)
}

pub async fn get_api_key(
    Path(provider): Path<String>,
    State(state): State<AppState>,
) -> Resp<ApiKeyResponse> {
    let config = state.config.lock().await;
    let api_key = match provider.as_str() {
        ai::PROVIDER_ANTHROPIC => config.anthropic_api_key.clone(),
        ai::PROVIDER_OPENAI => config.openai_api_key.clone(),
        _ => return Err(err_400(format!("Unknown provider: {}", provider))),
    };
    drop(config);

    let masked_key = api_key.map(|key| {
        if key.len() <= 10 {
            "********".to_string()
        } else {
            let prefix = &key[0..7];
            let suffix = &key[key.len() - 4..];
            format!("{}...{}", prefix, suffix)
        }
    });

    masked_key
        .map(|key| Json(ApiKeyResponse { api_key: key }))
        .ok_or_else(|| err_404("API key not configured"))
}

pub async fn set_api_key(
    Path(provider): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<SetApiKeyRequest>,
) -> Result<StatusCode, HttpError> {
    let mut config = state.config.lock().await;

    match provider.as_str() {
        ai::PROVIDER_ANTHROPIC => config.anthropic_api_key = Some(payload.api_key),
        ai::PROVIDER_OPENAI => config.openai_api_key = Some(payload.api_key),
        _ => return Err(err_400(format!("Unknown provider: {}", provider))),
    }

    config.save().map(|_| StatusCode::OK).map_err(err_500)
}

pub async fn get_model(
    Path(provider): Path<String>,
    State(state): State<AppState>,
) -> Resp<GetModelResponse> {
    if provider != ai::PROVIDER_ANTHROPIC && provider != ai::PROVIDER_OPENAI {
        return Err(err_400(format!(
            "Invalid provider: {}. Must be 'openai' or 'anthropic'",
            provider
        )));
    }

    let config = state.config.lock().await;
    let model = config.model_for(&provider);
    Ok(Json(GetModelResponse { model }))
}

pub async fn set_model(
    Path(provider): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<SetModelRequest>,
) -> Result<StatusCode, HttpError> {
    if payload.model.trim().is_empty() {
        return Err(err_400("Model must not be empty".to_string()));
    }

    if provider != ai::PROVIDER_ANTHROPIC && provider != ai::PROVIDER_OPENAI {
        return Err(err_400(format!(
            "Invalid provider: {}. Must be 'openai' or 'anthropic'",
            provider
        )));
    }

    let mut config = state.config.lock().await;
    config.active_models.insert(provider, payload.model);
    config.save().map(|_| StatusCode::OK).map_err(err_500)
}

pub async fn test_provider(
    Path(provider_name): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<TestProviderResponse>, HttpError> {
    let config_lock = state.config.lock().await;
    let provider = ai::factory::from_name_and_config(&provider_name, &config_lock);
    drop(config_lock); // Release lock

    match provider.test_connection().await {
        Ok(_) => Ok(Json(TestProviderResponse {
            status: "success".to_string(),
            message: "Connection successful".to_string(),
        })),
        Err(e) => Err(err_500(format!("Connection test failed: {}", e))),
    }
}

pub async fn list_tools(State(state): State<AppState>) -> Json<Vec<ToolManifest>> {
    let manifests = state.tool_registry.iter().cloned().collect();
    Json(manifests)
}

pub async fn get_provider(State(state): State<AppState>) -> Resp<GetProviderResponse> {
    let config = state.config.lock().await;
    Ok(Json(GetProviderResponse {
        provider: config.default_ai_provider.clone(),
    }))
}

pub async fn set_provider(
    State(state): State<AppState>,
    Json(payload): Json<SetProviderRequest>,
) -> Result<StatusCode, HttpError> {
    if payload.provider != ai::PROVIDER_OPENAI && payload.provider != ai::PROVIDER_ANTHROPIC {
        return Err(err_400(format!(
            "Invalid provider: {}. Must be 'openai' or 'anthropic'",
            payload.provider
        )));
    }

    let mut config = state.config.lock().await;
    config.default_ai_provider = payload.provider;

    config.save().map(|_| StatusCode::OK).map_err(err_500)
}


pub async fn acp_detect_agents() -> Resp<Vec<AcpDetectedAgent>> {
    info!("Detecting ACP agents");
    detect_agents().await.map(Json).map_err(err_500)
}

pub async fn acp_get_config() -> Resp<AcpAgentConfig> {
    info!("Fetching ACP config");
    load_acp_config()
        .map(|cfg| AcpAgentConfig {
            active_mode: cfg.active_mode,
            active_agent: cfg.active_agent,
            active_agent_command: cfg.active_agent_command,
        })
        .map(Json)
        .map_err(err_500)
}

#[derive(Deserialize)]
pub struct SetAcpConfigRequest {
    pub active_mode: String,
    pub active_agent: Option<String>,
}

pub async fn acp_set_config(Json(payload): Json<SetAcpConfigRequest>) -> Resp<AcpAgentConfig> {
    info!(
        active_mode = %payload.active_mode,
        active_agent = ?payload.active_agent,
        "Saving ACP config"
    );
    let normalized_mode =
        normalize_active_mode(&payload.active_mode).map_err(|err| err_400(err.to_string()))?;

    let mut cfg = load_acp_config().unwrap_or_else(|_| Default::default());
    cfg.active_mode = normalized_mode.clone();
    cfg.active_agent = None;
    cfg.active_agent_command = None;
    if normalized_mode != ACP_MODE_API {
        let selected = payload
            .active_agent
            .clone()
            .ok_or_else(|| err_400("active_agent must be set for external_agent mode"))?;
        let detected = detect_agents().await.map_err(err_500)?;
        cfg.active_agent = Some(selected.clone());
        cfg.active_agent_command = Some(
            resolve_active_agent_command(&cfg, &detected)
                .ok_or_else(|| err_400(format!("ACP agent unavailable: {selected}")))?,
        );
    }

    save_acp_config(&cfg).map_err(err_500)?;
    info!(
        active_mode = %cfg.active_mode,
        active_agent = ?cfg.active_agent,
        active_agent_command = ?cfg.active_agent_command,
        "Saved ACP config"
    );

    Ok(Json(AcpAgentConfig {
        active_mode: cfg.active_mode,
        active_agent: cfg.active_agent,
        active_agent_command: cfg.active_agent_command,
    }))
}

pub async fn execute_tool(
    State(state): State<AppState>,
    Json(request): Json<ToolExecutionRequest>,
) -> Resp<ToolExecutionResult> {
    let runtime = state.projects.default_runtime().await.map_err(err_500)?;
    let r_executor = runtime.r_executor.lock().await;

    state
        .tool_executor
        .execute(
            &request.tool_id,
            &request.capability_id,
            request.parameters,
            &r_executor,
        )
        .await
        .map(|result| Json(crate::conversions::to_proto_tool_result(result)))
        .map_err(err_500)
}

// Request/Response types
#[derive(serde::Deserialize)]
pub struct AIMessageRequest {
    pub messages: Vec<ChatMessage>,
}

#[derive(serde::Serialize)]
pub struct AIMessageResponse {
    pub response: String,
}

#[derive(serde::Serialize)]
pub struct ApiKeyResponse {
    pub api_key: String,
}

#[derive(serde::Deserialize)]
pub struct SetApiKeyRequest {
    pub api_key: String,
}

#[derive(serde::Deserialize)]
pub struct SetProviderRequest {
    pub provider: String,
}

#[derive(serde::Serialize)]
pub struct GetProviderResponse {
    pub provider: String,
}

#[derive(serde::Serialize)]
pub struct GetModelResponse {
    pub model: String,
}

#[derive(serde::Deserialize)]
pub struct SetModelRequest {
    pub model: String,
}

#[derive(serde::Serialize)]
pub struct TestProviderResponse {
    pub status: String,
    pub message: String,
}
