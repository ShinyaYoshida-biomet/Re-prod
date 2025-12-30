use crate::executor::CommandOutput;

pub struct OutputParseResult {
    pub stdout_raw: String,
    pub stderr_raw: String,
    pub stdout_clean: String,
    pub stderr_clean: String,
    pub display_output: String,
    pub error_output: Option<String>,
}

pub fn parse_command_output(command_output: &CommandOutput) -> OutputParseResult {
    let stdout_raw = String::from_utf8_lossy(&command_output.stdout).to_string();
    let stderr_raw = String::from_utf8_lossy(&command_output.stderr).to_string();
    let stdout_clean = strip_internal_lines(&stdout_raw);
    let stderr_clean = strip_internal_lines(&stderr_raw);

    let error_output = if command_output.interrupted {
        Some("Execution interrupted by user.".to_string())
    } else if stderr_clean.is_empty() {
        None
    } else {
        Some(stderr_clean.clone())
    };

    let display_output = if stderr_clean.is_empty() {
        stdout_clean.clone()
    } else {
        format!("{stdout_clean}\n{stderr_clean}")
    };

    OutputParseResult {
        stdout_raw,
        stderr_raw,
        stdout_clean,
        stderr_clean,
        display_output,
        error_output,
    }
}

pub(crate) fn is_internal_line(line: &str) -> bool {
    const NOISE_PREFIXES: [&str; 5] = [
        "REPROD_PNG_",
        "REPROD_STATE",
        "REPROD_WRAPPER_ENTER",
        "REPROD_PLOT_CAPTURE_ERROR",
        "__REPROD_PLOT__",
    ];
    NOISE_PREFIXES.iter().any(|p| line.starts_with(p))
}

fn strip_internal_lines(s: &str) -> String {
    s.lines()
        .filter(|line| !is_internal_line(line))
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_internal_lines_from_outputs() {
        let output = CommandOutput {
            success: true,
            stdout: b"ok\nREPROD_PNG_DEVICE: x\nanother".to_vec(),
            stderr: b"__REPROD_PLOT__|foo\nerr".to_vec(),
            interrupted: false,
        };

        let parsed = parse_command_output(&output);

        assert_eq!(parsed.stdout_clean, "ok\nanother");
        assert_eq!(parsed.stderr_clean, "err");
        assert_eq!(parsed.display_output, "ok\nanother\nerr");
        assert!(parsed.error_output.is_some());
    }
}
