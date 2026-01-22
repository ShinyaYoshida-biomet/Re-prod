use crate::ChatMessage;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone)]
pub struct LocalAgentSession {
    pub id: String,
    pub history: Vec<ChatMessage>,
    pub created_at: i64,
}

impl LocalAgentSession {
    pub fn new(id: String) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        Self {
            id,
            history: Vec::new(),
            created_at: now,
        }
    }

    pub fn add_message(&mut self, msg: ChatMessage) {
        self.history.push(msg);
    }

    pub fn history(&self) -> &[ChatMessage] {
        &self.history
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_creation() {
        let session = LocalAgentSession::new("test-id".to_string());
        assert_eq!(session.id, "test-id");
        assert!(session.history.is_empty());
        assert!(session.created_at > 0);
    }

    #[test]
    fn test_add_message() {
        let mut session = LocalAgentSession::new("test-id".to_string());
        session.add_message(ChatMessage {
            role: "user".to_string(),
            content: "hello".to_string(),
        });
        assert_eq!(session.history.len(), 1);
        assert_eq!(session.history[0].content, "hello");
    }
}
