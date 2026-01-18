import { expect, test } from "@playwright/test";

test.describe("File Operations", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		// Wait for file tree to load
		await expect(page.locator(".file-browser")).toBeVisible();
	});

	test("create new file via + button", async ({ page }) => {
		// Click + button
		await page.locator('button[title="New File"]').click();

		// Check if PromptDialog appears
		const dialog = page.locator('[role="dialog"][aria-labelledby="prompt-dialog-title"]');
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText("Enter new file name")).toBeVisible();

		// Enter filename
		const filename = `test-file-${Date.now()}.R`;
		const input = dialog.locator("input.form-input");
		await input.fill(filename);
		await dialog.getByRole("button", { name: "OK" }).click();

		// Verify file appears in tree
		await expect(page.locator(`.file-tree-label:text("${filename}")`)).toBeVisible();
	});

	test("create new folder via folder button", async ({ page }) => {
		// Click Folder button
		await page.locator('button[title="New Folder"]').click();

		// Check if PromptDialog appears
		const dialog = page.locator('[role="dialog"][aria-labelledby="prompt-dialog-title"]');
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText("Enter new folder name")).toBeVisible();

		// Enter folder name
		const folderName = `test-folder-${Date.now()}`;
		const input = dialog.locator("input.form-input");
		await input.fill(folderName);
		await dialog.getByRole("button", { name: "OK" }).click();

		// Verify folder appears in tree
		await expect(page.locator(`.file-tree-label:text("${folderName}")`)).toBeVisible();
	});
});
