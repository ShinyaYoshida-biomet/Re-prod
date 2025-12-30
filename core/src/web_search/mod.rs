use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

pub mod cloud_provider;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct WebSearchProviderId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSearchResult {
    pub title: String,
    pub url: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSearchResponse {
    pub results: Vec<WebSearchResult>,
}

#[async_trait]
pub trait WebSearchProvider: Send + Sync {
    fn id(&self) -> WebSearchProviderId;
    async fn search(&self, query: String) -> Result<WebSearchResponse>;
}

#[derive(Default)]
pub struct WebSearchRegistry {
    providers: HashMap<WebSearchProviderId, Arc<dyn WebSearchProvider>>,
    active_provider_id: Option<WebSearchProviderId>,
}

impl WebSearchRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register_provider(&mut self, provider: Arc<dyn WebSearchProvider>) {
        let id = provider.id();
        self.providers.insert(id.clone(), provider);
        if self.active_provider_id.is_none() {
            self.active_provider_id = Some(id);
        }
    }

    pub fn active_provider(&self) -> Option<Arc<dyn WebSearchProvider>> {
        self.active_provider_id
            .as_ref()
            .and_then(|id| self.providers.get(id).cloned())
    }
}
