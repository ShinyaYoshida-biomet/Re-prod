import { test, expect } from '@playwright/test';
import { selectors } from '../shared/selectors';
import { executeRCode, waitForConsoleOutput, consoleHasOutput } from '../shared/helpers';

test.describe('R execution flow', () => {
  test('runs a simple expression and shows the result', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.locator(selectors.editor);
    await editor.waitFor({ timeout: 30000 });

    // Execute simple R code
    await executeRCode(page, '1 + 1');

    // Wait for output to appear
    await waitForConsoleOutput(page, '[1] 2', { timeout: 30000 });

    // Verify output is displayed
    const hasOutput = await consoleHasOutput(page, '[1] 2');
    expect(hasOutput).toBeTruthy();
  });

  test('handles multiple expressions', async ({ page }) => {
    await page.goto('/');

    const editor = page.locator(selectors.editor);
    await editor.waitFor({ timeout: 30000 });

    // Execute multiple lines
    const code = `x <- 5
y <- 10
x + y`;

    await executeRCode(page, code);

    // Wait for result
    await waitForConsoleOutput(page, '[1] 15', { timeout: 30000 });

    // Verify output
    const hasOutput = await consoleHasOutput(page, '[1] 15');
    expect(hasOutput).toBeTruthy();
  });

  test('displays formatted output correctly', async ({ page }) => {
    await page.goto('/');

    const editor = page.locator(selectors.editor);
    await editor.waitFor({ timeout: 30000 });

    // Execute code that produces formatted output
    await executeRCode(page, 'print("Hello, Re-prod!")');

    // Wait for output
    await waitForConsoleOutput(page, 'Hello, Re-prod!', { timeout: 30000 });

    // Verify output
    const hasOutput = await consoleHasOutput(page, 'Hello, Re-prod!');
    expect(hasOutput).toBeTruthy();
  });
});
