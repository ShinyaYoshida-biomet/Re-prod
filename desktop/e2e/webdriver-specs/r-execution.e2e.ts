import assert from "node:assert";
import { clickRunAll, setEditorValue } from "./helpers";

const consoleOutputSelector = ".console-stdout";

describe("R execution flow", () => {
	it("runs a simple expression and shows the result", async () => {
		const editorInput = await browser.$(".monaco-editor textarea");
		await editorInput.waitForDisplayed({ timeout: 30000 });
		await setEditorValue("x <- 1 + 1\nprint(x)");
		await clickRunAll();

		await browser.waitUntil(
			async () => {
				const texts = await browser.execute(() =>
					Array.from(document.querySelectorAll(".console-stdout"), (element) =>
						(element.textContent ?? "").trim(),
					),
				);
				return texts.some((text) => text.includes("[1] 2"));
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected R execution output to include [1] 2",
			},
		);

		const outputs = await browser.execute(() =>
			Array.from(document.querySelectorAll(".console-stdout"), (element) =>
				(element.textContent ?? "").trim(),
			),
		);
		assert.ok(
			outputs.some((text) => text.includes("[1] 2")),
			"Console should show the result [1] 2",
		);
	});
});
