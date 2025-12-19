use std::path::Path;
use std::sync::Arc;

use axum::extract::ws::WebSocket;
use tokio::sync::broadcast;

use super::common::{error_response, WSRequest, WSResponse};
use super::runtime_fs::restart_fs_watcher;
use super::{build_project_opened_response, send_responses, AppState};
use crate::projects::{ProjectRuntime, RuntimeBroadcastEvent};
use reprod_core::fs::FileSystemEvent;
use tokio::sync::mpsc as tokio_mpsc;

use super::runtime_fs::FsWatcherHandle;

pub async fn handle_project_request(
    request: &WSRequest,
    state: &AppState,
    current_runtime: &mut Arc<ProjectRuntime>,
    run_event_rx: &mut broadcast::Receiver<RuntimeBroadcastEvent>,
    fs_watcher: &mut Option<FsWatcherHandle>,
    fs_event_tx: &tokio_mpsc::UnboundedSender<FileSystemEvent>,
    fs_events_closed: &mut bool,
    socket: &mut WebSocket,
) -> Option<bool> {
    match request {
        WSRequest::ProjectList => {
            let projects = state.projects.list_projects().await;
            Some(send_responses(socket, vec![WSResponse::ProjectList { projects }]).await)
        }
        WSRequest::ProjectOpen { project_id } => Some(
            switch_runtime(
                state,
                current_runtime,
                run_event_rx,
                fs_watcher,
                fs_event_tx,
                fs_events_closed,
                socket,
                project_id,
            )
            .await,
        ),
        WSRequest::ProjectCreate { name, path } => match state
            .projects
            .create_new_project(Path::new(path), name)
            .await
        {
            Ok(descriptor) => Some(
                switch_runtime(
                    state,
                    current_runtime,
                    run_event_rx,
                    fs_watcher,
                    fs_event_tx,
                    fs_events_closed,
                    socket,
                    &descriptor.config.id,
                )
                .await,
            ),
            Err(error) => Some(send_responses(socket, error_response(error.to_string())).await),
        },
        WSRequest::ProjectAddExisting { path } => {
            match state.projects.add_existing_project(Path::new(path)).await {
                Ok(descriptor) => Some(
                    switch_runtime(
                        state,
                        current_runtime,
                        run_event_rx,
                        fs_watcher,
                        fs_event_tx,
                        fs_events_closed,
                        socket,
                        &descriptor.config.id,
                    )
                    .await,
                ),
                Err(error) => Some(send_responses(socket, error_response(error.to_string())).await),
            }
        }
        WSRequest::ProjectClone { remote, path, name } => match state
            .projects
            .clone_project(remote, Path::new(path), name.clone())
            .await
        {
            Ok(descriptor) => Some(
                switch_runtime(
                    state,
                    current_runtime,
                    run_event_rx,
                    fs_watcher,
                    fs_event_tx,
                    fs_events_closed,
                    socket,
                    &descriptor.config.id,
                )
                .await,
            ),
            Err(error) => Some(send_responses(socket, error_response(error.to_string())).await),
        },
        WSRequest::ProjectStateLoad { project_id } => {
            Some(match state.projects.load_state(project_id).await {
                Ok(state_payload) => {
                    send_responses(
                        socket,
                        vec![WSResponse::ProjectState {
                            project_id: project_id.clone(),
                            state: state_payload,
                        }],
                    )
                    .await
                }
                Err(error) => send_responses(socket, error_response(error.to_string())).await,
            })
        }
        WSRequest::ProjectStateSave {
            project_id,
            state: payload,
        } => Some(
            match state.projects.save_state(project_id, payload.clone()).await {
                Ok(()) => {
                    send_responses(
                        socket,
                        vec![WSResponse::ProjectStateSaved {
                            project_id: project_id.to_string(),
                        }],
                    )
                    .await
                }
                Err(error) => send_responses(socket, error_response(error.to_string())).await,
            },
        ),
        _ => None,
    }
}

async fn switch_runtime(
    state: &AppState,
    current_runtime: &mut Arc<ProjectRuntime>,
    run_event_rx: &mut broadcast::Receiver<RuntimeBroadcastEvent>,
    fs_watcher: &mut Option<FsWatcherHandle>,
    fs_event_tx: &tokio_mpsc::UnboundedSender<FileSystemEvent>,
    fs_events_closed: &mut bool,
    socket: &mut WebSocket,
    project_id: &str,
) -> bool {
    match state.projects.runtime_for(project_id).await {
        Ok(runtime) => {
            *current_runtime = runtime;
            *run_event_rx = current_runtime.run_events.subscribe();
            restart_fs_watcher(current_runtime, fs_watcher, fs_event_tx, fs_events_closed);

            let responses = vec![build_project_opened_response(state, current_runtime).await];
            send_responses(socket, responses).await
        }
        Err(error) => send_responses(socket, error_response(error.to_string())).await,
    }
}
