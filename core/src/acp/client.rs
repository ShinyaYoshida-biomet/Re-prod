use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use crate::{
    config::app_config_dir,
    edit::{EditOperation, EditService, EditStatus, EditTextFileRequest},
};
use agent_client_protocol::{
    Client, PermissionOption, PermissionOptionKind, ReadTextFileRequest, ReadTextFileResponse,
    RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
    SelectedPermissionOutcome, SessionNotification, SessionUpdate, ToolCall, ToolCallId,
    ToolCallLocation, ToolCallStatus, ToolCallUpdate, ToolCallUpdateFields, ToolKind,
    WriteTextFileRequest, WriteTextFileResponse,
};
use anyhow::{anyhow, bail, Context, Result};
use dunce::canonicalize;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::{mpsc::UnboundedSender, oneshot, Mutex};
use tokio::time::timeout;
use tracing::{error, warn};
use uuid::Uuid;

use super::{
    connection::map_permission_request,
    pending_edit::{PendingEdit, PendingEditStore},
    types::{AcpPermissionDecisionScope, AcpPermissionRequestPayload},
};

#[cfg(not(test))]
const PERMISSION_TIMEOUT: Duration = Duration::from_secs(30);

#[cfg(test)]
const PERMISSION_TIMEOUT: Duration = Duration::from_millis(200);

pub struct ReprodAcpClient {
    workspace_root: PathBuf,
    edit_service: Arc<EditService>,
    session_update_tx: UnboundedSender<SessionNotification>,
    permission_request_tx: UnboundedSender<AcpPermissionRequestPayload>,
    pending_permissions: Arc<Mutex<HashMap<String, oneshot::Sender<RequestPermissionOutcome>>>>,
    trust_store: Arc<Mutex<HashMap<String, TrustDecision>>>,
    trust_path: PathBuf,
    decision_meta: Arc<Mutex<HashMap<String, AcpPermissionDecisionScope>>>,
    session_trust: Arc<Mutex<HashMap<String, TrustDecision>>>,
    read_snapshots: Arc<Mutex<HashMap<String, String>>>,
    pending_edits: Arc<Mutex<PendingEditStore>>,
}

impl ReprodAcpClient {
    pub fn new(
        workspace_root: PathBuf,
        edit_service: Arc<EditService>,
        pending_edits: Arc<Mutex<PendingEditStore>>,
        session_update_tx: UnboundedSender<SessionNotification>,
        permission_request_tx: UnboundedSender<AcpPermissionRequestPayload>,
        pending_permissions: Arc<Mutex<HashMap<String, oneshot::Sender<RequestPermissionOutcome>>>>,
        decision_meta: Arc<Mutex<HashMap<String, AcpPermissionDecisionScope>>>,
    ) -> Self {
        let trust_path = trust_store_path(&workspace_root);
        let trust_store = Arc::new(Mutex::new(
            load_trust_store(&trust_path).unwrap_or_default(),
        ));
        Self {
            workspace_root,
            edit_service,
            session_update_tx,
            permission_request_tx,
            pending_permissions,
            trust_store,
            trust_path,
            decision_meta,
            session_trust: Arc::new(Mutex::new(HashMap::new())),
            read_snapshots: Arc::new(Mutex::new(HashMap::new())),
            pending_edits,
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

    fn snapshot_key(&self, session_id: &str, path: &Path) -> String {
        format!("{}:{}", session_id, path.to_string_lossy())
    }

    fn expected_sha_from_meta(meta: &Option<agent_client_protocol::Meta>) -> Option<String> {
        meta.as_ref()
            .and_then(|meta| meta.get("expected_sha256"))
            .and_then(|value| value.as_str())
            .map(str::to_string)
    }

    async fn apply_trust(
        &self,
        payload: &AcpPermissionRequestPayload,
        options: &[PermissionOption],
    ) -> Option<RequestPermissionOutcome> {
        let key = self.build_trust_key(payload);
        // Session-remembered trust
        if let Some(decision) = self.session_trust.lock().await.get(&key).cloned() {
            let opt_id = match decision {
                TrustDecision::Allow => pick_option_id(
                    options,
                    &[
                        PermissionOptionKind::AllowOnce,
                        PermissionOptionKind::AllowAlways,
                    ],
                ),
                TrustDecision::Reject => pick_option_id(
                    options,
                    &[
                        PermissionOptionKind::RejectOnce,
                        PermissionOptionKind::RejectAlways,
                    ],
                ),
            }?;
            return Some(RequestPermissionOutcome::Selected(
                SelectedPermissionOutcome::new(opt_id),
            ));
        }
        let store = self.trust_store.lock().await;
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
            return;
        }

        // Session-level remember: if UI indicated session scope, capture AllowOnce/RejectOnce
        if let Some(scope) = self.decision_meta.lock().await.remove(&payload.request_id) {
            if matches!(scope, AcpPermissionDecisionScope::Session) {
                if let RequestPermissionOutcome::Selected(sel) = outcome {
                    if let Some(kind) = options
                        .iter()
                        .find(|o| o.option_id == sel.option_id)
                        .map(|o| o.kind)
                    {
                        let td = match kind {
                            PermissionOptionKind::AllowOnce => Some(TrustDecision::Allow),
                            PermissionOptionKind::RejectOnce => Some(TrustDecision::Reject),
                            _ => None,
                        };
                        if let Some(dec) = td {
                            let key = self.build_trust_key(payload);
                            self.session_trust.lock().await.insert(key, dec);
                        }
                    }
                }
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

    fn emit_pending_edit_update(&self, session_id: &str, path: &Path, edit: &PendingEdit) {
        let tool_call_id = ToolCallId::new(format!("fs-pending-{}", edit.id));
        let location = ToolCallLocation::new(path.to_string_lossy().to_string());
        let tool_call = ToolCall::new(tool_call_id.clone(), "Pending edit")
            .kind(ToolKind::Edit)
            .status(ToolCallStatus::InProgress)
            .locations(vec![location]);
        let _ = self.session_update_tx.send(SessionNotification::new(
            session_id.to_string(),
            SessionUpdate::ToolCall(tool_call),
        ));

        let output = serde_json::json!({
            "type": "pending_edit",
            "edit": edit,
        });
        let update = ToolCallUpdate::new(
            tool_call_id,
            ToolCallUpdateFields::new()
                .status(ToolCallStatus::Completed)
                .raw_output(output),
        );
        let _ = self.session_update_tx.send(SessionNotification::new(
            session_id.to_string(),
            SessionUpdate::ToolCallUpdate(update),
        ));
    }

    fn emit_edit_tool_error(&self, session_id: &str, path: &Path, message: &str) {
        let tool_call_id = ToolCallId::new(format!("fs-edit-{}", Uuid::new_v4()));
        let location = ToolCallLocation::new(path.to_string_lossy().to_string());
        let tool_call = ToolCall::new(tool_call_id.clone(), "Edit file")
            .kind(ToolKind::Edit)
            .status(ToolCallStatus::InProgress)
            .locations(vec![location]);
        let _ = self.session_update_tx.send(SessionNotification::new(
            session_id.to_string(),
            SessionUpdate::ToolCall(tool_call),
        ));

        let update = ToolCallUpdate::new(
            tool_call_id,
            ToolCallUpdateFields::new()
                .status(ToolCallStatus::Failed)
                .raw_output(Value::String(message.to_string())),
        );
        let _ = self.session_update_tx.send(SessionNotification::new(
            session_id.to_string(),
            SessionUpdate::ToolCallUpdate(update),
        ));
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

        if let Some(outcome) = self.apply_trust(&payload, &args.options).await {
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
        let relative = workspace_relative_path(&self.workspace_root, &resolved)
            .map_err(|err| agent_client_protocol::Error::internal_error().data(err.to_string()))?;
        let session_id = args.session_id.to_string();

        let expected_sha = match Self::expected_sha_from_meta(&args.meta) {
            Some(value) => Some(value),
            None => {
                let key = self.snapshot_key(&session_id, &resolved);
                self.read_snapshots.lock().await.get(&key).cloned()
            }
        };

        let edit_request = EditTextFileRequest {
            path: relative.clone(),
            operation: EditOperation::Replace,
            expected_sha256: expected_sha.clone(),
            new_text: Some(args.content.clone()),
            edits: None,
        };

        let overlay_text = self
            .pending_edits
            .lock()
            .await
            .overlay_for(&session_id, &relative)
            .map(|overlay| overlay.text);

        let result = match self
            .edit_service
            .preview_text_file(edit_request, overlay_text)
            .await
        {
            Ok(result) => result,
            Err(err) => {
                self.emit_edit_tool_error(&session_id, &resolved, &err.to_string());
                return Err(agent_client_protocol::Error::into_internal_error(err));
            }
        };

        if matches!(result.status, EditStatus::Conflict) {
            self.emit_edit_tool_error(
                &session_id,
                &resolved,
                "Conflict detected: file changed since last read. Reload and retry.",
            );
            return Err(agent_client_protocol::Error::internal_error()
                .data("Conflict detected: file changed since last read. Reload and retry."));
        }

        let pending_edit = PendingEdit {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.clone(),
            tool_call_id: Uuid::new_v4().to_string(),
            file_path: relative.clone(),
            old_text: result.old_text.clone(),
            new_text: result.new_text.clone(),
            unified_diff: result.unified_diff.clone(),
            base_sha256: result.old_sha256.clone(),
            expected_sha256: expected_sha,
        };

        let mut store = self.pending_edits.lock().await;
        if store.has_pending_for_file(&session_id, &relative) {
            self.emit_edit_tool_error(&session_id, &resolved, "Pending edit already exists.");
            return Err(agent_client_protocol::Error::internal_error()
                .data("Pending edit already exists for this file."));
        }
        if let Err(err) = store.register_pending_edit(pending_edit.clone(), &result) {
            self.emit_edit_tool_error(&session_id, &resolved, &err);
            return Err(agent_client_protocol::Error::internal_error().data(err));
        }
        drop(store);

        self.emit_pending_edit_update(&session_id, &resolved, &pending_edit);
        Ok(WriteTextFileResponse::new())
    }

    async fn read_text_file(
        &self,
        args: ReadTextFileRequest,
    ) -> agent_client_protocol::Result<ReadTextFileResponse> {
        let resolved = ensure_within_workspace(&self.workspace_root, &args.path)
            .map_err(|err| agent_client_protocol::Error::internal_error().data(err.to_string()))?;
        let relative = workspace_relative_path(&self.workspace_root, &resolved)
            .map_err(|err| agent_client_protocol::Error::internal_error().data(err.to_string()))?;
        let session_id = args.session_id.to_string();
        let overlay = self
            .pending_edits
            .lock()
            .await
            .overlay_for(&session_id, &relative);

        let (content, sha256) = if let Some(overlay) = overlay {
            (overlay.text, overlay.sha256)
        } else {
            let result = self
                .edit_service
                .read_text_file(&relative)
                .await
                .map_err(agent_client_protocol::Error::into_internal_error)?;
            (result.text, result.sha256)
        };

        let snapshot_key = self.snapshot_key(&session_id, &resolved);
        self.read_snapshots
            .lock()
            .await
            .insert(snapshot_key, sha256);

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

fn workspace_relative_path(workspace_root: &Path, resolved: &Path) -> Result<String> {
    let canonical_root = canonicalize(workspace_root)
        .with_context(|| format!("Failed to canonicalize workspace root: {workspace_root:?}"))?;
    let canonical_path = canonicalize(resolved).or_else(|_| {
        let mut ancestor = resolved;
        while !ancestor.exists() {
            ancestor = ancestor
                .parent()
                .ok_or_else(|| anyhow!("ACP path has no existing ancestor: {resolved:?}"))?;
        }
        let suffix = resolved
            .strip_prefix(ancestor)
            .context("ACP path prefix mismatch")?;
        Ok::<PathBuf, anyhow::Error>(canonicalize(ancestor)?.join(suffix))
    })?;
    let relative = canonical_path
        .strip_prefix(&canonical_root)
        .with_context(|| "ACP path is outside workspace root")?;
    Ok(relative.to_string_lossy().to_string())
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
    use crate::acp::pending_edit::PendingEditStore;
    use crate::acp::test_support::ENV_LOCK;
    use crate::config::APP_DIR_ENV;
    use crate::edit::EditService;
    use agent_client_protocol::{
        PermissionOption, PermissionOptionId, PermissionOptionKind, SelectedPermissionOutcome,
        SessionId, ToolCallId, ToolCallUpdate, ToolCallUpdateFields,
    };
    use std::collections::HashMap;
    use std::env;
    use std::sync::Arc;
    use tokio::task::LocalSet;

    struct EnvVarGuard {
        key: &'static str,
        prev: Option<String>,
    }

    impl EnvVarGuard {
        fn set(key: &'static str, value: &str) -> Self {
            let prev = env::var(key).ok();
            env::set_var(key, value);
            Self { key, prev }
        }
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            match self.prev.take() {
                Some(value) => env::set_var(self.key, value),
                None => env::remove_var(self.key),
            }
        }
    }

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
                let decision_meta: Arc<Mutex<HashMap<String, AcpPermissionDecisionScope>>> =
                    Arc::new(Mutex::new(HashMap::new()));
                let edit_service = Arc::new(EditService::new(workspace.clone()));
                let pending_edits = Arc::new(Mutex::new(PendingEditStore::default()));
                let client = ReprodAcpClient::new(
                    workspace,
                    edit_service,
                    pending_edits,
                    session_tx,
                    permission_tx,
                    pending.clone(),
                    decision_meta,
                );

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
        let decision_meta: Arc<Mutex<HashMap<String, AcpPermissionDecisionScope>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let edit_service = Arc::new(EditService::new(workspace.clone()));
        let pending_edits = Arc::new(Mutex::new(PendingEditStore::default()));
        let client = ReprodAcpClient::new(
            workspace,
            edit_service,
            pending_edits,
            session_tx,
            permission_tx,
            pending,
            decision_meta,
        );

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
        let _env_lock = ENV_LOCK.lock().unwrap();
        // Ensure trust store writes to a predictable, writable location for the test
        let config_root =
            std::env::temp_dir().join(format!("reprod-config-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&config_root);
        let _app_dir = EnvVarGuard::set(APP_DIR_ENV, config_root.to_string_lossy().as_ref());

        let workspace = std::env::temp_dir().join("acp-client-trust");
        let _ = std::fs::create_dir_all(&workspace);
        let trust_slug = workspace
            .to_string_lossy()
            .replace(std::path::MAIN_SEPARATOR, "_")
            .replace(':', "_");
        let trust_path = config_root
            .join("acp_trust")
            .join(format!("{trust_slug}.json"));

        let (session_tx, _session_rx) = tokio::sync::mpsc::unbounded_channel();
        let (permission_tx, mut permission_rx) = tokio::sync::mpsc::unbounded_channel();
        let pending = Arc::new(Mutex::new(HashMap::new()));
        let decision_meta: Arc<Mutex<HashMap<String, AcpPermissionDecisionScope>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let edit_service = Arc::new(EditService::new(workspace.clone()));
        let pending_edits = Arc::new(Mutex::new(PendingEditStore::default()));
        let client = ReprodAcpClient::new(
            workspace.clone(),
            edit_service,
            pending_edits,
            session_tx,
            permission_tx,
            pending.clone(),
            decision_meta,
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
        // Align with build_trust_key: base:workspace_root, kind:tool_kind, location:first locations entry
        payload.tool_kind = Some("file".to_string());
        payload.locations = vec!["/tmp/foo".to_string()];
        payload.trust_key = format!("{}:file:/tmp/foo", workspace.to_string_lossy());

        {
            let mut store = client.trust_store.lock().await;
            store.insert(payload.trust_key.clone(), TrustDecision::Allow);
        }

        let outcome = client
            .apply_trust(&payload, &req.options)
            .await
            .expect("applied trust");
        match &outcome {
            RequestPermissionOutcome::Selected(sel) => {
                assert_eq!(sel.option_id.to_string(), "allow-always");
            }
            other => panic!("unexpected outcome {other:?}"),
        }

        // Round trip persistence
        client.persist_trust(&req.options, &outcome, &payload).await;
        let stored = load_trust_store(&trust_path).unwrap();
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
        let canon_root = dunce::canonicalize(&workspace).unwrap();
        assert!(resolved.starts_with(&canon_root));
    }
}

#[tokio::test(flavor = "current_thread")]
async fn write_text_file_creates_pending_overlay_and_blocks_second() {
    let workspace = std::env::temp_dir().join(format!("acp-pending-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&workspace).unwrap();
    let file_path = workspace.join("sample.R");
    std::fs::write(&file_path, "old").unwrap();

    let (session_tx, _session_rx) = tokio::sync::mpsc::unbounded_channel();
    let (permission_tx, _permission_rx) = tokio::sync::mpsc::unbounded_channel();
    let pending = Arc::new(Mutex::new(HashMap::new()));
    let decision_meta: Arc<Mutex<HashMap<String, AcpPermissionDecisionScope>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let edit_service = Arc::new(EditService::new(workspace.clone()));
    let pending_edits = Arc::new(Mutex::new(PendingEditStore::default()));
    let client = ReprodAcpClient::new(
        workspace,
        edit_service,
        pending_edits,
        session_tx,
        permission_tx,
        pending,
        decision_meta,
    );

    let session_id = "s-pending";
    let read_req = ReadTextFileRequest::new(session_id, file_path.clone());
    let read_resp = client.read_text_file(read_req).await.unwrap();
    assert_eq!(read_resp.content, "old");

    let write_req = WriteTextFileRequest::new(session_id, file_path.clone(), "new-content");
    client.write_text_file(write_req).await.unwrap();

    let disk_contents = std::fs::read_to_string(&file_path).unwrap();
    assert_eq!(disk_contents, "old");

    let read_req = ReadTextFileRequest::new(session_id, file_path.clone());
    let read_resp = client.read_text_file(read_req).await.unwrap();
    assert_eq!(read_resp.content, "new-content");

    let write_req = WriteTextFileRequest::new(session_id, file_path.clone(), "another");
    let second = client.write_text_file(write_req).await;
    assert!(second.is_err());
}
