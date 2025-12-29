use agent_client_protocol::{
    Agent, CancelNotification, ClientCapabilities, ClientSideConnection, ContentBlock,
    FileSystemCapability, InitializeRequest, NewSessionRequest, PermissionOptionKind,
    PromptRequest, PromptResponse, ProtocolVersion, RequestPermissionOutcome,
    RequestPermissionRequest, SelectedPermissionOutcome, SessionId, SessionNotification,
};
use anyhow::{anyhow, Context, Result};
use std::collections::HashMap;
use std::sync::Arc;
use std::thread;
use tokio::{
    io::{AsyncRead, AsyncWrite},
    runtime::Builder,
    sync::{
        mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender},
        oneshot, Mutex,
    },
    task::LocalSet,
};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};
use tracing::{error, info};

use crate::{
    client::ReprodAcpClient,
    types::{
        AcpPermissionDecision, AcpPermissionDecisionScope, AcpPermissionOption,
        AcpPermissionRequestPayload,
    },
};

enum AcpRequest {
    CreateSession {
        cwd: String,
        resp: oneshot::Sender<Result<SessionId>>,
    },
    Prompt {
        request: PromptRequest,
        resp: oneshot::Sender<Result<PromptResponse>>,
    },
    Cancel {
        session_id: SessionId,
        resp: oneshot::Sender<Result<()>>,
    },
}

/// Thin wrapper over agent-client-protocol's ClientSideConnection.
pub struct AcpConnection {
    tx: tokio::sync::mpsc::UnboundedSender<AcpRequest>,
    permission_response_tx: UnboundedSender<PermissionDecisionMessage>,
}

#[derive(Debug, Clone)]
pub struct PermissionDecisionMessage {
    pub request_id: String,
    pub outcome: RequestPermissionOutcome,
    pub remember_scope: Option<AcpPermissionDecisionScope>,
}

impl AcpConnection {
    pub async fn initialize<R, W>(
        workspace_root: std::path::PathBuf,
        outgoing: W,
        incoming: R,
    ) -> Result<(
        Self,
        UnboundedReceiver<SessionNotification>,
        UnboundedReceiver<AcpPermissionRequestPayload>,
    )>
    where
        R: AsyncRead + Send + Unpin + 'static,
        W: AsyncWrite + Send + Unpin + 'static,
    {
        let (notif_tx, notif_rx) = unbounded_channel();
        let (permission_request_tx, permission_request_rx) = unbounded_channel();
        let (permission_response_tx, mut permission_response_rx) =
            unbounded_channel::<PermissionDecisionMessage>();
        let pending_permissions: Arc<
            Mutex<HashMap<String, oneshot::Sender<RequestPermissionOutcome>>>,
        > = Arc::new(Mutex::new(HashMap::new()));
        let decision_meta: Arc<Mutex<HashMap<String, AcpPermissionDecisionScope>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let handler = ReprodAcpClient::new(
            workspace_root,
            notif_tx,
            permission_request_tx,
            pending_permissions.clone(),
            decision_meta.clone(),
        );
        let (request_tx, mut request_rx) = tokio::sync::mpsc::unbounded_channel();
        let (init_tx, init_rx) = oneshot::channel();
        let outgoing = outgoing.compat_write();
        let incoming = incoming.compat();

        thread::spawn(move || {
            let runtime = Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("failed to build ACP runtime");

            runtime.block_on(async move {
                let local = LocalSet::new();
                local
                    .run_until(async move {
                        let (conn, io_task) =
                            ClientSideConnection::new(handler, outgoing, incoming, |fut| {
                                tokio::task::spawn_local(fut);
                            });
                        tokio::task::spawn_local(async move {
                            if let Err(err) = io_task.await {
                                error!("ACP IO task ended: {err}");
                            }
                        });

                        let init_request = InitializeRequest::new(ProtocolVersion::LATEST)
                            .client_capabilities(
                                ClientCapabilities::new()
                                    .fs(
                                        FileSystemCapability::new()
                                            .read_text_file(true)
                                            .write_text_file(true),
                                    )
                                    .terminal(false),
                            );
                        info!(
                            fs_read_text_file = true,
                            fs_write_text_file = true,
                            terminal = false,
                            "ACP initialize request built"
                        );

                        let init_result = conn
                            .initialize(init_request)
                            .await
                            .context("ACP initialize failed");
                        if let Err(ref err) = init_result {
                            error!(error = ?err, "ACP initialize failed");
                        }

                        if init_tx.send(init_result).is_err() {
                            return;
                        }

                        while let Some(req) = request_rx.recv().await {
                            match req {
                                AcpRequest::CreateSession { cwd, resp } => {
                                    let result = conn
                                        .new_session(NewSessionRequest::new(cwd))
                                        .await
                                        .map(|resp| resp.session_id)
                                        .map_err(anyhow::Error::from);
                                    let _ = resp.send(result);
                                }
                                AcpRequest::Prompt { request, resp } => {
                                    let result =
                                        conn.prompt(request).await.map_err(anyhow::Error::from);
                                    let _ = resp.send(result);
                                }
                                AcpRequest::Cancel { session_id, resp } => {
                                    let result = conn
                                        .cancel(CancelNotification::new(session_id))
                                        .await
                                        .map_err(anyhow::Error::from);
                                    let _ = resp.send(result);
                                }
                            }
                        }
                    })
                    .await;
            });
        });

        init_rx.await??;

        tokio::spawn({
            let pending = pending_permissions.clone();
            let decision_meta = decision_meta.clone();
            async move {
                while let Some(decision) = permission_response_rx.recv().await {
                    if let Some(scope) = decision.remember_scope.clone() {
                        decision_meta.lock().await.insert(decision.request_id.clone(), scope);
                    }
                    let sender = { pending.lock().await.remove(&decision.request_id) };
                    if let Some(tx) = sender {
                        let _ = tx.send(decision.outcome);
                    }
                }
            }
        });

        Ok((
            Self {
                tx: request_tx,
                permission_response_tx,
            },
            notif_rx,
            permission_request_rx,
        ))
    }

    pub async fn create_session(&self, cwd: String) -> Result<SessionId> {
        let (resp_tx, resp_rx) = oneshot::channel();
        let _ = self
            .tx
            .send(AcpRequest::CreateSession { cwd, resp: resp_tx });
        resp_rx.await.context("ACP create_session dropped")?
    }

    pub async fn prompt(&self, request: PromptRequest) -> Result<PromptResponse> {
        let (resp_tx, resp_rx) = oneshot::channel();
        let _ = self.tx.send(AcpRequest::Prompt {
            request,
            resp: resp_tx,
        });
        resp_rx.await.context("ACP prompt dropped")?
    }

    pub async fn cancel(&self, session_id: SessionId) -> Result<()> {
        let (resp_tx, resp_rx) = oneshot::channel();
        let _ = self.tx.send(AcpRequest::Cancel {
            session_id,
            resp: resp_tx,
        });
        resp_rx.await.context("ACP cancel dropped")?
    }

    pub async fn respond_permission(&self, decision: PermissionDecisionMessage) -> Result<()> {
        self.permission_response_tx
            .send(decision)
            .map_err(|_| anyhow!("Permission decision channel closed"))
    }

    pub fn make_prompt_from_strings(session_id: String, messages: Vec<String>) -> PromptRequest {
        let prompt = messages.into_iter().map(ContentBlock::from).collect();
        PromptRequest::new(session_id, prompt)
    }
}

pub fn map_permission_request(req: RequestPermissionRequest) -> AcpPermissionRequestPayload {
    let tool_title = req.tool_call.fields.title.clone();
    let tool_call_id = req.tool_call.tool_call_id.to_string();
    let locations = req
        .tool_call
        .fields
        .locations
        .unwrap_or_default()
        .into_iter()
        .map(|loc| loc.path.to_string_lossy().to_string())
        .collect();
    let options = req
        .options
        .into_iter()
        .map(|opt| AcpPermissionOption {
            option_id: opt.option_id.to_string(),
            name: opt.name,
            kind: permission_kind_to_string(opt.kind),
        })
        .collect();

    AcpPermissionRequestPayload {
        request_id: tool_call_id.clone(),
        session_id: req.session_id.to_string(),
        tool_call_id,
        tool_title,
        tool_kind: req.tool_call.fields.kind.map(|k| format!("{k:?}")),
        raw_input: req
            .tool_call
            .fields
            .raw_input
            .and_then(|v| serde_json::to_string(&v).ok()),
        trust_key: req.session_id.to_string(),
        locations,
        options,
    }
}

pub fn permission_kind_to_string(kind: PermissionOptionKind) -> String {
    match kind {
        PermissionOptionKind::AllowOnce => "allow_once",
        PermissionOptionKind::AllowAlways => "allow_always",
        PermissionOptionKind::RejectOnce => "reject_once",
        PermissionOptionKind::RejectAlways => "reject_always",
        _ => "unknown",
    }
    .to_string()
}

impl TryFrom<AcpPermissionDecision> for PermissionDecisionMessage {
    type Error = anyhow::Error;

    fn try_from(value: AcpPermissionDecision) -> Result<Self, Self::Error> {
        let outcome = match value.outcome {
            crate::types::AcpPermissionDecisionOutcome::Cancelled => {
                RequestPermissionOutcome::Cancelled
            }
            _ => {
                let option_id = value.option_id.ok_or_else(|| {
                    anyhow::anyhow!("Permission decision missing option_id for selection")
                })?;
                RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(option_id))
            }
        };

        Ok(Self {
            request_id: value.request_id,
            outcome,
            remember_scope: value.remember_scope,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol::{
        PermissionOption, PermissionOptionId, ToolCallId, ToolCallUpdate, ToolCallUpdateFields,
    };

    #[test]
    fn maps_permission_request_fields() {
        let req = RequestPermissionRequest::new(
            SessionId::new("s1"),
            ToolCallUpdate::new(
                ToolCallId::new("t1"),
                ToolCallUpdateFields::new().title("read file"),
            ),
            vec![PermissionOption::new(
                PermissionOptionId::new("allow"),
                "Allow once",
                PermissionOptionKind::AllowOnce,
            )],
        );

        let mapped = map_permission_request(req);
        assert_eq!(mapped.request_id, "t1");
        assert_eq!(mapped.session_id, "s1");
        assert_eq!(mapped.tool_title.as_deref(), Some("read file"));
        assert_eq!(mapped.options.len(), 1);
        assert_eq!(mapped.options[0].kind, "allow_once");
    }

    #[test]
    fn converts_decision_into_protocol_message() {
        let decision = AcpPermissionDecision {
            request_id: "req-1".to_string(),
            outcome: crate::types::AcpPermissionDecisionOutcome::AllowOnce,
            option_id: Some("opt-1".to_string()),
            remember_scope: None,
        };

        let msg = PermissionDecisionMessage::try_from(decision).unwrap();
        assert_eq!(msg.request_id, "req-1");
        match msg.outcome {
            RequestPermissionOutcome::Selected(selection) => {
                assert_eq!(selection.option_id.to_string(), "opt-1");
            }
            other => panic!("Unexpected outcome: {other:?}"),
        }
    }

    #[test]
    fn converts_cancelled_decision() {
        let decision = AcpPermissionDecision {
            request_id: "req-2".to_string(),
            outcome: crate::types::AcpPermissionDecisionOutcome::Cancelled,
            option_id: None,
            remember_scope: None,
        };

        let msg = PermissionDecisionMessage::try_from(decision).unwrap();
        assert!(matches!(msg.outcome, RequestPermissionOutcome::Cancelled));
    }
}
