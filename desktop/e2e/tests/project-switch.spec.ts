import { expect, test } from "@playwright/test";
import { selectors } from "../shared/selectors";

const CONNECTED_TIMEOUT_MS = 240000;

test.describe("Project Switch (Web)", () => {
	test("opens modal and switches to a server project", async ({ page }) => {
		await page.goto("/");

		const fileBrowser = page.locator(selectors.fileBrowser);
		await expect(fileBrowser).toBeVisible({ timeout: CONNECTED_TIMEOUT_MS });
		await expect(page.getByText("Connected", { exact: true })).toBeVisible({
			timeout: CONNECTED_TIMEOUT_MS,
		});
		await page.waitForFunction(
			() => {
				const helper = (window as { reprodTest?: { isConnected?: () => boolean } }).reprodTest;
				return helper?.isConnected?.();
			},
			{ timeout: CONNECTED_TIMEOUT_MS },
		);

		await page.keyboard.press("Control+Shift+O");

		const modalTitle = page.getByRole("heading", { name: "Switch Project" });
		await expect(modalTitle).toBeVisible({ timeout: 30000 });

		const alphaItem = page.locator(".project-switch-item", { hasText: "E2E Alpha" });
		await expect(alphaItem).toBeVisible({ timeout: 30000 });
		await alphaItem.click();

		const openButton = page.getByRole("button", { name: "Open Project" });
		await expect(openButton).toBeEnabled();
		const waitForProjectOpened = page.evaluate(() => {
			const helper = (
				window as {
					reprodTest?: { waitForProjectOpened?: (projectName: string, timeoutMs?: number) => any };
				}
			).reprodTest;
			if (!helper?.waitForProjectOpened) {
				throw new Error("reprodTest waitForProjectOpened not available");
			}
			return helper.waitForProjectOpened("E2E Alpha", 30000);
		});
		await openButton.click();
		await waitForProjectOpened;

		await expect(modalTitle).toBeHidden({ timeout: 30000 });

		const alphaFile = page
			.locator(selectors.fileTreeNode)
			.filter({
				has: page.locator(selectors.fileTreeLabel, { hasText: "alpha.R" }),
			})
			.first();
		await expect(alphaFile).toBeVisible({ timeout: 30000 });
	});
});
