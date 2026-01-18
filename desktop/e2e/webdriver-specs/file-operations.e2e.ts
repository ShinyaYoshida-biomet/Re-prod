import { expect } from "@wdio/globals";

describe("File Operations", () => {
	beforeEach(async () => {
		// Ensure app is loaded
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

		// Wait for file in tree
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

		// Wait for folder in tree
		const folderLabel = await $(`.file-tree-label=${folderName}`);
		await folderLabel.waitForDisplayed();
		await expect(folderLabel).toBeDisplayed();
	});
});
