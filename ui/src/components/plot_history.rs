use leptos::prelude::*;
use crate::state::use_app_state;
use crate::services::socket::send_ws_message;
use reprod_protocol::WSRequest;

#[component]
pub fn PlotHistoryPanel() -> impl IntoView {
    let state = use_app_state();
    let plots = move || state.plot_history.items.get();
    let active_id = move || state.plot_history.active_plot_id.get();

    let active_plot = move || {
        let id = active_id();
        let items = plots();
        id.and_then(|id| items.iter().find(|p| p.id == id).cloned())
    };

    let on_prev = move |_| state.plot_history.select_previous();
    let on_next = move |_| state.plot_history.select_next();

    let on_export = move |_| {
        if let Some(plot) = active_plot() {
            send_ws_message(&WSRequest::PlotHistoryExport {
                plot_id: plot.id,
                path: format!("plot_{}.png", chrono_now()),
                format: Some("png".to_string()),
            });
        }
    };

    view! {
        <div class="plot-history-panel">
            {move || if let Some(plot) = active_plot() {
                view! {
                    <div class="plot-display">
                        <img src=format!("data:image/png;base64,{}", plot.data) class="plot-image" />
                        <div class="plot-controls">
                            <button class="plot-nav-button" on:click=on_prev>"< Prev"</button>
                            <span class="plot-counter">
                                {move || {
                                    let items = plots();
                                    let current = active_id().and_then(|id| items.iter().position(|p| p.id == id)).unwrap_or(0);
                                    format!("{} / {}", current + 1, items.len())
                                }}
                            </span>
                            <button class="plot-nav-button" on:click=on_next>"Next >"</button>
                            <button class="plot-export-button" on:click=on_export>"Export"</button>
                        </div>
                    </div>
                }.into_any()
            } else {
                view! {
                    <div class="plot-empty">"No plots yet. Run code that generates plots to see them here."</div>
                }.into_any()
            }}
        </div>
    }
}

fn chrono_now() -> u64 {
    (js_sys::Date::now() / 1000.0) as u64
}
