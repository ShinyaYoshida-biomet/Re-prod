import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { executeRCode, waitForElement } from "../shared/helpers";
import { selectors } from "../shared/selectors";
import { TEST_CASES } from "../shared/test-registry";

const parsePlotCounter = (text: string | null) => {
	if (!text) {
		return null;
	}
	const match = text.trim().match(/(\d+)\s*\/\s*(\d+)/);
	if (!match) {
		return null;
	}
	return { current: Number(match[1]), total: Number(match[2]) };
};

const readPlotCounter = async (counter: Locator) => {
	return parsePlotCounter(await counter.textContent());
};

const openPlotsTab = async (page: any) => {
	const plotsTab = page.locator(selectors.plotsTab);
	await plotsTab.waitFor({ timeout: 10000 });
	await plotsTab.click();
};

test.describe("Plot visualization", () => {
	test(TEST_CASES.plot[0], async ({ page }) => {
		await page.goto("/");

		const editor = page.locator(selectors.editor);
		await editor.waitFor({ timeout: 30000 });

		await executeRCode(page, "plot(1:10)");
		await openPlotsTab(page);

		await waitForElement(page, selectors.plotImage, { timeout: 20000 });
		const plotImage = page.locator(selectors.plotImage);
		expect(await plotImage.isVisible()).toBeTruthy();
	});

	test(TEST_CASES.plot[1], async ({ page }) => {
		await page.goto("/");

		const editor = page.locator(selectors.editor);
		await editor.waitFor({ timeout: 30000 });

		await executeRCode(page, "plot(1:10)\nplot(10:1)");
		await openPlotsTab(page);

		await waitForElement(page, selectors.plotImage, { timeout: 20000 });

		const counter = page.locator(selectors.plotCounter);
		await counter.waitFor({ timeout: 10000 });
		await expect.poll(async () => readPlotCounter(counter), { timeout: 10000 }).not.toBeNull();
		const initial = (await readPlotCounter(counter))!;
		expect(initial.total).toBeGreaterThanOrEqual(2);

		const nextButton = page.locator(selectors.plotNextButton);
		const prevButton = page.locator(selectors.plotPrevButton);
		if (initial.current >= initial.total) {
			await prevButton.click();
			await expect
				.poll(async () => (await readPlotCounter(counter))?.current, { timeout: 10000 })
				.toBe(initial.current - 1);
			await nextButton.click();
			await expect
				.poll(async () => (await readPlotCounter(counter))?.current, { timeout: 10000 })
				.toBe(initial.current);
		} else {
			await nextButton.click();
			await expect
				.poll(async () => (await readPlotCounter(counter))?.current, { timeout: 10000 })
				.toBe(initial.current + 1);
			await prevButton.click();
			await expect
				.poll(async () => (await readPlotCounter(counter))?.current, { timeout: 10000 })
				.toBe(initial.current);
		}
	});
});
