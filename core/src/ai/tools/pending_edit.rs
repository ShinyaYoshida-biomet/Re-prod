use serde_json::Value;

pub fn get_pending_edit_tools() -> Vec<Value> {
    serde_json::json!([
        {
            "name": "propose_text_edit",
            "description": "Propose a text edit without writing to disk. Returns a pending edit payload.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to the file within workspace (e.g., 'analysis.R')"
                    },
                    "operation": {
                        "type": "string",
                        "enum": ["create", "replace", "apply_edits", "delete"],
                        "description": "Edit operation to propose"
                    },
                    "expected_sha256": {
                        "type": "string",
                        "description": "Optional SHA-256 of the file content from read_text_file for conflict detection"
                    },
                    "new_text": {
                        "type": "string",
                        "description": "Full new file contents (required for create/replace)"
                    },
                    "edits": {
                        "type": "array",
                        "description": "Range-based edits (required for apply_edits)",
                        "items": {
                            "type": "object",
                            "properties": {
                                "range": {
                                    "type": "object",
                                    "properties": {
                                        "start_line": { "type": "integer" },
                                        "start_col": { "type": "integer" },
                                        "end_line": { "type": "integer" },
                                        "end_col": { "type": "integer" }
                                    },
                                    "required": ["start_line", "start_col", "end_line", "end_col"]
                                },
                                "text": { "type": "string" }
                            },
                            "required": ["range", "text"]
                        }
                    }
                },
                "required": ["path", "operation"]
            }
        },
        {
            "name": "apply_pending_edit",
            "description": "Apply a previously proposed pending edit by id.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "edit_id": {
                        "type": "string",
                        "description": "Pending edit id"
                    }
                },
                "required": ["edit_id"]
            }
        }
    ])
    .as_array()
    .expect("get_pending_edit_tools: json! array literal should always be an array")
    .clone()
}
