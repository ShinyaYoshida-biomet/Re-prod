SHELL := /bin/bash

.PHONY: help install dev dev-ui dev-desktop build build-ui test test-core test-protocol lint format rust-fmt rust-fmt-check clippy check check-build pre-push

help:
	@echo "Re-prod Make targets"
	@echo ""
	@echo "Setup"
	@echo "  make install           Install dependencies (trunk)"
	@echo ""
	@echo "Development"
	@echo "  make dev               Run Axum backend + Leptos UI"
	@echo "  make dev-ui            Run Leptos UI only (trunk serve)"
	@echo "  make dev-desktop       Launch Tauri desktop app"
	@echo ""
	@echo "Build"
	@echo "  make build             Build all packages"
	@echo "  make build-ui          Build Leptos UI (trunk build)"
	@echo "  make check-build       Run build checks"
	@echo ""
	@echo "Testing"
	@echo "  make test              Run all Rust tests"
	@echo "  make test-core         Run core crate tests"
	@echo "  make test-protocol     Run protocol crate tests"
	@echo ""
	@echo "Quality"
	@echo "  make rust-fmt          Apply Rust formatting"
	@echo "  make rust-fmt-check    Check Rust formatting"
	@echo "  make clippy            Run Rust clippy"
	@echo "  make check             Run standard local checks"

install:
	cargo install trunk
	rustup target add wasm32-unknown-unknown

dev:
	cd ui && trunk serve --port 5176 &
	cargo run -p reprod-server

dev-ui:
	cd ui && trunk serve --port 5176

dev-desktop:
	cd desktop && cargo tauri dev

build:
	cd ui && trunk build --release
	cargo build --release -p reprod-server

build-ui:
	cd ui && trunk build --release

check-build:
	cd ui && trunk build
	cargo build

test: test-core test-protocol

test-core:
	cargo test -p reprod-core -p reprod-server

test-protocol:
	cargo test -p reprod-protocol

rust-fmt:
	cargo fmt

rust-fmt-check:
	cargo fmt --check

clippy:
	cargo clippy

check:
	cargo fmt --check
	cargo clippy
	cargo test --lib

pre-push:
	cargo fmt --check
	cargo clippy
	cargo test
