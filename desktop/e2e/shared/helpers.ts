/**
 * Common test helper functions
 */

import type { Page } from "@playwright/test";

/**
 * Wait for element with timeout
 */
export async function waitForElement(
	page: Page,
	selector: string,
	options: { timeout?: number } = {},
) {
	const timeout = options.timeout || 30000;
	await page.locator(selector).waitFor({ timeout });
}

/**
 * Execute R code in the editor
 */
export async function executeRCode(page: Page, code: string) {
	// Wait for Monaco Editor to be ready
	await page.waitForSelector(".monaco-editor", { timeout: 30000 });

	// Set editor content using Monaco Editor API (more reliable than keyboard input)
	await page.evaluate((newCode) => {
		const monaco = (window as any).monaco;
		if (monaco && monaco.editor) {
			const editors = monaco.editor.getEditors();
			if (editors && editors.length > 0) {
				const editor = editors[0];
				editor.setValue(newCode);
				editor.focus();
			}
		}
	}, code);

	// Wait a bit for the change to take effect
	await page.waitForTimeout(500);

	// Click run button
	const runButton = page.locator('button[title="Run All (Cmd/Ctrl+Shift+Enter)"]');
	await runButton.waitFor({ timeout: 15000 });
	await runButton.click();
}

/**
 * Wait for console output containing specific text
 */
export async function waitForConsoleOutput(
	page: Page,
	expectedText: string,
	options: { timeout?: number } = {},
) {
	const timeout = options.timeout || 30000;

	await page.waitForFunction(
		({ selector, text }) => {
			const outputs = document.querySelectorAll(selector);
			return Array.from(outputs).some((output) => output.textContent?.includes(text));
		},
		{ selector: ".console-stdout", text: expectedText },
		{ timeout },
	);
}

/**
 * Open Timeline dialog
 */
export async function openTimelineDialog(page: Page) {
	await page.evaluate(() => {
		(window as any).openTimelineDialog?.();
	});

	const dialog = page.locator(".timeline-dialog");
	await dialog.waitFor({ timeout: 10000 });
}

/**
 * Open Export dialog
 */
export async function openExportDialog(page: Page) {
	await page.evaluate(() => {
		(window as any).openExportDialog?.();
	});

	const dialog = page.locator(".export-dialog");
	await dialog.waitFor({ timeout: 10000 });
}

/**
 * Close dialog with Escape key
 */
export async function closeDialog(page: Page) {
	await page.keyboard.press("Escape");
	await page.waitForTimeout(500); // Give time for animation
}

/**
 * Get all console outputs
 */
export async function getConsoleOutputs(page: Page): Promise<string[]> {
	const outputs = await page.locator(".console-stdout").all();
	return Promise.all(outputs.map((output) => output.textContent() || ""));
}

/**
 * Check if console has output containing text
 */
export async function consoleHasOutput(page: Page, expectedText: string): Promise<boolean> {
	const outputs = await getConsoleOutputs(page);
	return outputs.some((text) => text.includes(expectedText));
}
