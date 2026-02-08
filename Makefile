SHELL := /bin/bash

.PHONY: help install dev dev-client dev-desktop build build-client test test-core test-client lint biome-check format format-check rust-fmt rust-fmt-check clippy check check-build pre-push

help:
	@echo "Re-prod Make targets"
	@echo ""
	@echo "Setup"
	@echo "  make install           Install workspace dependencies"
	@echo ""
	@echo "Development"
	@echo "  make dev               Run Axum backend + Vite client"
	@echo "  make dev-client        Run frontend only"
	@echo "  make dev-desktop       Launch Tauri desktop app"
	@echo ""
	@echo "Build"
	@echo "  make build             Build all packages"
	@echo "  make build-client      Build client only"
	@echo "  make check-build       Run build checks (client + Rust)"
	@echo ""
	@echo "Testing"
	@echo "  make test              Run Rust + client tests"
	@echo "  make test-core         Run all Rust tests"
	@echo "  make test-client       Run client tests"
	@echo ""
	@echo "Quality"
	@echo "  make lint              Run TypeScript lint"
	@echo "  make biome-check       Run Biome checks"
	@echo "  make format            Apply Biome formatting"
	@echo "  make format-check      Check Biome formatting"
	@echo "  make rust-fmt          Apply Rust formatting"
	@echo "  make rust-fmt-check    Check Rust formatting"
	@echo "  make clippy            Run Rust clippy"
	@echo "  make check             Run standard local checks"
	@echo "  make pre-push          Run .husky pre-push checks"

install:
	pnpm install

dev:
	pnpm dev

dev-client:
	pnpm --filter client dev

dev-desktop:
	cd desktop && cargo tauri dev

build:
	pnpm build

build-client:
	pnpm --filter client build

check-build:
	pnpm --filter client run build
	cargo build

test: test-core test-client

test-core:
	cargo test

test-client:
	pnpm --filter client test

lint:
	pnpm -r lint

biome-check:
	pnpm biome:check

format:
	pnpm format

format-check:
	pnpm format:check

rust-fmt:
	cargo fmt

rust-fmt-check:
	cargo fmt --check

clippy:
	cargo clippy

check:
	pnpm -r lint
	pnpm biome:check
	cargo fmt --check
	cargo clippy

pre-push:
	./.husky/pre-push
