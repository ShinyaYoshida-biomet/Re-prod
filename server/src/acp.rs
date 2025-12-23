use std::path::PathBuf;
use std::time::{Duration, Instant};

use anyhow::{anyhow, bail, Result};
use reprod_acp::{
    build_process_config,
    config::{is_external_mode, load_acp_config},
    detection::{detect_agents, resolve_active_agent_command},
    types::{AcpPermissionDecision, AcpPermissionRequestPayload, AcpSessionUpdateEnvelope},
    AcpGateway,
};
use tokio::sync::{broadcast, Mutex};
use tracing::{info, warn};

const RATE_LIMIT_MAX_OPS: usize = 30;
const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(10);

pub struct AcpService {
    workspace_root: PathBuf,
    gateway: Mutex<AcpGateway>,
    rate_limiter: Mutex<RateLimiter>,
}

impl AcpService {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self {
            workspace_root: workspace_root.clone(),
            gateway: Mutex::new(AcpGateway::new(workspace_root)),
            rate_limiter: Mutex::new(RateLimiter::new(RATE_LIMIT_MAX_OPS, RATE_LIMIT_WINDOW)),
        }
    }

    async fn ensure_agent_running(&self) -> Result<()> {
        let command = resolve_agent_command()?;
        let mut gateway = self.gateway.lock().await;
        let config = build_process_config(&self.workspace_root, Some(command), None);
        let response = gateway.initialize(config).await?;
        info!(
            status = response.status.as_str(),
            workspace = %self.workspace_root.display(),
            "ACP gateway initialized",
        );
        Ok(())
    }

    async fn rate_limit(&self, operation: &str) -> Result<()> {
        let mut limiter = self.rate_limiter.lock().await;
        if limiter.allow() {
            Ok(())
        } else {
            warn!(operation = operation, "ACP request throttled");
            bail!("ACP request rate-limited; try again shortly")
        }
    }

    pub async fn create_session(&self) -> Result<String> {
        self.rate_limit("create_session").await?;
        self.ensure_agent_running().await?;
        let mut gateway = self.gateway.lock().await;
        let session_id = gateway.create_session().await?;
        info!(
            %session_id,
            workspace = %self.workspace_root.display(),
            "ACP session created"
        );
        Ok(session_id)
    }

    pub async fn send_prompt(&self, session_id: &str, messages: Vec<String>) -> Result<()> {
        self.rate_limit("prompt").await?;
        self.ensure_agent_running().await?;
        let gateway = self.gateway.lock().await;
        if !gateway.session_exists(session_id) {
            bail!("Unknown ACP session: {session_id}");
        }
        gateway.send_prompt(session_id, messages.clone()).await?;
        info!(
            %session_id,
            message_count = messages.len(),
            "ACP prompt dispatched",
        );
        Ok(())
    }

    pub async fn cancel(&self, session_id: &str) -> Result<()> {
        self.rate_limit("cancel").await?;
        self.ensure_agent_running().await?;
        let mut gateway = self.gateway.lock().await;
        if !gateway.session_exists(session_id) {
            bail!("Unknown ACP session: {session_id}");
        }
        gateway.cancel(session_id).await?;
        gateway.remove_session(session_id);
        info!(%session_id, "ACP session cancelled");
        Ok(())
    }

    pub async fn respond_permission(&self, decision: AcpPermissionDecision) -> Result<()> {
        self.rate_limit("permission_decision").await?;
        self.ensure_agent_running().await?;
        let gateway = self.gateway.lock().await;
        gateway.respond_permission(decision.clone()).await?;
        info!(
            request_id = %decision.request_id,
            outcome = ?decision.outcome,
            "ACP permission decision forwarded",
        );
        Ok(())
    }

    pub async fn subscribe_session_updates(&self) -> broadcast::Receiver<AcpSessionUpdateEnvelope> {
        let gateway = self.gateway.lock().await;
        gateway.subscribe_session_updates()
    }

    pub async fn subscribe_permission_requests(
        &self,
    ) -> broadcast::Receiver<AcpPermissionRequestPayload> {
        let gateway = self.gateway.lock().await;
        gateway.subscribe_permission_requests()
    }
}

struct RateLimiter {
    window: Duration,
    max_events: usize,
    events: Vec<Instant>,
}

impl RateLimiter {
    fn new(max_events: usize, window: Duration) -> Self {
        Self {
            window,
            max_events,
            events: Vec::with_capacity(max_events),
        }
    }

    fn allow(&mut self) -> bool {
        let now = Instant::now();
        self.events
            .retain(|instant| now.duration_since(*instant) <= self.window);
        if self.events.len() >= self.max_events {
            return false;
        }
        self.events.push(now);
        true
    }
}

fn resolve_agent_command() -> Result<String> {
    let cfg = load_acp_config().unwrap_or_else(|_| Default::default());
    if !is_external_mode(&cfg.active_mode) {
        bail!("External agent mode not enabled");
    }
    let detected = detect_agents()?;
    resolve_active_agent_command(&cfg, &detected).ok_or_else(|| {
        anyhow!("Selected ACP agent unavailable or not set for external_agent mode")
    })
}
