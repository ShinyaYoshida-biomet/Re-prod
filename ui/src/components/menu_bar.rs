use leptos::prelude::*;
use crate::state::{use_app_state, view::{ViewPane, ModalType}};
use crate::services::socket::send_ws_message;
use reprod_protocol::WSRequest;

#[component]
pub fn MenuBar() -> impl IntoView {
    let state = use_app_state();

    let on_new_file = {
        let editor = state.editor.clone();
        move |_| {
            editor.add_buffer(crate::state::editor::Buffer {
                id: uuid::Uuid::new_v4().to_string(),
                filepath: None,
                content: String::new(),
                is_dirty: false,
                cursor_line: 1,
                cursor_column: 1,
                display_name: Some("Untitled.R".to_string()),
            });
        }
    };

    let on_run_code = {
        let editor = state.editor.clone();
        move |_| {
            if let Some(buffer) = editor.active_buffer() {
                send_ws_message(&WSRequest::Execute {
                    request: reprod_protocol::ExecutionRequest {
                        code: buffer.content.clone(),
                        context: reprod_protocol::ExecutionContext::default(),
                        blocks: vec![],
                        plot_width: None,
                        plot_height: None,
                    },
                });
            }
        }
    };

    let on_interrupt = move |_| { send_ws_message(&WSRequest::InterruptExecution); };
    let on_restart = move |_| { send_ws_message(&WSRequest::RestartSession); };

    let v = state.view.clone();
    let on_export = { let v = v.clone(); move |_| v.open_modal(ModalType::Export) };
    let on_settings = { let v = v.clone(); move |_| v.open_modal(ModalType::Settings) };
    let on_toggle_files = { let v = v.clone(); move |_| v.toggle_pane(ViewPane::Files) };
    let on_toggle_assistant = { let v = v.clone(); move |_| v.toggle_pane(ViewPane::Assistant) };
    let on_zoom_in = { let v = v.clone(); move |_| v.adjust_zoom(0.1) };
    let on_zoom_out = { let v = v.clone(); move |_| v.adjust_zoom(-0.1) };
    let on_zoom_reset = { let v = v.clone(); move |_| v.reset_zoom() };
    let on_shortcuts = { let v = v.clone(); move |_| v.open_modal(ModalType::Shortcuts) };
    let on_about = { let v = v.clone(); move |_| v.open_modal(ModalType::About) };

    view! {
        <div class="menubar">
            <div class="menubar-section">
                <div class="menu-group">
                    <span class="menu-label">"File"</span>
                    <div class="menu-dropdown">
                        <button class="menu-item" on:click=on_new_file>"New File"</button>
                        <button class="menu-item" on:click=on_export>"Export..."</button>
                    </div>
                </div>
                <div class="menu-group">
                    <span class="menu-label">"Code"</span>
                    <div class="menu-dropdown">
                        <button class="menu-item" on:click=on_run_code>"Run All"</button>
                        <button class="menu-item" on:click=on_interrupt>"Interrupt"</button>
                    </div>
                </div>
                <div class="menu-group">
                    <span class="menu-label">"Session"</span>
                    <div class="menu-dropdown">
                        <button class="menu-item" on:click=on_restart>"Restart R Session"</button>
                        <button class="menu-item" on:click=on_settings>"Settings..."</button>
                    </div>
                </div>
                <div class="menu-group">
                    <span class="menu-label">"View"</span>
                    <div class="menu-dropdown">
                        <button class="menu-item" on:click=on_toggle_files>"Toggle Files"</button>
                        <button class="menu-item" on:click=on_toggle_assistant>"Toggle Assistant"</button>
                        <div class="menu-divider"></div>
                        <button class="menu-item" on:click=on_zoom_in>"Zoom In"</button>
                        <button class="menu-item" on:click=on_zoom_out>"Zoom Out"</button>
                        <button class="menu-item" on:click=on_zoom_reset>"Reset Zoom"</button>
                    </div>
                </div>
                <div class="menu-group">
                    <span class="menu-label">"Help"</span>
                    <div class="menu-dropdown">
                        <button class="menu-item" on:click=on_shortcuts>"Keyboard Shortcuts"</button>
                        <button class="menu-item" on:click=on_about>"About Re-prod"</button>
                    </div>
                </div>
            </div>
        </div>
    }
}
