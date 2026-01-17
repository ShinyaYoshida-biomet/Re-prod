import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { Options } from "@wdio/types";
import E2eSummaryReporter from "./reporters/wdio-summary-reporter";

const driverHost = process.env.TAURI_DRIVER_HOST ?? "127.0.0.1";
const driverPort = Number(process.env.TAURI_DRIVER_PORT ?? "9515");
const driverPath = process.env.TAURI_DRIVER_PATH ?? "/";
const driverReadyTimeout = Number(process.env.TAURI_DRIVER_READY_TIMEOUT ?? "15000");
const logLevel = (process.env.LOG_LEVEL ?? "info") as Options.Testrunner["logLevel"];
const cargoTargetDir = process.env.CARGO_TARGET_DIR;
const defaultBinaryPath = cargoTargetDir
	? path.resolve(cargoTargetDir, "debug/reprod-desktop")
	: path.resolve(__dirname, "../target/debug/reprod-desktop");
const binaryPath = process.env.TAURI_DRIVER_APP ?? defaultBinaryPath;
const driverExecutable = process.env.TAURI_DRIVER_EXECUTABLE ?? "tauri-driver";
const nativeDriverCandidates = [
	"/usr/libexec/webkit2gtk-4.1/WebKitWebDriver",
	"/usr/libexec/webkit2gtk-4.0/WebKitWebDriver",
	"/usr/bin/WebKitWebDriver",
];
const nativeDriverPath = nativeDriverCandidates.find((candidate) => fs.existsSync(candidate));
const defaultDriverArgs = ["--port", driverPort.toString()];
if (nativeDriverPath) {
	defaultDriverArgs.push("--native-driver", nativeDriverPath);
}
const driverArgs = process.env.TAURI_DRIVER_ARGS
	? process.env.TAURI_DRIVER_ARGS.split(" ").filter(Boolean)
	: defaultDriverArgs;
const isDocker = fs.existsSync("/.dockerenv") || process.env.REPROD_E2E_DOCKER === "1";
const summaryPath = process.env.WDIO_SUMMARY_PATH ?? path.resolve(__dirname, ".wdio-summary.jsonl");

if (!process.env.CI && !isDocker) {
	throw new Error(
		"E2E tests are disabled on local machines. Use the Docker setup in desktop/e2e/Dockerfile.",
	);
}

let tauriOptions: Record<string, unknown> = {};
if (process.env.TAURI_DRIVER_TAURI_OPTIONS) {
	try {
		tauriOptions = JSON.parse(process.env.TAURI_DRIVER_TAURI_OPTIONS);
	} catch (error) {
		console.warn("Unable to parse TAURI_DRIVER_TAURI_OPTIONS", error);
	}
}
const resolvedApplicationPath =
	typeof (tauriOptions as { application?: unknown }).application === "string"
		? (tauriOptions as { application: string }).application
		: typeof (tauriOptions as { application?: { path?: string } }).application?.path === "string"
			? (tauriOptions as { application: { path: string } }).application.path
			: binaryPath;
const resolvedTauriOptions = {
	...tauriOptions,
	application: resolvedApplicationPath,
};

let driverProcess: ChildProcess | null = null;

function startDriver(): void {
	if (driverProcess) {
		return;
	}

	console.log(`[tauri-driver] starting (${driverExecutable} ${driverArgs.join(" ")})`);
	driverProcess = spawn(driverExecutable, driverArgs, {
		stdio: ["ignore", "pipe", "pipe"],
	});

	if (driverProcess.stdout) {
		driverProcess.stdout.on("data", (chunk) => {
			process.stdout.write(`[tauri-driver] ${chunk}`);
		});
	}

	if (driverProcess.stderr) {
		driverProcess.stderr.on("data", (chunk) => {
			process.stderr.write(`[tauri-driver] ${chunk}`);
		});
	}
}

function stopDriver(): void {
	if (!driverProcess) {
		return;
	}

	driverProcess.kill();
	driverProcess = null;
}

async function waitForDriverReady(): Promise<void> {
	const deadline = Date.now() + driverReadyTimeout;
	const statusUrl = `http://${driverHost}:${driverPort}/status`;

	console.log(`[tauri-driver] waiting for readiness at ${statusUrl}`);

	while (Date.now() < deadline) {
		try {
			await new Promise<void>((resolve, reject) => {
				const req = http.request(
					{
						hostname: driverHost,
						port: driverPort,
						path: "/status",
						method: "GET",
						timeout: 2000,
					},
					(res) => {
						if (res.statusCode && res.statusCode < 500) {
							resolve();
						} else {
							reject(new Error(`unexpected status ${res.statusCode}`));
						}
					},
				);

				req.on("error", reject);
				req.on("timeout", () => {
					req.destroy();
					reject(new Error("timeout"));
				});
				req.end();
			});

			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	throw new Error("tauri-driver did not become ready in time");
}

export const config: Options.Testrunner = {
	runner: "local",
	specs: ["./webdriver-specs/**/*.e2e.ts"],
	maxInstances: 1,
	autoCompileOpts: {
		autoCompile: true,
		tsNodeOpts: {
			project: path.resolve(__dirname, "tsconfig.json"),
			transpileOnly: true,
		},
	},
	capabilities: [
		{
			"tauri:options": {
				...resolvedTauriOptions,
			},
		} as any,
	],
	logLevel,
	bail: 0,
	waitforTimeout: 30000,
	connectionRetryTimeout: 120000,
	connectionRetryCount: 2,
	services: [],
	framework: "mocha",
	reporters: [E2eSummaryReporter as any],
	mochaOpts: {
		ui: "bdd",
		timeout: 300000,
	},
	hostname: driverHost,
	port: driverPort,
	path: driverPath,
	protocol: "http" as any,
	onPrepare: async () => {
		try {
			fs.unlinkSync(summaryPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
		}
		startDriver();
		await waitForDriverReady();
	},
	onComplete: () => {
		if (fs.existsSync(summaryPath)) {
			const lines = fs
				.readFileSync(summaryPath, "utf8")
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean);
			const totals = lines.reduce(
				(acc, line) => {
					try {
						const parsed = JSON.parse(line) as {
							total: number;
							passed: number;
							failed: number;
							skipped: number;
						};
						acc.total += parsed.total;
						acc.passed += parsed.passed;
						acc.failed += parsed.failed;
						acc.skipped += parsed.skipped;
					} catch {
						// ignore malformed lines
					}
					return acc;
				},
				{ total: 0, passed: 0, failed: 0, skipped: 0 },
			);
			const summaryLine = `[e2e] Summary: total=${totals.total} passed=${totals.passed} failed=${totals.failed} skipped=${totals.skipped}`;
			process.once("exit", () => {
				try {
					fs.writeSync(1, `${summaryLine}\n`);
				} catch {
					// ignore write failures during shutdown
				}
			});
		}
		stopDriver();
	},
};
