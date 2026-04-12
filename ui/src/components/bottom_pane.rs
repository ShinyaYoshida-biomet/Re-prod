use leptos::prelude::*;
use crate::state::use_app_state;
use crate::components::console::ConsolePanel;
use crate::components::terminal::TerminalPanel;
use crate::components::plot_history::PlotHistoryPanel;

#[component]
pub fn BottomPane() -> impl IntoView {
    let state = use_app_state();
    let active_tab = move || state.view.active_bottom_tab.get();

    let set_tab = move |tab: &str| {
        let tab = tab.to_string();
        move |_| state.view.active_bottom_tab.set(tab.clone())
    };

    view! {
        <div class="bottom-pane">
            <div class="panel-tabs">
                <button
                    class="panel-tab"
                    class:active=move || active_tab() == "console"
                    on:click=set_tab("console")
                >"Console"</button>
                <button
                    class="panel-tab"
                    class:active=move || active_tab() == "terminal"
                    on:click=set_tab("terminal")
                >"Terminal"</button>
                <button
                    class="panel-tab"
                    class:active=move || active_tab() == "plots"
                    on:click=set_tab("plots")
                >"Plots"</button>
                <button
                    class="panel-tab"
                    class:active=move || active_tab() == "environment"
                    on:click=set_tab("environment")
                >"Environment"</button>
                <button
                    class="panel-tab"
                    class:active=move || active_tab() == "help"
                    on:click=set_tab("help")
                >"Help"</button>
            </div>
            <div class="panel-content">
                {move || match active_tab().as_str() {
                    "console" => view! { <ConsolePanel /> }.into_any(),
                    "terminal" => view! { <TerminalPanel /> }.into_any(),
                    "plots" => view! { <PlotHistoryPanel /> }.into_any(),
                    "environment" => view! { <div class="environment-panel">"Environment variables will appear here"</div> }.into_any(),
                    "help" => view! { <div class="help-panel">"Help content"</div> }.into_any(),
                    _ => view! { <ConsolePanel /> }.into_any(),
                }}
            </div>
        </div>
    }
}
