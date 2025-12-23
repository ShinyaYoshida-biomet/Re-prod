use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use agent_client_protocol::{
    Client, PermissionOption, PermissionOptionKind, ReadTextFileRequest, ReadTextFileResponse,
    RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
    SelectedPermissionOutcome, SessionNotification, WriteTextFileRequest, WriteTextFileResponse,
};
use anyhow::{anyhow, bail, Context, Result};
use dunce::canonicalize;
use reprod_core::config::app_config_dir;
use serde::{Deserialize, Serialize};
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
    trust_store: Arc<Mutex<HashMap<String, TrustDecision>>>,
    trust_path: PathBuf,
}

impl ReprodAcpClient {
    pub fn new(
        workspace_root: PathBuf,
        session_update_tx: UnboundedSender<SessionNotification>,
        permission_request_tx: UnboundedSender<AcpPermissionRequestPayload>,
        pending_permissions: Arc<Mutex<HashMap<String, oneshot::Sender<RequestPermissionOutcome>>>>,
    ) -> Self {
        let trust_path = trust_store_path(&workspace_root);
        let trust_store = Arc::new(Mutex::new(
            load_trust_store(&trust_path).unwrap_or_default(),
        ));
        Self {
            workspace_root,
            session_update_tx,
            permission_request_tx,
            pending_permissions,
            trust_store,
            trust_path,
        }
    }

    fn build_trust_key(&self, payload: &AcpPermissionRequestPayload) -> String {
        let base = self.workspace_root.to_string_lossy();
        let kind = payload
            .tool_kind
            .clone()
            .unwrap_or_else(|| "unknown".to_string());
        let location = payload
            .locations
            .first()
            .cloned()
            .unwrap_or_else(|| payload.tool_call_id.clone());
        format!("{base}:{kind}:{location}")
    }

    fn apply_trust(
        &self,
        payload: &AcpPermissionRequestPayload,
        options: &[PermissionOption],
    ) -> Option<RequestPermissionOutcome> {
        let key = self.build_trust_key(payload);
        let store = self.trust_store.blocking_lock();
        match store.get(&key) {
            Some(TrustDecision::Allow) => {
                let opt_id = pick_option_id(
                    options,
                    &[
                        PermissionOptionKind::AllowAlways,
                        PermissionOptionKind::AllowOnce,
                    ],
                )?;
                Some(RequestPermissionOutcome::Selected(
                    SelectedPermissionOutcome::new(opt_id),
                ))
            }
            Some(TrustDecision::Reject) => {
                let opt_id = pick_option_id(
                    options,
                    &[
                        PermissionOptionKind::RejectAlways,
                        PermissionOptionKind::RejectOnce,
                    ],
                )?;
                Some(RequestPermissionOutcome::Selected(
                    SelectedPermissionOutcome::new(opt_id),
                ))
            }
            None => None,
        }
    }

    async fn persist_trust(
        &self,
        options: &[PermissionOption],
        outcome: &RequestPermissionOutcome,
        payload: &AcpPermissionRequestPayload,
    ) {
        let decision = match &outcome {
            RequestPermissionOutcome::Selected(sel) => options
                .iter()
                .find(|o| o.option_id == sel.option_id)
                .and_then(|o| match o.kind {
                    PermissionOptionKind::AllowAlways => Some(TrustDecision::Allow),
                    PermissionOptionKind::RejectAlways => Some(TrustDecision::Reject),
                    _ => None,
                }),
            _ => None,
        };

        if let Some(decision) = decision {
            let key = self.build_trust_key(payload);
            let mut guard = self.trust_store.lock().await;
            guard.insert(key, decision);
            if let Err(err) = save_trust_store(&self.trust_path, &*guard) {
                warn!("Failed to persist ACP trust store: {err}");
            }
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
        let mut payload = map_permission_request(args.clone());
        payload.trust_key = self.build_trust_key(&payload);

        if let Some(outcome) = self.apply_trust(&payload, &args.options) {
            return Ok(RequestPermissionResponse::new(outcome));
        }

        let fallback = select_timeout_outcome(&args.options);
        let outcome = self.wait_for_permission(payload.clone(), fallback).await;
        self.persist_trust(&args.options, &outcome, &payload).await;
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
    let root = canonicalize(workspace_root)
        .with_context(|| format!("Failed to canonicalize workspace root: {workspace_root:?}"))?;

    let requested_abs = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        workspace_root.join(requested)
    };

    let resolved = canonicalize(&requested_abs).or_else(|_| {
        let mut ancestor = requested_abs.as_path();
        while !ancestor.exists() {
            ancestor = ancestor
                .parent()
                .ok_or_else(|| anyhow!("ACP path has no existing ancestor: {requested_abs:?}"))?;
        }
        let suffix = requested_abs
            .strip_prefix(ancestor)
            .context("ACP path prefix mismatch")?;
        Ok::<PathBuf, anyhow::Error>(canonicalize(ancestor)?.join(suffix))
    })?;

    if !resolved.starts_with(&root) {
        bail!(
            "ACP path escapes workspace root: requested={requested_abs:?} resolved={resolved:?} root={root:?}"
        );
    }

    Ok(resolved)
}

fn trust_store_path(workspace_root: &Path) -> PathBuf {
    let slug = workspace_root
        .to_string_lossy()
        .replace(std::path::MAIN_SEPARATOR, "_")
        .replace(':', "_");
    app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("acp_trust")
        .join(format!("{slug}.json"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum TrustDecision {
    Allow,
    Reject,
}

fn load_trust_store(path: &Path) -> Option<HashMap<String, TrustDecision>> {
    let contents = fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

fn save_trust_store(path: &Path, store: &HashMap<String, TrustDecision>) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let data = serde_json::to_string_pretty(store)?;
    fs::write(path, data)?;
    Ok(())
}

fn pick_option_id(
    options: &[PermissionOption],
    prefer_kind: &[PermissionOptionKind],
) -> Option<String> {
    for kind in prefer_kind {
        if let Some(opt) = options.iter().find(|o| &o.kind == kind) {
            return Some(opt.option_id.to_string());
        }
    }
    None
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

    #[tokio::test(flavor = "current_thread")]
    async fn applies_trust_store_decisions() {
        let workspace = std::env::temp_dir().join("acp-client-trust");
        let _ = std::fs::create_dir_all(&workspace);

        let (session_tx, _session_rx) = tokio::sync::mpsc::unbounded_channel();
        let (permission_tx, mut permission_rx) = tokio::sync::mpsc::unbounded_channel();
        let pending = Arc::new(Mutex::new(HashMap::new()));
        let client = ReprodAcpClient::new(
            workspace.clone(),
            session_tx,
            permission_tx,
            pending.clone(),
        );

        let req = RequestPermissionRequest::new(
            SessionId::new("s-trust"),
            ToolCallUpdate::new(
                ToolCallId::new("tool-allow"),
                ToolCallUpdateFields::new().title("read file"),
            ),
            vec![
                PermissionOption::new(
                    PermissionOptionId::new("allow-always"),
                    "Always allow",
                    PermissionOptionKind::AllowAlways,
                ),
                PermissionOption::new(
                    PermissionOptionId::new("deny"),
                    "Deny",
                    PermissionOptionKind::RejectOnce,
                ),
            ],
        );

        let mut payload = map_permission_request(req.clone());
        payload.trust_key = format!("{}:file:/tmp/foo", workspace.to_string_lossy());

        {
            let mut store = client.trust_store.lock().await;
            store.insert(payload.trust_key.clone(), TrustDecision::Allow);
        }

        let outcome = client
            .apply_trust(&payload, &req.options)
            .expect("applied trust");
        match &outcome {
            RequestPermissionOutcome::Selected(sel) => {
                assert_eq!(sel.option_id.to_string(), "allow-always");
            }
            other => panic!("unexpected outcome {other:?}"),
        }

        // Round trip persistence
        client.persist_trust(&req.options, &outcome, &payload).await;
        let stored = load_trust_store(&trust_store_path(&workspace)).unwrap();
        assert!(stored.contains_key(&payload.trust_key));

        // Ensure pending sender cleanup still works when skipping UI
        assert!(pending.lock().await.is_empty());
        assert!(permission_rx.try_recv().is_err());
    }

    #[test]
    fn rejects_path_outside_workspace() {
        let workspace = std::env::temp_dir().join("acp-client-path");
        let outside = workspace.parent().unwrap().join("outside.txt");
        std::fs::create_dir_all(&workspace).unwrap();
        let err = ensure_within_workspace(&workspace, &outside).unwrap_err();
        assert!(format!("{err}").contains("escapes workspace"));
    }

    #[test]
    fn resolves_relative_path_inside_workspace() {
        let workspace = std::env::temp_dir().join("acp-client-path-inside");
        let file = workspace.join("subdir/inner.txt");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, b"hi").unwrap();
        let resolved = ensure_within_workspace(&workspace, Path::new("subdir/inner.txt"))
            .expect("within workspace");
        assert!(resolved.starts_with(&workspace));
    }
}
