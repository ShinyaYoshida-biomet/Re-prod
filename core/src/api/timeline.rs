use crate::{
    error::ReprodError,
    executor::timeline::{
        SortOrder, TimelineFilters, TimelineQuery, TimelineResponse, TimelineStats,
    },
    export::{CodeFolding, ExportFormat, ExportMode, PdfRenderOptions, RMarkdownOptions},
    ExecutionActor, ExecutionEvent, ExecutionSource,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct TimelineQueryPayload {
    pub filters: Option<TimelineFiltersPayload>,
    pub sort: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct TimelineFiltersPayload {
    pub actor: Option<String>,
    pub source: Option<String>,
    #[serde(rename = "startTime")]
    pub start_time: Option<u64>,
    #[serde(rename = "endTime")]
    pub end_time: Option<u64>,
    #[serde(rename = "hasPlots")]
    pub has_plots: Option<bool>,
    #[serde(rename = "hasErrors")]
    pub has_errors: Option<bool>,
    #[serde(rename = "codeContains")]
    pub code_contains: Option<String>,
}

impl TimelineQueryPayload {
    pub fn into_domain(self) -> Result<TimelineQuery, ReprodError> {
        let filters = match self.filters {
            Some(payload) => Some(payload.try_into()?),
            None => None,
        };

        let sort = match self.sort {
            Some(value) => Some(match value.as_str() {
                "asc" => SortOrder::Asc,
                "desc" => SortOrder::Desc,
                other => {
                    return Err(ReprodError::ProtocolError(format!(
                        "Invalid sort order: {}",
                        other
                    )))
                }
            }),
            None => None,
        };

        Ok(TimelineQuery {
            filters,
            sort,
            limit: self.limit,
            offset: self.offset,
        })
    }
}

impl TryFrom<TimelineFiltersPayload> for TimelineFilters {
    type Error = ReprodError;

    fn try_from(payload: TimelineFiltersPayload) -> Result<Self, Self::Error> {
        let actor = match payload.actor.as_deref() {
            Some("user") => Some(ExecutionActor::User),
            Some("ai") => Some(ExecutionActor::Ai),
            Some(other) => {
                return Err(ReprodError::ProtocolError(format!(
                    "Invalid actor: {}",
                    other
                )))
            }
            None => None,
        };

        let source = match payload.source.as_deref() {
            Some("selection") => Some(ExecutionSource::Selection),
            Some("cell") => Some(ExecutionSource::Cell),
            Some("whole_document") => Some(ExecutionSource::WholeDocument),
            Some("unknown") => Some(ExecutionSource::Unknown),
            Some(other) => {
                return Err(ReprodError::ProtocolError(format!(
                    "Invalid source: {}",
                    other
                )))
            }
            None => None,
        };

        Ok(Self {
            actor,
            source,
            start_time: payload.start_time,
            end_time: payload.end_time,
            has_plots: payload.has_plots,
            has_errors: payload.has_errors,
            code_contains: payload.code_contains,
        })
    }
}

#[derive(Debug, Serialize)]
pub struct TimelineResponsePayload {
    pub events: Vec<ExecutionEvent>,
    pub total: u32,
    #[serde(rename = "hasMore")]
    pub has_more: bool,
    pub query: TimelineQueryEcho,
}

#[derive(Debug, Serialize)]
pub struct TimelineQueryEcho {
    pub filters: Option<TimelineFiltersEcho>,
    pub sort: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct TimelineFiltersEcho {
    pub actor: Option<String>,
    pub source: Option<String>,
    #[serde(rename = "startTime")]
    pub start_time: Option<u64>,
    #[serde(rename = "endTime")]
    pub end_time: Option<u64>,
    #[serde(rename = "hasPlots")]
    pub has_plots: Option<bool>,
    #[serde(rename = "hasErrors")]
    pub has_errors: Option<bool>,
    #[serde(rename = "codeContains")]
    pub code_contains: Option<String>,
}

impl From<TimelineResponse> for TimelineResponsePayload {
    fn from(response: TimelineResponse) -> Self {
        let filters = response.query.filters.map(|f| TimelineFiltersEcho {
            actor: f.actor.map(|actor| actor_to_string(actor).to_string()),
            source: f.source.map(|source| source_to_string(source).to_string()),
            start_time: f.start_time,
            end_time: f.end_time,
            has_plots: f.has_plots,
            has_errors: f.has_errors,
            code_contains: f.code_contains,
        });

        let sort = response.query.sort.map(|s| match s {
            SortOrder::Asc => "asc".to_string(),
            SortOrder::Desc => "desc".to_string(),
        });

        Self {
            events: response.events,
            total: response.total,
            has_more: response.has_more,
            query: TimelineQueryEcho {
                filters,
                sort,
                limit: response.query.limit,
                offset: response.query.offset,
            },
        }
    }
}

#[derive(Debug, Serialize)]
pub struct TimelineStatsPayload {
    #[serde(rename = "totalEvents")]
    pub total_events: u32,
    #[serde(rename = "totalPlots")]
    pub total_plots: u32,
    #[serde(rename = "totalErrors")]
    pub total_errors: u32,
    #[serde(rename = "userActions")]
    pub user_actions: u32,
    #[serde(rename = "aiActions")]
    pub ai_actions: u32,
    #[serde(rename = "sessionStartTime")]
    pub session_start_time: u64,
    #[serde(rename = "sessionEndTime")]
    pub session_end_time: u64,
    #[serde(rename = "sessionDuration")]
    pub session_duration: u64,
}

impl From<TimelineStats> for TimelineStatsPayload {
    fn from(stats: TimelineStats) -> Self {
        Self {
            total_events: stats.total_events,
            total_plots: stats.total_plots,
            total_errors: stats.total_errors,
            user_actions: stats.user_actions,
            ai_actions: stats.ai_actions,
            session_start_time: stats.session_start_time,
            session_end_time: stats.session_end_time,
            session_duration: stats.session_duration,
        }
    }
}

const fn actor_to_string(actor: ExecutionActor) -> &'static str {
    match actor {
        ExecutionActor::User => "user",
        ExecutionActor::Ai => "ai",
    }
}

const fn source_to_string(source: ExecutionSource) -> &'static str {
    match source {
        ExecutionSource::Selection => "selection",
        ExecutionSource::Cell => "cell",
        ExecutionSource::WholeDocument => "whole_document",
        ExecutionSource::Unknown => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timeline_query_payload_into_domain_basic() {
        let payload = TimelineQueryPayload {
            filters: None,
            sort: Some("asc".to_string()),
            limit: Some(10),
            offset: Some(5),
        };

        let query = payload.into_domain().unwrap();
        assert_eq!(query.sort, Some(SortOrder::Asc));
        assert_eq!(query.limit, Some(10));
        assert_eq!(query.offset, Some(5));
        assert!(query.filters.is_none());
    }

    #[test]
    fn test_timeline_query_payload_sort_desc() {
        let payload = TimelineQueryPayload {
            filters: None,
            sort: Some("desc".to_string()),
            limit: None,
            offset: None,
        };

        let query = payload.into_domain().unwrap();
        assert_eq!(query.sort, Some(SortOrder::Desc));
    }

    #[test]
    fn test_timeline_query_payload_invalid_sort() {
        let payload = TimelineQueryPayload {
            filters: None,
            sort: Some("invalid".to_string()),
            limit: None,
            offset: None,
        };

        let result = payload.into_domain();
        assert!(result.is_err());
        match result {
            Err(ReprodError::ProtocolError(msg)) => {
                assert!(msg.contains("Invalid sort order"));
            }
            _ => panic!("Expected ProtocolError"),
        }
    }

    #[test]
    fn test_timeline_filters_payload_actor_user() {
        let payload = TimelineFiltersPayload {
            actor: Some("user".to_string()),
            source: None,
            start_time: None,
            end_time: None,
            has_plots: None,
            has_errors: None,
            code_contains: None,
        };

        let filters: TimelineFilters = payload.try_into().unwrap();
        assert_eq!(filters.actor, Some(ExecutionActor::User));
    }

    #[test]
    fn test_timeline_filters_payload_actor_ai() {
        let payload = TimelineFiltersPayload {
            actor: Some("ai".to_string()),
            source: None,
            start_time: None,
            end_time: None,
            has_plots: None,
            has_errors: None,
            code_contains: None,
        };

        let filters: TimelineFilters = payload.try_into().unwrap();
        assert_eq!(filters.actor, Some(ExecutionActor::Ai));
    }

    #[test]
    fn test_timeline_filters_payload_invalid_actor() {
        let payload = TimelineFiltersPayload {
            actor: Some("invalid".to_string()),
            source: None,
            start_time: None,
            end_time: None,
            has_plots: None,
            has_errors: None,
            code_contains: None,
        };

        let result: Result<TimelineFilters, _> = payload.try_into();
        assert!(result.is_err());
        match result {
            Err(ReprodError::ProtocolError(msg)) => {
                assert!(msg.contains("Invalid actor"));
            }
            _ => panic!("Expected ProtocolError"),
        }
    }

    #[test]
    fn test_timeline_filters_payload_source_selection() {
        let payload = TimelineFiltersPayload {
            actor: None,
            source: Some("selection".to_string()),
            start_time: None,
            end_time: None,
            has_plots: None,
            has_errors: None,
            code_contains: None,
        };

        let filters: TimelineFilters = payload.try_into().unwrap();
        assert_eq!(filters.source, Some(ExecutionSource::Selection));
    }

    #[test]
    fn test_timeline_filters_payload_source_cell() {
        let payload = TimelineFiltersPayload {
            actor: None,
            source: Some("cell".to_string()),
            start_time: None,
            end_time: None,
            has_plots: None,
            has_errors: None,
            code_contains: None,
        };

        let filters: TimelineFilters = payload.try_into().unwrap();
        assert_eq!(filters.source, Some(ExecutionSource::Cell));
    }

    #[test]
    fn test_timeline_filters_payload_source_whole_document() {
        let payload = TimelineFiltersPayload {
            actor: None,
            source: Some("whole_document".to_string()),
            start_time: None,
            end_time: None,
            has_plots: None,
            has_errors: None,
            code_contains: None,
        };

        let filters: TimelineFilters = payload.try_into().unwrap();
        assert_eq!(filters.source, Some(ExecutionSource::WholeDocument));
    }

    #[test]
    fn test_timeline_filters_payload_source_unknown() {
        let payload = TimelineFiltersPayload {
            actor: None,
            source: Some("unknown".to_string()),
            start_time: None,
            end_time: None,
            has_plots: None,
            has_errors: None,
            code_contains: None,
        };

        let filters: TimelineFilters = payload.try_into().unwrap();
        assert_eq!(filters.source, Some(ExecutionSource::Unknown));
    }

    #[test]
    fn test_timeline_filters_payload_invalid_source() {
        let payload = TimelineFiltersPayload {
            actor: None,
            source: Some("invalid".to_string()),
            start_time: None,
            end_time: None,
            has_plots: None,
            has_errors: None,
            code_contains: None,
        };

        let result: Result<TimelineFilters, _> = payload.try_into();
        assert!(result.is_err());
        match result {
            Err(ReprodError::ProtocolError(msg)) => {
                assert!(msg.contains("Invalid source"));
            }
            _ => panic!("Expected ProtocolError"),
        }
    }

    #[test]
    fn test_timeline_filters_payload_all_fields() {
        let payload = TimelineFiltersPayload {
            actor: Some("user".to_string()),
            source: Some("cell".to_string()),
            start_time: Some(1000),
            end_time: Some(2000),
            has_plots: Some(true),
            has_errors: Some(false),
            code_contains: Some("plot".to_string()),
        };

        let filters: TimelineFilters = payload.try_into().unwrap();
        assert_eq!(filters.actor, Some(ExecutionActor::User));
        assert_eq!(filters.source, Some(ExecutionSource::Cell));
        assert_eq!(filters.start_time, Some(1000));
        assert_eq!(filters.end_time, Some(2000));
        assert_eq!(filters.has_plots, Some(true));
        assert_eq!(filters.has_errors, Some(false));
        assert_eq!(filters.code_contains, Some("plot".to_string()));
    }

    #[test]
    fn test_actor_to_string_user() {
        assert_eq!(actor_to_string(ExecutionActor::User), "user");
    }

    #[test]
    fn test_actor_to_string_ai() {
        assert_eq!(actor_to_string(ExecutionActor::Ai), "ai");
    }

    #[test]
    fn test_source_to_string_selection() {
        assert_eq!(source_to_string(ExecutionSource::Selection), "selection");
    }

    #[test]
    fn test_source_to_string_cell() {
        assert_eq!(source_to_string(ExecutionSource::Cell), "cell");
    }

    #[test]
    fn test_source_to_string_whole_document() {
        assert_eq!(
            source_to_string(ExecutionSource::WholeDocument),
            "whole_document"
        );
    }

    #[test]
    fn test_source_to_string_unknown() {
        assert_eq!(source_to_string(ExecutionSource::Unknown), "unknown");
    }

    #[test]
    fn test_timeline_response_payload_conversion() {
        let response = TimelineResponse {
            events: vec![],
            total: 100,
            has_more: true,
            query: TimelineQuery {
                filters: Some(TimelineFilters {
                    actor: Some(ExecutionActor::User),
                    source: Some(ExecutionSource::Cell),
                    start_time: Some(1000),
                    end_time: Some(2000),
                    has_plots: Some(true),
                    has_errors: Some(false),
                    code_contains: Some("test".to_string()),
                }),
                sort: Some(SortOrder::Desc),
                limit: Some(20),
                offset: Some(10),
            },
        };

        let payload: TimelineResponsePayload = response.into();
        assert_eq!(payload.total, 100);
        assert_eq!(payload.has_more, true);
        assert_eq!(payload.query.sort, Some("desc".to_string()));
        assert_eq!(payload.query.limit, Some(20));
        assert_eq!(payload.query.offset, Some(10));

        let filters = payload.query.filters.unwrap();
        assert_eq!(filters.actor, Some("user".to_string()));
        assert_eq!(filters.source, Some("cell".to_string()));
        assert_eq!(filters.start_time, Some(1000));
        assert_eq!(filters.end_time, Some(2000));
        assert_eq!(filters.has_plots, Some(true));
        assert_eq!(filters.has_errors, Some(false));
        assert_eq!(filters.code_contains, Some("test".to_string()));
    }

    #[test]
    fn test_timeline_stats_payload_conversion() {
        let stats = TimelineStats {
            total_events: 150,
            total_plots: 25,
            total_errors: 5,
            user_actions: 100,
            ai_actions: 50,
            session_start_time: 1000,
            session_end_time: 2000,
            session_duration: 1000,
        };

        let payload: TimelineStatsPayload = stats.into();
        assert_eq!(payload.total_events, 150);
        assert_eq!(payload.total_plots, 25);
        assert_eq!(payload.total_errors, 5);
        assert_eq!(payload.user_actions, 100);
        assert_eq!(payload.ai_actions, 50);
        assert_eq!(payload.session_start_time, 1000);
        assert_eq!(payload.session_end_time, 2000);
        assert_eq!(payload.session_duration, 1000);
    }

    // Complex integration-style tests

    #[test]
    fn test_query_with_complex_filters_combination() {
        // Test realistic scenario: User wants all their cell executions with plots from last hour
        let payload = TimelineQueryPayload {
            filters: Some(TimelineFiltersPayload {
                actor: Some("user".to_string()),
                source: Some("cell".to_string()),
                start_time: Some(1700000000000), // Unix timestamp
                end_time: Some(1700003600000),   // 1 hour later
                has_plots: Some(true),
                has_errors: Some(false),
                code_contains: Some("ggplot".to_string()),
            }),
            sort: Some("desc".to_string()),
            limit: Some(50),
            offset: Some(0),
        };

        let query = payload.into_domain().unwrap();

        // Verify all filters are correctly converted
        let filters = query.filters.unwrap();
        assert_eq!(filters.actor, Some(ExecutionActor::User));
        assert_eq!(filters.source, Some(ExecutionSource::Cell));
        assert_eq!(filters.start_time, Some(1700000000000));
        assert_eq!(filters.end_time, Some(1700003600000));
        assert_eq!(filters.has_plots, Some(true));
        assert_eq!(filters.has_errors, Some(false));
        assert_eq!(filters.code_contains, Some("ggplot".to_string()));

        assert_eq!(query.sort, Some(SortOrder::Desc));
        assert_eq!(query.limit, Some(50));
        assert_eq!(query.offset, Some(0));
    }

    #[test]
    fn test_query_pagination_realistic_use_case() {
        // Page 1: First 20 items
        let page1 = TimelineQueryPayload {
            filters: None,
            sort: Some("desc".to_string()),
            limit: Some(20),
            offset: Some(0),
        };
        let query1 = page1.into_domain().unwrap();
        assert_eq!(query1.limit, Some(20));
        assert_eq!(query1.offset, Some(0));

        // Page 2: Next 20 items
        let page2 = TimelineQueryPayload {
            filters: None,
            sort: Some("desc".to_string()),
            limit: Some(20),
            offset: Some(20),
        };
        let query2 = page2.into_domain().unwrap();
        assert_eq!(query2.limit, Some(20));
        assert_eq!(query2.offset, Some(20));

        // Page 3: Next 20 items
        let page3 = TimelineQueryPayload {
            filters: None,
            sort: Some("desc".to_string()),
            limit: Some(20),
            offset: Some(40),
        };
        let query3 = page3.into_domain().unwrap();
        assert_eq!(query3.limit, Some(20));
        assert_eq!(query3.offset, Some(40));
    }

    #[test]
    fn test_error_only_filter_for_debugging() {
        // Realistic scenario: Developer wants to see all errors
        let payload = TimelineQueryPayload {
            filters: Some(TimelineFiltersPayload {
                actor: None,
                source: None,
                start_time: None,
                end_time: None,
                has_plots: None,
                has_errors: Some(true),
                code_contains: None,
            }),
            sort: Some("desc".to_string()),
            limit: Some(100),
            offset: Some(0),
        };

        let query = payload.into_domain().unwrap();
        let filters = query.filters.unwrap();
        assert_eq!(filters.has_errors, Some(true));
        assert!(filters.actor.is_none());
        assert!(filters.source.is_none());
    }

    #[test]
    fn test_code_search_filter() {
        // Search for specific function usage in code
        let payload = TimelineQueryPayload {
            filters: Some(TimelineFiltersPayload {
                actor: None,
                source: None,
                start_time: None,
                end_time: None,
                has_plots: None,
                has_errors: None,
                code_contains: Some("dplyr::filter".to_string()),
            }),
            sort: Some("asc".to_string()),
            limit: None,
            offset: None,
        };

        let query = payload.into_domain().unwrap();
        let filters = query.filters.unwrap();
        assert_eq!(filters.code_contains, Some("dplyr::filter".to_string()));
        assert_eq!(query.sort, Some(SortOrder::Asc));
    }

    #[test]
    fn test_ai_generated_code_filter() {
        // Filter only AI-generated code
        let payload = TimelineQueryPayload {
            filters: Some(TimelineFiltersPayload {
                actor: Some("ai".to_string()),
                source: None,
                start_time: None,
                end_time: None,
                has_plots: None,
                has_errors: None,
                code_contains: None,
            }),
            sort: Some("desc".to_string()),
            limit: Some(50),
            offset: Some(0),
        };

        let query = payload.into_domain().unwrap();
        let filters = query.filters.unwrap();
        assert_eq!(filters.actor, Some(ExecutionActor::Ai));
    }

    #[test]
    fn test_time_range_filter() {
        // Query events within specific time window
        let start = 1700000000000u64;
        let end = 1700010000000u64;

        let payload = TimelineQueryPayload {
            filters: Some(TimelineFiltersPayload {
                actor: None,
                source: None,
                start_time: Some(start),
                end_time: Some(end),
                has_plots: None,
                has_errors: None,
                code_contains: None,
            }),
            sort: Some("asc".to_string()),
            limit: None,
            offset: None,
        };

        let query = payload.into_domain().unwrap();
        let filters = query.filters.unwrap();
        assert_eq!(filters.start_time, Some(start));
        assert_eq!(filters.end_time, Some(end));
    }

    #[test]
    fn test_response_payload_empty_events() {
        // Test empty events array
        let response = TimelineResponse {
            events: vec![],
            total: 0,
            has_more: false,
            query: TimelineQuery {
                filters: None,
                sort: Some(SortOrder::Desc),
                limit: Some(10),
                offset: Some(0),
            },
        };

        let payload: TimelineResponsePayload = response.into();
        assert_eq!(payload.events.len(), 0);
        assert_eq!(payload.total, 0);
        assert_eq!(payload.has_more, false);
    }

    #[test]
    fn test_empty_filters_equal_to_none() {
        // When all filter fields are None, it should behave same as no filters
        let payload_with_empty_filters = TimelineQueryPayload {
            filters: Some(TimelineFiltersPayload {
                actor: None,
                source: None,
                start_time: None,
                end_time: None,
                has_plots: None,
                has_errors: None,
                code_contains: None,
            }),
            sort: Some("desc".to_string()),
            limit: Some(10),
            offset: Some(0),
        };

        let query = payload_with_empty_filters.into_domain().unwrap();
        let filters = query.filters.unwrap();

        // All fields should be None
        assert!(filters.actor.is_none());
        assert!(filters.source.is_none());
        assert!(filters.start_time.is_none());
        assert!(filters.end_time.is_none());
        assert!(filters.has_plots.is_none());
        assert!(filters.has_errors.is_none());
        assert!(filters.code_contains.is_none());
    }

    #[test]
    fn test_query_with_no_pagination() {
        // Query without limit/offset should return all results
        let payload = TimelineQueryPayload {
            filters: None,
            sort: Some("desc".to_string()),
            limit: None,
            offset: None,
        };

        let query = payload.into_domain().unwrap();
        assert!(query.limit.is_none());
        assert!(query.offset.is_none());
    }

    #[test]
    fn test_stats_with_zero_values() {
        // Edge case: session with no activity
        let stats = TimelineStats {
            total_events: 0,
            total_plots: 0,
            total_errors: 0,
            user_actions: 0,
            ai_actions: 0,
            session_start_time: 1700000000000,
            session_end_time: 1700000000000,
            session_duration: 0,
        };

        let payload: TimelineStatsPayload = stats.into();
        assert_eq!(payload.total_events, 0);
        assert_eq!(payload.total_plots, 0);
        assert_eq!(payload.total_errors, 0);
        assert_eq!(payload.user_actions, 0);
        assert_eq!(payload.ai_actions, 0);
        assert_eq!(payload.session_duration, 0);
    }

    #[test]
    fn test_stats_with_large_values() {
        // Stress test with large numbers
        let stats = TimelineStats {
            total_events: 1_000_000,
            total_plots: 50_000,
            total_errors: 10_000,
            user_actions: 600_000,
            ai_actions: 400_000,
            session_start_time: 1700000000000,
            session_end_time: 1700086400000, // 24 hours later
            session_duration: 86400000,      // 24 hours in ms
        };

        let payload: TimelineStatsPayload = stats.into();
        assert_eq!(payload.total_events, 1_000_000);
        assert_eq!(payload.total_plots, 50_000);
        assert_eq!(payload.total_errors, 10_000);
        assert_eq!(payload.user_actions, 600_000);
        assert_eq!(payload.ai_actions, 400_000);
        assert_eq!(payload.session_duration, 86400000);
    }

    #[test]
    fn test_multiple_invalid_sort_orders() {
        let invalid_sorts = vec!["ascending", "descending", "INVALID", "123", ""];

        for invalid_sort in invalid_sorts {
            let payload = TimelineQueryPayload {
                filters: None,
                sort: Some(invalid_sort.to_string()),
                limit: None,
                offset: None,
            };

            let result = payload.into_domain();
            assert!(result.is_err(), "Sort '{}' should be invalid", invalid_sort);
        }
    }

    #[test]
    fn test_multiple_invalid_actors() {
        let invalid_actors = vec!["USER", "AI", "admin", "system", ""];

        for invalid_actor in invalid_actors {
            let payload = TimelineFiltersPayload {
                actor: Some(invalid_actor.to_string()),
                source: None,
                start_time: None,
                end_time: None,
                has_plots: None,
                has_errors: None,
                code_contains: None,
            };

            let result: Result<TimelineFilters, _> = payload.try_into();
            assert!(
                result.is_err(),
                "Actor '{}' should be invalid",
                invalid_actor
            );
        }
    }

    #[test]
    fn test_multiple_invalid_sources() {
        let invalid_sources = vec!["CELL", "SELECTION", "document", "file", ""];

        for invalid_source in invalid_sources {
            let payload = TimelineFiltersPayload {
                actor: None,
                source: Some(invalid_source.to_string()),
                start_time: None,
                end_time: None,
                has_plots: None,
                has_errors: None,
                code_contains: None,
            };

            let result: Result<TimelineFilters, _> = payload.try_into();
            assert!(
                result.is_err(),
                "Source '{}' should be invalid",
                invalid_source
            );
        }
    }
}

// ===== RMarkdown Export API Types =====

/// Request to export timeline as RMarkdown document.
#[derive(Debug, Deserialize)]
pub struct ExportRMarkdownRequest {
    pub mode: String, // "timeline" or "document"
    #[serde(default = "default_export_format")]
    pub format: String, // "rmarkdown" or "pdf"
    #[serde(rename = "outputPath")]
    pub output_path: String,
    #[serde(rename = "documentPath")]
    pub document_path: Option<String>,
    #[serde(rename = "codeFolding")]
    pub code_folding: Option<String>,
    #[serde(rename = "includeTimestamps")]
    pub include_timestamps: bool,
    #[serde(rename = "showActor")]
    pub show_actor: bool,
    #[serde(rename = "embedPlots")]
    pub embed_plots: bool,
    #[serde(rename = "includeOutputs")]
    pub include_outputs: bool,
    #[serde(rename = "includeErrors")]
    pub include_errors: bool,
    #[serde(rename = "includeSummary")]
    pub include_summary: bool,
    #[serde(rename = "outputTruncation")]
    pub output_truncation: Option<OutputTruncationPayload>,
    #[serde(rename = "pdfOptions")]
    pub pdf_options: Option<PdfOptionsPayload>,
}

impl ExportRMarkdownRequest {
    pub fn mode(&self) -> &str {
        &self.mode
    }

    pub fn into_options(
        self,
    ) -> Result<
        (
            ExportMode,
            ExportFormat,
            RMarkdownOptions,
            Option<PdfRenderOptions>,
            String,
        ),
        ReprodError,
    > {
        let mode = match self.mode.as_str() {
            "timeline" => ExportMode::Timeline,
            "document" => ExportMode::Document,
            other => {
                return Err(ReprodError::ProtocolError(format!(
                    "Invalid export mode: {}",
                    other
                )))
            }
        };

        let format = match self.format.as_str() {
            "rmarkdown" => ExportFormat::RMarkdown,
            "pdf" => ExportFormat::Pdf,
            other => {
                return Err(ReprodError::ProtocolError(format!(
                    "Invalid export format: {}",
                    other
                )))
            }
        };

        let pdf_options: Option<PdfRenderOptions> = self
            .pdf_options
            .as_ref()
            .map(|options| options.clone().into());
        let show_code = pdf_options
            .as_ref()
            .map(|options: &PdfRenderOptions| options.include_source)
            .unwrap_or(true);

        let code_folding = match self.code_folding.as_deref() {
            Some("hide") => CodeFolding::Hide,
            Some("show") | None => CodeFolding::Show,
            Some(other) => {
                return Err(ReprodError::ProtocolError(format!(
                    "Invalid code folding option: {}",
                    other
                )))
            }
        };

        let truncation = self.output_truncation.unwrap_or_default();

        let options = RMarkdownOptions {
            mode,
            show_code,
            code_folding,
            include_timestamps: self.include_timestamps,
            show_actor: self.show_actor,
            embed_plots: self.embed_plots,
            include_outputs: self.include_outputs,
            include_errors: self.include_errors,
            include_summary: self.include_summary,
            output_head_lines: truncation.head_lines,
            output_tail_lines: truncation.tail_lines,
            output_max_lines: truncation.max_lines,
        };

        Ok((mode, format, options, pdf_options, self.output_path))
    }

    pub fn document_path(&self) -> Option<String> {
        self.document_path.clone()
    }
}

fn default_export_format() -> String {
    "rmarkdown".to_string()
}

#[derive(Debug, Clone, Deserialize)]
pub struct PdfOptionsPayload {
    #[serde(default = "bool_true")]
    pub toc: bool,
    #[serde(rename = "includeSource", default = "bool_true")]
    pub include_source: bool,
    #[serde(rename = "highlightTheme", default = "default_highlight_theme")]
    pub highlight_theme: String,
    #[serde(rename = "figWidth", default = "default_fig_width")]
    pub fig_width: f64,
    #[serde(rename = "figHeight", default = "default_fig_height")]
    pub fig_height: f64,
    #[serde(rename = "latexPreamble")]
    pub latex_preamble: Option<String>,
}

impl From<PdfOptionsPayload> for PdfRenderOptions {
    fn from(payload: PdfOptionsPayload) -> Self {
        Self {
            toc: payload.toc,
            include_source: payload.include_source,
            highlight_theme: payload.highlight_theme,
            fig_width: payload.fig_width,
            fig_height: payload.fig_height,
            latex_preamble: payload.latex_preamble,
        }
    }
}

const fn bool_true() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
pub struct OutputTruncationPayload {
    #[serde(default = "default_head_lines")]
    pub head_lines: usize,
    #[serde(default = "default_tail_lines")]
    pub tail_lines: usize,
    #[serde(default = "default_max_lines")]
    pub max_lines: usize,
}

impl Default for OutputTruncationPayload {
    fn default() -> Self {
        Self {
            head_lines: default_head_lines(),
            tail_lines: default_tail_lines(),
            max_lines: default_max_lines(),
        }
    }
}

const fn default_head_lines() -> usize {
    20
}

const fn default_tail_lines() -> usize {
    8
}

const fn default_max_lines() -> usize {
    200
}

const fn default_fig_width() -> f64 {
    7.0
}

const fn default_fig_height() -> f64 {
    5.0
}

fn default_highlight_theme() -> String {
    "tango".to_string()
}

/// Response from RMarkdown export operation.
#[derive(Debug, Serialize)]
pub struct ExportRMarkdownResponse {
    pub success: bool,
    #[serde(rename = "outputPath")]
    pub output_path: String,
    pub error: Option<String>,
}

impl ExportRMarkdownResponse {
    pub const fn success(output_path: String) -> Self {
        Self {
            success: true,
            output_path,
            error: None,
        }
    }

    pub const fn error(error: String) -> Self {
        Self {
            success: false,
            output_path: String::new(),
            error: Some(error),
        }
    }

    pub fn output_path(&self) -> &str {
        &self.output_path
    }
}
