use super::AIProvider;
use crate::{AIResponse, ChatMessage, ReprodError, ToolCall};
use async_trait::async_trait;
use reqwest::Client;
use serde_json::{json, Value};

pub struct OpenAIProvider {
    api_key: Option<String>,
    base_url: String,
    model: String,
    client: Client,
}

impl OpenAIProvider {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key,
            base_url: "https://api.openai.com/v1/chat/completions".to_string(),
            model: "gpt-4o".to_string(),
            client: Client::new(),
        }
    }

    pub fn from_env() -> Self {
        let api_key = std::env::var("OPENAI_API_KEY").ok();
        Self::new(api_key)
    }

    pub fn with_model(mut self, model: String) -> Self {
        self.model = model;
        self
    }
}

#[async_trait]
impl AIProvider for OpenAIProvider {
    async fn send_message(&self, messages: Vec<ChatMessage>) -> Result<String, ReprodError> {
        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| ReprodError::AIError("OpenAI API key not configured".to_string()))?;

        let response = self
            .client
            .post(&self.base_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&json!({
                "model": self.model,
                "messages": messages,
                "max_tokens": 4096,
                "temperature": 0.7,
            }))
            .timeout(std::time::Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| ReprodError::AIError(format!("Request failed: {}", e)))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(ReprodError::AIError(format!(
                "OpenAI API error ({}): {}",
                status, error_text
            )));
        }

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| ReprodError::AIError(format!("Invalid response: {}", e)))?;

        data["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| ReprodError::AIError("Missing content in response".to_string()))
            .map(|s| s.to_string())
    }

    fn name(&self) -> &str {
        "OpenAI"
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
            .ok_or_else(|| ReprodError::AIError("OpenAI API key not configured".to_string()))?;

        let mut request_body = json!({
            "model": self.model,
            "messages": messages,
            "max_tokens": 4096,
            "temperature": 0.7,
        });

        // Add tools if provided (OpenAI uses different format)
        if !tools.is_empty() {
            // Convert Anthropic tool format to OpenAI format
            let openai_tools: Vec<Value> = tools
                .iter()
                .map(|tool| {
                    json!({
                        "type": "function",
                        "function": {
                            "name": tool["name"],
                            "description": tool["description"],
                            "parameters": tool["input_schema"]
                        }
                    })
                })
                .collect();
            request_body["tools"] = json!(openai_tools);
        }

        let response = self
            .client
            .post(&self.base_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .timeout(std::time::Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| ReprodError::AIError(format!("Request failed: {}", e)))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(ReprodError::AIError(format!(
                "OpenAI API error ({}): {}",
                status, error_text
            )));
        }

        let data: Value = response
            .json()
            .await
            .map_err(|e| ReprodError::AIError(format!("Invalid response: {}", e)))?;

        let message = &data["choices"][0]["message"];
        let content = message["content"].as_str().unwrap_or("").to_string();

        let mut tool_calls = Vec::new();
        if let Some(calls) = message["tool_calls"].as_array() {
            for call in calls {
                if let (Some(id), Some(name), Some(args)) = (
                    call["id"].as_str(),
                    call["function"]["name"].as_str(),
                    call["function"]["arguments"].as_str(),
                ) {
                    let input: Value = serde_json::from_str(args).unwrap_or_else(|_| json!({}));
                    tool_calls.push(ToolCall {
                        id: id.to_string(),
                        name: name.to_string(),
                        input,
                    });
                }
            }
        }

        let stop_reason = data["choices"][0]["finish_reason"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();

        Ok(AIResponse {
            content,
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
            .ok_or_else(|| ReprodError::AIError("OpenAI API key not configured".to_string()))?;

        // Minimal request to verify API key
        let test_messages = vec![ChatMessage {
            role: "user".to_string(),
            content: "hello".to_string(),
        }];

        let response = self
            .client
            .post(&self.base_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&json!({
                "model": "gpt-3.5-turbo", // Use a cheaper model for testing
                "messages": test_messages,
                "max_tokens": 1, // Request minimal tokens
            }))
            .timeout(std::time::Duration::from_secs(10)) // Shorter timeout for testing
            .send()
            .await
            .map_err(|e| ReprodError::AIError(format!("OpenAI connection test failed: {}", e)))?;

        let status = response.status();
        if status.is_success() {
            Ok(())
        } else {
            let text = response.text().await.unwrap_or_default();
            Err(ReprodError::AIError(format!(
                "OpenAI connection test failed with status {}: {}",
                status, text
            )))
        }
    }
}
