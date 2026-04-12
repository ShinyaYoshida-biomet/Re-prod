pub mod ai;
pub mod connection;
pub mod editor;
pub mod execution;
pub mod pending_edit;
pub mod plot_history;
pub mod project;
pub mod settings;
pub mod timeline;
pub mod view;

use leptos::prelude::*;

use ai::AiState;
use connection::ConnectionState;
use editor::EditorState;
use execution::ExecutionState;
use pending_edit::PendingEditState;
use plot_history::PlotHistoryState;
use project::ProjectState;
use settings::SettingsState;
use timeline::TimelineState;
use view::ViewState;

#[derive(Clone, Copy)]
pub struct AppState {
    pub editor: EditorState,
    pub execution: ExecutionState,
    pub ai: AiState,
    pub pending_edit: PendingEditState,
    pub settings: SettingsState,
    pub connection: ConnectionState,
    pub timeline: TimelineState,
    pub plot_history: PlotHistoryState,
    pub view: ViewState,
    pub project: ProjectState,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            editor: EditorState::new(),
            execution: ExecutionState::new(),
            ai: AiState::new(),
            pending_edit: PendingEditState::new(),
            settings: SettingsState::new(),
            connection: ConnectionState::new(),
            timeline: TimelineState::new(),
            plot_history: PlotHistoryState::new(),
            view: ViewState::new(),
            project: ProjectState::new(),
        }
    }
}

pub fn provide_app_state() -> AppState {
    let state = AppState::new();
    provide_context(state.clone());
    state
}

pub fn use_app_state() -> AppState {
    expect_context::<AppState>()
}
