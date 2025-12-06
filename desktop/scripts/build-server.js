#!/usr/bin/env node

const { copyFileSync, existsSync, mkdirSync } = require("node:fs");
const { execSync } = require("node:child_process");
const path = require("node:path");

function detectTargetTriple() {
	const fromEnv =
		process.env.TAURI_ENV_TARGET_TRIPLE ||
		process.env.TAURI_TARGET_TRIPLE ||
		process.env.TAURI_TARGET ||
		process.env.CARGO_BUILD_TARGET;
	if (fromEnv) return fromEnv;

	const platform = process.env.TAURI_PLATFORM || process.platform;
	const arch = process.env.TAURI_ARCH || process.arch;

	if (platform === "darwin") {
		return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
	}
	if (platform === "linux") {
		return "x86_64-unknown-linux-gnu";
	}
	if (platform === "win32" || platform === "windows") {
		return "x86_64-pc-windows-msvc";
	}

	return null;
}

function main() {
	const triple = detectTargetTriple();
	const targetArg = triple ? `--target ${triple}` : "";
	const binaryName =
		process.platform === "win32" || process.platform === "windows"
			? "reprod-server.exe"
			: "reprod-server";

	const workspaceRoot = path.join(__dirname, "..", "..");
	const buildCmd = `cargo build --release -p reprod-server ${targetArg}`.trim();
	console.log(`[build-server] running: ${buildCmd}`);
	execSync(buildCmd, { stdio: "inherit", cwd: workspaceRoot });

	const builtPath = triple
		? path.join(workspaceRoot, "target", triple, "release", binaryName)
		: path.join(workspaceRoot, "target", "release", binaryName);

	if (!existsSync(builtPath)) {
		throw new Error(`[build-server] built binary not found at ${builtPath}`);
	}

	const destDir = path.join(__dirname, "..", "binaries");
	mkdirSync(destDir, { recursive: true });
	const destPath = path.join(destDir, binaryName);
	copyFileSync(builtPath, destPath);

	// Also write a target-suffixed name so Tauri can resolve per-target binaries.
	if (triple) {
		const ext = binaryName.endsWith(".exe") ? ".exe" : "";
		const base = ext ? binaryName.replace(/\.exe$/, "") : binaryName;
		const suffixed = path.join(destDir, `${base}-${triple}${ext}`);
		copyFileSync(builtPath, suffixed);
		console.log(`[build-server] copied ${builtPath} -> ${destPath} and ${suffixed}`);
	} else {
		console.log(`[build-server] copied ${builtPath} -> ${destPath}`);
	}
}

main();
