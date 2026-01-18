import { expect, test } from "@playwright/test";

test.describe("File Operations", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await expect(page.locator(".file-browser")).toBeVisible();
	});

	test("create new file via + button", async ({ page }) => {
		await page.locator('button[title="New File"]').click();

		const dialog = page.locator('[role="dialog"][aria-labelledby="prompt-dialog-title"]');
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText("Enter file name")).toBeVisible();

		const filename = `test-file-${Date.now()}.R`;
		const input = dialog.locator("input.form-input");
		await input.fill(filename);
		await dialog.getByRole("button", { name: "OK" }).click();

		await expect(page.locator(`.file-tree-label:text("${filename}")`)).toBeVisible();
	});

	test("create new folder via folder button", async ({ page }) => {
		await page.locator('button[title="New Folder"]').click();

		const dialog = page.locator('[role="dialog"][aria-labelledby="prompt-dialog-title"]');
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText("Enter folder name")).toBeVisible();

		const folderName = `test-folder-${Date.now()}`;
		const input = dialog.locator("input.form-input");
		await input.fill(folderName);
		await dialog.getByRole("button", { name: "OK" }).click();

		await expect(page.locator(`.file-tree-label:text("${folderName}")`)).toBeVisible();
	});

	test("rename file via context menu", async ({ page }) => {
		// Create file first
		await page.locator('button[title="New File"]').click();
		const dialog = page.locator('[role="dialog"][aria-labelledby="prompt-dialog-title"]');
		await expect(dialog).toBeVisible();

		const filename = `rename-test-${Date.now()}.R`;
		await dialog.locator("input.form-input").fill(filename);
		await dialog.getByRole("button", { name: "OK" }).click();

		const fileLabel = page.locator(`.file-tree-label:text("${filename}")`);
		await expect(fileLabel).toBeVisible();

		// Right click to rename
		await fileLabel.click({ button: "right" });

		// Wait for context menu
		const renameBtn = page.locator('.file-context-menu button:has-text("Rename")');
		await expect(renameBtn).toBeVisible();
		await renameBtn.click();

		// Dialog appears
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText("Enter new name")).toBeVisible();

		// Rename
		const newName = `renamed-${Date.now()}.R`;
		await dialog.locator("input.form-input").fill(newName);
		await dialog.getByRole("button", { name: "OK" }).click();

		// Verify new name
		await expect(page.locator(`.file-tree-label:text("${newName}")`)).toBeVisible();
	});

	test("save untitled file clears dirty state", async ({ page }) => {
		// Click + on Tab bar to create new buffer
		await page.locator('button[aria-label="New file"]').click();

		// Type in editor to make it dirty
		await page.locator(".monaco-editor").first().click();
		await page.keyboard.type('print("hello")');

		// Verify dirty indicator
		await expect(page.locator(".tab-dirty-indicator")).toBeVisible();

		// Trigger Save via Menu: File -> Save
		await page.locator("button.menu-item").filter({ hasText: "File" }).click();
		// Use data-id for precision
		await page.locator('button[data-id="file:save"]').click();

		// Verify dirty indicator gone
		await expect(page.locator(".tab-dirty-indicator")).not.toBeVisible();
	});
});
