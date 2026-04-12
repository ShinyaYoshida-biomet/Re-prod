use leptos::prelude::*;
use crate::state::use_app_state;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;
use crate::services::socket::send_ws_message;
use reprod_protocol::WSRequest;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = initMonacoEditor)]
    fn init_monaco_editor(container_id: &str, initial_content: &str, language: &str) -> js_sys::Promise;

    #[wasm_bindgen(js_name = getMonacoValue)]
    fn get_monaco_value(container_id: &str) -> String;

    #[wasm_bindgen(js_name = setMonacoValue)]
    fn set_monaco_value(container_id: &str, value: &str);

    #[wasm_bindgen(js_name = onMonacoContentChange)]
    fn on_monaco_content_change(container_id: &str, callback: &Closure<dyn Fn(String)>);

    #[wasm_bindgen(js_name = onMonacoKeyDown)]
    fn on_monaco_key_down(container_id: &str, callback: &Closure<dyn Fn(String, bool, bool, bool)>);

    #[wasm_bindgen(js_name = getMonacoCursorPosition)]
    fn get_monaco_cursor_position(container_id: &str) -> JsValue;
}

const EDITOR_CONTAINER_ID: &str = "monaco-editor-container";

#[component]
pub fn EditorPanel() -> impl IntoView {
    let state = use_app_state();
    let editor_state = state.editor.clone();

    // Initialize Monaco editor after mount
    let _init_effect = Effect::new(move |_| {
        let editor_state = editor_state.clone();
        let content = editor_state.active_buffer()
            .map(|b| b.content.clone())
            .unwrap_or_default();

        spawn_local(async move {
            let promise = init_monaco_editor(EDITOR_CONTAINER_ID, &content, "r");
            let _ = wasm_bindgen_futures::JsFuture::from(promise).await;

            // Set up content change handler
            let es = editor_state.clone();
            let content_callback = Closure::wrap(Box::new(move |new_content: String| {
                if let Some(buffer) = es.active_buffer() {
                    es.update_content(&buffer.id, new_content);
                }
            }) as Box<dyn Fn(String)>);
            on_monaco_content_change(EDITOR_CONTAINER_ID, &content_callback);
            content_callback.forget();

            // Set up keyboard shortcut handler
            let _es2 = editor_state.clone();
            let key_callback = Closure::wrap(Box::new(move |key: String, ctrl: bool, meta: bool, shift: bool| {
                let cmd = ctrl || meta;
                // Cmd/Ctrl+Enter: Run current cell
                if cmd && !shift && key == "Enter" {
                    let code = get_monaco_value(EDITOR_CONTAINER_ID);
                    if !code.is_empty() {
                        send_ws_message(&WSRequest::Execute {
                            request: reprod_protocol::ExecutionRequest {
                                code,
                                context: reprod_protocol::ExecutionContext::default(),
                                blocks: vec![],
                                plot_width: None,
                                plot_height: None,
                            },
                        });
                    }
                }
                // Cmd/Ctrl+Shift+Enter: Run all
                if cmd && shift && key == "Enter" {
                    let code = get_monaco_value(EDITOR_CONTAINER_ID);
                    if !code.is_empty() {
                        send_ws_message(&WSRequest::Execute {
                            request: reprod_protocol::ExecutionRequest {
                                code,
                                context: reprod_protocol::ExecutionContext {
                                    source: reprod_protocol::ExecutionSource::WholeDocument,
                                    ..Default::default()
                                },
                                blocks: vec![],
                                plot_width: None,
                                plot_height: None,
                            },
                        });
                    }
                }
            }) as Box<dyn Fn(String, bool, bool, bool)>);
            on_monaco_key_down(EDITOR_CONTAINER_ID, &key_callback);
            key_callback.forget();
        });
    });

    // Sync content when active buffer changes
    let _active_buffer_content = {
        let editor_state = state.editor.clone();
        move || editor_state.active_buffer().map(|b| b.content.clone()).unwrap_or_default()
    };

    let tab_name = {
        let editor_state = state.editor.clone();
        move || editor_state.active_buffer()
            .and_then(|b| b.display_name.clone().or(b.filepath.clone()))
            .unwrap_or_else(|| "Untitled.R".to_string())
    };

    let is_dirty = {
        let editor_state = state.editor.clone();
        move || editor_state.active_buffer().map(|b| b.is_dirty).unwrap_or(false)
    };

    view! {
        <div class="editor-panel">
            <div class="editor-tabs">
                <div class="editor-tab active">
                    <span class="tab-name">{tab_name}</span>
                    {move || if is_dirty() {
                        view! { <span class="tab-dirty">"*"</span> }.into_any()
                    } else {
                        view! { <span></span> }.into_any()
                    }}
                </div>
            </div>
            <div id={EDITOR_CONTAINER_ID} class="editor-container"></div>
        </div>
    }
}
