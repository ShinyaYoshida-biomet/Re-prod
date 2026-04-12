use leptos::prelude::*;
use crate::state::use_app_state;
use crate::state::view::ModalType;
use crate::services::socket::send_ws_message;
use reprod_protocol::WSRequest;

#[component]
pub fn ExportDialog() -> impl IntoView {
    let state = use_app_state();
    let is_open = move || state.view.active_modal.get() == Some(ModalType::Export);

    view! {
        <Show when=is_open>
            {
                let state = use_app_state();
                let export_format = RwSignal::new("rmarkdown".to_string());
                let output_path = RwSignal::new("output.Rmd".to_string());
                let include_timestamps = RwSignal::new(true);
                let embed_plots = RwSignal::new(true);
                let include_outputs = RwSignal::new(true);

                let on_export = move |_| {
                    send_ws_message(&WSRequest::ExportRMarkdown {
                        request: reprod_protocol::ExportRMarkdownRequest {
                            mode: "timeline".to_string(),
                            format: export_format.get(),
                            output_path: output_path.get(),
                            document_path: None,
                            code_folding: None,
                            include_timestamps: include_timestamps.get(),
                            show_actor: true,
                            embed_plots: embed_plots.get(),
                            include_outputs: include_outputs.get(),
                            include_errors: true,
                            include_summary: true,
                            output_truncation: None,
                            pdf_options: None,
                        },
                    });
                    state.view.close_modal();
                };

                view! {
                    <div class="modal-overlay" on:click=move |_| state.view.close_modal()>
                        <div class="modal-content export-dialog" on:click=move |e| e.stop_propagation()>
                            <div class="modal-header">
                                <h2>"Export"</h2>
                                <button class="modal-close" on:click=move |_| state.view.close_modal()>"×"</button>
                            </div>
                            <div class="modal-body">
                                <div class="export-option">
                                    <label>"Format"</label>
                                    <select on:change=move |ev| export_format.set(event_target_value(&ev))>
                                        <option value="rmarkdown" selected=true>"RMarkdown"</option>
                                        <option value="pdf">"PDF"</option>
                                    </select>
                                </div>
                                <div class="export-option">
                                    <label>"Output Path"</label>
                                    <input type="text" prop:value=move || output_path.get() on:input=move |ev| output_path.set(event_target_value(&ev)) />
                                </div>
                                <div class="export-option">
                                    <label><input type="checkbox" checked=move || include_timestamps.get() on:change=move |_| include_timestamps.update(|v| *v = !*v) />" Include Timestamps"</label>
                                </div>
                                <div class="export-option">
                                    <label><input type="checkbox" checked=move || embed_plots.get() on:change=move |_| embed_plots.update(|v| *v = !*v) />" Embed Plots"</label>
                                </div>
                                <div class="export-option">
                                    <label><input type="checkbox" checked=move || include_outputs.get() on:change=move |_| include_outputs.update(|v| *v = !*v) />" Include Outputs"</label>
                                </div>
                                <div class="export-actions">
                                    <button class="export-button" on:click=on_export>"Export"</button>
                                    <button class="cancel-button" on:click=move |_| state.view.close_modal()>"Cancel"</button>
                                </div>
                            </div>
                        </div>
                    </div>
                }
            }
        </Show>
    }
}
