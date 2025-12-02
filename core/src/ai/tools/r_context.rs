use crate::{RExecutor, ReprodError};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// R Context tool for AI to query R environment state
#[derive(Debug, Clone)]
pub struct RContextTool;

#[derive(Debug, Serialize, Deserialize)]
pub struct GetVariablesRequest {
    pub pattern: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VariableInfo {
    pub name: String,
    pub class: String,
    pub preview: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetWorkingDirRequest {}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetInstalledPackagesRequest {}

impl Default for RContextTool {
    fn default() -> Self {
        Self::new()
    }
}

impl RContextTool {
    pub const fn new() -> Self {
        Self
    }

    /// Get list of variables in R environment
    pub async fn get_variables(
        &self,
        _request: GetVariablesRequest,
        executor: &mut RExecutor,
    ) -> Result<Vec<VariableInfo>, ReprodError> {
        let code = r#"
# Get all objects in global environment
objects_list <- ls(envir = .GlobalEnv)

# Get info for each object
info_list <- lapply(objects_list, function(obj_name) {
    obj <- get(obj_name, envir = .GlobalEnv)
    list(
        name = obj_name,
        class = paste(class(obj), collapse = ", "),
        preview = paste(utils::capture.output(utils::str(obj, max.level = 1))[1:3], collapse = "\n")
    )
})

# Convert to JSON
jsonlite::toJSON(info_list, auto_unbox = TRUE)
"#;

        let request = crate::ExecutionRequest {
            code: code.to_string(),
            context: Default::default(),
            blocks: vec![],
            plot_width: None,
            plot_height: None,
        };

        let result = executor.execute(request).await?;

        if !result.success {
            return Err(ReprodError::ExecutionError(
                result.error.unwrap_or_else(|| "Unknown error".to_string()),
            ));
        }

        // Parse the JSON output
        let variables: Vec<VariableInfo> =
            serde_json::from_str(&result.output).unwrap_or_else(|_| vec![]);

        Ok(variables)
    }

    /// Get current working directory
    pub async fn get_working_dir(
        &self,
        _request: GetWorkingDirRequest,
        executor: &mut RExecutor,
    ) -> Result<String, ReprodError> {
        let code = "getwd()";

        let request = crate::ExecutionRequest {
            code: code.to_string(),
            context: Default::default(),
            blocks: vec![],
            plot_width: None,
            plot_height: None,
        };

        let result = executor.execute(request).await?;

        if !result.success {
            return Err(ReprodError::ExecutionError(
                result.error.unwrap_or_else(|| "Unknown error".to_string()),
            ));
        }

        // Extract working directory from output
        let output = result.output.trim();
        let wd = output
            .lines()
            .last()
            .unwrap_or("")
            .trim()
            .trim_matches(|c| c == '"' || c == '[' || c == ']' || c == '1');

        Ok(wd.to_string())
    }

    /// Get list of installed packages
    pub async fn get_installed_packages(
        &self,
        _request: GetInstalledPackagesRequest,
        executor: &mut RExecutor,
    ) -> Result<Vec<String>, ReprodError> {
        let code = r#"
# Get installed packages
pkgs <- installed.packages()[, "Package"]
jsonlite::toJSON(pkgs, auto_unbox = TRUE)
"#;

        let request = crate::ExecutionRequest {
            code: code.to_string(),
            context: Default::default(),
            blocks: vec![],
            plot_width: None,
            plot_height: None,
        };

        let result = executor.execute(request).await?;

        if !result.success {
            return Err(ReprodError::ExecutionError(
                result.error.unwrap_or_else(|| "Unknown error".to_string()),
            ));
        }

        // Parse the JSON output
        let packages: Vec<String> = serde_json::from_str(&result.output).unwrap_or_else(|_| vec![]);

        Ok(packages)
    }
}

/// Tool definitions for AI provider
pub fn get_r_context_tools() -> Vec<Value> {
    serde_json::json!([
        {
            "name": "get_r_variables",
            "description": "Get a list of all variables currently defined in the R environment, including their types and previews.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Optional regex pattern to filter variable names"
                    }
                }
            }
        },
        {
            "name": "get_working_directory",
            "description": "Get the current working directory in the R session.",
            "input_schema": {
                "type": "object",
                "properties": {}
            }
        },
        {
            "name": "get_installed_packages",
            "description": "Get a list of all R packages currently installed.",
            "input_schema": {
                "type": "object",
                "properties": {}
            }
        }
    ])
    .as_array()
    .expect("get_r_context_tools: json! array literal should always be an array")
    .clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_r_context_tool_creation() {
        let tool = RContextTool::new();
        assert!(std::mem::size_of_val(&tool) == 0); // ZST
    }

    #[test]
    fn test_get_r_context_tools() {
        let tools = get_r_context_tools();
        assert_eq!(tools.len(), 3);

        let names: Vec<_> = tools
            .iter()
            .filter_map(|t| t.get("name").and_then(|n| n.as_str()))
            .collect();

        assert!(names.contains(&"get_r_variables"));
        assert!(names.contains(&"get_working_directory"));
        assert!(names.contains(&"get_installed_packages"));
    }
}
