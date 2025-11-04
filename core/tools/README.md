# R Tool Starter Pack

This directory contains tool manifests for the Re-prod tool integration framework (Issue 013/014). These manifests enable Re-prod to interact with R packages in a structured way.

## Directory Structure

```
core/tools/
├── README.md           # This file
├── ape.toml           # Phylogenetics (Issue 013)
├── mafft.toml         # Sequence alignment CLI (Issue 013)
└── r-packages/        # R package manifests (Issue 014)
    ├── ggplot2.toml   # Data visualization
    ├── dplyr.toml     # Data manipulation
    └── tidyr.toml     # Data tidying
```

## Overview

The Issue 014 starter pack includes **3 R package manifests** in `r-packages/`:
- **ggplot2** - Data visualization (tidyverse)
- **dplyr** - Data manipulation (tidyverse)
- **tidyr** - Data tidying (tidyverse)

## R Package Tools

### Visualization & Analysis

#### 1. ggplot2.toml
**Grammar of Graphics visualization**

Capabilities:
- `ggplot2::scatter_plot` - Create scatter plots
- `ggplot2::bar_chart` - Create bar charts
- `ggplot2::line_plot` - Create line plots
- `ggplot2::histogram` - Create histograms
- `ggplot2::boxplot` - Create boxplots

### Data Manipulation (tidyverse)

#### 2. dplyr.toml
**Data frame manipulation**

Capabilities:
- `dplyr::filter` - Filter rows by condition
- `dplyr::select` - Select specific columns
- `dplyr::mutate` - Add or modify columns
- `dplyr::summarize` - Create summary statistics
- `dplyr::group_by` - Group data for aggregation
- `dplyr::arrange` - Sort rows
- `dplyr::join` - Join data frames

#### 3. tidyr.toml
**Data tidying and reshaping**

Capabilities:
- `tidyr::pivot_longer` - Transform wide to long format
- `tidyr::pivot_wider` - Transform long to wide format
- `tidyr::separate` - Split column into multiple columns
- `tidyr::unite` - Combine multiple columns
- `tidyr::drop_na` - Remove missing values
- `tidyr::fill` - Fill missing values

## Manifest Structure

Each `.toml` file follows this structure:

```toml
id = "tool-id"
display_name = "Human Readable Name"
kind = "r-package" | "cli"
description = "What this tool does"
version = "1.0.0"
homepage = "https://..."
tags = ["category1", "category2"]

[runtime]
r_library = "package_name"  # for R packages
cli_binary = "command"      # for CLI tools
imports = ["package"]
args = []

[validation]
requires_packages = ["pkg"]  # for R packages
requires_cli = ["cmd"]       # for CLI tools
preflight_r = "R code"
preflight_cli = "shell command"

[[capabilities]]
id = "tool::capability"
display_name = "Action Name"
kind = "r-function" | "r-snippet" | "cli-command"
entrypoint = "function_name"
description = "What this capability does"
input_spec = [
  { name = "param", type = "string" }
]
output_spec = [
  { type = "r-object", class = "data.frame" }
]
template = "code template with {{params}}"
```

## Usage

### Loading the Registry

```rust
use reprod_core::tools::ToolRegistry;

// Load R package tools only
let registry = ToolRegistry::load_from_dir("core/tools/r-packages")?;
```

### Validating Tools

```rust
use reprod_core::tools::ToolValidator;

let validator = ToolValidator::new();
let result = validator.validate_manifest(&manifest, Some(&mut r_executor)).await;

if !result.is_valid {
    eprintln!("Validation errors: {:?}", result.errors);
}
```

### Executing Capabilities

```rust
use reprod_core::tools::ToolExecutor;
use std::collections::HashMap;
use serde_json::json;

let executor = ToolExecutor::new(Arc::new(registry));

let params = HashMap::from([
    ("data".to_string(), json!("mtcars")),
    ("x".to_string(), json!("wt")),
    ("y".to_string(), json!("mpg")),
    ("title".to_string(), json!("Weight vs MPG")),
]);

let result = executor.execute(
    "ggplot2",
    "ggplot2::scatter_plot",
    params,
    &mut r_executor
).await?;

println!("Execution took {}ms", result.execution_time_ms);
```

## Testing

Comprehensive test suite in `core/tests/tool_manifests.rs`:

```bash
cargo test --package reprod-core --test tool_manifests
```

Tests cover:
- ✅ All manifests parse correctly
- ✅ Registry loads all manifests
- ✅ Unique tool and capability IDs
- ✅ Required fields present
- ✅ R packages specify requirements
- ✅ CLI tools specify binaries
- ✅ Templates exist and are valid
- ✅ Parameter specifications valid
- ✅ Output specifications valid
- ✅ Capability lookup works
- ✅ Parameter min/max constraints
- ✅ Enum parameters have options

## Adding New R Package Tools

1. Create a new `.toml` file in `core/tools/r-packages/`
2. Follow the manifest schema (see existing files in `r-packages/`)
3. Use `kind = "r-package"` for R packages
4. Run tests to validate: `cargo test --package reprod-core --test tool_manifests`
5. Update this README with the new tool

## Design Decisions

### Why TOML?
- Human-readable and editable
- Strong typing with clear structure
- Native Rust support via `serde` + `toml` crate
- Better for configuration than JSON or YAML

### Template System
Uses simple `{{parameter}}` placeholders:
- Easy to understand and implement
- Type-safe through `input_spec` validation
- No complex templating engine needed
- Works for both R and shell commands

### Validation Strategy
- **Preflight checks**: Verify tool availability before execution
- **R package validation**: Check `requireNamespace()` at runtime
- **CLI validation**: Check binary availability with `which`/`where`
- **Parameter validation**: Type checking and constraint enforcement

### Capability Organization
- Each tool can expose multiple capabilities
- Capabilities map to specific functions or commands
- Enables fine-grained AI tool selection
- Allows composable workflows

## Statistics (Issue 014)

- **R package tools**: 3 (ggplot2, dplyr, tidyr)
- **Total capabilities**: 18 (across 3 R packages)
- **Test coverage**: 12 comprehensive test cases
- **Location**: `core/tools/r-packages/`

## Future R Package Additions

Potential additions to `r-packages/`:
- **stringr**: String manipulation (tidyverse)
- **readr/readxl**: File I/O (tidyverse)
- **purrr**: Functional programming (tidyverse)
- **lubridate**: Date/time handling (tidyverse)
- **forcats**: Factor handling (tidyverse)
- **DESeq2**: RNA-seq analysis (Bioconductor)
- **edgeR**: Differential expression (Bioconductor)
- **Seurat**: Single-cell analysis

## References

- [Issue 013](../../docs/.obsidian/issues/issue-board.md): Tool integration framework (ToolRegistry, Executor, Validator)
- [Issue 014](../../docs/.obsidian/issues/issue-board.md): R package tool starter pack (this work)
- [AGENTS.md](../../AGENTS.md): Project guidelines
