use agent_client_protocol::{
    Agent, CancelNotification, ClientSideConnection, ContentBlock, InitializeRequest,
    NewSessionRequest, PromptRequest, PromptResponse, ProtocolVersion, SessionId,
    SessionNotification,
};
use anyhow::{Context, Result};
use std::thread;
use tokio::{
    io::{AsyncRead, AsyncWrite},
    runtime::Builder,
    sync::{
        mpsc::{unbounded_channel, UnboundedReceiver},
        oneshot,
    },
    task::LocalSet,
};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};
use tracing::error;

use crate::acp::client::ReprodAcpClient;

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
}

impl AcpConnection {
    pub async fn initialize<R, W>(
        workspace_root: std::path::PathBuf,
        outgoing: W,
        incoming: R,
    ) -> Result<(Self, UnboundedReceiver<SessionNotification>)>
    where
        R: AsyncRead + Send + Unpin + 'static,
        W: AsyncWrite + Send + Unpin + 'static,
    {
        let (notif_tx, notif_rx) = unbounded_channel();
        let handler = ReprodAcpClient::new(workspace_root, notif_tx);
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

                        let init_result = conn
                            .initialize(InitializeRequest::new(ProtocolVersion::LATEST))
                            .await
                            .context("ACP initialize failed");

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

        Ok((Self { tx: request_tx }, notif_rx))
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

    pub fn make_prompt_from_strings(session_id: String, messages: Vec<String>) -> PromptRequest {
        let prompt = messages.into_iter().map(ContentBlock::from).collect();
        PromptRequest::new(session_id, prompt)
    }
}
