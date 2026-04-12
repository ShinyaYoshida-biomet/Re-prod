use leptos::prelude::*;
use crate::state::use_app_state;

#[component]
pub fn StatusBar() -> impl IntoView {
    let state = use_app_state();

    let is_connected = move || state.connection.is_connected.get();
    let is_running = move || state.execution.is_running.get();
    let zoom_level = move || {
        let z = state.view.zoom.get();
        format!("{}%", (z * 100.0) as u32)
    };
    let project_name = move || {
        state.project.project.get()
            .map(|p| p.name.clone())
            .unwrap_or_else(|| "No Project".to_string())
    };
    let cursor_info = move || {
        state.editor.active_buffer()
            .map(|b| format!("Ln {}, Col {}", b.cursor_line, b.cursor_column))
            .unwrap_or_else(|| "Ln 1, Col 1".to_string())
    };

    view! {
        <div class="status-bar">
            <div class="status-bar-left">
                <span class="status-indicator" class:connected=is_connected class:disconnected=move || !is_connected()>
                    {move || if is_connected() { "Connected" } else { "Disconnected" }}
                </span>
                <span class="status-item">
                    {project_name}
                </span>
                {move || if is_running() {
                    view! { <span class="status-item running">"Running..."</span> }.into_any()
                } else {
                    view! { <span></span> }.into_any()
                }}
            </div>
            <div class="status-bar-right">
                <span class="status-item">{cursor_info}</span>
                <span class="status-item">"R"</span>
                <span class="status-item">{zoom_level}</span>
            </div>
        </div>
    }
}
