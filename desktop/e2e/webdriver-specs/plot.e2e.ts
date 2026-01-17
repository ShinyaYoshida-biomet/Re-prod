import assert from "node:assert";
import { selectors } from "../shared/selectors";
import { TEST_CASES } from "../shared/test-registry";
import { clickRunAll, setEditorValue, waitForConnected } from "./helpers";

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
	beforeEach(async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });
		await waitForConnected();
	});

	it(TEST_CASES.plot[0], async () => {
		await setEditorValue("plot(1:10)");
		await clickRunAll();
		await openPlotsTab();

		const plotImage = await browser.$(selectors.plotImage);
		await plotImage.waitForDisplayed({ timeout: 20000 });
		assert.ok(await plotImage.isDisplayed());
	});

	it(TEST_CASES.plot[1], async () => {
		await setEditorValue("plot(1:10)\nplot(10:1)");
		await clickRunAll();
		await openPlotsTab();

		const plotImage = await browser.$(selectors.plotImage);
		await plotImage.waitForDisplayed({ timeout: 20000 });

		const counter = await browser.$(selectors.plotCounter);
		await counter.waitForDisplayed({ timeout: 10000 });
		assert.ok((await counter.getText()).includes("1 / 2"));

		const nextButton = await browser.$(selectors.plotNextButton);
		await nextButton.waitForEnabled({ timeout: 10000 });
		await nextButton.click();
		await browser.waitUntil(async () => (await counter.getText()).includes("2 / 2"), {
			timeout: 10000,
			timeoutMsg: "Expected plot counter to move to 2 / 2",
		});

		const prevButton = await browser.$(selectors.plotPrevButton);
		await prevButton.waitForEnabled({ timeout: 10000 });
		await prevButton.click();
		await browser.waitUntil(async () => (await counter.getText()).includes("1 / 2"), {
			timeout: 10000,
			timeoutMsg: "Expected plot counter to return to 1 / 2",
		});
	});
});
