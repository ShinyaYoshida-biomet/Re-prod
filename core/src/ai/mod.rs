mod anthropic;
mod constants;
pub mod factory;
mod openai;
mod provider;
pub mod session;
pub mod tools;

pub use anthropic::AnthropicProvider;
pub use constants::*;
pub use factory::from_config;
pub use openai::OpenAIProvider;
pub use provider::AIProvider;

use crate::{ChatMessage, Config, ReprodError};

/// Convenience helper to create a provider from configuration and send a message batch.
pub async fn send_message_with_config(
    cfg: &Config,
    messages: Vec<ChatMessage>,
) -> Result<String, ReprodError> {
    let provider = from_config(cfg);
    provider.send_message(messages).await
}
