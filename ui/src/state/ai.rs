use leptos::prelude::*;
use reprod_protocol::AIMode;

#[derive(Clone, Debug)]
pub struct AiMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub mode: Option<AIMode>,
    pub streaming_id: Option<String>,
    pub is_complete: bool,
    pub timestamp: f64,
    pub code_blocks: Vec<serde_json::Value>,
    pub plan_steps: Vec<serde_json::Value>,
    pub agent_events: Vec<serde_json::Value>,
    pub tool_logs: Vec<serde_json::Value>,
    pub approval_queue: Vec<serde_json::Value>,
    pub artifacts: Vec<serde_json::Value>,
}

#[derive(Clone, Copy)]
pub struct AiState {
    pub messages: RwSignal<Vec<AiMessage>>,
    pub is_loading: RwSignal<bool>,
    pub active_request_id: RwSignal<Option<String>>,
    pub agent_session_id: RwSignal<Option<String>>,
}

impl AiState {
    pub fn new() -> Self {
        Self {
            messages: RwSignal::new(Vec::new()),
            is_loading: RwSignal::new(false),
            active_request_id: RwSignal::new(None),
            agent_session_id: RwSignal::new(None),
        }
    }

    pub fn add_message(&self, message: AiMessage) {
        self.messages.update(|msgs| msgs.push(message));
    }

    pub fn start_streaming(&self, streaming_id: String, mode: Option<AIMode>) {
        self.is_loading.set(true);
        self.active_request_id.set(Some(streaming_id.clone()));
        let msg = AiMessage {
            id: uuid::Uuid::new_v4().to_string(),
            role: "assistant".to_string(),
            content: String::new(),
            mode,
            streaming_id: Some(streaming_id),
            is_complete: false,
            timestamp: js_sys::Date::now(),
            code_blocks: Vec::new(),
            plan_steps: Vec::new(),
            agent_events: Vec::new(),
            tool_logs: Vec::new(),
            approval_queue: Vec::new(),
            artifacts: Vec::new(),
        };
        self.messages.update(|msgs| msgs.push(msg));
    }

    pub fn append_chunk(&self, streaming_id: &str, chunk: &str) {
        self.messages.update(|msgs| {
            if let Some(msg) = msgs.iter_mut().rev().find(|m| m.streaming_id.as_deref() == Some(streaming_id)) {
                msg.content.push_str(chunk);
            }
        });
    }

    pub fn complete_streaming(&self, streaming_id: &str, final_content: Option<String>, code_blocks: Option<Vec<serde_json::Value>>) {
        self.is_loading.set(false);
        self.active_request_id.set(None);
        self.messages.update(|msgs| {
            if let Some(msg) = msgs.iter_mut().rev().find(|m| m.streaming_id.as_deref() == Some(streaming_id)) {
                if let Some(content) = final_content {
                    msg.content = content;
                }
                if let Some(blocks) = code_blocks {
                    msg.code_blocks = blocks;
                }
                msg.is_complete = true;
            }
        });
    }

    pub fn update_plan(&self, streaming_id: &str, steps: Vec<serde_json::Value>) {
        self.messages.update(|msgs| {
            if let Some(msg) = msgs.iter_mut().rev().find(|m| m.streaming_id.as_deref() == Some(streaming_id)) {
                msg.plan_steps = steps;
            }
        });
    }

    pub fn append_agent_event(&self, streaming_id: &str, event: serde_json::Value) {
        self.messages.update(|msgs| {
            if let Some(msg) = msgs.iter_mut().rev().find(|m| m.streaming_id.as_deref() == Some(streaming_id)) {
                msg.agent_events.push(event);
            }
        });
    }

    pub fn record_tool_event(&self, streaming_id: &str, tool: serde_json::Value) {
        self.messages.update(|msgs| {
            if let Some(msg) = msgs.iter_mut().rev().find(|m| m.streaming_id.as_deref() == Some(streaming_id)) {
                // Update existing or add new
                let tool_id = tool.get("id").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(existing) = msg.tool_logs.iter_mut().find(|t| t.get("id").and_then(|v| v.as_str()) == Some(tool_id)) {
                    *existing = tool;
                } else {
                    msg.tool_logs.push(tool);
                }
            }
        });
    }

    pub fn add_approval_request(&self, streaming_id: &str, request: serde_json::Value) {
        self.messages.update(|msgs| {
            if let Some(msg) = msgs.iter_mut().rev().find(|m| m.streaming_id.as_deref() == Some(streaming_id)) {
                msg.approval_queue.push(request);
            }
        });
    }

    pub fn clear_messages(&self) {
        self.messages.set(Vec::new());
    }
}
