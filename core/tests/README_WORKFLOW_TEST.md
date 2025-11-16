# Viral Phylogenomics Workflow Integration Test

## Overview

This integration test suite validates the complete 6-step viral phylogenomics workflow that serves as the primary demo scenario for Re-prod.

**Test File**: `core/tests/viral_phylogenomics_workflow_test.rs`

## What It Tests

### End-to-End Workflow Integration

The test suite validates all components working together:

1. ✅ **R Execution Engine** - Executes R code blocks with proper error handling
2. ✅ **Timeline Recording** - Captures all execution events with metadata
3. ✅ **Plot Capture** - Records visualization outputs (PNG generation)
4. ✅ **Tool Manifests** - Validates phylogenomics tool configurations
5. ✅ **Export Functionality** - Generates reproducible analysis bundles
6. ✅ **Actor Tracking** - Distinguishes User vs AI-triggered executions
7. ✅ **Error Handling** - Gracefully handles and records execution failures

### Demo Scenario Steps

The 6-step workflow simulates a real viral phylogenomics analysis:

| Step | Description | Actor | Tests |
|------|-------------|-------|-------|
| 1 | **Data Acquisition** | User | FASTA file creation, timeline recording |
| 2 | **Sequence Alignment** | User | File operations, MAFFT simulation |
| 3 | **Quality Check** | AI | ape package integration, statistics |
| 4 | **Tree Construction** | AI | Phylogenetic tree building (ape::nj) |
| 5 | **Visualization** | AI | Plot generation (ggtree, pheatmap) |
| 6 | **Report Generation** | User | Bundle export with all artifacts |

## Running the Tests

### Run All Workflow Tests

```bash
cd core
cargo test --test viral_phylogenomics_workflow_test
```

**Expected Output**:
```
running 9 tests
test test_large_workflow_performance ... ignored
test test_step1_data_acquisition ... ok
test test_step2_alignment_simulation ... ok
test test_step3_quality_check ... ok
test test_step4_tree_construction ... ok
test test_step5_visualization_with_plots ... ok
test test_step6_report_generation_full_workflow ... ok
test test_workflow_tool_manifests_present ... ok
test test_workflow_with_error_in_step ... ok

test result: ok. 8 passed; 0 failed; 1 ignored
```

### Run Individual Step Tests

```bash
# Test specific step
cargo test --test viral_phylogenomics_workflow_test test_step1_data_acquisition

# Test with output
cargo test --test viral_phylogenomics_workflow_test test_step3_quality_check -- --nocapture
```

### Run Performance Test

```bash
cargo test --test viral_phylogenomics_workflow_test -- --ignored --nocapture
```

**Performance Expectations**:
- 50 steps should complete in < 30 seconds
- Average execution time: ~90-100ms per step
- Timeline query operations: < 10ms

## Test Coverage

### Test Functions

| Test Function | Purpose | Duration |
|---------------|---------|----------|
| `test_step1_data_acquisition` | Validates FASTA file creation and timeline recording | ~0.2s |
| `test_step2_alignment_simulation` | Tests file copy operations and command simulation | ~0.1s |
| `test_step3_quality_check` | Validates ape package integration (graceful fallback) | ~0.1s |
| `test_step4_tree_construction` | Tests distance matrix and tree building code | ~0.1s |
| `test_step5_visualization_with_plots` | Validates plot generation (heatmap, tree plot) | ~0.1s |
| `test_step6_report_generation_full_workflow` | Complete workflow with bundle export | ~0.2s |
| `test_workflow_tool_manifests_present` | Validates tool manifest configuration | ~0.03s |
| `test_workflow_with_error_in_step` | Tests error handling and recovery | ~0.1s |
| `test_large_workflow_performance` | Stress test with 50 steps | ~4.7s |

**Total Coverage**: 9 tests covering all workflow aspects

### Validated Components

#### Backend (Rust)
- ✅ `RExecutor` - R code execution with timeline integration
- ✅ `JsonTimeline` - NDJSON-based timeline persistence
- ✅ `TimelineQuery` - Filtering, sorting, pagination
- ✅ `ToolRegistry` - Tool manifest loading and validation
- ✅ `ReproductionBundle` - Export bundle creation
- ✅ `BundleWriter` - Tarball generation

#### Tool Manifests
- ✅ `ape` - Phylogenetic tree construction (2 capabilities)
- ✅ `ggtree` - Tree visualization (4 capabilities)
- ✅ `seqinr` - Sequence analysis (4 capabilities)
- ✅ `phangorn` - Advanced phylogenetics (5 capabilities)
- ✅ `biostrings` - Sequence manipulation (4 capabilities)

## Key Features Tested

### 1. Timeline Event Recording

Every execution creates a timeline event with:
- Unique event ID
- Execution context (document, cell index, timestamp)
- Actor (User or AI)
- Code blocks with metadata
- Execution result (success/failure, output, errors)
- Plot artifacts (if generated)
- Environment snapshot

### 2. Actor Tracking

Tests verify correct attribution:
- **User actions**: Steps 1, 2, 6 (data acquisition, alignment, summary)
- **AI actions**: Steps 3, 4, 5 (quality check, tree construction, visualization)

Example assertion:
```rust
assert_eq!(event.context.actor, ExecutionActor::Ai, "Step 3 should be AI-triggered");
```

### 3. Error Handling

`test_workflow_with_error_in_step` validates:
- Errors are captured in timeline (not thrown)
- Execution continues after error
- Timeline query can filter by `has_errors: true`
- Error messages are preserved

### 4. Export Bundle Structure

Generated bundle includes:
- `metadata.json` - Session statistics and format version
- `timeline.json` - Complete execution history
- `code/*.R` - Extracted R scripts
- `plots/*.png` - Captured visualizations
- `README.md` - Bundle documentation
- `validate.sh` - Validation script
- `replay.R` - Replay script

## Integration with CI/CD

### GitHub Actions Integration

Add to `.github/workflows/ci.yml`:

```yaml
- name: Run Workflow Integration Tests
  run: |
    cd core
    cargo test --test viral_phylogenomics_workflow_test -- --nocapture
```

## Troubleshooting

### Test Failures

#### "Rscript not found"
```
Error: Failed to execute R code: No such file or directory (os error 2)
```

**Solution**: Ensure Rscript is in PATH
```bash
which Rscript
export PATH="/usr/local/bin:$PATH"
```

#### "ape package not available"
This is expected! Tests gracefully handle missing R packages:
```
Note: ape package not available for full quality check
Quality check completed (basic mode)
```

Tests use conditional logic to work without optional packages.

#### Timeline Query Errors
```
Error: Failed to query timeline: No such file or directory
```

**Solution**: Timeline file is created in temp directory automatically. This error indicates `TempDir` cleanup issue or permission problem.

### Performance Issues

If `test_large_workflow_performance` exceeds 30 seconds:

1. **Check R Installation**: Slow R startup can impact performance
   ```bash
   time Rscript -e "1+1"
   ```
   Should complete in < 100ms.

2. **Disk I/O**: Timeline writes are I/O bound
   ```bash
   # Check disk performance
   time dd if=/dev/zero of=/tmp/testfile bs=1M count=100
   ```

3. **Adjust Timeout**: Edit test if running on slower hardware
   ```rust
   assert!(duration.as_secs() < 60, "Adjust for slower hardware");
   ```

## Test Data

### Mock FASTA Sequences

Tests use minimal mock data for speed:

```
>seq1
ATCGATCGATCG
>seq2
ATCGATCGATCG
>seq3
ATCGATCGATCC
```

For full demo with real data, see `docs/.obsidian/issues/017-demo-assets.md`.

## Future Enhancements

### Planned Test Additions

1. **Shell Command Integration**
   - Test actual MAFFT execution (requires MAFFT installed)
   - Validate stdout/stderr capture
   - Test command timeout handling

2. **Real R Package Tests**
   - Conditional tests when ape/ggtree available
   - Validate actual phylogenetic tree objects
   - Test plot capture with real ggtree output

3. **Bundle Replay Validation**
   - Extract and re-run generated bundles
   - Validate reproducibility

4. **WebSocket Integration**
   - Test timeline events via WebSocket messages
   - Validate real-time event streaming

## Related Documentation

- **Demo Scenario**: `docs/.obsidian/issues/000-demo-analysis-scenario.md`
- **Feature Matrix**: `docs/.obsidian/issues/000-demo-feature-matrix.md`
- **Tool Manifests**: `core/tools/*.toml`
- **Timeline API**: `docs/.obsidian/issues/019-timeline-api-contract.md`

## Test Maintenance

When updating the workflow test:

1. **Keep Tests Fast**: Each step should complete in < 200ms
2. **Use Mock Data**: Avoid real downloads or heavy computations
3. **Test Graceful Degradation**: Handle missing R packages
4. **Update Documentation**: Keep this README in sync with code
5. **Run Locally**: Verify tests pass before pushing

---

**Last Updated**: 2025-11-11
**Test Suite Version**: 1.0.0
**Total Tests**: 9 (8 active, 1 performance test)
**Coverage**: End-to-end workflow validation
