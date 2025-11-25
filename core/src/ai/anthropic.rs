use super::AIProvider;
use crate::{AIResponse, ChatMessage, ReprodError, ToolCall};
use async_trait::async_trait;
use reqwest::Client;
use serde_json::{json, Value};

pub struct AnthropicProvider {
    api_key: Option<String>,
    base_url: String,
    client: Client,
}

impl AnthropicProvider {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key,
            base_url: "https://api.anthropic.com/v1/messages".to_string(),
            client: Client::new(),
        }
    }

    pub fn from_env() -> Self {
        let api_key = std::env::var("ANTHROPIC_API_KEY").ok();
        Self::new(api_key)
    }
}

#[async_trait]
impl AIProvider for AnthropicProvider {
    async fn send_message(&self, messages: Vec<ChatMessage>) -> Result<String, ReprodError> {
        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| ReprodError::AIError("Anthropic API key not configured".to_string()))?;

        let response = self
            .client
            .post(&self.base_url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&json!({
                "model": "claude-sonnet-4-5-20250929",
                "messages": messages,
                "max_tokens": 4096,
            }))
            .timeout(std::time::Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| ReprodError::AIError(format!("Request failed: {}", e)))?;

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| ReprodError::AIError(format!("Invalid response: {}", e)))?;

        data["content"][0]["text"]
            .as_str()
            .ok_or_else(|| ReprodError::AIError("Missing content in response".to_string()))
            .map(|s| s.to_string())
    }

    fn name(&self) -> &str {
        "Anthropic"
    }

    fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    async fn send_message_with_tools(
        &self,
        messages: Vec<ChatMessage>,
        tools: Vec<Value>,
    ) -> Result<AIResponse, ReprodError> {
        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| ReprodError::AIError("Anthropic API key not configured".to_string()))?;

        let mut request_body = json!({
            "model": "claude-sonnet-4-5-20250929",
            "messages": messages,
            "max_tokens": 4096,
        });

        // Add tools if provided
        if !tools.is_empty() {
            request_body["tools"] = json!(tools);
        }

        let response = self
            .client
            .post(&self.base_url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request_body)
            .timeout(std::time::Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| ReprodError::AIError(format!("Request failed: {}", e)))?;

        let data: Value = response
            .json()
            .await
            .map_err(|e| ReprodError::AIError(format!("Invalid response: {}", e)))?;

        // Extract content
        let content = data["content"]
            .as_array()
            .ok_or_else(|| ReprodError::AIError("Missing content in response".to_string()))?;

        let mut text_content = String::new();
        let mut tool_calls = Vec::new();

        for block in content {
            match block["type"].as_str() {
                Some("text") => {
                    if let Some(text) = block["text"].as_str() {
                        text_content.push_str(text);
                    }
                }
                Some("tool_use") => {
                    let tool_call = ToolCall {
                        id: block["id"]
                            .as_str()
                            .ok_or_else(|| {
                                ReprodError::AIError("Missing tool call id".to_string())
                            })?
                            .to_string(),
                        name: block["name"]
                            .as_str()
                            .ok_or_else(|| ReprodError::AIError("Missing tool name".to_string()))?
                            .to_string(),
                        input: block["input"].clone(),
                    };
                    tool_calls.push(tool_call);
                }
                _ => {}
            }
        }

        let stop_reason = data["stop_reason"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();

        Ok(AIResponse {
            content: text_content,
            tool_calls: if tool_calls.is_empty() {
                None
            } else {
                Some(tool_calls)
            },
            stop_reason,
        })
    }

    async fn test_connection(&self) -> Result<(), ReprodError> {
        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| ReprodError::AIError("Anthropic API key not configured".to_string()))?;

        // Minimal request to verify API key
        let test_messages = vec![ChatMessage {
            role: "user".to_string(),
            content: "hello".to_string(),
        }];

        let response = self
            .client
            .post(&self.base_url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&json!({
                "model": "claude-3-haiku-20240307", // Use a cheaper model for testing
                "messages": test_messages,
                "max_tokens": 1, // Request minimal tokens
            }))
            .timeout(std::time::Duration::from_secs(10)) // Shorter timeout for testing
            .send()
            .await
            .map_err(|e| {
                ReprodError::AIError(format!("Anthropic connection test failed: {}", e))
            })?;

        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            Err(ReprodError::AIError(format!(
                "Anthropic connection test failed with status {}: {}",
                status, text
            )))
        }
    }
}
