import path from "node:path";

export async function openTimelineDialog(): Promise<WebdriverIO.Element> {
	await browser.waitUntil(
		async () =>
			browser.execute(() => {
				const helper = (window as any).reprodTest as
					| { openTimelineDialog?: () => void }
					| undefined;
				return (
					typeof helper?.openTimelineDialog === "function" ||
					typeof (window as any).openTimelineDialog === "function"
				);
			}),
		{ timeout: 10000, timeoutMsg: "Timeline helper not available" },
	);

	await browser.execute(() => {
		const helper = (window as any).reprodTest as { openTimelineDialog?: () => void } | undefined;
		if (helper?.openTimelineDialog) {
			helper.openTimelineDialog();
			return;
		}
		(window as any).openTimelineDialog?.();
	});

	const timelineDialog = await browser.$(".timeline-dialog");
	await timelineDialog.waitForDisplayed({ timeout: 10000 });
	return timelineDialog;
}

export async function openExportDialog(): Promise<WebdriverIO.Element> {
	await browser.waitUntil(
		async () =>
			browser.execute(() => {
				const helper = (window as any).reprodTest as { openExportDialog?: () => void } | undefined;
				return (
					typeof helper?.openExportDialog === "function" ||
					typeof (window as any).openExportDialog === "function"
				);
			}),
		{ timeout: 10000, timeoutMsg: "Export helper not available" },
	);

	await browser.execute(() => {
		const helper = (window as any).reprodTest as { openExportDialog?: () => void } | undefined;
		if (helper?.openExportDialog) {
			helper.openExportDialog();
			return;
		}
		(window as any).openExportDialog?.();
	});

	const exportDialog = await browser.$(".export-dialog");
	await exportDialog.waitForDisplayed({ timeout: 10000 });
	return exportDialog;
}

export async function openProjectSwitchDialog(): Promise<void> {
	await browser.waitUntil(
		async () =>
			browser.execute(() => {
				const helper = (window as any).reprodTest as
					| { openProjectSwitchDialog?: () => void }
					| undefined;
				return typeof helper?.openProjectSwitchDialog === "function";
			}),
		{ timeout: 10000, timeoutMsg: "Project switch helper not available" },
	);

	await browser.execute(() => {
		const helper = (window as any).reprodTest as
			| { openProjectSwitchDialog?: () => void }
			| undefined;
		helper?.openProjectSwitchDialog?.();
	});
}

export async function openSettingsDialog(): Promise<void> {
	await browser.waitUntil(
		async () =>
			browser.execute(() => {
				const helper = (window as any).reprodTest as
					| { openSettingsDialog?: () => void }
					| undefined;
				return typeof helper?.openSettingsDialog === "function";
			}),
		{ timeout: 10000, timeoutMsg: "Settings helper not available" },
	);

	await browser.execute(() => {
		const helper = (window as any).reprodTest as { openSettingsDialog?: () => void } | undefined;
		helper?.openSettingsDialog?.();
	});
}

export async function closeDialog(dialogSelector: string, overlaySelector: string): Promise<void> {
	const dialog = await browser.$(dialogSelector);
	if (!(await dialog.isExisting())) {
		return;
	}

	await browser.keys("Escape");
	await browser.execute(
		(selectors) => {
			const dialogEl = document.querySelector(selectors.dialogSelector);
			if (!dialogEl) {
				return false;
			}
			const closeButton =
				dialogEl.querySelector('[aria-label="Close dialog"]') ||
				dialogEl.querySelector(".btn.btn-icon");
			const overlay = document.querySelector(selectors.overlaySelector);

			if (closeButton instanceof HTMLElement) {
				closeButton.click();
				return true;
			}
			if (overlay instanceof HTMLElement) {
				overlay.click();
				return true;
			}
			return false;
		},
		{ dialogSelector, overlaySelector },
	);

	await dialog.waitForDisplayed({
		reverse: true,
		timeout: 5000,
		timeoutMsg: "Dialog should close",
	});
}

export async function setEditorValue(code: string): Promise<void> {
	await browser.waitUntil(
		async () =>
			browser.execute((newCode) => {
				const monaco = (window as any).monaco;
				const editors = monaco?.editor?.getEditors?.();
				if (!editors || editors.length === 0) {
					return false;
				}
				const editor = editors[0];
				editor.setValue(newCode);
				editor.focus();
				return true;
			}, code),
		{ timeout: 30000, timeoutMsg: "Monaco editor not available" },
	);
}

export async function clickRunAll(): Promise<void> {
	const runAllSelector = 'button[title="Run All (Cmd/Ctrl+Shift+Enter)"]';

	await browser.waitUntil(
		async () =>
			browser.execute((selector) => {
				const button = document.querySelector(selector) as HTMLButtonElement | null;
				if (!button || button.disabled) {
					return false;
				}
				button.click();
				return true;
			}, runAllSelector),
		{ timeout: 15000, timeoutMsg: "Run All button not available" },
	);
}

export async function waitForConsoleOutput(expected: string, timeoutMs = 60000): Promise<string[]> {
	await browser.waitUntil(
		async () => {
			const texts = await browser.execute(() =>
				Array.from(document.querySelectorAll(".console-stdout"), (element) =>
					(element.textContent ?? "").trim(),
				),
			);
			return texts.some((text) => text.includes(expected));
		},
		{
			timeout: timeoutMs,
			timeoutMsg: `Expected R execution output to include ${expected}`,
		},
	);

	return (await browser.execute(() =>
		Array.from(document.querySelectorAll(".console-stdout"), (element) =>
			(element.textContent ?? "").trim(),
		),
	)) as string[];
}

export async function waitForConnected(timeoutMs = 30000): Promise<void> {
	await browser.waitUntil(
		async () =>
			browser.execute(() => {
				const helper = (window as any).reprodTest as { isConnected?: () => boolean } | undefined;
				if (typeof helper?.isConnected === "function") {
					return helper.isConnected();
				}
				const status = document.querySelector(".connection-indicator .connection-text");
				return status?.textContent?.toLowerCase().includes("connected") ?? false;
			}),
		{
			timeout: timeoutMs,
			timeoutMsg: "Expected app to be connected before running code",
		},
	);
}

export async function openFixturesProject(timeoutMs = 30000): Promise<void> {
	const repoRoot = path.resolve(__dirname, "../../..");
	const fixturesRoot = path.join(repoRoot, "desktop/e2e/shared/fixtures/projects");
	await waitForConnected(timeoutMs);
	await switchProjectFolderAndWait(fixturesRoot, "projects", timeoutMs);
	await waitForFileTreeLabel("alpha", timeoutMs);
}

export async function getFileTreeLabels(): Promise<string[]> {
	return (await browser.execute(() => {
		return Array.from(document.querySelectorAll(".file-tree-label"))
			.map((label) => label.textContent?.trim() ?? "")
			.filter(Boolean);
	})) as string[];
}

export async function waitForFileTreeLabel(expected: string, timeoutMs = 30000): Promise<void> {
	let labels: string[] = [];
	try {
		await browser.waitUntil(
			async () => {
				labels = await getFileTreeLabels();
				return labels.includes(expected);
			},
			{ timeout: timeoutMs, timeoutMsg: `Expected file tree label "${expected}"` },
		);
	} catch {
		const emptyState = (await browser.execute(
			() => document.querySelector(".file-browser-empty")?.textContent?.trim() ?? "",
		)) as string;
		const errorState = (await browser.execute(
			() => document.querySelector(".file-browser-error")?.textContent?.trim() ?? "",
		)) as string;
		const suffixParts = [];
		if (labels.length) {
			suffixParts.push(`labels: ${labels.join(", ")}`);
		}
		if (emptyState) {
			suffixParts.push(`empty: ${emptyState}`);
		}
		if (errorState) {
			suffixParts.push(`error: ${errorState}`);
		}
		const suffix = suffixParts.length ? ` (${suffixParts.join(" | ")})` : "";
		throw new Error(`Expected file tree label "${expected}"${suffix}`);
	}
}

export async function openFileInWorkspace(relativePath: string): Promise<void> {
	const result = (await browser.executeAsync((path, done) => {
		const helper = (window as any).reprodTest as { openFile?: (path: string) => Promise<void> };
		if (!helper?.openFile) {
			done({ ok: false, error: "reprodTest openFile helper not available" });
			return;
		}

		Promise.resolve(helper.openFile(path))
			.then(() => done({ ok: true }))
			.catch((error) => done({ ok: false, error: error?.message ?? String(error) }));
	}, relativePath)) as { ok: boolean; error?: string } | undefined;

	if (!result?.ok) {
		throw new Error(result?.error ?? `Failed to open file: ${relativePath}`);
	}
}

export async function switchProjectFolderAndWait(
	folderPath: string,
	projectName: string,
	timeoutMs = 30000,
): Promise<void> {
	const result = (await browser.executeAsync(
		(path, name, timeout, done) => {
			const helper = (window as any).reprodTest as
				| {
						sendMessage?: (payload: { type: string; path: string }) => boolean;
						waitForProjectOpened?: (project: string, timeout?: number) => Promise<void>;
				  }
				| undefined;
			if (!helper?.sendMessage || !helper?.waitForProjectOpened) {
				done({ ok: false, error: "reprodTest project switch helpers not available" });
				return;
			}

			const waitPromise = helper.waitForProjectOpened(name, timeout);
			const didSend = helper.sendMessage({ type: "project_switch_folder", path });
			if (!didSend) {
				done({ ok: false, error: "Expected project switch message to be sent" });
				return;
			}

			Promise.resolve(waitPromise)
				.then(() => done({ ok: true }))
				.catch((error) => done({ ok: false, error: error?.message ?? String(error) }));
		},
		folderPath,
		projectName,
		timeoutMs,
	)) as { ok: boolean; error?: string } | undefined;

	if (!result?.ok) {
		throw new Error(result?.error ?? `Timed out waiting for project_opened: ${projectName}`);
	}
}
