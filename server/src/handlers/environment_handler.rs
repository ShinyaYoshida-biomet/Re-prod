use crate::projects::ProjectRuntime;
use reprod_core::{
    EnvironmentVariable, ExecutionActor, ExecutionContext, ExecutionRequest, ExecutionSource,
};
use std::sync::Arc;

use super::common::{error_response, WSResponse};

pub async fn handle_environment_query(runtime: &Arc<ProjectRuntime>) -> Vec<WSResponse> {
    // R code to gather environment data
    let r_code = r#"
{
    # Get all variable names in global environment
    var_names <- ls(envir = .GlobalEnv)

    if (length(var_names) == 0) {
        result <- list(variables = list())
    } else {
        # For each variable, collect metadata
        env_data <- lapply(var_names, function(name) {
            obj <- tryCatch(
                get(name, envir = .GlobalEnv),
                error = function(e) NULL
            )

            if (is.null(obj)) {
                return(NULL)
            }

            # Type/Class
            obj_class <- class(obj)[1]

            # Size info
            if (is.data.frame(obj)) {
                size <- sprintf("%d obs. of %d variables", nrow(obj), ncol(obj))
            } else if (is.matrix(obj)) {
                size <- sprintf("%d x %d matrix", nrow(obj), ncol(obj))
            } else if (is.list(obj) && !is.data.frame(obj)) {
                size <- sprintf("list of %d", length(obj))
            } else if (length(obj) > 1) {
                size <- sprintf("length %d", length(obj))
            } else {
                size <- "length 1"
            }

            # Value preview (max 50 chars)
            if (is.data.frame(obj) || is.matrix(obj)) {
                value <- sprintf("<%s>", obj_class)
            } else if (is.function(obj)) {
                value <- "<function>"
            } else if (length(obj) > 5) {
                preview <- paste(head(obj, 5), collapse = ", ")
                value <- sprintf("%s, ...", preview)
            } else {
                value <- paste(deparse(obj), collapse = " ")
                if (nchar(value) > 50) {
                    value <- paste0(substr(value, 1, 47), "...")
                }
            }

            list(
                name = name,
                type = obj_class,
                size = size,
                value = value
            )
        })

        # Remove NULL entries (failed gets)
        env_data <- Filter(Negate(is.null), env_data)

        # Sort by name
        if (length(env_data) > 0) {
            names_vec <- sapply(env_data, function(x) x$name)
            env_data <- env_data[order(names_vec)]
        }

        result <- list(variables = env_data)
    }

    # Convert to JSON
    jsonlite::toJSON(result, auto_unbox = TRUE)
}
"#;

    // Execute R code
    let request = ExecutionRequest {
        code: r_code.to_string(),
        context: ExecutionContext {
            source: ExecutionSource::Unknown,
            document_path: None,
            cell_index: None,
            triggered_at_ms: 0,
            actor: ExecutionActor::User,
        },
        blocks: Vec::new(),
        plot_width: None,
        plot_height: None,
    };

    let executor = runtime.r_executor.lock().await;
    match executor.execute(request).await {
        Ok(exec_result) => {
            if !exec_result.success {
                return error_response(format!(
                    "Failed to query environment: {}",
                    exec_result.error.unwrap_or_else(|| "Unknown error".to_string())
                ));
            }

            // Parse JSON output
            let output = exec_result.output.trim();
            if output.is_empty() {
                return vec![WSResponse::EnvironmentData {
                    variables: Vec::new(),
                }];
            }

            match serde_json::from_str::<serde_json::Value>(output) {
                Ok(json) => {
                    let variables = json["variables"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| {
                                    Some(EnvironmentVariable {
                                        name: v["name"].as_str()?.to_string(),
                                        var_type: v["type"].as_str()?.to_string(),
                                        size: v["size"].as_str()?.to_string(),
                                        value: v["value"].as_str()?.to_string(),
                                    })
                                })
                                .collect()
                        })
                        .unwrap_or_default();

                    vec![WSResponse::EnvironmentData { variables }]
                }
                Err(e) => error_response(format!("Failed to parse environment data: {}", e)),
            }
        }
        Err(e) => error_response(format!("Execution error: {}", e)),
    }
}
