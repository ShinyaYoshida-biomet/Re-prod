use leptos::prelude::*;
use crate::state::provide_app_state;
use crate::components::menu_bar::MenuBar;
use crate::components::status_bar::StatusBar;
use crate::components::editor_panel::EditorPanel;
use crate::components::bottom_pane::BottomPane;
use crate::components::ai_panel::AIPanel;
use crate::components::file_browser::FileBrowserPane;
use crate::components::settings_modal::SettingsModal;
use crate::components::export_dialog::ExportDialog;
use crate::components::modals::{AboutModal, KeyboardShortcutsModal, SessionInfoModal, ProjectSwitchModal};
use crate::state::view::ModalType;

#[component]
pub fn App() -> impl IntoView {
    let state = provide_app_state();

    let files_visible = move || state.view.files_visible.get();
    let editor_visible = move || state.view.editor_visible.get();
    let assistant_visible = move || state.view.assistant_visible.get();
    let zoom = move || state.view.zoom.get();

    // Global keyboard shortcuts
    let view_state = state.view.clone();
    let _editor_state = state.editor.clone();
    let on_keydown = move |ev: web_sys::KeyboardEvent| {
        let cmd = ev.ctrl_key() || ev.meta_key();
        let key = ev.key();

        if cmd && key == "," {
            ev.prevent_default();
            view_state.open_modal(ModalType::Settings);
        }
        if cmd && key == "=" {
            ev.prevent_default();
            view_state.adjust_zoom(0.1);
        }
        if cmd && key == "-" {
            ev.prevent_default();
            view_state.adjust_zoom(-0.1);
        }
        if cmd && key == "0" {
            ev.prevent_default();
            view_state.reset_zoom();
        }
    };

    view! {
        <div class="app" on:keydown=on_keydown style=move || format!("font-size: {}px", (14.0 * zoom()) as u32)>
            <MenuBar />
            <div class="workspace-shell">
                <Show when=files_visible>
                    <div class="files-pane" style="width: 240px; min-width: 180px;">
                        <FileBrowserPane />
                    </div>
                </Show>
                <div class="main-area" style="flex: 1; display: flex; flex-direction: column;">
                    <Show when=editor_visible>
                        <div class="editor-area" style="flex: 1; min-height: 200px;">
                            <EditorPanel />
                        </div>
                    </Show>
                    <div class="bottom-area" style="height: 35%; min-height: 150px;">
                        <BottomPane />
                    </div>
                </div>
                <Show when=assistant_visible>
                    <div class="assistant-pane" style="width: 25%; min-width: 300px;">
                        <AIPanel />
                    </div>
                </Show>
            </div>
            <StatusBar />

            // Modals
            <SettingsModal />
            <ExportDialog />
            <AboutModal />
            <KeyboardShortcutsModal />
            <SessionInfoModal />
            <ProjectSwitchModal />
        </div>
    }
}
