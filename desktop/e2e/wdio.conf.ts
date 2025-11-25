import { type ChildProcess, spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import type { Options } from "@wdio/types";

const driverHost = process.env.TAURI_DRIVER_HOST ?? "127.0.0.1";
const driverPort = Number(process.env.TAURI_DRIVER_PORT ?? "9515");
const driverPath = process.env.TAURI_DRIVER_PATH ?? "/";
const driverReadyTimeout = Number(process.env.TAURI_DRIVER_READY_TIMEOUT ?? "15000");
const binaryPath =
	process.env.TAURI_DRIVER_APP ?? path.resolve(__dirname, "../target/debug/reprod-desktop");
const driverExecutable = process.env.TAURI_DRIVER_EXECUTABLE ?? "tauri-driver";
const driverArgs = process.env.TAURI_DRIVER_ARGS
	? process.env.TAURI_DRIVER_ARGS.split(" ").filter(Boolean)
	: ["--port", driverPort.toString(), "--binary", binaryPath];

let tauriOptions: Record<string, unknown> = {};
if (process.env.TAURI_DRIVER_TAURI_OPTIONS) {
	try {
		tauriOptions = JSON.parse(process.env.TAURI_DRIVER_TAURI_OPTIONS);
	} catch (error) {
		console.warn("Unable to parse TAURI_DRIVER_TAURI_OPTIONS", error);
	}
}

let driverProcess: ChildProcess | null = null;

function startDriver(): void {
	if (driverProcess) {
		return;
	}

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
	specs: ["./webdriver-specs/**/*.ts"],
	maxInstances: 1,
	capabilities: [
		{
			browserName: "tauri" as any,
			"tauri:options": {
				binaryPath,
				...tauriOptions,
			},
		} as any,
	],
	logLevel: "info",
	bail: 0,
	waitforTimeout: 30000,
	connectionRetryTimeout: 120000,
	connectionRetryCount: 2,
	services: [],
	framework: "mocha",
	reporters: ["spec" as any],
	mochaOpts: {
		ui: "bdd",
		timeout: 300000,
	},
	hostname: driverHost,
	port: driverPort,
	path: driverPath,
	protocol: "http" as any,
	onPrepare: async () => {
		startDriver();
		await waitForDriverReady();
	},
	onComplete: () => {
		stopDriver();
	},
};
