# Code Action Factory Pattern

This module implements the **Factory Pattern** for handling different types of AI-suggested code actions.

## Problem Solved

Previously, code action handling relied on growing if/switch statement chains scattered across multiple files. This made it difficult to:

- Add new action types
- Test actions in isolation
- Maintain consistent validation logic
- Understand the full range of supported actions

## Architecture

### Factory Pattern Benefits

1. **Extensibility**: Adding a new action only requires creating a new class and registering it in the factory
2. **Maintainability**: Each action's logic is encapsulated in its own class
3. **Testability**: Individual actions can be tested in isolation
4. **Type Safety**: TypeScript ensures all actions implement the `ICodeAction` interface

### Components

```
actions/
├── ICodeAction.ts           # Interface defining action contract
├── BaseCodeAction.ts        # Abstract base with shared validation
├── CodeActionFactory.ts     # Factory for creating action instances
├── ReplaceAllAction.ts
├── ReplaceRangeAction.ts
├── DeleteRangeAction.ts
├── CreateFileAction.ts
├── InsertAction.ts
├── index.ts
└── __tests__/
```

## Usage

### Basic Usage

```typescript
import { CodeActionFactory } from "@/core/ai/actions";
import type { CodeBlock } from "@shared/types";

// Get a label for UI display
const label = CodeActionFactory.getLabel(codeBlock);

// Validate before applying
const validation = CodeActionFactory.validate(codeBlock);
if (!validation.valid) {
  console.error(validation.error);
  return;
}

// Get the action and apply it
const action = CodeActionFactory.getAction(codeBlock);
await action.apply(codeBlock, context);
```

### With Context

```typescript
import { CodeActionFactory, type CodeActionContext } from "@/core/ai/actions";

const context: CodeActionContext = {
  applyToEditor: async (codeBlock) => {
    // Apply to current editor
  },
  applyToFile: async (codeBlock) => {
    // Apply to remote file
  },
  editorFilepath: "src/App.tsx",
  postMessage: (msg) => console.log(msg),
};

const action = CodeActionFactory.getAction(codeBlock);
await action.apply(codeBlock, context);
```

### Check Support

```typescript
// Check if an action type is supported
if (CodeActionFactory.isSupported("replace-all")) {
  // ...
}

// Get all supported actions
const actions = CodeActionFactory.getSupportedActions();
// ["replace-all", "replace-range", "delete-range", "create-file", "insert"]
```

## Supported Actions

### 1. Replace All (`replace-all`)

Replaces the entire contents of a file.

**Required fields:**

- `code`: New content to replace with

**Example:**

```typescript
{
  action: "replace-all",
  code: "console.log('new content');",
  language: "typescript",
  filepath: "src/App.tsx"
}
```

### 2. Replace Range (`replace-range`)

Replaces a specific range of code.

**Required fields:**

- `code`: New content
- `targetRange`: { startLine, startColumn, endLine, endColumn }

**Example:**

```typescript
{
  action: "replace-range",
  code: "const x = 1;",
  language: "typescript",
  targetRange: { startLine: 10, startColumn: 0, endLine: 10, endColumn: 15 }
}
```

### 3. Delete Range (`delete-range`)

Deletes a specific range of lines.

**Required fields:**

- `targetRange`: { startLine, endLine }

**Example:**

```typescript
{
  action: "delete-range",
  code: "",
  language: "typescript",
  targetRange: { startLine: 5, startColumn: 0, endLine: 10, endColumn: 0 }
}
```

### 4. Create File (`create-file`)

Creates a new file with the given content.

**Required fields:**

- `filepath`: Path for the new file
- `code`: File content

**Example:**

```typescript
{
  action: "create-file",
  code: "export const API_URL = 'https://api.example.com';",
  language: "typescript",
  filepath: "src/config.ts"
}
```

### 5. Insert (`insert`)

Inserts code at a specific position.

**Required fields:**

- `code`: Content to insert

**Example:**

```typescript
{
  action: "insert",
  code: "import { useState } from 'react';",
  language: "typescript"
}
```

## Adding a New Action

1. **Create the Action Class**

```typescript
// MyNewAction.ts
import type { CodeBlock } from "@shared/types";
import type {
  ICodeAction,
  CodeActionContext,
  CodeActionValidation,
} from "./ICodeAction";

export class MyNewAction implements ICodeAction {
  getLabel(codeBlock: CodeBlock): string {
    return `My new action on ${codeBlock.filepath || "active editor"}`;
  }

  validate(codeBlock: CodeBlock): CodeActionValidation {
    // Validation logic
    if (!codeBlock.someRequiredField) {
      return { valid: false, error: "Missing required field" };
    }
    return { valid: true };
  }

  async apply(codeBlock: CodeBlock, context: CodeActionContext): Promise<void> {
    const validation = this.validate(codeBlock);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Implementation logic
    await context.applyToEditor?.(codeBlock);
    context.postMessage?.(`Applied my new action`);
  }
}
```

2. **Register in Factory**

```typescript
// CodeActionFactory.ts
import { MyNewAction } from "./MyNewAction";

export class CodeActionFactory {
  private static readonly actions = new Map<string, ICodeAction>([
    // ... existing actions
    ["my-new-action", new MyNewAction()],
  ]);
}
```

3. **Add Tests**

```typescript
// __tests__/CodeActionFactory.test.ts
it("should return MyNewAction for my-new-action", () => {
  const codeBlock: CodeBlock = {
    action: "my-new-action",
    code: "test",
    language: "typescript",
  };

  const action = CodeActionFactory.getAction(codeBlock);
  expect(action).toBeInstanceOf(MyNewAction);
});
```

## Migration from Old Code

### Before (if/else chain)

```typescript
function getCodeActionLabel(codeBlock: CodeBlock): string {
  if (codeBlock.action === "replace-all") {
    return `Replace entire ${targetFile}`;
  }
  if (codeBlock.action === "replace-range") {
    return `Replace ${targetFile} ${startLine}:${startColumn}-${endLine}:${endColumn}`;
  }
  // ... more conditions
  return "Apply suggested change";
}
```

### After (Factory Pattern)

```typescript
// Just one line!
const label = CodeActionFactory.getLabel(codeBlock);
```

## Related Documentation

- [Factory Pattern - Refactoring Guru](https://refactoring.guru/design-patterns/factory-method)
- [SOLID Principles - Open/Closed](https://en.wikipedia.org/wiki/Open%E2%80%93closed_principle)
- [Issue #195: Implement Factory Pattern for LLM Providers and Tool Execution](../../../../../../../docs/.obsidian/issues/195-refactor-factory-pattern-llm-tools.md)
