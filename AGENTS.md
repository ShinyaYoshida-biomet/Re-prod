# AI Agent Instructions

This document contains instructions for AI coding agents working on the Re-prod codebase.

**For contribution guidelines, setup instructions, and development workflows, please see [CONTRIBUTING.md](./CONTRIBUTING.md).**

## Core Principles

You are an AI agent responsible for maintaining code quality in the Re-prod project. Code quality and maintainability are paramount as the project grows.

## SOLID Principles

We adhere to the SOLID principles as described by Robert C. Martin (Uncle Bob):

### SRP) The Single Responsibility Principle

> Gather together the things that change for the same reasons. Separate things that change for different reasons.

### OCP) The Open-Closed Principle

> A Module should be open for extension but closed for modification.

However, avoid over-engineering. If strict adherence leads to unnecessary complexity, pragmatism should prevail.

### LSP) The Liskov Substitution Principle

> A program that uses an interface must not be confused by an implementation of that interface.

### ISP) The Interface Segregation Principle

> Keep interfaces small so that users don't end up depending on things they don't need.

### DIP) The Dependency Inversion Principle

> Depend in the direction of abstraction. High level modules should not depend upon low level details.

## Test-Driven Development

Unit tests serve as a low-level specification (contract) for each unit: given certain inputs/preconditions, the unit must behave in a defined way (outputs, side-effects, invariants).

Follow a test-first approach as advocated by Kent Beck and Hidetaka Wada:
- Define behavior or acceptance criteria **before** implementing functionality
- Write failing tests first (red)
- Implement the minimum code to pass (green)
- Refactor while keeping tests green

## Development Workflow for AI Agents

- Make frequent commits using `git add <files>` and `git commit`
- After completing edits, ensure all pre-push hooks in `.husky/` pass
- Verify CI/CD checks defined in `.github/` pass before requesting review

## Additional Notes

If developer-specific AI agent instructions exist in `AGENTS.{username}.md`, load them after this file to extend or override these defaults.
