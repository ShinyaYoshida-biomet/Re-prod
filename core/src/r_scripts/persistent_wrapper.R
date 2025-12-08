# Auto-generated plot capture wrapper (persistent session)
cat("REPROD_WRAPPER_ENTER: persistent\n")
.reprod_plot_dir <- "__TEMP_DIR__"
.reprod_plot_prefix <- "__PLOT_PREFIX__"

if (!dir.exists(.reprod_plot_dir)) {
  dir.create(.reprod_plot_dir, recursive = TRUE, showWarnings = FALSE)
}

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
    snapshot <- tryCatch(recordPlot(), error = function(e) NULL)
    actions <- tryCatch(snapshot$actions, error = function(e) NULL)

    # If nothing was actually drawn, skip emitting a plot event
    if (is.null(snapshot) || (!is.null(actions) && length(actions) == 0)) {
      return(FALSE);
    }

    snapshot_path <- file.path(.reprod_plot_dir, sprintf("%s_%d.rds", .reprod_plot_prefix, index))
    saveRDS(snapshot, snapshot_path)

    cat("__REPROD_PLOT__|",
        sprintf("%s_%d", .reprod_plot_prefix, index), "|",
        snapshot_path, "|",
        png_path,
        "\n", sep = "")
    file.exists(png_path)
  }, error = function(e) {
    cat("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e), "\n", file=stderr())
    FALSE
  })
}

reprod_png_available <- FALSE
tryCatch({
  .reprod_open_device(1)
  reprod_png_available <<- TRUE
  cat("REPROD_PNG_DEVICE: ", file.path(.reprod_plot_dir, sprintf("%s_1.png", .reprod_plot_prefix)), "\n", file=stderr())
  cat("REPROD_PNG_DEVICE: ", file.path(.reprod_plot_dir, sprintf("%s_1.png", .reprod_plot_prefix)), "\n") # stdout mirror
}, error = function(e) {
  cat("REPROD_PNG_ERROR: ", conditionMessage(e), "\n", file=stderr())
  cat("REPROD_PNG_ERROR: ", conditionMessage(e), "\n") # stdout mirror
})

tryCatch(
  {
    __CODE__
  },
  error = function(e) {
    assign(".reprod_last_error", e, envir = .GlobalEnv)
    cat("REPROD_ERROR: ", conditionMessage(e), "\n", file=stderr())
    cat("REPROD_TRACEBACK: ", paste(utils::capture.output(traceback()), collapse = " | "), "\n", file=stderr())
    cat("REPROD_DEVICES: ", paste(names(dev.list()), collapse=","), "\n", file=stderr())
    cat("REPROD_PLOT_DIR: ", .reprod_plot_dir, "\n", file=stderr())
    cat("REPROD_GETWD: ", getwd(), "\n", file=stderr())
    cat("REPROD_ERROR: ", conditionMessage(e), "\n") # stdout mirror
    cat("REPROD_TRACEBACK: ", paste(utils::capture.output(traceback()), collapse = " | "), "\n") # stdout mirror
    cat("REPROD_DEVICES: ", paste(names(dev.list()), collapse=","), "\n") # stdout mirror
    cat("REPROD_PLOT_DIR: ", .reprod_plot_dir, "\n") # stdout mirror
    cat("REPROD_GETWD: ", getwd(), "\n") # stdout mirror
  }
)

if (reprod_png_available && names(dev.cur()) != "null device") {
  captured <- isTRUE(tryCatch(.reprod_capture_plot(1), error = function(e) {
    cat("REPROD_PLOT_CAPTURE_ERROR: ", conditionMessage(e), "\n", file=stderr())
    FALSE
  }))
  tryCatch(dev.off(), error = function(e) message("REPROD_DEVICE_CLOSE_ERROR: ", conditionMessage(e)))
  if (!isTRUE(captured)) {
    tryCatch(unlink(file.path(.reprod_plot_dir, sprintf("%s_1.png", .reprod_plot_prefix)), recursive = FALSE, force = TRUE), silent = TRUE)
    tryCatch(unlink(file.path(.reprod_plot_dir, sprintf("%s_1.rds", .reprod_plot_prefix)), recursive = FALSE, force = TRUE), silent = TRUE)
  }
}

cat("REPROD_STATE: PNG_AVAILABLE=", reprod_png_available, " PLOT_DIR=", .reprod_plot_dir,
    " GETWD=", getwd(), "DEVICES=", paste(names(dev.list()), collapse=","), "\n",
    file=stderr())
cat("REPROD_STATE: PNG_AVAILABLE=", reprod_png_available, " PLOT_DIR=", .reprod_plot_dir,
    " GETWD=", getwd(), "DEVICES=", paste(names(dev.list()), collapse=","), "\n")

cat("__DELIMITER__\n")
