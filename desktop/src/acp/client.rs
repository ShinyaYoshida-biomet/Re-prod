use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use agent_client_protocol::{
    Client, PermissionOption, PermissionOptionKind, ReadTextFileRequest, ReadTextFileResponse,
    RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
    SessionNotification, WriteTextFileRequest, WriteTextFileResponse,
};
use anyhow::{anyhow, bail, Context, Result};
use tokio::sync::{mpsc::UnboundedSender, oneshot, Mutex};
use tokio::time::timeout;
use tracing::{error, warn};

use crate::acp::{connection::map_permission_request, types::AcpPermissionRequestPayload};

#[cfg(not(test))]
const PERMISSION_TIMEOUT: Duration = Duration::from_secs(30);

#[cfg(test)]
const PERMISSION_TIMEOUT: Duration = Duration::from_millis(200);

pub struct ReprodAcpClient {
    workspace_root: PathBuf,
    session_update_tx: UnboundedSender<SessionNotification>,
    permission_request_tx: UnboundedSender<AcpPermissionRequestPayload>,
    pending_permissions: Arc<Mutex<HashMap<String, oneshot::Sender<RequestPermissionOutcome>>>>,
}

impl ReprodAcpClient {
    pub fn new(
        workspace_root: PathBuf,
        session_update_tx: UnboundedSender<SessionNotification>,
        permission_request_tx: UnboundedSender<AcpPermissionRequestPayload>,
        pending_permissions: Arc<Mutex<HashMap<String, oneshot::Sender<RequestPermissionOutcome>>>>,
    ) -> Self {
        Self {
            workspace_root,
            session_update_tx,
            permission_request_tx,
            pending_permissions,
        }
    }

    async fn wait_for_permission(
        &self,
        payload: AcpPermissionRequestPayload,
        fallback: RequestPermissionOutcome,
    ) -> RequestPermissionOutcome {
        let (tx, rx) = oneshot::channel();
        let request_id = payload.request_id.clone();
        if self
            .pending_permissions
            .lock()
            .await
            .insert(request_id.clone(), tx)
            .is_some()
        {
            warn!("Overwriting pending permission request_id={}", request_id);
        }

        if let Err(err) = self.permission_request_tx.send(payload) {
            error!("Failed to send permission request to UI: {err}");
            let _ = self.pending_permissions.lock().await.remove(&request_id);
            return fallback;
        }

        let outcome = match timeout(PERMISSION_TIMEOUT, rx).await {
            Ok(Ok(outcome)) => outcome,
            Ok(Err(_)) => {
                warn!("Permission responder dropped; using fallback");
                fallback
            }
            Err(_) => {
                warn!("Permission request timed out; using fallback");
                fallback
            }
        };

        let _ = self.pending_permissions.lock().await.remove(&request_id);
        outcome
    }
}

#[async_trait::async_trait(?Send)]
impl Client for ReprodAcpClient {
    async fn request_permission(
        &self,
        args: RequestPermissionRequest,
    ) -> agent_client_protocol::Result<RequestPermissionResponse> {
        let payload = map_permission_request(args.clone());
        let fallback = select_timeout_outcome(&args.options);
        let outcome = self.wait_for_permission(payload, fallback).await;
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

fn select_timeout_outcome(options: &[PermissionOption]) -> RequestPermissionOutcome {
    let deny_option = options.iter().find(|opt| {
        matches!(
            opt.kind,
            PermissionOptionKind::RejectOnce | PermissionOptionKind::RejectAlways
        )
    });

    if let Some(option) = deny_option {
        return RequestPermissionOutcome::Selected(
            agent_client_protocol::SelectedPermissionOutcome::new(option.option_id.clone()),
        );
    }

    warn!("ACP permission request had no deny option; cancelling");
    RequestPermissionOutcome::Cancelled
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol::{
        PermissionOption, PermissionOptionId, PermissionOptionKind, SelectedPermissionOutcome,
        SessionId, ToolCallId, ToolCallUpdate, ToolCallUpdateFields,
    };
    use tokio::task::LocalSet;

    #[tokio::test(flavor = "current_thread")]
    async fn forwards_permission_and_awaits_decision() {
        let local = LocalSet::new();
        local
            .run_until(async {
                let workspace = std::env::temp_dir().join("acp-client-test");
                let _ = std::fs::create_dir_all(&workspace);

                let (session_tx, _session_rx) = tokio::sync::mpsc::unbounded_channel();
                let (permission_tx, mut permission_rx) = tokio::sync::mpsc::unbounded_channel();
                let pending = Arc::new(Mutex::new(HashMap::new()));
                let client =
                    ReprodAcpClient::new(workspace, session_tx, permission_tx, pending.clone());

                let req = RequestPermissionRequest::new(
                    SessionId::new("s-test"),
                    ToolCallUpdate::new(
                        ToolCallId::new("tool-1"),
                        ToolCallUpdateFields::new().title("read file"),
                    ),
                    vec![PermissionOption::new(
                        PermissionOptionId::new("allow"),
                        "Allow once",
                        PermissionOptionKind::AllowOnce,
                    )],
                );

                let handle =
                    tokio::task::spawn_local(async move { client.request_permission(req).await });

                let payload = permission_rx.recv().await.expect("permission payload");
                assert_eq!(payload.request_id, "tool-1");

                let sender = pending
                    .lock()
                    .await
                    .remove(&payload.request_id)
                    .expect("pending sender");
                sender
                    .send(RequestPermissionOutcome::Selected(
                        SelectedPermissionOutcome::new("allow"),
                    ))
                    .expect("send outcome");

                let resp = handle.await.expect("join").expect("permission response");
                match resp.outcome {
                    RequestPermissionOutcome::Selected(choice) => {
                        assert_eq!(choice.option_id.to_string(), "allow");
                    }
                    other => panic!("Unexpected outcome: {other:?}"),
                }
            })
            .await;
    }

    #[tokio::test(flavor = "current_thread")]
    async fn times_out_to_reject_when_no_response() {
        let workspace = std::env::temp_dir().join("acp-client-timeout");
        let _ = std::fs::create_dir_all(&workspace);

        let (session_tx, _session_rx) = tokio::sync::mpsc::unbounded_channel();
        let (permission_tx, mut permission_rx) = tokio::sync::mpsc::unbounded_channel();
        let pending = Arc::new(Mutex::new(HashMap::new()));
        let client = ReprodAcpClient::new(workspace, session_tx, permission_tx, pending);

        let req = RequestPermissionRequest::new(
            SessionId::new("s-test"),
            ToolCallUpdate::new(
                ToolCallId::new("tool-1"),
                ToolCallUpdateFields::new().title("read file"),
            ),
            vec![PermissionOption::new(
                PermissionOptionId::new("deny"),
                "Deny",
                PermissionOptionKind::RejectOnce,
            )],
        );

        let local = LocalSet::new();
        let resp = local
            .run_until(async move {
                let handle =
                    tokio::task::spawn_local(async move { client.request_permission(req).await });
                let _ = permission_rx.recv().await.expect("permission payload");
                handle.await.expect("join").expect("response")
            })
            .await;
        match resp.outcome {
            RequestPermissionOutcome::Selected(choice) => {
                assert_eq!(choice.option_id.to_string(), "deny");
            }
            other => panic!("Unexpected outcome: {other:?}"),
        }
    }
}
