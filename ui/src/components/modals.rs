use leptos::prelude::*;
use crate::state::use_app_state;
use crate::state::view::ModalType;

#[component]
pub fn AboutModal() -> impl IntoView {
    let state = use_app_state();
    let active_modal = state.view.active_modal.clone();
    let is_open = {
        let m = active_modal.clone();
        move || m.get() == Some(ModalType::About)
    };
    let close1 = { let m = active_modal.clone(); move |_| m.set(None) };
    let close2 = { let m = active_modal.clone(); move |_| m.set(None) };

    view! {
        <Show when=is_open fallback=|| ()>
            <div class="modal-overlay" on:click=close1>
                <div class="modal-content about-modal" on:click=move |e| e.stop_propagation()>
                    <div class="modal-header">
                        <h2>"About Re-prod"</h2>
                        <button class="modal-close" on:click=close2>"×"</button>
                    </div>
                    <div class="modal-body">
                        <p>"Re-prod v0.1.0"</p>
                        <p>"An AI-Powered R Analysis IDE"</p>
                        <p>"Built with Leptos + Tauri"</p>
                    </div>
                </div>
            </div>
        </Show>
    }
}

#[component]
pub fn KeyboardShortcutsModal() -> impl IntoView {
    let state = use_app_state();
    let active_modal = state.view.active_modal.clone();
    let is_open = {
        let m = active_modal.clone();
        move || m.get() == Some(ModalType::Shortcuts)
    };
    let close1 = { let m = active_modal.clone(); move |_| m.set(None) };
    let close2 = { let m = active_modal.clone(); move |_| m.set(None) };

    view! {
        <Show when=is_open fallback=|| ()>
            <div class="modal-overlay" on:click=close1>
                <div class="modal-content shortcuts-modal" on:click=move |e| e.stop_propagation()>
                    <div class="modal-header">
                        <h2>"Keyboard Shortcuts"</h2>
                        <button class="modal-close" on:click=close2>"×"</button>
                    </div>
                    <div class="modal-body">
                        <table class="shortcuts-table">
                            <thead><tr><th>"Shortcut"</th><th>"Action"</th></tr></thead>
                            <tbody>
                                <tr><td>"Cmd/Ctrl + Enter"</td><td>"Run current cell"</td></tr>
                                <tr><td>"Shift + Enter"</td><td>"Run cell and move next"</td></tr>
                                <tr><td>"Cmd/Ctrl + Shift + Enter"</td><td>"Run all"</td></tr>
                                <tr><td>"Cmd/Ctrl + K"</td><td>"Focus AI panel"</td></tr>
                                <tr><td>"Cmd/Ctrl + ,"</td><td>"Settings"</td></tr>
                                <tr><td>"Cmd/Ctrl + ="</td><td>"Zoom in"</td></tr>
                                <tr><td>"Cmd/Ctrl + -"</td><td>"Zoom out"</td></tr>
                                <tr><td>"Cmd/Ctrl + 0"</td><td>"Reset zoom"</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Show>
    }
}

#[component]
pub fn SessionInfoModal() -> impl IntoView {
    let state = use_app_state();
    let active_modal = state.view.active_modal.clone();
    let settings = state.settings.settings.clone();
    let is_connected = state.connection.is_connected.clone();
    let server_port = state.connection.server_port.clone();

    let is_open = {
        let m = active_modal.clone();
        move || m.get() == Some(ModalType::SessionInfo)
    };
    let close1 = { let m = active_modal.clone(); move |_| m.set(None) };
    let close2 = { let m = active_modal.clone(); move |_| m.set(None) };

    view! {
        <Show when=is_open fallback=|| ()>
            <div class="modal-overlay" on:click=close1>
                <div class="modal-content session-info-modal" on:click=move |e| e.stop_propagation()>
                    <div class="modal-header">
                        <h2>"Session Info"</h2>
                        <button class="modal-close" on:click=close2>"×"</button>
                    </div>
                    <div class="modal-body">
                        <p>"R Path: " {move || settings.get().r_path.clone()}</p>
                        <p>"Connected: " {move || is_connected.get().to_string()}</p>
                        <p>"Server Port: " {move || server_port.get().to_string()}</p>
                    </div>
                </div>
            </div>
        </Show>
    }
}

#[component]
pub fn ProjectSwitchModal() -> impl IntoView {
    let state = use_app_state();
    let active_modal = state.view.active_modal.clone();
    let is_open = {
        let m = active_modal.clone();
        move || m.get() == Some(ModalType::ProjectSwitch)
    };
    let close1 = { let m = active_modal.clone(); move |_| m.set(None) };
    let close2 = { let m = active_modal.clone(); move |_| m.set(None) };

    view! {
        <Show when=is_open fallback=|| ()>
            <div class="modal-overlay" on:click=close1>
                <div class="modal-content project-switch-modal" on:click=move |e| e.stop_propagation()>
                    <div class="modal-header">
                        <h2>"Switch Project"</h2>
                        <button class="modal-close" on:click=close2>"×"</button>
                    </div>
                    <div class="modal-body">
                        <p>"Project switching will be available here."</p>
                    </div>
                </div>
            </div>
        </Show>
    }
}
