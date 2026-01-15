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
