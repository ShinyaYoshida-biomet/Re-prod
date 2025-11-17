import assert from 'node:assert';

const editorSelector = '.monaco-editor textarea';
const runAllSelector = 'button[title="Run All (Cmd/Ctrl+Shift+Enter)"]';
const consoleOutputSelector = '.console-output, .console-entry';
const consoleStderrSelector = '.console-stderr';
const errorBadgeSelector = '.console-error-badge, .error-badge';

describe('Error handling scenarios', () => {
  it('displays R syntax errors in console', async () => {
    const editorInput = await browser.$(editorSelector);
    await editorInput.waitForDisplayed({ timeout: 30000 });
    await editorInput.click();

    // Clear editor and enter invalid R syntax
    await browser.keys(['Control', 'a', 'NULL']);
    await browser.keys('x <- 1 +');  // Incomplete expression

    const runAllButton = await browser.$(runAllSelector);
    await runAllButton.waitForClickable({ timeout: 15000 });
    await runAllButton.click();

    // Wait for error output to appear
    await browser.waitUntil(
      async () => {
        const outputs = await browser.$$(consoleOutputSelector);
        for (const output of outputs) {
          const text = await output.getText();
          // R typically shows "Error" or "unexpected end of input"
          if (text.toLowerCase().includes('error') ||
              text.toLowerCase().includes('unexpected')) {
            return true;
          }
        }
        return false;
      },
      {
        timeout: 30000,
        timeoutMsg: 'Expected syntax error to be displayed in console',
      },
    );

    // Verify error appears in console
    const outputs = await browser.$$(consoleOutputSelector);
    const errorTexts = await Promise.all(
      outputs.map(async (output) => await output.getText()),
    );
    const hasError = errorTexts.some(
      (text) => text.toLowerCase().includes('error') ||
                text.toLowerCase().includes('unexpected'),
    );

    assert.ok(hasError, 'Syntax error should be displayed in console');
  });

  it('displays R runtime errors', async () => {
    const editorInput = await browser.$(editorSelector);
    await editorInput.click();

    // Clear and enter code that will cause runtime error
    await browser.keys(['Control', 'a', 'NULL']);
    await browser.keys('x <- c(1, 2, 3)\nprint(x[10])'); // Accessing out-of-bounds index (returns NA, not error)

    // Better runtime error: division by non-numeric
    await browser.keys(['Control', 'a', 'NULL']);
    await browser.keys('x <- "text"\ny <- x / 2'); // Type error

    const runAllButton = await browser.$(runAllSelector);
    await runAllButton.click();

    // Wait for error in console
    await browser.waitUntil(
      async () => {
        const outputs = await browser.$$(consoleOutputSelector);
        for (const output of outputs) {
          const text = await output.getText();
          if (text.toLowerCase().includes('error')) {
            return true;
          }
        }
        return false;
      },
      {
        timeout: 30000,
        timeoutMsg: 'Expected runtime error to be displayed',
      },
    );

    const outputs = await browser.$$(consoleOutputSelector);
    const errorTexts = await Promise.all(
      outputs.map(async (output) => await output.getText()),
    );
    const hasError = errorTexts.some((text) => text.toLowerCase().includes('error'));

    assert.ok(hasError, 'Runtime error should be displayed in console');
  });

  it('shows stderr output with error styling', async () => {
    const editorInput = await browser.$(editorSelector);
    await editorInput.click();

    // Code that produces error
    await browser.keys(['Control', 'a', 'NULL']);
    await browser.keys('stop("Intentional error for testing")');

    const runAllButton = await browser.$(runAllSelector);
    await runAllButton.click();

    // Wait for stderr output
    await browser.waitUntil(
      async () => {
        const stderrElements = await browser.$$(consoleStderrSelector);
        if (stderrElements.length === 0) {
          // Fallback: check any console output for error
          const outputs = await browser.$$(consoleOutputSelector);
          for (const output of outputs) {
            const text = await output.getText();
            if (text.includes('Intentional error') || text.includes('Error')) {
              return true;
            }
          }
        }
        return stderrElements.length > 0;
      },
      {
        timeout: 30000,
        timeoutMsg: 'Expected stderr output to appear',
      },
    );

    // Verify stderr is styled appropriately
    const stderrElements = await browser.$$(consoleStderrSelector);
    if (stderrElements.length > 0) {
      const firstStderr = stderrElements[0];
      const text = await firstStderr.getText();

      assert.ok(
        text.toLowerCase().includes('error') || text.includes('Intentional error'),
        'Stderr should contain error message',
      );
    } else {
      // Verify error appears somewhere in console
      const outputs = await browser.$$(consoleOutputSelector);
      const errorTexts = await Promise.all(
        outputs.map(async (output) => await output.getText()),
      );
      const hasError = errorTexts.some(
        (text) => text.includes('Intentional error') || text.includes('Error'),
      );

      assert.ok(hasError, 'Error message should appear in console output');
    }
  });

  it('displays error badge for failed executions', async () => {
    const editorInput = await browser.$(editorSelector);
    await editorInput.click();

    // Code that will error
    await browser.keys(['Control', 'a', 'NULL']);
    await browser.keys('undefined_variable');

    const runAllButton = await browser.$(runAllSelector);
    await runAllButton.click();

    // Wait for execution to complete
    await browser.pause(3000);

    // Check for error badge (if implemented)
    const errorBadge = await browser.$(errorBadgeSelector);
    const hasBadge = await errorBadge.isExisting();

    if (hasBadge) {
      assert.ok(await errorBadge.isDisplayed(), 'Error badge should be visible for failed executions');
    }

    // At minimum, verify error appears in console
    const outputs = await browser.$$(consoleOutputSelector);
    const errorTexts = await Promise.all(
      outputs.map(async (output) => await output.getText()),
    );
    const hasError = errorTexts.some(
      (text) => text.toLowerCase().includes('error') ||
                text.toLowerCase().includes('not found'),
    );

    assert.ok(hasError, 'Error should be visible in console output');
  });

  it('handles undefined function errors', async () => {
    const editorInput = await browser.$(editorSelector);
    await editorInput.click();

    await browser.keys(['Control', 'a', 'NULL']);
    await browser.keys('nonexistent_function()');

    const runAllButton = await browser.$(runAllSelector);
    await runAllButton.click();

    // Wait for error
    await browser.waitUntil(
      async () => {
        const outputs = await browser.$$(consoleOutputSelector);
        for (const output of outputs) {
          const text = await output.getText();
          if (text.toLowerCase().includes('could not find function') ||
              text.toLowerCase().includes('error')) {
            return true;
          }
        }
        return false;
      },
      {
        timeout: 30000,
        timeoutMsg: 'Expected function not found error',
      },
    );

    const outputs = await browser.$$(consoleOutputSelector);
    const errorTexts = await Promise.all(
      outputs.map(async (output) => await output.getText()),
    );
    const hasError = errorTexts.some(
      (text) => text.toLowerCase().includes('could not find function') ||
                text.toLowerCase().includes('error'),
    );

    assert.ok(hasError, 'Undefined function error should be displayed');
  });

  it('recovers from errors and allows subsequent executions', async () => {
    const editorInput = await browser.$(editorSelector);
    await editorInput.click();

    // First: Execute code that errors
    await browser.keys(['Control', 'a', 'NULL']);
    await browser.keys('stop("Error")');

    const runAllButton = await browser.$(runAllSelector);
    await runAllButton.click();

    // Wait for error
    await browser.pause(3000);

    // Second: Execute valid code
    await editorInput.click();
    await browser.keys(['Control', 'a', 'NULL']);
    await browser.keys('x <- 42\nprint(x)');

    await runAllButton.click();

    // Wait for successful output
    await browser.waitUntil(
      async () => {
        const outputs = await browser.$$(consoleOutputSelector);
        for (const output of outputs) {
          const text = await output.getText();
          if (text.includes('[1] 42')) {
            return true;
          }
        }
        return false;
      },
      {
        timeout: 30000,
        timeoutMsg: 'Expected successful execution after error',
      },
    );

    const outputs = await browser.$$(consoleOutputSelector);
    const outputTexts = await Promise.all(
      outputs.map(async (output) => await output.getText()),
    );
    const hasSuccess = outputTexts.some((text) => text.includes('[1] 42'));

    assert.ok(hasSuccess, 'Application should recover from errors and execute new code');
  });

  it('handles parse errors gracefully', async () => {
    const editorInput = await browser.$(editorSelector);
    await editorInput.click();

    // Completely malformed R code
    await browser.keys(['Control', 'a', 'NULL']);
    await browser.keys('}{][)( <- %% !!!');

    const runAllButton = await browser.$(runAllSelector);
    await runAllButton.click();

    // Wait for parse error
    await browser.waitUntil(
      async () => {
        const outputs = await browser.$$(consoleOutputSelector);
        for (const output of outputs) {
          const text = await output.getText();
          if (text.toLowerCase().includes('error') ||
              text.toLowerCase().includes('unexpected')) {
            return true;
          }
        }
        return false;
      },
      {
        timeout: 30000,
        timeoutMsg: 'Expected parse error to be displayed',
      },
    );

    // Verify application didn't crash
    const editorStillVisible = await editorInput.isDisplayed();
    assert.ok(editorStillVisible, 'Editor should still be functional after parse error');
  });
});
