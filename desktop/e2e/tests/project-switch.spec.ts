import { expect, test } from "@playwright/test";
import { selectors } from "../shared/selectors";

test.describe("Project Switch (Web)", () => {
	test("opens modal and switches to a server project", async ({ page }) => {
		await page.goto("/");

		const fileBrowser = page.locator(selectors.fileBrowser);
		await expect(fileBrowser).toBeVisible({ timeout: 30000 });
		await expect(page.getByText("Connected")).toBeVisible({ timeout: 30000 });
		await page.waitForFunction(() => {
			const helper = (window as { reprodTest?: { isConnected?: () => boolean } }).reprodTest;
			return helper?.isConnected?.();
		});

		await page.keyboard.press("Control+Shift+O");

		const modalTitle = page.getByRole("heading", { name: "Switch Project" });
		await expect(modalTitle).toBeVisible({ timeout: 30000 });

		const alphaItem = page.locator(".project-switch-item", { hasText: "E2E Alpha" });
		await expect(alphaItem).toBeVisible({ timeout: 30000 });
		await alphaItem.click();

		const openButton = page.getByRole("button", { name: "Open Project" });
		await expect(openButton).toBeEnabled();
		await openButton.click();

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
