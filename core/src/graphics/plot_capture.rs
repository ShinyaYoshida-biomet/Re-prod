use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::plot_history::{
    PlotHistoryEntry, PlotHistoryManager, DEFAULT_PLOT_HEIGHT, DEFAULT_PLOT_WIDTH,
    PLOT_HISTORY_SUBDIR,
};
use crate::PlotInfo;
use anyhow::Result;
use base64::Engine;
use tokio::fs;
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

pub const PERSISTENT_DELIMITER: &str = "---REPROD-PERSIST-END---";

#[derive(Clone)]
pub struct CapturedPlot {
    pub info: PlotInfo,
    pub data: Vec<u8>,
    pub snapshot: Option<Vec<u8>>,
}

pub struct PlotCapture {
    temp_dir: PathBuf,
    plot_history: Option<Arc<AsyncMutex<PlotHistoryManager>>>,
}

impl PlotCapture {
    pub fn new(
        temp_dir: PathBuf,
        plot_history: Option<Arc<AsyncMutex<PlotHistoryManager>>>,
    ) -> Self {
        Self {
            temp_dir,
            plot_history,
        }
    }

    pub fn wrap_code(
        &self,
        code: &str,
        plot_prefix: &str,
        plot_width: u32,
        plot_height: u32,
        persistent: bool,
    ) -> String {
        if persistent {
            wrap_code_with_plot_capture_persistent(
                &self.temp_dir,
                code,
                plot_prefix,
                plot_width,
                plot_height,
            )
        } else {
            wrap_code_with_plot_capture(&self.temp_dir, code, plot_prefix, plot_width, plot_height)
        }
    }

    pub async fn collect(
        &self,
        plot_prefix: &str,
        plot_width: u32,
        plot_height: u32,
    ) -> Result<Vec<CapturedPlot>> {
        let mut plots = Vec::new();
        let mut index = 1u32;

        loop {
            let filename = format!("{}_{}.png", plot_prefix, index);
            let path = self.temp_dir.join(&filename);
            let snapshot_path = self.temp_dir.join(format!("{}_{}.rds", plot_prefix, index));

            if !path.exists() {
                break;
            }

            let data = fs::read(&path).await?;
            let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);
            let timestamp = now_ms();
            let snapshot_bytes = if snapshot_path.exists() {
                let bytes = fs::read(&snapshot_path).await.ok();
                let _ = fs::remove_file(&snapshot_path).await;
                bytes
            } else {
                None
            };
            let snapshot_path_str = snapshot_bytes
                .as_ref()
                .and_then(|_| snapshot_path.to_str().map(|s| s.to_string()));

            plots.push(CapturedPlot {
                info: PlotInfo {
                    id: Uuid::new_v4().to_string(),
                    filename,
                    base64_data,
                    index,
                    width: Some(plot_width),
                    height: Some(plot_height),
                    timestamp: Some(timestamp),
                    code: None,
                    storage_path: None,
                    snapshot_path: snapshot_path_str.clone(),
                },
                data,
                snapshot: snapshot_bytes,
            });

            let _ = fs::remove_file(&path).await;

            index += 1;
        }

        Ok(plots)
    }

    pub async fn finalize_plots(
        &self,
        mut captures: Vec<CapturedPlot>,
        code: &str,
    ) -> Result<(Vec<PlotInfo>, Vec<PlotHistoryEntry>)> {
        let mut plots = Vec::with_capacity(captures.len());
        let mut history_entries = Vec::new();

        for mut capture in captures.drain(..) {
            capture.info.code = Some(code.to_string());

            if let Some(manager) = &self.plot_history {
                let mut manager = manager.lock().await;
                let meta = manager.add_plot(
                    Some(capture.info.id.clone()),
                    capture.info.width.unwrap_or(DEFAULT_PLOT_WIDTH),
                    capture.info.height.unwrap_or(DEFAULT_PLOT_HEIGHT),
                    &capture.data,
                    capture.snapshot.as_deref(),
                    Some(code.to_string()),
                    capture.info.timestamp.map(|t| t as i64),
                )?;

                let storage_relative = format!("{}/{}", PLOT_HISTORY_SUBDIR, meta.filename);
                capture.info.filename = storage_relative.clone();
                capture.info.storage_path = Some(storage_relative.clone());
                if let Some(snapshot_filename) = meta.snapshot_filename {
                    let snapshot_rel = format!("{}/{}", PLOT_HISTORY_SUBDIR, snapshot_filename);
                    capture.info.snapshot_path = Some(snapshot_rel);
                }

                history_entries.push(PlotHistoryEntry {
                    id: meta.id.clone(),
                    timestamp: meta.timestamp,
                    width: meta.width,
                    height: meta.height,
                    filename: storage_relative.clone(),
                    storage_path: storage_relative,
                    data: capture.info.base64_data.clone(),
                    code: meta.code.clone(),
                    snapshot_path: capture.info.snapshot_path.clone(),
                });
            }

            plots.push(capture.info);
        }

        Ok((plots, history_entries))
    }
}

fn wrap_code_with_plot_capture_persistent(
    temp_dir: &Path,
    code: &str,
    plot_prefix: &str,
    plot_width: u32,
    plot_height: u32,
) -> String {
    let temp_dir_str = r_escape(&temp_dir.to_string_lossy());

    format!(
        r#"
# Auto-generated plot capture wrapper (persistent session)
cat("REPROD_WRAPPER_ENTER: persistent\n")
.reprod_plot_dir <- "{temp_dir}"
.reprod_plot_prefix <- "{plot_prefix}"

if (!dir.exists(.reprod_plot_dir)) {{
  dir.create(.reprod_plot_dir, recursive = TRUE, showWarnings = FALSE)
}}

.reprod_open_device <- function(index) {{
  filename <- sprintf("%s_%d.png", .reprod_plot_prefix, index)
  png(
    file.path(.reprod_plot_dir, filename),
    width = {plot_width}, height = {plot_height},
    type = "cairo"
  )
}}

.reprod_capture_plot <- function(index) {{
  if (length(dev.list()) == 0 || names(dev.cur()) == "null device") {{
    return(FALSE)
  }}
  tryCatch({{
    snapshot <- recordPlot()
    if (is.null(snapshot)) {{
      return(FALSE)
    }}
    snapshot_path <- file.path(.reprod_plot_dir, sprintf("%s_%d.rds", .reprod_plot_prefix, index))
    saveRDS(snapshot, snapshot_path)
    cat("__REPROD_PLOT__|",
        sprintf("%s_%d", .reprod_plot_prefix, index), "|",
        snapshot_path, "|",
        file.path(.reprod_plot_dir, sprintf("%s_%d.png", .reprod_plot_prefix, index)),
        "\n", sep = "")
    TRUE
  }}, error = function(e) {{
    cat("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e), "\n", file=stderr())
    FALSE
  }})
}}

reprod_png_available <- FALSE
tryCatch({{
  .reprod_open_device(1)
  reprod_png_available <<- TRUE
  cat("REPROD_PNG_DEVICE: ", file.path(.reprod_plot_dir, sprintf("%s_1.png", .reprod_plot_prefix)), "\n", file=stderr())
  cat("REPROD_PNG_DEVICE: ", file.path(.reprod_plot_dir, sprintf("%s_1.png", .reprod_plot_prefix)), "\n") # stdout mirror
}}, error = function(e) {{
  cat("REPROD_PNG_ERROR: ", conditionMessage(e), "\n", file=stderr())
  cat("REPROD_PNG_ERROR: ", conditionMessage(e), "\n") # stdout mirror
}})

tryCatch(
  {{
    {code}
  }},
  error = function(e) {{
    assign(".reprod_last_error", e, envir = .GlobalEnv)
    cat("REPROD_ERROR: ", conditionMessage(e), "\n", file=stderr())
    cat("REPROD_TRACEBACK: ", paste(utils::capture.output(traceback()), collapse = " | "), "\n", file=stderr())
    cat("REPROD_DEVICES: ", paste(names(dev.list()), collapse = ","), "\n", file=stderr())
    cat("REPROD_PLOT_DIR: ", .reprod_plot_dir, "\n", file=stderr())
    cat("REPROD_GETWD: ", getwd(), "\n", file=stderr())
    cat("REPROD_ERROR: ", conditionMessage(e), "\n") # stdout mirror
    cat("REPROD_TRACEBACK: ", paste(utils::capture.output(traceback()), collapse = " | "), "\n") # stdout mirror
    cat("REPROD_DEVICES: ", paste(names(dev.list()), collapse = ","), "\n") # stdout mirror
    cat("REPROD_PLOT_DIR: ", .reprod_plot_dir, "\n") # stdout mirror
    cat("REPROD_GETWD: ", getwd(), "\n") # stdout mirror
  }}
)

if (reprod_png_available && names(dev.cur()) != "null device") {{
  tryCatch(.reprod_capture_plot(1), error = function(e) {{
    cat("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e), "\n", file=stderr())
  }})
  tryCatch(dev.off(), error = function(e) message("REPROD_DEVICE_CLOSE_ERROR: ", conditionMessage(e)))
}}

if (reprod_png_available) {{
  tryCatch({{
    existing_plots <- list.files(
      .reprod_plot_dir,
      pattern = sprintf("^%s_\\d+\\.png$", .reprod_plot_prefix)
    )
    if (length(existing_plots) == 0 &&
        requireNamespace("ggplot2", quietly = TRUE)) {{
      last_plot <- tryCatch(ggplot2::last_plot(), error = function(e) NULL)
      if (inherits(last_plot, "ggplot")) {{
        next_index <- length(existing_plots) + 1
        .reprod_open_device(next_index)
        print(last_plot)
        dev.off()
      }}
    }}
  }}, error = function(e) {{
    cat("REPROD_PNG_POST_ERROR: ", conditionMessage(e), "\n", file=stderr())
    cat("REPROD_PNG_POST_ERROR: ", conditionMessage(e), "\n")
  }})
}}

cat("REPROD_STATE: PNG_AVAILABLE=", reprod_png_available, " PLOT_DIR=", .reprod_plot_dir,
    " GETWD=", getwd(), " DEVICES=", paste(names(dev.list()), collapse=","), "\n",
    file=stderr())
cat("REPROD_STATE: PNG_AVAILABLE=", reprod_png_available, " PLOT_DIR=", .reprod_plot_dir,
    " GETWD=", getwd(), " DEVICES=", paste(names(dev.list()), collapse=","), "\n")

cat("{delimiter}\n")
"#,
        temp_dir = temp_dir_str,
        plot_prefix = plot_prefix,
        plot_width = plot_width,
        plot_height = plot_height,
        code = code,
        delimiter = PERSISTENT_DELIMITER,
    )
}

fn wrap_code_with_plot_capture(
    temp_dir: &Path,
    code: &str,
    plot_prefix: &str,
    plot_width: u32,
    plot_height: u32,
) -> String {
    let temp_dir_str = r_escape(&temp_dir.to_string_lossy());

    format!(
        r#"
# Auto-generated plot capture wrapper
cat("REPROD_WRAPPER_ENTER: oneshot\n")
.reprod_plot_dir <- "{temp_dir}"
.reprod_state_path <- file.path(.reprod_plot_dir, ".reprod_state.RData")

# Ensure plot directory exists
if (!dir.exists(.reprod_plot_dir)) {{
  dir.create(.reprod_plot_dir, recursive = TRUE, showWarnings = FALSE)
}}

# Restore workspace if it exists
if (file.exists(.reprod_state_path)) {{
  tryCatch(
    load(.reprod_state_path, envir = .GlobalEnv),
    error = function(e) message("Failed to restore workspace: ", e)
  )
}}

# Reset run-scoped state to avoid stale values from previous sessions
.reprod_plot_dir <- "{temp_dir}"
.reprod_plot_prefix <- "{plot_prefix}"
.reprod_state_path <- file.path(.reprod_plot_dir, ".reprod_state.RData")
.reprod_exit_code <- 0

# Open PNG device
.reprod_open_device <- function(index) {{
  filename <- sprintf("%s_%d.png", .reprod_plot_prefix, index)
  png(
    file.path(.reprod_plot_dir, filename),
    width = {plot_width}, height = {plot_height},
    type = "cairo"
  )
}}

.reprod_capture_plot <- function(index) {{
  if (length(dev.list()) == 0 || names(dev.cur()) == "null device") {{
    return(FALSE)
  }}
  tryCatch({{
    snapshot <- recordPlot()
    if (is.null(snapshot)) {{
      return(FALSE)
    }}
    snapshot_path <- file.path(.reprod_plot_dir, sprintf("%s_%d.rds", .reprod_plot_prefix, index))
    saveRDS(snapshot, snapshot_path)
    cat("__REPROD_PLOT__|",
        sprintf("%s_%d", .reprod_plot_prefix, index), "|",
        snapshot_path, "|",
        file.path(.reprod_plot_dir, sprintf("%s_%d.png", .reprod_plot_prefix, index)),
        "\n", sep = "")
    TRUE
  }}, error = function(e) {{
    message("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e))
    FALSE
  }})
}}

.reprod_open_device(1)

# User code
tryCatch(
  {{
    {code}
  }},
  error = function(e) {{
    .reprod_exit_code <<- 1
    assign(".reprod_last_error", e, envir = .GlobalEnv)
    message("REPROD_ERROR: ", conditionMessage(e))
  }}
)

# If a device is open, close it to flush the PNG
if (names(dev.cur()) != "null device") {{
  tryCatch(.reprod_capture_plot(1), error = function(e) {{
    message("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e))
  }})
  dev.off()
}}

# If no plots were produced, try to render the last ggplot object automatically
try({{
  existing_plots <- list.files(
    .reprod_plot_dir,
    pattern = sprintf("^%s_\\d+\\.png$", .reprod_plot_prefix)
  )
  if (length(existing_plots) == 0 &&
      requireNamespace("ggplot2", quietly = TRUE)) {{
    last_plot <- tryCatch(ggplot2::last_plot(), error = function(e) NULL)
    if (inherits(last_plot, "ggplot")) {{
      next_index <- length(existing_plots) + 1
      .reprod_open_device(next_index)
      print(last_plot)
      tryCatch(.reprod_capture_plot(next_index), error = function(e) {{
        message("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e))
      }})
      dev.off()
    }}
  }}
}}, silent = TRUE)

# Persist workspace for next run
tryCatch(
  save.image(file = .reprod_state_path),
  error = function(e) message("Failed to save workspace: ", e)
)

quit(status = .reprod_exit_code, runLast = FALSE)
"#,
        temp_dir = temp_dir_str,
        plot_prefix = plot_prefix,
        plot_width = plot_width,
        plot_height = plot_height,
        code = code
    )
}

fn r_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persistent_wrapper_does_not_quit_or_save_image() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let capture = PlotCapture::new(temp_dir.path().to_path_buf(), None);

        let wrapped = capture.wrap_code(
            "x <- 1",
            "pfx",
            DEFAULT_PLOT_WIDTH,
            DEFAULT_PLOT_HEIGHT,
            true,
        );

        assert!(
            !wrapped.contains("save.image"),
            "Persistent wrapper should not save image per call"
        );
        assert!(
            !wrapped.contains("quit("),
            "Persistent wrapper should not quit the R process"
        );
        assert!(
            wrapped.contains(PERSISTENT_DELIMITER),
            "Persistent wrapper must emit delimiter"
        );
    }
}
