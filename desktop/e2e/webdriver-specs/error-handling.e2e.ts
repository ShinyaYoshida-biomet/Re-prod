import assert from "node:assert";
import { clickRunAll, openFixturesProject, setEditorValue, waitForConnected } from "./helpers";
import { TEST_CASES } from "../shared/test-registry";

const editorSelector = ".monaco-editor textarea";
const consoleOutputSelector = ".console-stdout, .console-stderr";

describe("Error handling scenarios", () => {
	before(async () => {
		const editorInput = await browser.$(editorSelector);
		await editorInput.waitForDisplayed({ timeout: 30000 });
		await waitForConnected();
		await openFixturesProject();
	});

	it(TEST_CASES["error-handling"][0], async () => {
		await setEditorValue("x <- 1 +");
		await clickRunAll();

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
				timeoutMsg: "Expected syntax error to be displayed in console",
			},
		);

		const outputs = await browser.$$(consoleOutputSelector);
		const errorTexts = await outputs.map((output) => output.getText());
		const hasError = errorTexts.some(
			(text) => text.toLowerCase().includes("error") || text.toLowerCase().includes("unexpected"),
		);

		assert.ok(hasError, "Syntax error should be displayed in console");
	});

	it(TEST_CASES["error-handling"][1], async () => {
		await setEditorValue('x <- "text"\ny <- x / 2');
		await clickRunAll();

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

	it(TEST_CASES["error-handling"][2], async () => {
		await setEditorValue('stop("Error")');
		await clickRunAll();
		await browser.pause(3000);

		await setEditorValue("x <- 42\nprint(x)");
		await clickRunAll();

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

	it(TEST_CASES["error-handling"][3], async () => {
		await setEditorValue("print(undefined_variable)");
		await clickRunAll();

		await browser.waitUntil(
			async () => {
				const outputs = await browser.$$(consoleOutputSelector);
				for (const output of outputs) {
					const text = await output.getText();
					if (text.toLowerCase().includes("error") || text.toLowerCase().includes("not found")) {
						return true;
					}
				}
				return false;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected undefined variable error",
			},
		);

		const outputs = await browser.$$(consoleOutputSelector);
		const errorTexts = await outputs.map((output) => output.getText());
		const hasError = errorTexts.some(
			(text) => text.toLowerCase().includes("error") || text.toLowerCase().includes("not found"),
		);

		assert.ok(hasError, "Undefined variable error should be displayed");
	});

	it(TEST_CASES["error-handling"][4], async () => {
		await setEditorValue("nonexistent_function()");
		await clickRunAll();

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

		assert.ok(hasError, "Function error should be displayed");
	});

	it(TEST_CASES["error-handling"][5], async () => {
		await setEditorValue("}{][)( <- %% !!!");
		await clickRunAll();

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

		const editorInput = await browser.$(editorSelector);
		const editorStillVisible = await editorInput.isDisplayed();
		assert.ok(editorStillVisible, "Editor should still be functional after parse error");
	});

	it(TEST_CASES["error-handling"][6], async () => {
		await setEditorValue("x <- 1 +");
		await clickRunAll();
		await browser.pause(1000);

		await setEditorValue('y <- "text" / 2');
		await clickRunAll();
		await browser.pause(1000);

		await setEditorValue("z <- undefinedVar");
		await clickRunAll();
		await browser.pause(1000);

		await setEditorValue("final_result <- 100\nprint(final_result)");
		await clickRunAll();

		await browser.waitUntil(
			async () => {
				const outputs = await browser.$$(consoleOutputSelector);
				for (const output of outputs) {
					const text = await output.getText();
					if (text.includes("[1] 100")) {
						return true;
					}
				}
				return false;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected successful execution after multiple errors",
			},
		);

		const outputs = await browser.$$(consoleOutputSelector);
		const outputTexts = await outputs.map((output) => output.getText());
		const hasSuccess = outputTexts.some((text) => text.includes("[1] 100"));

		assert.ok(hasSuccess, "Application should remain responsive after multiple errors");
	});
});
