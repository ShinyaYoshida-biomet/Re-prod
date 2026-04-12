use leptos::prelude::*;
use crate::state::use_app_state;

#[component]
pub fn TimelineDialog() -> impl IntoView {
    let state = use_app_state();
    let events = move || state.timeline.events.get();
    let total = move || state.timeline.total.get();

    view! {
        <div class="timeline-dialog">
            <div class="timeline-header">
                <h3>"Timeline"</h3>
                <span class="timeline-count">{move || format!("{} events", total())}</span>
            </div>
            <div class="timeline-list">
                <For
                    each=events
                    key=|event| event.event_id.clone()
                    let:event
                >
                    <div class="timeline-event">
                        <div class="timeline-event-header">
                            <span class="timeline-event-status" class:success=move || event.result.success class:error=move || !event.result.success>
                                {if event.result.success { "OK" } else { "ERR" }}
                            </span>
                            <span class="timeline-event-code">{event.blocks.first().map(|b| b.code.clone()).unwrap_or_else(|| "...".to_string())}</span>
                        </div>
                        {if !event.result.plots.is_empty() {
                            view! { <span class="timeline-event-plots">{format!("{} plots", event.result.plots.len())}</span> }.into_any()
                        } else {
                            view! { <span></span> }.into_any()
                        }}
                    </div>
                </For>
            </div>
        </div>
    }
}
