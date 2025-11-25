use crate::{
    ai::{AIProvider, AnthropicProvider, OpenAIProvider},
    Config,
};
use std::sync::Arc;

/// Create an AI provider from a given name and configuration.
pub fn from_name_and_config(name: &str, cfg: &Config) -> Arc<dyn AIProvider> {
    match name {
        "openai" => Arc::new(OpenAIProvider::new(cfg.openai_api_key.clone())),
        "anthropic" => Arc::new(AnthropicProvider::new(cfg.anthropic_api_key.clone())),
        _ => Arc::new(AnthropicProvider::new(cfg.anthropic_api_key.clone())), // Fallback
    }
}

/// Create an AI provider from Config.default_ai_provider.
/// Falls back to Anthropic when value is unrecognized.
pub fn from_config(cfg: &Config) -> Arc<dyn AIProvider> {
    from_name_and_config(&cfg.default_ai_provider, cfg)
}
