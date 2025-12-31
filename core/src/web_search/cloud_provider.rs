use std::env;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use reqwest::Client;
use serde_json::json;

use super::{WebSearchProvider, WebSearchProviderId, WebSearchResponse};

const WEB_SEARCH_URL_ENV: &str = "REPROD_WEB_SEARCH_URL";
const WEB_SEARCH_TOKEN_ENV: &str = "REPROD_WEB_SEARCH_TOKEN";
const MAX_TOKEN_RETRIES: usize = 3;

pub struct CloudWebSearchProvider {
    endpoint: String,
    client: Client,
    token: Option<String>,
}

impl CloudWebSearchProvider {
    pub fn new(endpoint: String, token: Option<String>) -> Self {
        Self {
            endpoint: normalize_endpoint(endpoint),
            client: Client::new(),
            token,
        }
    }

    pub fn from_env() -> Result<Option<Arc<Self>>> {
        let endpoint = match env::var(WEB_SEARCH_URL_ENV) {
            Ok(value) => value,
            Err(_) => return Ok(None),
        };
        let token = env::var(WEB_SEARCH_TOKEN_ENV).ok();
        Ok(Some(Arc::new(Self::new(endpoint, token))))
    }

    fn current_token(&self) -> Option<String> {
        env::var(WEB_SEARCH_TOKEN_ENV)
            .ok()
            .or_else(|| self.token.clone())
    }
}

#[async_trait::async_trait]
impl WebSearchProvider for CloudWebSearchProvider {
    fn id(&self) -> WebSearchProviderId {
        WebSearchProviderId("cloud.provider".to_string())
    }

    async fn search(&self, query: String) -> Result<WebSearchResponse> {
        for attempt in 1..=MAX_TOKEN_RETRIES {
            let mut request = self
                .client
                .post(&self.endpoint)
                .json(&json!({ "query": query }));

            if let Some(token) = self.current_token() {
                request = request.bearer_auth(token);
            }

            let response = request.send().await.context("Web search request failed")?;

            if response.headers().contains_key("x-expired-token") {
                if attempt >= MAX_TOKEN_RETRIES {
                    return Err(anyhow!("Token expired, max retries exceeded"));
                }
                continue;
            }

            let status = response.status();
            if !status.is_success() {
                let body = response.text().await.unwrap_or_default();
                return Err(anyhow!("Web search error ({}): {}", status, body));
            }

            let body = response
                .json::<WebSearchResponse>()
                .await
                .context("Invalid web search response")?;
            return Ok(body);
        }

        Err(anyhow!("Web search failed after retries"))
    }
}

fn normalize_endpoint(endpoint: String) -> String {
    if endpoint.contains("/web_search") {
        return endpoint;
    }
    format!("{}/web_search", endpoint.trim_end_matches('/'))
}
