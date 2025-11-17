import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const editorSelector = '.monaco-editor textarea';
const runAllSelector = 'button[title="Run All (Cmd/Ctrl+Shift+Enter)"]';
const exportDialogSelector = '.export-dialog';
const exportButtonSelector = '.export-dialog button[type="submit"], .export-dialog .btn-primary';
const consoleOutputSelector = '.console-stdout';

describe('Export functionality', () => {
  let tempDir: string;

  before(() => {
    // Create temporary directory for export tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reprod-e2e-export-'));
  });

  after(() => {
    // Cleanup temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('opens export dialog and displays export options', async () => {
    // Execute some R code first
    const editorInput = await browser.$(editorSelector);
    await editorInput.waitForDisplayed({ timeout: 30000 });
    await editorInput.click();

    await browser.keys(['Control', 'a', 'NULL']);
    await browser.keys('# Export test\nresult <- mean(c(1, 2, 3, 4, 5))\nprint(result)');

    const runAllButton = await browser.$(runAllSelector);
    await runAllButton.waitForClickable({ timeout: 15000 });
    await runAllButton.click();

    // Wait for execution to complete
    await browser.waitUntil(
      async () => {
        const outputs = await browser.$$(consoleOutputSelector);
        for (const output of outputs) {
          const text = await output.getText();
          if (text.includes('[1] 3')) {
            return true;
          }
        }
        return false;
      },
      {
        timeout: 30000,
        timeoutMsg: 'Expected code execution to complete',
      },
    );

    // Open export dialog via browser.execute
    await browser.execute(() => {
      (window as any).openExportDialog?.();
    });

    // Wait for export dialog to appear
    const exportDialog = await browser.$(exportDialogSelector);
    await exportDialog.waitForDisplayed({ timeout: 10000 });

    // Verify dialog is visible
    const isDialogVisible = await exportDialog.isDisplayed();
    assert.ok(isDialogVisible, 'Export dialog should be visible');

    // Verify export format options exist
    const bundleRadio = await browser.$('input[value="bundle"]');
    const rmarkdownRadio = await browser.$('input[value="rmarkdown"]');
    const bothRadio = await browser.$('input[value="both"]');

    assert.ok(await bundleRadio.isExisting(), 'Bundle format option should exist');
    assert.ok(await rmarkdownRadio.isExisting(), 'RMarkdown format option should exist');
    assert.ok(await bothRadio.isExisting(), 'Both format option should exist');

    // Close dialog with ESC key
    await browser.keys('Escape');

    // Verify dialog is closed
    await browser.waitUntil(
      async () => {
        return !(await exportDialog.isDisplayed());
      },
      {
        timeout: 5000,
        timeoutMsg: 'Export dialog should close after pressing ESC',
      },
    );
  });

  it('allows selecting different export formats', async () => {
    // Open export dialog
    await browser.execute(() => {
      (window as any).openExportDialog?.();
    });

    const exportDialog = await browser.$(exportDialogSelector);
    await exportDialog.waitForDisplayed({ timeout: 10000 });

    // Test selecting RMarkdown format
    const rmarkdownRadio = await browser.$('input[value="rmarkdown"]');
    await rmarkdownRadio.click();

    // Verify selection
    const isRmarkdownChecked = await rmarkdownRadio.isSelected();
    assert.ok(isRmarkdownChecked, 'RMarkdown format should be selectable');

    // Test selecting Bundle format
    const bundleRadio = await browser.$('input[value="bundle"]');
    await bundleRadio.click();

    const isBundleChecked = await bundleRadio.isSelected();
    assert.ok(isBundleChecked, 'Bundle format should be selectable');

    // Close dialog
    await browser.keys('Escape');
  });

  it('displays export modes (standalone/linked)', async () => {
    // Open export dialog
    await browser.execute(() => {
      (window as any).openExportDialog?.();
    });

    const exportDialog = await browser.$(exportDialogSelector);
    await exportDialog.waitForDisplayed({ timeout: 10000 });

    // Check for mode selection options
    const standaloneMode = await browser.$('input[value="standalone"]');
    const linkedMode = await browser.$('input[value="linked"]');

    const hasStandaloneMode = await standaloneMode.isExisting();
    const hasLinkedMode = await linkedMode.isExisting();

    // At least one mode should be available
    assert.ok(
      hasStandaloneMode || hasLinkedMode,
      'Export modes should be available',
    );

    // Close dialog
    await browser.keys('Escape');
  });

  it('shows export button and validates form', async () => {
    // Open export dialog
    await browser.execute(() => {
      (window as any).openExportDialog?.();
    });

    const exportDialog = await browser.$(exportDialogSelector);
    await exportDialog.waitForDisplayed({ timeout: 10000 });

    // Find export button
    const exportBtn = await browser.$(exportButtonSelector);
    const buttonExists = await exportBtn.isExisting();

    if (buttonExists) {
      // Verify button is displayed
      assert.ok(await exportBtn.isDisplayed(), 'Export button should be visible');

      // Check if button text is appropriate
      const buttonText = await exportBtn.getText();
      assert.ok(
        buttonText.toLowerCase().includes('export') ||
          buttonText.toLowerCase().includes('save'),
        'Export button should have appropriate text',
      );
    }

    // Close dialog
    await browser.keys('Escape');
  });

  it('handles export errors gracefully', async () => {
    // Open export dialog
    await browser.execute(() => {
      (window as any).openExportDialog?.();
    });

    const exportDialog = await browser.$(exportDialogSelector);
    await exportDialog.waitForDisplayed({ timeout: 10000 });

    // Try to export with invalid/empty path (if path input exists)
    const pathInput = await browser.$('input[type="text"], input[placeholder*="path"]');
    const pathInputExists = await pathInput.isExisting();

    if (pathInputExists) {
      await pathInput.click();
      await browser.keys(['Control', 'a', 'NULL']);
      await browser.keys(''); // Clear input

      // Try to click export button
      const exportBtn = await browser.$(exportButtonSelector);
      if (await exportBtn.isExisting()) {
        await exportBtn.click();

        // Wait a moment for potential error message
        await browser.pause(1000);

        // Check if error message appears or button is disabled
        const errorMessage = await browser.$('.export-error, .error-message, [role="alert"]');
        const hasError = await errorMessage.isExisting();

        // Either error message should appear OR button should remain disabled
        const isButtonDisabled = !(await exportBtn.isEnabled());

        assert.ok(
          hasError || isButtonDisabled,
          'Export should handle invalid input gracefully',
        );
      }
    }

    // Close dialog
    await browser.keys('Escape');
  });

  it('displays RMarkdown-specific options when RMarkdown is selected', async () => {
    // Open export dialog
    await browser.execute(() => {
      (window as any).openExportDialog?.();
    });

    const exportDialog = await browser.$(exportDialogSelector);
    await exportDialog.waitForDisplayed({ timeout: 10000 });

    // Select RMarkdown format
    const rmarkdownRadio = await browser.$('input[value="rmarkdown"]');
    await rmarkdownRadio.click();

    // Wait for options to appear
    await browser.pause(500);

    // Check for RMarkdown-specific options (like document template)
    const rmdOptions = await browser.$$('.export-section label, .export-checkbox');

    // Should have some configuration options
    assert.ok(
      rmdOptions.length > 0,
      'RMarkdown format should show additional options',
    );

    // Close dialog
    await browser.keys('Escape');
  });
});
