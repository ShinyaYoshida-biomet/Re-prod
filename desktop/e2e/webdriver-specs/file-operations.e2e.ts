import { expect } from "@wdio/globals";

describe("File Operations", () => {
	beforeEach(async () => {
		const fileBrowser = await $("div.file-browser");
		await fileBrowser.waitForDisplayed();
	});

	it("creates a new file via + button", async () => {
		const plusBtn = await $('button[title="New File"]');
		await plusBtn.click();

		const dialog = await $('[role="dialog"][aria-labelledby="prompt-dialog-title"]');
		await dialog.waitForDisplayed();

		const input = await dialog.$("input.form-input");
		const filename = `desktop-test-file-${Date.now()}.R`;
		await input.setValue(filename);

		const okBtn = await dialog.$("button=OK");
		await okBtn.click();

		const fileLabel = await $(`.file-tree-label=${filename}`);
		await fileLabel.waitForDisplayed();
		await expect(fileLabel).toBeDisplayed();
	});

	it("creates a new folder via folder button", async () => {
		const folderBtn = await $('button[title="New Folder"]');
		await folderBtn.click();

		const dialog = await $('[role="dialog"][aria-labelledby="prompt-dialog-title"]');
		await dialog.waitForDisplayed();

		const input = await dialog.$("input.form-input");
		const folderName = `desktop-test-folder-${Date.now()}`;
		await input.setValue(folderName);

		const okBtn = await dialog.$("button=OK");
		await okBtn.click();

		const folderLabel = await $(`.file-tree-label=${folderName}`);
		await folderLabel.waitForDisplayed();
		await expect(folderLabel).toBeDisplayed();
	});

	it("renames a file via context menu", async () => {
		// Create file first
		const plusBtn = await $('button[title="New File"]');
		await plusBtn.click();
		const dialog = await $('[role="dialog"][aria-labelledby="prompt-dialog-title"]');
		await dialog.waitForDisplayed();
		const input = await dialog.$("input.form-input");
		const filename = `desktop-rename-${Date.now()}.R`;
		await input.setValue(filename);
		await dialog.$("button=OK").click();

		const fileLabel = await $(`.file-tree-label=${filename}`);
		await fileLabel.waitForDisplayed();

		// Right click
		await fileLabel.click({ button: 2 }); // 2 = right click

		// Wait for context menu
		const menu = await $(".file-context-menu");
		await menu.waitForDisplayed();

		// Click Rename
		const renameBtn = await menu.$("button=Rename");
		await renameBtn.click();

		// Dialog
		await dialog.waitForDisplayed();
		const newName = `desktop-renamed-${Date.now()}.R`;
		await dialog.$("input.form-input").setValue(newName);
		await dialog.$("button=OK").click();

		// Verify
		const newLabel = await $(`.file-tree-label=${newName}`);
		await newLabel.waitForDisplayed();
		await expect(newLabel).toBeDisplayed();
	});
});
