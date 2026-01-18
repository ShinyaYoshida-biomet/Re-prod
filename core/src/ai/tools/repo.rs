use serde_json::Value;

pub fn get_repo_tools() -> Vec<Value> {
    serde_json::json!([
        {
            "name": "search_repo",
            "description": "Search the workspace using ripgrep and return matching lines.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Ripgrep query string"
                    },
                    "path": {
                        "type": "string",
                        "description": "Optional relative path within workspace to scope the search"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of matches to return"
                    }
                },
                "required": ["query"]
            }
        },
        {
            "name": "git_status",
            "description": "Run git status (read-only) within the workspace.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Optional relative path within workspace to scope the status"
                    }
                }
            }
        },
        {
            "name": "git_diff",
            "description": "Run git diff (read-only) within the workspace.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Optional relative path within workspace to scope the diff"
                    },
                    "staged": {
                        "type": "boolean",
                        "description": "Whether to show staged changes"
                    }
                }
            }
        },
        {
            "name": "git_log",
            "description": "Run git log (read-only) within the workspace.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Optional relative path within workspace to scope the log"
                    },
                    "max_entries": {
                        "type": "integer",
                        "description": "Maximum number of log entries"
                    }
                }
            }
        }
    ])
    .as_array()
    .expect("get_repo_tools: json! array literal should always be an array")
    .clone()
}
