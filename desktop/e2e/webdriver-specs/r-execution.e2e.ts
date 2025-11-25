import assert from "node:assert";

const consoleOutputSelector = ".console-stdout";
const runAllSelector = 'button[title="Run All (Cmd/Ctrl+Shift+Enter)"]';

describe("R execution flow", () => {
	it("runs a simple expression and shows the result", async () => {
		const editorInput = await browser.$(".monaco-editor textarea");
		await editorInput.waitForDisplayed({ timeout: 30000 });
		await editorInput.click();

		await browser.keys(["Control", "a", "NULL"]);
		await browser.keys("1 + 1");

		const runAllButton = await browser.$(runAllSelector);
		await runAllButton.waitForClickable({ timeout: 15000 });
		await runAllButton.click();

		await browser.waitUntil(
			async () => {
				const outputs = await browser.$$(consoleOutputSelector);
				for (const output of outputs) {
					const text = await output.getText();
					if (text.includes("[1] 2")) {
						return true;
					}
				}
				return false;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected R execution output to include [1] 2",
			},
		);

		const outputs = await browser.$$(consoleOutputSelector);
		const found = await Promise.all(
			outputs.map(async (output) => (await output.getText()).includes("[1] 2")),
		);
		assert.ok(found.some(Boolean), "Console should show the result [1] 2");
	});
});
