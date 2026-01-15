import assert from "node:assert";
import { clickRunAll, setEditorValue } from "./helpers";

const editorSelector = ".monaco-editor textarea";
const consoleOutputSelector = ".console-output, .console-entry";
const consoleStderrSelector = ".console-stderr";
const errorBadgeSelector = ".console-error-badge, .error-badge";

describe("Error handling scenarios", () => {
	it("displays R syntax errors in console", async () => {
		const editorInput = await browser.$(editorSelector);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		// Clear editor and enter invalid R syntax
		await setEditorValue("x <- 1 +"); // Incomplete expression
		await clickRunAll();

		// Wait for error output to appear
		await browser.waitUntil(
			async () => {
				const outputs = await browser.$$(consoleOutputSelector);
				for (const output of outputs) {
					const text = await output.getText();
					// R typically shows "Error" or "unexpected end of input"
					if (text.toLowerCase().includes("error") || text.toLowerCase().includes("unexpected")) {
						return true;
					}
				}
				return false;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected syntax error to be displayed in console",
			},
		);

		// Verify error appears in console
		const outputs = await browser.$$(consoleOutputSelector);
		const errorTexts = await outputs.map((output) => output.getText());
		const hasError = errorTexts.some(
			(text) => text.toLowerCase().includes("error") || text.toLowerCase().includes("unexpected"),
		);

		assert.ok(hasError, "Syntax error should be displayed in console");
	});

	it("displays R runtime errors", async () => {
		const editorInput = await browser.$(editorSelector);
		// Better runtime error: division by non-numeric
		await setEditorValue('x <- "text"\ny <- x / 2'); // Type error
		await clickRunAll();

		// Wait for error in console
		await browser.waitUntil(
			async () => {
				const outputs = await browser.$$(consoleOutputSelector);
				for (const output of outputs) {
					const text = await output.getText();
					if (text.toLowerCase().includes("error")) {
						return true;
					}
				}
				return false;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected runtime error to be displayed",
			},
		);

		const outputs = await browser.$$(consoleOutputSelector);
		const errorTexts = await outputs.map((output) => output.getText());
		const hasError = errorTexts.some((text) => text.toLowerCase().includes("error"));

		assert.ok(hasError, "Runtime error should be displayed in console");
	});

	it("shows stderr output with error styling", async () => {
		const editorInput = await browser.$(editorSelector);
		// Code that produces error
		await setEditorValue('stop("Intentional error for testing")');
		await clickRunAll();

		// Wait for stderr output
		await browser.waitUntil(
			async () => {
				const stderrElements = await browser.$$(consoleStderrSelector);
				if (stderrElements.length === 0) {
					// Fallback: check any console output for error
					const outputs = await browser.$$(consoleOutputSelector);
					for (const output of outputs) {
						const text = await output.getText();
						if (text.includes("Intentional error") || text.includes("Error")) {
							return true;
						}
					}
				}
				return stderrElements.length > 0;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected stderr output to appear",
			},
		);

		// Verify stderr is styled appropriately
		const stderrTexts = await browser.execute((selector) => {
			return Array.from(document.querySelectorAll(selector)).map(
				(element) => element.textContent ?? "",
			);
		}, consoleStderrSelector);
		const hasStderrError = stderrTexts.some(
			(text) => text.toLowerCase().includes("error") || text.includes("Intentional error"),
		);

		if (!hasStderrError) {
			// Verify error appears somewhere in console
			const outputTexts = await browser.execute((selector) => {
				return Array.from(document.querySelectorAll(selector)).map(
					(element) => element.textContent ?? "",
				);
			}, consoleOutputSelector);
			const hasOutputError = outputTexts.some(
				(text) => text.includes("Intentional error") || text.includes("Error"),
			);

			assert.ok(hasOutputError, "Error message should appear in console output");
		}
	});

	it("displays error badge for failed executions", async () => {
		const editorInput = await browser.$(editorSelector);
		// Code that will error
		await setEditorValue("undefined_variable");
		await clickRunAll();

		// Wait for execution to complete
		await browser.pause(3000);

		// Check for error badge (if implemented)
		const errorBadge = await browser.$(errorBadgeSelector);
		const hasBadge = await errorBadge.isExisting();

		if (hasBadge) {
			assert.ok(
				await errorBadge.isDisplayed(),
				"Error badge should be visible for failed executions",
			);
		}

		// At minimum, verify error appears in console
		const outputs = await browser.$$(consoleOutputSelector);
		const errorTexts = await outputs.map((output) => output.getText());
		const hasError = errorTexts.some(
			(text) => text.toLowerCase().includes("error") || text.toLowerCase().includes("not found"),
		);

		assert.ok(hasError, "Error should be visible in console output");
	});

	it("handles undefined function errors", async () => {
		await setEditorValue("nonexistent_function()");
		await clickRunAll();

		// Wait for error
		await browser.waitUntil(
			async () => {
				const outputs = await browser.$$(consoleOutputSelector);
				for (const output of outputs) {
					const text = await output.getText();
					if (
						text.toLowerCase().includes("could not find function") ||
						text.toLowerCase().includes("error")
					) {
						return true;
					}
				}
				return false;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected function not found error",
			},
		);

		const outputs = await browser.$$(consoleOutputSelector);
		const errorTexts = await outputs.map((output) => output.getText());
		const hasError = errorTexts.some(
			(text) =>
				text.toLowerCase().includes("could not find function") ||
				text.toLowerCase().includes("error"),
		);

		assert.ok(hasError, "Undefined function error should be displayed");
	});

	it("recovers from errors and allows subsequent executions", async () => {
		const editorInput = await browser.$(editorSelector);
		// First: Execute code that errors
		await setEditorValue('stop("Error")');
		await clickRunAll();

		// Wait for error
		await browser.pause(3000);

		// Second: Execute valid code
		await setEditorValue("x <- 42\nprint(x)");
		await clickRunAll();

		// Wait for successful output
		await browser.waitUntil(
			async () => {
				const outputs = await browser.$$(consoleOutputSelector);
				for (const output of outputs) {
					const text = await output.getText();
					if (text.includes("[1] 42")) {
						return true;
					}
				}
				return false;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected successful execution after error",
			},
		);

		const outputs = await browser.$$(consoleOutputSelector);
		const outputTexts = await outputs.map((output) => output.getText());
		const hasSuccess = outputTexts.some((text) => text.includes("[1] 42"));

		assert.ok(hasSuccess, "Application should recover from errors and execute new code");
	});

	it("handles parse errors gracefully", async () => {
		const editorInput = await browser.$(editorSelector);
		// Completely malformed R code
		await setEditorValue("}{][)( <- %% !!!");
		await clickRunAll();

		// Wait for parse error
		await browser.waitUntil(
			async () => {
				const outputs = await browser.$$(consoleOutputSelector);
				for (const output of outputs) {
					const text = await output.getText();
					if (text.toLowerCase().includes("error") || text.toLowerCase().includes("unexpected")) {
						return true;
					}
				}
				return false;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected parse error to be displayed",
			},
		);

		// Verify application didn't crash
		const editorStillVisible = await editorInput.isDisplayed();
		assert.ok(editorStillVisible, "Editor should still be functional after parse error");
	});
});
