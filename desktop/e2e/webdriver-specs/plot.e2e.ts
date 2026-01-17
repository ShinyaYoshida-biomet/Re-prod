import assert from "node:assert";
import { selectors } from "../shared/selectors";
import { TEST_CASES } from "../shared/test-registry";
import { clickRunAll, openFixturesProject, setEditorValue, waitForConnected } from "./helpers";

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

const getPlotCounter = async (): Promise<{ current: number; total: number } | null> => {
	const text = (await browser.execute(() => {
		const counter = document.querySelector(".plot-counter");
		return counter?.textContent?.trim() ?? "";
	})) as string;
	const match = text.match(/(\d+)\s*\/\s*(\d+)/);
	if (!match) {
		return null;
	}
	return { current: Number(match[1]), total: Number(match[2]) };
};

describe("Plot visualization", () => {
	before(async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });
		await waitForConnected();
		await openFixturesProject();
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
		const previousTotal = (await getPlotCounter())?.total ?? 0;

		await setEditorValue("plot(1:10)\nplot(10:1)");
		await clickRunAll();
		await openPlotsTab();

		const counter = await browser.$(selectors.plotCounter);
		await counter.waitForDisplayed({ timeout: 10000 });

		await browser.waitUntil(
			async () => {
				const parsed = await getPlotCounter();
				return parsed !== null && parsed.total >= previousTotal + 2;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected plot history to include two new plots",
			},
		);

		const plotImage = await browser.$(selectors.plotImage);
		await plotImage.waitForDisplayed({ timeout: 20000 });

		const prevButton = await browser.$(selectors.plotPrevButton);
		await prevButton.waitForEnabled({ timeout: 10000 });
		await prevButton.click();
		await browser.waitUntil(
			async () => {
				const parsed = await getPlotCounter();
				return parsed !== null && parsed.current === parsed.total - 1;
			},
			{
				timeout: 10000,
				timeoutMsg: "Expected plot counter to move to previous plot",
			},
		);

		const nextButton = await browser.$(selectors.plotNextButton);
		await nextButton.waitForEnabled({ timeout: 10000 });
		await nextButton.click();
		await browser.waitUntil(
			async () => {
				const parsed = await getPlotCounter();
				return parsed !== null && parsed.current === parsed.total;
			},
			{
				timeout: 10000,
				timeoutMsg: "Expected plot counter to return to latest plot",
			},
		);
	});
});
