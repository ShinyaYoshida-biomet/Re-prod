use leptos::prelude::*;
use crate::state::use_app_state;
use crate::state::ai::AiMessage;
use crate::services::socket::send_ws_message;
use reprod_protocol::{WSRequest, AIMode};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = renderMarkdown)]
    fn render_markdown(text: &str) -> String;
}

#[component]
pub fn AIPanel() -> impl IntoView {
    let state = use_app_state();
    let input_value = RwSignal::new(String::new());
    let is_loading = move || state.ai.is_loading.get();
    let messages = move || state.ai.messages.get();

    let do_send = move || {
        let content = input_value.get();
        if content.trim().is_empty() { return; }

        let streaming_id = uuid::Uuid::new_v4().to_string();

        // Add user message
        state.ai.add_message(AiMessage {
            id: uuid::Uuid::new_v4().to_string(),
            role: "user".to_string(),
            content: content.clone(),
            mode: None,
            streaming_id: None,
            is_complete: true,
            timestamp: js_sys::Date::now(),
            code_blocks: Vec::new(),
            plan_steps: Vec::new(),
            agent_events: Vec::new(),
            tool_logs: Vec::new(),
            approval_queue: Vec::new(),
            artifacts: Vec::new(),
        });

        // Start streaming response
        state.ai.start_streaming(streaming_id.clone(), Some(AIMode::Agent));

        // Send via WebSocket
        let session_id = state.ai.agent_session_id.get().unwrap_or_default();
        send_ws_message(&WSRequest::AIMessage {
            session_id,
            content,
            context: None,
            enable_tools: true,
            request_id: Some(streaming_id),
            stream: true,
            mode: AIMode::Agent,
        });

        input_value.set(String::new());
    };

    let _on_send = move |_: web_sys::MouseEvent| {
        do_send();
    };

    let on_keydown = move |ev: web_sys::KeyboardEvent| {
        if (ev.ctrl_key() || ev.meta_key()) && ev.key() == "Enter" {
            ev.prevent_default();
            do_send();
        }
    };

    view! {
        <div class="ai-pane-wrapper">
            <div class="ai-panel-header">
                <h3>"AI Assistant"</h3>
            </div>
            <div class="ai-messages">
                <For
                    each=messages
                    key=|msg| msg.id.clone()
                    let:msg
                >
                    {
                        let is_user = msg.role == "user";
                        let is_assistant = msg.role == "assistant";
                        let role_label = if is_user { "You" } else { "Assistant" };
                        let content = msg.content.clone();
                        let show_streaming = !msg.is_complete && is_assistant;
                        view! {
                            <div class="ai-message" class:user=is_user class:assistant=is_assistant>
                                <div class="message-role">{role_label}</div>
                                <div class="message-content" inner_html=move || {
                                    if is_assistant {
                                        render_markdown(&content)
                                    } else {
                                        content.clone()
                                    }
                                }></div>
                                {if show_streaming {
                                    view! { <div class="streaming-indicator">"..."</div> }.into_any()
                                } else {
                                    view! { <span></span> }.into_any()
                                }}
                            </div>
                        }
                    }
                </For>
            </div>
            <div class="ai-input-area">
                <textarea
                    class="ai-input"
                    placeholder="Ask the AI assistant..."
                    prop:value=move || input_value.get()
                    on:input=move |ev| input_value.set(event_target_value(&ev))
                    on:keydown=on_keydown
                    disabled=is_loading
                ></textarea>
                <div class="ai-input-actions">
                    <button
                        class="ai-send-button"
                        on:click=move |_| do_send()
                        disabled=is_loading
                    >"Send"</button>
                    <button
                        class="ai-cancel-button"
                        on:click=move |_| {
                            if let Some(request_id) = state.ai.active_request_id.get() {
                                send_ws_message(&WSRequest::AICancel { request_id });
                            }
                        }
                        disabled=move || !is_loading()
                    >"Cancel"</button>
                </div>
            </div>
        </div>
    }
}
