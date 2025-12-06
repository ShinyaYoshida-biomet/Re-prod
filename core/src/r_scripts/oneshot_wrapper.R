# Auto-generated plot capture wrapper
cat("REPROD_WRAPPER_ENTER: oneshot\n")
.reprod_plot_dir <- "__TEMP_DIR__"
.reprod_state_path <- file.path(.reprod_plot_dir, ".reprod_state.RData")

# Ensure plot directory exists
if (!dir.exists(.reprod_plot_dir)) {
  dir.create(.reprod_plot_dir, recursive = TRUE, showWarnings = FALSE)
}

# Restore workspace if it exists
if (file.exists(.reprod_state_path)) {
  tryCatch(
    load(.reprod_state_path, envir = .GlobalEnv),
    error = function(e) message("Failed to restore workspace: ", e)
  )
}

# Reset run-scoped state to avoid stale values from previous sessions
.reprod_plot_dir <- "__TEMP_DIR__"
.reprod_plot_prefix <- "__PLOT_PREFIX__"
.reprod_state_path <- file.path(.reprod_plot_dir, ".reprod_state.RData")
.reprod_exit_code <- 0

# Open PNG device
.reprod_open_device <- function(index) {
  filename <- sprintf("%s_%d.png", .reprod_plot_prefix, index)
  png(
    file.path(.reprod_plot_dir, filename),
    width = __PLOT_WIDTH__, height = __PLOT_HEIGHT__,
    type = "cairo"
  )
}

.reprod_capture_plot <- function(index) {
  if (length(dev.list()) == 0 || names(dev.cur()) == "null device") {
    return(FALSE)
  }
  tryCatch({
    png_path <- file.path(.reprod_plot_dir, sprintf("%s_%d.png", .reprod_plot_prefix, index))
    snapshot_path <- NULL
    snapshot <- tryCatch(recordPlot(), error = function(e) NULL)
    actions <- tryCatch(snapshot$actions, error = function(e) NULL)
    if (!is.null(snapshot) && (is.null(actions) || length(actions) > 0)) {
      snapshot_path <- file.path(.reprod_plot_dir, sprintf("%s_%d.rds", .reprod_plot_prefix, index))
      saveRDS(snapshot, snapshot_path)
    }
    cat("__REPROD_PLOT__|",
        sprintf("%s_%d", .reprod_plot_prefix, index), "|",
        if (is.null(snapshot_path)) "" else snapshot_path, "|",
        png_path,
        "\n", sep = "")
    file.exists(png_path)
  }, error = function(e) {
    message("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e))
    FALSE
  })
}

.reprod_open_device(1)

# User code
tryCatch(
  {
    __CODE__
  },
  error = function(e) {
    .reprod_exit_code <<- 1
    assign(".reprod_last_error", e, envir = .GlobalEnv)
    message("REPROD_ERROR: ", conditionMessage(e))
  }
)

# If a device is open, close it to flush the PNG
if (names(dev.cur()) != "null device") {
  captured <- isTRUE(tryCatch(.reprod_capture_plot(1), error = function(e) {
    message("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e))
    FALSE
  }))
  dev.off()
  if (!isTRUE(captured)) {
    tryCatch(unlink(file.path(.reprod_plot_dir, sprintf("%s_1.png", .reprod_plot_prefix)), recursive = FALSE, force = TRUE), silent = TRUE)
    tryCatch(unlink(file.path(.reprod_plot_dir, sprintf("%s_1.rds", .reprod_plot_prefix)), recursive = FALSE, force = TRUE), silent = TRUE)
  }
}

# If no plots were produced, try to render the last ggplot object automatically
try({
  existing_plots <- list.files(
    .reprod_plot_dir,
    pattern = sprintf("^%s_\\d+\\.png$", .reprod_plot_prefix)
  )
  if (length(existing_plots) == 0 &&
      requireNamespace("ggplot2", quietly = TRUE)) {
    last_plot <- tryCatch(ggplot2::last_plot(), error = function(e) NULL)
    if (inherits(last_plot, "ggplot")) {
      next_index <- length(existing_plots) + 1
      .reprod_open_device(next_index)
      print(last_plot)
      tryCatch(.reprod_capture_plot(next_index), error = function(e) {
        message("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e))
      })
      dev.off()
    }
  }
}, silent = TRUE)

# Persist workspace for next run
tryCatch(
  save.image(file = .reprod_state_path),
  error = function(e) message("Failed to save workspace: ", e)
)

quit(status = .reprod_exit_code, runLast = FALSE)