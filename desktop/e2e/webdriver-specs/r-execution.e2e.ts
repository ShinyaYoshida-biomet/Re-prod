import assert from "node:assert";
import { clickRunAll, setEditorValue } from "./helpers";

const consoleOutputSelector = ".console-stdout";

describe("R execution flow", () => {
	it("runs a simple expression and shows the result", async () => {
		const editorInput = await browser.$(".monaco-editor textarea");
		await editorInput.waitForDisplayed({ timeout: 30000 });
		await setEditorValue("1 + 1");
		await clickRunAll();

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
		const found = await outputs.map((output) =>
			output.getText().then((text) => text.includes("[1] 2")),
		);
		assert.ok(found.some(Boolean), "Console should show the result [1] 2");
	});
});
