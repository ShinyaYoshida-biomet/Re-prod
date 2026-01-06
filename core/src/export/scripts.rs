use super::bundle::ReproductionBundle;

/// Generate README.md for the bundle.
pub fn generate_readme(bundle: &ReproductionBundle) -> String {
    format!(
        r#"# Re-prod Reproduction Bundle

This bundle contains a complete reproduction of an R analysis session captured by Re-prod.

## Bundle Information

- **Bundle ID**: {}
- **Created**: {}
- **Re-prod Version**: {}
- **Total Events**: {}
- **Duration**: {:.2} seconds

## Session Statistics

- **Total Executions**: {}
- **User Actions**: {}
- **AI Actions**: {}
- **Total Plots**: {}
- **Errors**: {}
- **Unique Documents**: {}

## Environment

- **R Path**: {}
- **Platform**: {}
- **Working Directory**: {}

## Contents

- `metadata.json` - Bundle metadata and statistics
- `timeline.json` - Complete timeline of execution events
- `validate.sh` - Validation script to verify bundle integrity
- `replay.R` - R script to replay the session
- `code/` - R code files from the session
- `plots/` - Generated plot images

## Usage

### Validate the Bundle

```bash
bash validate.sh
```

### Replay the Session

```bash
Rscript replay.R
```

### Inspect the Timeline

```bash
cat timeline.json | jq '.events[] | {{event_id, actor: .context.actor, source: .context.source}}'
```

### View Statistics

```bash
cat metadata.json | jq '.statistics'
```

## Format Version

This bundle uses format version **{}**.

## About Re-prod

Re-prod is a reproducible R analysis environment that captures execution history, AI interactions, and artifacts for full session replay.

For more information, visit: https://github.com/yourusername/re-prod
"#,
        bundle.metadata.bundle_id,
        bundle.metadata.created_at,
        bundle.metadata.re_prod_version,
        bundle.metadata.session.total_events,
        bundle.metadata.session.duration_ms as f64 / 1000.0,
        bundle.metadata.statistics.total_executions,
        bundle.metadata.statistics.user_actions,
        bundle.metadata.statistics.ai_actions,
        bundle.metadata.statistics.total_plots,
        bundle.metadata.statistics.total_errors,
        bundle.metadata.statistics.unique_documents,
        bundle.metadata.environment.r_path,
        bundle.metadata.environment.platform,
        bundle.metadata.environment.working_dir,
        bundle.metadata.format_version,
    )
}

/// Generate validation script (validate.sh).
pub fn generate_validation_script() -> String {
    r#"#!/bin/bash
# Reproduction Bundle Validation Script
# Verifies integrity of bundle contents

set -e

echo "Validating reproduction bundle..."
echo ""

# Check required files
echo "[1/5] Checking required files..."
REQUIRED_FILES="metadata.json timeline.json README.md"
for file in $REQUIRED_FILES; do
  if [ ! -f "$file" ]; then
    echo "ERROR: Missing required file: $file"
    exit 1
  fi
  echo "  ✓ $file"
done

# Validate JSON syntax
echo ""
echo "[2/5] Validating JSON files..."

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo "WARNING: jq not found - skipping JSON validation"
  echo "  Install jq to enable JSON validation"
else
  if ! jq empty metadata.json 2>/dev/null; then
    echo "ERROR: metadata.json is not valid JSON"
    exit 1
  fi
  echo "  ✓ metadata.json"

  if ! jq empty timeline.json 2>/dev/null; then
    echo "ERROR: timeline.json is not valid JSON"
    exit 1
  fi
  echo "  ✓ timeline.json"
fi

# Check referenced files exist
echo ""
echo "[3/5] Checking code files..."
if command -v jq &> /dev/null; then
  CODE_FILES=$(jq -r '.files.code_files[]' metadata.json 2>/dev/null || echo "")
  if [ -z "$CODE_FILES" ]; then
    echo "  No code files referenced"
  else
    for file in $CODE_FILES; do
      if [ ! -f "$file" ]; then
        echo "ERROR: Referenced code file missing: $file"
        exit 1
      fi
      echo "  ✓ $file"
    done
  fi
else
  echo "  Skipping (jq not available)"
fi

echo ""
echo "[4/5] Checking plot files..."
if command -v jq &> /dev/null; then
  PLOT_FILES=$(jq -r '.files.plot_files[]' metadata.json 2>/dev/null || echo "")
  if [ -z "$PLOT_FILES" ]; then
    echo "  No plot files referenced"
  else
    for file in $PLOT_FILES; do
      if [ ! -f "$file" ]; then
        echo "ERROR: Referenced plot file missing: $file"
        exit 1
      fi
      echo "  ✓ $file"
    done
  fi
else
  echo "  Skipping (jq not available)"
fi

# Validate format version
echo ""
echo "[5/5] Checking format version..."
if command -v jq &> /dev/null; then
  FORMAT_VERSION=$(jq -r '.format_version' metadata.json)
  if [ "$FORMAT_VERSION" != "1.0" ]; then
    echo "WARNING: Unknown format version: $FORMAT_VERSION"
    echo "         This validator supports version 1.0"
  else
    echo "  ✓ Format version: $FORMAT_VERSION"
  fi
fi

echo ""
echo "✓ Validation complete!"
echo ""

# Display statistics
if command -v jq &> /dev/null; then
  echo "Bundle Statistics:"
  echo "=================="
  jq -r '"  Total events: \(.session.total_events)"' metadata.json
  jq -r '"  User actions: \(.statistics.user_actions)"' metadata.json
  jq -r '"  AI actions: \(.statistics.ai_actions)"' metadata.json
  jq -r '"  Total plots: \(.statistics.total_plots)"' metadata.json
  jq -r '"  Errors: \(.statistics.total_errors)"' metadata.json
  jq -r '"  Duration: \(.session.duration_ms / 1000) seconds"' metadata.json
fi
"#
    .to_string()
}

/// Generate replay script (replay.R).
pub fn generate_replay_script() -> String {
    r#"#!/usr/bin/env Rscript
# Reproduction Bundle Replay Script
# Re-executes all events in the timeline

library(jsonlite)

cat("Re-prod Reproduction Bundle Replay\n")
cat("===================================\n\n")

# Load metadata
cat("Loading metadata...\n")
metadata <- fromJSON("metadata.json")
cat(sprintf("  Bundle ID: %s\n", metadata$bundle_id))
cat(sprintf("  Total events: %d\n", metadata$session$total_events))
cat("\n")

# Load timeline
cat("Loading timeline...\n")
timeline <- fromJSON("timeline.json")
events <- timeline$events
cat(sprintf("  Loaded %d events\n", nrow(events)))
cat("\n")

# Setup replay environment
cat("Setting up replay environment...\n")
replay_env <- new.env()
cat("  Environment ready\n")
cat("\n")

# Track results
results <- list(
  total = 0,
  success = 0,
  failed = 0,
  errors = list()
)

# Execute each event
cat("Replaying events...\n")
cat(sprintf("%-12s %-15s %-45s %s\n", "Event", "Source", "Code", "Status"))
cat(strrep("-", 90), "\n")

for (i in seq_len(nrow(events))) {
  event <- events[i, ]
  results$total <- results$total + 1

  # Get code from first block
  blocks <- event$blocks[[1]]
  if (is.null(blocks) || nrow(blocks) == 0) {
    cat(sprintf("%-12s %-15s %-45s %s\n",
                substr(event$event_id, 1, 12),
                event$context$source,
                "(no code)",
                "⊘ SKIP"))
    next
  }

  code <- blocks$code[1]
  code_preview <- substr(gsub("\n", " ", code), 1, 40)
  if (nchar(code) > 40) code_preview <- paste0(code_preview, "...")

  # Execute code
  result <- tryCatch({
    eval(parse(text = code), envir = replay_env)
    results$success <- results$success + 1
    "✓ OK"
  }, error = function(e) {
    results$failed <- results$failed + 1
    results$errors[[length(results$errors) + 1]] <- list(
      event_id = event$event_id,
      error = e$message
    )
    paste0("✗ FAIL")
  })

  cat(sprintf("%-12s %-15s %-45s %s\n",
              substr(event$event_id, 1, 12),
              event$context$source,
              code_preview,
              result))
}

cat("\n")
cat("Replay Summary\n")
cat("==============\n")
cat(sprintf("Total events: %d\n", results$total))
cat(sprintf("Successful: %d (%.1f%%)\n",
            results$success,
            100 * results$success / results$total))
cat(sprintf("Failed: %d (%.1f%%)\n",
            results$failed,
            100 * results$failed / results$total))

if (results$failed > 0) {
  cat("\nErrors:\n")
  for (j in seq_along(results$errors)) {
    error <- results$errors[[j]]
    cat(sprintf("  %d. %s: %s\n", j, error$event_id, error$error))
  }
}

cat("\nReplay complete!\n")
"#
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{
        CodeBlockKind, CodeBlockMetadata, EnvironmentSnapshot, ExecutionActor, ExecutionContext,
        ExecutionResult, ExecutionSource, RunStatus,
    };

    fn create_test_bundle() -> ReproductionBundle {
        let event = crate::protocol::ExecutionEvent {
            event_id: "evt-test".to_string(),
            context: ExecutionContext {
                source: ExecutionSource::Cell,
                document_path: Some("test.R".to_string()),
                cell_index: Some(1),
                triggered_at_ms: 1699200000000,
                actor: ExecutionActor::User,
            },
            blocks: vec![CodeBlockMetadata {
                id: "block-1".to_string(),
                index: 0,
                kind: CodeBlockKind::Section,
                label: Some("Test".to_string()),
                start_line: 1,
                end_line: 2,
                code: "x <- 1:10".to_string(),
            }],
            result: ExecutionResult {
                success: true,
                output: "[1] 1 2 3".to_string(),
                error: None,
                plots: vec![],
                execution_time_ms: 42,
            },
            environment: EnvironmentSnapshot {
                r_version: None,
                r_path: "Rscript".to_string(),
                working_dir: "/tmp/test".to_string(),
                temp_dir: "/tmp/reprod".to_string(),
            },
            created_at_ms: 1699200001000,
            status: RunStatus::Succeeded,
            started_at_ms: 1699200000000,
            finished_at_ms: Some(1699200001000),
            duration_ms: Some(1000),
        };

        ReproductionBundle::from_events(vec![event])
    }

    #[test]
    fn test_generate_readme() {
        let bundle = create_test_bundle();
        let readme = generate_readme(&bundle);

        assert!(readme.contains("Re-prod Reproduction Bundle"));
        assert!(readme.contains(&bundle.metadata.bundle_id));
        assert!(readme.contains("validate.sh"));
        assert!(readme.contains("replay.R"));
    }

    #[test]
    fn test_generate_validation_script() {
        let script = generate_validation_script();

        assert!(script.contains("#!/bin/bash"));
        assert!(script.contains("metadata.json"));
        assert!(script.contains("timeline.json"));
        assert!(script.contains("jq"));
    }

    #[test]
    fn test_generate_replay_script() {
        let script = generate_replay_script();

        assert!(script.contains("#!/usr/bin/env Rscript"));
        assert!(script.contains("library(jsonlite)"));
        assert!(script.contains("timeline.json"));
        assert!(script.contains("replay_env"));
    }
}
