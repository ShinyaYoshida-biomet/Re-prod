use std::sync::Arc;

use anyhow::Result;
use reprod_core::acp::runtime::AcpRuntime;
use reprod_core::acp::types::{
    AcpPermissionDecision, AcpPermissionRequestPayload, AcpSessionUpdateEnvelope,
};
use tokio::sync::{broadcast, Mutex};

use crate::acp::AcpManager;

pub struct DesktopAcpRuntime {
    manager: Arc<Mutex<AcpManager>>,
}

impl DesktopAcpRuntime {
    pub fn new(manager: Arc<Mutex<AcpManager>>) -> Self {
        Self { manager }
    }
}

#[async_trait::async_trait]
impl AcpRuntime for DesktopAcpRuntime {
    async fn create_session(&self) -> Result<String> {
        let mut guard = self.manager.lock().await;
        guard.create_session().await
    }

    async fn send_prompt(&self, session_id: &str, messages: Vec<String>) -> Result<()> {
        let guard = self.manager.lock().await;
        guard.send_prompt(session_id, messages).await
    }

    async fn cancel(&self, session_id: &str) -> Result<()> {
        let mut guard = self.manager.lock().await;
        guard.cancel(session_id).await?;
        guard.remove_session(session_id);
        Ok(())
    }

    async fn respond_permission(&self, decision: AcpPermissionDecision) -> Result<()> {
        let guard = self.manager.lock().await;
        guard.respond_permission(decision).await
    }

    async fn subscribe_session_updates(&self) -> broadcast::Receiver<AcpSessionUpdateEnvelope> {
        let guard = self.manager.lock().await;
        guard.subscribe_session_updates()
    }

    async fn subscribe_permission_requests(
        &self,
    ) -> broadcast::Receiver<AcpPermissionRequestPayload> {
        let guard = self.manager.lock().await;
        guard.subscribe_permission_requests()
    }
}
