use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
pub struct WebSearchRequest {
    pub query: String,
}

/// Tool definitions for AI provider
pub fn get_web_search_tools() -> Vec<Value> {
    serde_json::json!([
        {
            "name": "web_search",
            "description": "Search the web for up-to-date information and return source links.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    }
                },
                "required": ["query"]
            }
        }
    ])
    .as_array()
    .expect("get_web_search_tools: json! array literal should always be an array")
    .clone()
}
