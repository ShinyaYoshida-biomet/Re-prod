# Environment Pane Specification

## Overview

Add an Environment pane to the Bottom Pane that displays currently defined R variables, similar to RStudio's Environment tab.

**Related Issue**: #426

## User Requirements

- **Problem**: Users lack visibility into active variables and must manually execute `ls()` or print statements
- **Goal**: Provide real-time visibility into R workspace variables
- **Reference**: RStudio Environment pane

## Data Structure

### Variable Entry

Each variable in the R environment will be represented with:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | Variable name | `"my_data"` |
| `type` | string | R class/type | `"data.frame"`, `"numeric"`, `"list"` |
| `size` | string | Dimension or length info | `"10 obs. of 3 variables"`, `"length 5"` |
| `value` | string | Value preview (truncated) | `"1, 2, 3, 4, 5"` or `"<data.frame>"` |

### Example Data

```json
{
  "variables": [
    {
      "name": "x",
      "type": "numeric",
      "size": "length 5",
      "value": "1, 2, 3, 4, 5"
    },
    {
      "name": "df",
      "type": "data.frame",
      "size": "10 obs. of 3 variables",
      "value": "<data.frame>"
    },
    {
      "name": "result",
      "type": "character",
      "size": "length 1",
      "value": "\"hello world\""
    }
  ]
}
```

## Backend Implementation

### R Data Retrieval

Execute the following R code to gather environment data:

```r
# Get all variable names in global environment
var_names <- ls(envir = .GlobalEnv)

# For each variable, collect metadata
env_data <- lapply(var_names, function(name) {
  obj <- get(name, envir = .GlobalEnv)

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
    value <- sprintf("%s, ... (%d more)", preview, length(obj) - 5)
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

# Convert to JSON-friendly format
jsonlite::toJSON(list(variables = env_data), auto_unbox = TRUE)
```

### WebSocket Protocol

#### Request: `environment_query`

```typescript
{
  type: "environment_query"
}
```

#### Response: `environment_data`

```typescript
{
  type: "environment_data",
  variables: Array<{
    name: string;
    type: string;
    size: string;
    value: string;
  }>
}
```

## Frontend Implementation

### UI Components

#### EnvironmentPanel Component

Location: `client/src/components/environment/EnvironmentPanel.tsx`

**Features**:
- Table display with columns: Name, Type, Size, Value
- Empty state message: "No variables in environment"
- Loading state during query
- Error handling

**Table Columns**:
1. **Name** - Variable name (left-aligned, monospace font)
2. **Type** - R class (center-aligned)
3. **Size** - Dimension info (right-aligned)
4. **Value** - Preview (left-aligned, truncated, monospace)

#### Bottom Pane Integration

Add "Environment" tab to Bottom Pane tabs array:

```typescript
const tabs: PanelTabItem<BottomPaneTab>[] = [
  { id: "console", label: "Console" },
  { id: "history", label: "History" },
  { id: "environment", label: "Environment" },  // NEW
  { id: "terminal", label: "Terminal" },
  { id: "plots", label: "Plots" },
  { id: "help", label: "Help" }
];
```

### Auto-Refresh Behavior

**Trigger**: After code execution completes

**Implementation**:
- Listen to `execution_result` WebSocket message
- When `success: true`, send `environment_query` request
- Update Environment panel state with response

**Edge Cases**:
- Skip refresh if execution failed
- Debounce multiple rapid executions (e.g., running whole document)
- Handle empty environment gracefully

### Sorting & Filtering

**Phase 1 (MVP)**:
- No sorting or filtering
- Display variables in alphabetical order (sorted by name)

**Phase 2 (Future Enhancement)**:
- Click column headers to sort
- Search/filter by variable name
- Filter by type

## UI/UX Mockup

### Table Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Environment                                                 │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Name         │ Type         │ Size         │ Value          │
├──────────────┼──────────────┼──────────────┼────────────────┤
│ x            │ numeric      │ length 5     │ 1, 2, 3, 4, 5  │
│ df           │ data.frame   │ 10 obs. of 3 │ <data.frame>   │
│ my_list      │ list         │ list of 3    │ <list>         │
│ result       │ character    │ length 1     │ "hello"        │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

### Empty State

```
┌─────────────────────────────────────────────────────────────┐
│ Environment                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                  No variables in environment                │
│                                                             │
│     Run some R code to see variables appear here           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Testing Requirements

### Backend Tests

File: `core/src/executor/environment_tests.rs`

Test cases:
- Empty environment returns empty array
- Single variable returns correct metadata
- Data frame metadata includes dimensions
- Large vectors show truncated value
- Functions display as `<function>`

### Frontend Tests

File: `client/src/components/environment/__tests__/EnvironmentPanel.test.tsx`

Test cases:
- Renders empty state when no variables
- Displays table with variable data
- Shows loading state during query
- Handles query errors gracefully
- Auto-refreshes after execution

## Implementation Phases

### Phase 1: MVP (Core Functionality)
1. Backend: Add `environment_query` handler
2. Backend: Implement R data gathering script
3. Frontend: Create `EnvironmentPanel` component
4. Frontend: Add tab to Bottom Pane
5. Frontend: Implement auto-refresh on execution
6. Tests: Basic unit tests

### Phase 2: Enhancements
1. Column sorting
2. Variable name search/filter
3. Type filtering
4. Expand/collapse for complex objects
5. Click to inspect variable details

## Edge Cases & Error Handling

1. **Large environments** (1000+ variables)
   - Limit to first 1000 variables
   - Show warning message

2. **Execution errors**
   - Don't refresh environment on failed execution
   - Show last known state

3. **Network errors**
   - Show error message in panel
   - Retry button

4. **R session restart**
   - Clear environment display
   - Show "Environment cleared" message

5. **Very long variable names**
   - Truncate with ellipsis
   - Show full name on hover (tooltip)

## Performance Considerations

- Environment query should complete < 500ms for typical workspaces
- Debounce rapid executions to avoid flooding
- Consider pagination for very large environments (future)
- Cache results until next execution

## Acceptance Criteria

✅ Environment tab appears in Bottom Pane
✅ Empty environment shows appropriate message
✅ Variables display with Name, Type, Size, Value columns
✅ Auto-refreshes after successful code execution
✅ Handles errors gracefully
✅ Data frames show dimension info
✅ Large values are truncated appropriately
✅ Unit tests pass for both backend and frontend

## References

- RStudio Environment Pane: https://support.rstudio.com/hc/en-us/articles/200484568
- R `ls()` documentation
- Issue #426: https://github.com/ShinyaYoshida-biomet/Re-prod/issues/426
