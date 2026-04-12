use leptos::prelude::*;
use crate::state::use_app_state;
use crate::state::view::ModalType;

#[component]
pub fn SettingsModal() -> impl IntoView {
    let state = use_app_state();
    let is_open = move || state.view.active_modal.get() == Some(ModalType::Settings);

    view! {
        <Show when=is_open>
            {
                let state = use_app_state();
                let settings = move || state.settings.settings.get();

                let on_font_size_change = move |ev: web_sys::Event| {
                    let value: String = event_target_value(&ev);
                    if let Ok(size) = value.parse::<u32>() {
                        state.settings.update_settings(|s| s.font_size = size);
                    }
                };

                let on_r_path_change = move |ev: web_sys::Event| {
                    let value: String = event_target_value(&ev);
                    state.settings.update_settings(|s| s.r_path = value);
                };

                let on_auto_run_change = move |_| {
                    state.settings.update_settings(|s| s.auto_run = !s.auto_run);
                };

                let on_cell_decorations_change = move |_| {
                    state.settings.update_settings(|s| s.show_cell_decorations = !s.show_cell_decorations);
                };

                view! {
                    <div class="modal-overlay" on:click=move |_| state.view.close_modal()>
                        <div class="modal-content settings-modal" on:click=move |e| e.stop_propagation()>
                            <div class="modal-header">
                                <h2>"Settings"</h2>
                                <button class="modal-close" on:click=move |_| state.view.close_modal()>"×"</button>
                            </div>
                            <div class="modal-body">
                                <div class="settings-group">
                                    <h3>"Editor"</h3>
                                    <div class="setting-row">
                                        <label>"Font Size"</label>
                                        <input type="number" value=move || settings().font_size.to_string() on:change=on_font_size_change min="8" max="32" />
                                    </div>
                                    <div class="setting-row">
                                        <label>"Show Cell Decorations"</label>
                                        <input type="checkbox" checked=move || settings().show_cell_decorations on:change=on_cell_decorations_change />
                                    </div>
                                    <div class="setting-row">
                                        <label>"Auto Run"</label>
                                        <input type="checkbox" checked=move || settings().auto_run on:change=on_auto_run_change />
                                    </div>
                                </div>
                                <div class="settings-group">
                                    <h3>"R Configuration"</h3>
                                    <div class="setting-row">
                                        <label>"R Path"</label>
                                        <input type="text" value=move || settings().r_path.clone() on:change=on_r_path_change />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                }
            }
        </Show>
    }
}
