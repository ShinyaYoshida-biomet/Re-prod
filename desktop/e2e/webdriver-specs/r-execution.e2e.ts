import assert from "node:assert";
import {
	clickRunAll,
	openFixturesProject,
	setEditorValue,
	waitForConnected,
	waitForConsoleOutput,
} from "./helpers";
import { TEST_CASES } from "../shared/test-registry";

describe("R execution flow", () => {
	before(async () => {
		const editorInput = await browser.$(".monaco-editor textarea");
		await editorInput.waitForDisplayed({ timeout: 30000 });
		await waitForConnected();
		await openFixturesProject();
	});

	it(TEST_CASES["r-execution"][0], async () => {
		await setEditorValue("x <- 1 + 1\nprint(x)");
		await clickRunAll();

		const outputs = await waitForConsoleOutput("[1] 2");
		assert.ok(
			outputs.some((text) => text.includes("[1] 2")),
			"Console should show the result [1] 2",
		);
	});

	it(TEST_CASES["r-execution"][1], async () => {
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
		await setEditorValue('print("Hello, Re-prod!")');
		await clickRunAll();

		const outputs = await waitForConsoleOutput("Hello, Re-prod!");
		assert.ok(
			outputs.some((text) => text.includes("Hello, Re-prod!")),
			"Console should show formatted output",
		);
	});
});
