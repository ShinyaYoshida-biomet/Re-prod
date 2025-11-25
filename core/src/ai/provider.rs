use crate::{AIResponse, ChatMessage, ReprodError};
use async_trait::async_trait;
use serde_json::Value;

/// Trait for AI provider implementations
#[async_trait]
pub trait AIProvider: Send + Sync {
    /// Send messages and get response (legacy method, returns text only)
    async fn send_message(&self, messages: Vec<ChatMessage>) -> Result<String, ReprodError>;

    /// Send messages with tool support and get structured response
    async fn send_message_with_tools(
        &self,
        messages: Vec<ChatMessage>,
        tools: Vec<Value>,
    ) -> Result<AIResponse, ReprodError>;

    /// Get provider name
    fn name(&self) -> &str;

    /// Check if provider is configured
    fn is_configured(&self) -> bool;

    /// Test connection to the provider
    async fn test_connection(&self) -> Result<(), ReprodError>;
}
