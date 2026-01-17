import assert from "node:assert";
import { selectors } from "../shared/selectors";
import { TEST_CASES } from "../shared/test-registry";
import { clickRunAll, setEditorValue } from "./helpers";

const openPlotsTab = async (): Promise<void> => {
	await browser.waitUntil(
		async () =>
			browser.execute(() => {
				const tabs = Array.from(document.querySelectorAll(".tabs .tab"));
				const plotTab = tabs.find((tab) => tab.textContent?.trim() === "Plots");
				if (!plotTab) {
					return false;
				}
				(plotTab as HTMLElement).click();
				return true;
			}),
		{ timeout: 10000, timeoutMsg: "Plots tab not available" },
	);
};

describe("Plot visualization", () => {
	it(TEST_CASES.plot[0], async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		await setEditorValue("plot(1:10)");
		await clickRunAll();
		await openPlotsTab();

		const plotImage = await browser.$(selectors.plotImage);
		await plotImage.waitForDisplayed({ timeout: 20000 });
		assert.ok(await plotImage.isDisplayed());
	});

	it(TEST_CASES.plot[1], async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		await setEditorValue("plot(1:10)\nplot(10:1)");
		await clickRunAll();
		await openPlotsTab();

		const plotImage = await browser.$(selectors.plotImage);
		await plotImage.waitForDisplayed({ timeout: 20000 });

		const counter = await browser.$(selectors.plotCounter);
		await counter.waitForDisplayed({ timeout: 10000 });
		assert.ok((await counter.getText()).includes("1 / 2"));

		const nextButton = await browser.$(selectors.plotNextButton);
		await nextButton.click();
		assert.ok((await counter.getText()).includes("2 / 2"));

		const prevButton = await browser.$(selectors.plotPrevButton);
		await prevButton.click();
		assert.ok((await counter.getText()).includes("1 / 2"));
	});
});
