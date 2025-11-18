use super::common::{error_response, single_response, AppState, WSResponse};
use reprod_core::api::timeline::{
    TimelineQueryPayload, TimelineResponsePayload, TimelineStatsPayload,
};

pub(super) fn handle_timeline_query(
    state: &AppState,
    query: TimelineQueryPayload,
) -> Vec<WSResponse> {
    match query.into_domain() {
        Ok(timeline_query) => match state.timeline.query(timeline_query) {
            Ok(response) => single_response(WSResponse::TimelineResponse {
                data: TimelineResponsePayload::from(response),
            }),
            Err(e) => error_response(format!("Timeline query failed: {}", e)),
        },
        Err(e) => error_response(format!("Invalid timeline query: {}", e)),
    }
}

pub(super) fn handle_timeline_stats_query(state: &AppState) -> Vec<WSResponse> {
    match state.timeline.stats() {
        Ok(stats) => single_response(WSResponse::TimelineStatsResponse {
            stats: TimelineStatsPayload::from(stats),
        }),
        Err(e) => error_response(format!("Timeline stats query failed: {}", e)),
    }
}
