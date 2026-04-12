use leptos::prelude::*;
use crate::state::use_app_state;

#[component]
pub fn ConsolePanel() -> impl IntoView {
    let state = use_app_state();
    let results = move || state.execution.results.get();

    view! {
        <div class="console-panel">
            <div class="console-output">
                <For
                    each=results
                    key=|entry| entry.run_id.clone().unwrap_or_default()
                    let:entry
                >
                    <div class="console-entry" class:error=move || !entry.success>
                        {if !entry.code.is_empty() {
                            view! {
                                <div class="console-code">
                                    <pre><code>{entry.code.clone()}</code></pre>
                                </div>
                            }.into_any()
                        } else {
                            view! { <span></span> }.into_any()
                        }}
                        {if !entry.stdout.is_empty() {
                            view! {
                                <div class="console-stdout">
                                    <pre>{entry.stdout.clone()}</pre>
                                </div>
                            }.into_any()
                        } else {
                            view! { <span></span> }.into_any()
                        }}
                        {if !entry.stderr.is_empty() {
                            view! {
                                <div class="console-stderr">
                                    <pre>{entry.stderr.clone()}</pre>
                                </div>
                            }.into_any()
                        } else {
                            view! { <span></span> }.into_any()
                        }}
                        <For
                            each=move || entry.plots.clone()
                            key=|plot| plot.data.len()
                            let:plot
                        >
                            <div class="console-plot">
                                <img src=format!("data:image/png;base64,{}", plot.data) />
                            </div>
                        </For>
                        {if entry.pending {
                            view! { <div class="console-pending">"Running..."</div> }.into_any()
                        } else {
                            let duration_str = format!("{:.1}ms", entry.duration);
                            view! {
                                <div class="console-duration">{duration_str}</div>
                            }.into_any()
                        }}
                    </div>
                </For>
            </div>
        </div>
    }
}
