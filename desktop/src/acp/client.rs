use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};

use agent_client_protocol::{
    Client, ReadTextFileRequest, ReadTextFileResponse, RequestPermissionOutcome,
    RequestPermissionRequest, RequestPermissionResponse, SessionNotification, ToolCallUpdate,
    WriteTextFileRequest, WriteTextFileResponse,
};
use anyhow::{anyhow, bail, Context, Result};
use tokio::sync::{mpsc::UnboundedSender, oneshot, Mutex};
use tracing::warn;
use uuid::Uuid;

use crate::acp::types::{
    AcpPermissionDecision, AcpPermissionDecisionOutcome, AcpPermissionOption,
    AcpPermissionRequestPayload,
};

pub struct PermissionDecisionMessage {
    pub request_id: String,
    pub outcome: AcpPermissionDecisionOutcome,
    pub option_id: Option<String>,
}

pub struct ReprodAcpClient {
    workspace_root: PathBuf,
    session_update_tx: UnboundedSender<SessionNotification>,
    permission_event_tx: UnboundedSender<AcpPermissionRequestPayload>,
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<RequestPermissionOutcome>>>>,
}

impl ReprodAcpClient {
    pub fn new(
        workspace_root: PathBuf,
        session_update_tx: UnboundedSender<SessionNotification>,
        permission_event_tx: UnboundedSender<AcpPermissionRequestPayload>,
    ) -> Self {
        Self {
            workspace_root,
            session_update_tx,
            permission_event_tx,
            pending: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn pending(
        &self,
    ) -> Arc<Mutex<HashMap<String, oneshot::Sender<RequestPermissionOutcome>>>> {
        Arc::clone(&self.pending)
    }
}

#[async_trait::async_trait(?Send)]
impl Client for ReprodAcpClient {
    async fn request_permission(
        &self,
        args: RequestPermissionRequest,
    ) -> agent_client_protocol::Result<RequestPermissionResponse> {
        let request_id = Uuid::new_v4().to_string();
        let options: Vec<AcpPermissionOption> = args
            .options
            .iter()
            .map(|opt| AcpPermissionOption {
                option_id: opt.option_id.to_string(),
                name: opt.name.clone(),
                kind: format!("{:?}", opt.kind),
            })
            .collect();

        if options.is_empty() {
            warn!(
                "ACP permission request had no options; cancelling session_id={}",
                args.session_id
            );
            return Ok(RequestPermissionResponse::new(
                RequestPermissionOutcome::Cancelled,
            ));
        }

        let payload = AcpPermissionRequestPayload {
            request_id: request_id.clone(),
            session_id: args.session_id.to_string(),
            tool_call_id: args.tool_call.tool_call_id.to_string(),
            tool_title: extract_tool_title(&args.tool_call),
            options,
        };

        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.lock().await;
            pending.insert(request_id.clone(), tx);
        }

        let _ = self.permission_event_tx.send(payload);

        let outcome = rx.await.unwrap_or(RequestPermissionOutcome::Cancelled);
        Ok(RequestPermissionResponse::new(outcome))
    }

    async fn session_notification(
        &self,
        args: SessionNotification,
    ) -> agent_client_protocol::Result<()> {
        let _ = self.session_update_tx.send(args);
        Ok(())
    }

    async fn write_text_file(
        &self,
        args: WriteTextFileRequest,
    ) -> agent_client_protocol::Result<WriteTextFileResponse> {
        let resolved = ensure_within_workspace(&self.workspace_root, &args.path)
            .map_err(|err| agent_client_protocol::Error::internal_error().data(err.to_string()))?;

        if let Some(parent) = resolved.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(agent_client_protocol::Error::into_internal_error)?;
        }

        tokio::fs::write(&resolved, args.content)
            .await
            .map_err(agent_client_protocol::Error::into_internal_error)?;

        Ok(WriteTextFileResponse::new())
    }

    async fn read_text_file(
        &self,
        args: ReadTextFileRequest,
    ) -> agent_client_protocol::Result<ReadTextFileResponse> {
        let resolved = ensure_within_workspace(&self.workspace_root, &args.path)
            .map_err(|err| agent_client_protocol::Error::internal_error().data(err.to_string()))?;

        let content = tokio::fs::read_to_string(&resolved)
            .await
            .map_err(agent_client_protocol::Error::into_internal_error)?;

        let (start_line, limit) = match (args.line, args.limit) {
            (None, None) => return Ok(ReadTextFileResponse::new(content)),
            (line, limit) => (line.unwrap_or(1), limit),
        };

        let start_idx = start_line.saturating_sub(1) as usize;
        let lines: Vec<&str> = content.lines().collect();
        let slice = if let Some(limit) = limit {
            let end = start_idx.saturating_add(limit as usize);
            lines.get(start_idx..end).unwrap_or_default()
        } else {
            lines.get(start_idx..).unwrap_or_default()
        };

        Ok(ReadTextFileResponse::new(slice.join("\n")))
    }
}

fn ensure_within_workspace(workspace_root: &Path, requested: &Path) -> Result<PathBuf> {
    let root = workspace_root
        .canonicalize()
        .with_context(|| format!("Failed to canonicalize workspace root: {workspace_root:?}"))?;

    if !requested.is_absolute() {
        bail!("ACP requested path must be absolute: {requested:?}");
    }

    if requested.components().any(|component| {
        matches!(
            component,
            std::path::Component::CurDir | std::path::Component::ParentDir
        )
    }) {
        bail!("ACP requested path contains invalid components: {requested:?}");
    }

    let mut existing_ancestor = requested.to_path_buf();
    while !existing_ancestor.exists() {
        existing_ancestor = existing_ancestor
            .parent()
            .ok_or_else(|| anyhow!("ACP path has no existing ancestor: {requested:?}"))?
            .to_path_buf();
    }

    let suffix = requested
        .strip_prefix(&existing_ancestor)
        .context("ACP path prefix mismatch")?;

    let resolved = existing_ancestor.canonicalize()?.join(suffix);
    if !resolved.starts_with(&root) {
        return Err(anyhow!(
			"ACP path escapes workspace root: requested={requested:?} resolved={resolved:?} root={root:?}"
		));
    }

    Ok(resolved)
}

fn extract_tool_title(update: &ToolCallUpdate) -> Option<String> {
    update
        .fields
        .title
        .clone()
        .or_else(|| update.fields.kind.as_ref().map(|k| format!("{k:?}")))
}

impl From<AcpPermissionDecision> for PermissionDecisionMessage {
    fn from(value: AcpPermissionDecision) -> Self {
        Self {
            request_id: value.request_id,
            outcome: value.outcome,
            option_id: value.option_id,
        }
    }
}
