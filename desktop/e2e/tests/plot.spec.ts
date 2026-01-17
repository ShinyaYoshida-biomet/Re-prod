import { expect, test } from "@playwright/test";
import { executeRCode, waitForElement } from "../shared/helpers";
import { selectors } from "../shared/selectors";
import { TEST_CASES } from "../shared/test-registry";

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
		expect(await counter.textContent()).toContain("1 / 2");

		const nextButton = page.locator(selectors.plotNextButton);
		await nextButton.click();
		expect(await counter.textContent()).toContain("2 / 2");

		const prevButton = page.locator(selectors.plotPrevButton);
		await prevButton.click();
		expect(await counter.textContent()).toContain("1 / 2");
	});
});
