import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	clickRunAll,
	closeDialog,
	openExportDialog,
	openFixturesProject,
	setEditorValue,
	waitForConnected,
} from "./helpers";
import { TEST_CASES } from "../shared/test-registry";

const editorSelector = ".monaco-editor textarea";
const exportDialogSelector = ".export-dialog";
const exportButtonSelector = '.export-dialog button[type="submit"], .export-dialog .btn-primary';
const consoleOutputSelector = ".console-stdout";

describe("Export functionality", () => {
	let tempDir: string;

	before(() => {
		// Create temporary directory for export tests
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reprod-e2e-export-"));
	});

	after(() => {
		// Cleanup temporary directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	beforeEach(async () => {
		const editorInput = await browser.$(editorSelector);
		await editorInput.waitForDisplayed({ timeout: 30000 });
		await waitForConnected();
	});

	before(async () => {
		await openFixturesProject();
	});

	it(TEST_CASES["export"][0], async () => {
		// Execute some R code first
		await setEditorValue("# Export test\nresult <- mean(c(1, 2, 3, 4, 5))\nprint(result)");

		await clickRunAll();

		// Wait for execution to complete
		await browser.waitUntil(
			async () => {
				const outputs = await browser.$$(consoleOutputSelector);
				for (const output of outputs) {
					const text = await output.getText();
					if (text.includes("[1] 3")) {
						return true;
					}
				}
				return false;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected code execution to complete",
			},
		);

		const exportDialog = await openExportDialog();

		// Verify dialog is visible
		const isDialogVisible = await exportDialog.isDisplayed();
		assert.ok(isDialogVisible, "Export dialog should be visible");

		// Verify export format options exist
		const rmarkdownRadio = await browser.$('input[value="rmarkdown"]');
		const pdfRadio = await browser.$('input[value="pdf"]');
		const bothRadio = await browser.$('input[value="both"]');

		const formatOptionCount =
			Number(await rmarkdownRadio.isExisting()) +
			Number(await pdfRadio.isExisting()) +
			Number(await bothRadio.isExisting());
		assert.ok(formatOptionCount > 0, "At least one export format option should exist");

		// Close dialog
		await closeDialog(exportDialogSelector, ".export-dialog-overlay");
	});

	it(TEST_CASES["export"][1], async () => {
		await openExportDialog();

		// Test selecting RMarkdown format
		const rmarkdownRadio = await browser.$('input[value="rmarkdown"]');
		if (await rmarkdownRadio.isExisting()) {
			await rmarkdownRadio.click();

			// Verify selection
			const isRmarkdownChecked = await rmarkdownRadio.isSelected();
			assert.ok(isRmarkdownChecked, "RMarkdown format should be selectable");
		}

		// Test selecting PDF format
		const pdfRadio = await browser.$('input[value="pdf"]');
		if (await pdfRadio.isExisting()) {
			await pdfRadio.click();

			const isPdfChecked = await pdfRadio.isSelected();
			assert.ok(isPdfChecked, "PDF format should be selectable");
		}

		// Test selecting both formats
		const bothRadio = await browser.$('input[value="both"]');
		if (await bothRadio.isExisting()) {
			await bothRadio.click();

			const isBothChecked = await bothRadio.isSelected();
			assert.ok(isBothChecked, "Both formats option should be selectable");
		}

		// Close dialog
		await closeDialog(exportDialogSelector, ".export-dialog-overlay");
	});

	it(TEST_CASES["export"][2], async () => {
		await openExportDialog();

		// Check for mode selection options
		const timelineMode = await browser.$('input[value="timeline"]');
		const documentMode = await browser.$('input[value="document"]');

		const hasTimelineMode = await timelineMode.isExisting();
		const hasDocumentMode = await documentMode.isExisting();

		// At least one mode should be available
		assert.ok(hasTimelineMode || hasDocumentMode, "Export modes should be available");

		if (hasTimelineMode) {
			await timelineMode.click();
			assert.ok(await timelineMode.isSelected(), "Timeline mode should be selectable");
		}

		if (hasDocumentMode) {
			await documentMode.click();
			assert.ok(await documentMode.isSelected(), "Document mode should be selectable");
		}

		// Close dialog
		await closeDialog(exportDialogSelector, ".export-dialog-overlay");
	});

	it(TEST_CASES["export"][3], async () => {
		const exportDialog = await openExportDialog();

		const inputs = await exportDialog.$$("input");
		assert.ok(inputs.length > 0, "Export dialog should contain inputs");

		// Close dialog
		await closeDialog(exportDialogSelector, ".export-dialog-overlay");
	});

	it(TEST_CASES["export"][5], async () => {
		const exportDialog = await openExportDialog();

		// Try to export with invalid/empty path (if path input exists)
		let pathInput = await exportDialog.$("#outputPath");
		if (!(await pathInput.isExisting())) {
			pathInput = await exportDialog.$('input[type="text"], input[placeholder*="path"]');
		}
		const pathInputExists = await pathInput.isExisting();

		if (pathInputExists) {
			await pathInput.click();
			await browser.keys(["Control", "a", "NULL"]);
			// WebDriverIO setValue("") can throw "Missing text parameter" on some drivers.
			await browser.execute(
				(input?: HTMLInputElement | null) => {
					if (!input) return false;
					input.value = "";
					input.dispatchEvent(new Event("input", { bubbles: true }));
					input.dispatchEvent(new Event("change", { bubbles: true }));
					return true;
				},
				await pathInput,
			);

			// Try to click export button
			const exportBtn = await exportDialog.$(exportButtonSelector);
			if (await exportBtn.isExisting()) {
				await exportBtn.click();

				// Wait a moment for potential error message
				await browser.pause(1000);

				// Check if error message appears (dialog may close on failure)
				const errorMessage = await browser.$('.export-error, .error-message, [role="alert"]');
				const hasError = await errorMessage.isExisting();

				// If dialog is still open, button should remain disabled or error appears.
				const dialogStillOpen = await browser.$(exportDialogSelector).isExisting();
				const isButtonDisabled = dialogStillOpen ? !(await exportBtn.isEnabled()) : false;

				assert.ok(hasError || isButtonDisabled, "Export should handle invalid input gracefully");
			}
		}

		// Close dialog
		await closeDialog(exportDialogSelector, ".export-dialog-overlay");
	});

	it(TEST_CASES["export"][4], async () => {
		const exportDialog = await openExportDialog();

		const requiredInputs = await exportDialog.$$("input[required]");
		if (requiredInputs.length > 0) {
			const exportBtn = await exportDialog.$(exportButtonSelector);
			if (await exportBtn.isExisting()) {
				await exportBtn.click();
				await browser.pause(500);

				const dialogStillOpen = await browser.$(exportDialogSelector).isExisting();
				assert.ok(dialogStillOpen, "Export dialog should remain open on invalid input");
			}
		}

		// Close dialog
		await closeDialog(exportDialogSelector, ".export-dialog-overlay");
	});
});
