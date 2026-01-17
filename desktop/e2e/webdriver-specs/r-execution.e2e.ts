import assert from "node:assert";
import { clickRunAll, setEditorValue, waitForConsoleOutput } from "./helpers";
import { TEST_CASES } from "../shared/test-registry";

describe("R execution flow", () => {
	it(TEST_CASES["r-execution"][0], async () => {
		const editorInput = await browser.$(".monaco-editor textarea");
		await editorInput.waitForDisplayed({ timeout: 30000 });
		await setEditorValue("x <- 1 + 1\nprint(x)");
		await clickRunAll();

		const outputs = await waitForConsoleOutput("[1] 2");
		assert.ok(
			outputs.some((text) => text.includes("[1] 2")),
			"Console should show the result [1] 2",
		);
	});

	it(TEST_CASES["r-execution"][1], async () => {
		const editorInput = await browser.$(".monaco-editor textarea");
		await editorInput.waitForDisplayed({ timeout: 30000 });

		const code = `x <- 5
y <- 10
print(x + y)`;
		await setEditorValue(code);
		await clickRunAll();

		const outputs = await waitForConsoleOutput("[1] 15");
		assert.ok(
			outputs.some((text) => text.includes("[1] 15")),
			"Console should show the result [1] 15",
		);
	});

	it(TEST_CASES["r-execution"][2], async () => {
		const editorInput = await browser.$(".monaco-editor textarea");
		await editorInput.waitForDisplayed({ timeout: 30000 });

		await setEditorValue('print("Hello, Re-prod!")');
		await clickRunAll();

		const outputs = await waitForConsoleOutput("Hello, Re-prod!");
		assert.ok(
			outputs.some((text) => text.includes("Hello, Re-prod!")),
			"Console should show formatted output",
		);
	});
});
