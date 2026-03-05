use reprod_core::ai::extract_code_blocks;

use super::common::WSResponse;

pub(super) fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub(super) fn build_streaming_payload(
    stream: bool,
    stream_id: &str,
    content: String,
) -> Vec<WSResponse> {
    if stream {
        let blocks = extract_code_blocks(&content);
        let code_blocks = if blocks.is_empty() {
            None
        } else {
            Some(blocks)
        };
        vec![
            WSResponse::AIResponseChunk {
                id: stream_id.to_string(),
                chunk: content.clone(),
            },
            WSResponse::AIResponseComplete {
                id: stream_id.to_string(),
                final_text: content,
                code_blocks,
            },
        ]
    } else {
        vec![WSResponse::AIResponse { response: content }]
    }
}

pub(super) fn error_response(message: impl Into<String>) -> Vec<WSResponse> {
    vec![WSResponse::Error {
        message: message.into(),
    }]
}

pub(super) fn single_response(response: WSResponse) -> Vec<WSResponse> {
    vec![response]
}
