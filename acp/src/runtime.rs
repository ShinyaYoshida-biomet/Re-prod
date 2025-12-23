use anyhow::Result;
use tokio::sync::broadcast;

use crate::types::{AcpPermissionDecision, AcpPermissionRequestPayload, AcpSessionUpdateEnvelope};

#[async_trait::async_trait]
pub trait AcpRuntime: Send + Sync {
	async fn create_session(&self) -> Result<String>;
	async fn send_prompt(&self, session_id: &str, messages: Vec<String>) -> Result<()>;
	async fn cancel(&self, session_id: &str) -> Result<()>;
	async fn respond_permission(&self, decision: AcpPermissionDecision) -> Result<()>;
	async fn subscribe_session_updates(&self) -> broadcast::Receiver<AcpSessionUpdateEnvelope>;
	async fn subscribe_permission_requests(
		&self,
	) -> broadcast::Receiver<AcpPermissionRequestPayload>;
}
