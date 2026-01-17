import assert from "node:assert";
import { TEST_CASES } from "../shared/test-registry";
import { selectors } from "../shared/selectors";

const openTerminalPane = async () => {
	await browser.execute(() => {
		window.dispatchEvent(new Event("terminal:focus"));
	});
	const terminalPane = await browser.$(selectors.terminalPane);
	await terminalPane.waitForDisplayed({ timeout: 10000 });
	return terminalPane;
};

const openTerminalSession = async () => {
	const newTerminalButton = await browser.$(selectors.newTerminalButton);
	await newTerminalButton.waitForDisplayed({ timeout: 10000 });
	const initialTabs = await browser.$$(selectors.terminalTab);
	const initialCount = initialTabs.length;

	await browser.execute((selector) => {
		const button = document.querySelector(selector) as HTMLButtonElement | null;
		button?.click();
	}, selectors.newTerminalButton);

	await browser.waitUntil(
		async () => (await browser.$$(selectors.terminalTab)).length > initialCount,
		{
			timeout: 10000,
			timeoutMsg: "Expected a new terminal tab to be created",
		},
	);

	const terminalTabs = await browser.$$(selectors.terminalTab);
	const terminalTab = terminalTabs[terminalTabs.length - 1];
	await terminalTab.waitForDisplayed({ timeout: 10000 });
	await terminalTab.click();

	const terminalSession = await browser.$(".terminal-session--active .terminal-session__term");
	await terminalSession.waitForDisplayed({ timeout: 10000 });
};

const focusTerminalInput = async () => {
	const terminalContainer = await browser.$(".terminal-session--active .terminal-session__term");
	await terminalContainer.waitForDisplayed({ timeout: 10000 });
	await terminalContainer.click();
	const terminalInput = await browser.$(".terminal-session--active .xterm-helper-textarea");
	await terminalInput.waitForExist({ timeout: 10000 });
	await browser.waitUntil(
		async () =>
			browser.execute(() => {
				const input = document.querySelector(
					".terminal-session--active .xterm-helper-textarea",
				) as HTMLTextAreaElement | null;
				if (!input) {
					return false;
				}
				input.focus();
				return document.activeElement === input;
			}),
		{ timeout: 10000, timeoutMsg: "Terminal input not focused" },
	);
	return terminalInput;
};

const runTerminalCommand = async (command: string) => {
	const terminalInput = await focusTerminalInput();
	await terminalInput.addValue(command);
	await terminalInput.addValue("\n");
};
const getTerminalOutput = async () =>
	(await browser.execute(() => {
		const helper = (window as any).reprodTest as { getTerminalOutput?: () => string } | undefined;
		return helper?.getTerminalOutput?.() ?? "";
	})) as string;
const countMatches = (value: string, needle: string) => value.split(needle).length - 1;

describe("Terminal integration", () => {
	it(TEST_CASES["terminal"][0], async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		// Open terminal pane
		await openTerminalPane();
		await openTerminalSession();
		await browser.execute(() => {
			const helper = (window as any).reprodTest as { clearTerminalOutput?: () => void } | undefined;
			helper?.clearTerminalOutput?.();
		});

		// Verify terminal pane is visible
		const terminalPane = await browser.$(selectors.terminalPane);
		await terminalPane.waitForDisplayed({ timeout: 10000 });
		const isVisible = await terminalPane.isDisplayed();
		assert.ok(isVisible, "Terminal pane should be visible");
	});

	it(TEST_CASES["terminal"][1], async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		// Open terminal
		await openTerminalPane();
		await openTerminalSession();
		await browser.execute(() => {
			const helper = (window as any).reprodTest as { clearTerminalOutput?: () => void } | undefined;
			helper?.clearTerminalOutput?.();
		});

		// Execute shell command
		await runTerminalCommand("echo 'Hello from terminal'");

		// Verify output is displayed
		await browser.waitUntil(
			async () => (await getTerminalOutput()).includes("Hello from terminal"),
			{
				timeout: 10000,
				timeoutMsg: "Terminal output should contain the command result",
			},
		);
	});

	it(TEST_CASES["terminal"][2], async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		// Open terminal
		await openTerminalPane();
		await openTerminalSession();
		await browser.execute(() => {
			const helper = (window as any).reprodTest as { clearTerminalOutput?: () => void } | undefined;
			helper?.clearTerminalOutput?.();
		});

		// Execute first command
		await runTerminalCommand("echo 'first command'");

		await browser.pause(500);

		// Execute second command
		await runTerminalCommand("echo 'second command'");

		await browser.pause(500);

		// Press up arrow to navigate history and execute
		const beforeOutput = await getTerminalOutput();
		await focusTerminalInput();
		await browser.keys("ArrowUp");
		await browser.keys("Enter");

		await browser.waitUntil(async () => (await getTerminalOutput()).length > beforeOutput.length, {
			timeout: 10000,
			timeoutMsg: "History should allow re-running previous command",
		});
	});

	it(TEST_CASES["terminal"][3], async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		// Open terminal
		await openTerminalPane();
		await openTerminalSession();
		await browser.execute(() => {
			const helper = (window as any).reprodTest as { clearTerminalOutput?: () => void } | undefined;
			helper?.clearTerminalOutput?.();
		});

		const terminalInput = await focusTerminalInput();

		// Test paste operation
		const testText = "echo 'pasted text'";
		await terminalInput.addValue(testText);
		await terminalInput.addValue("\n");
		await browser.pause(1000);

		// Verify output is visible
		await browser.waitUntil(async () => (await getTerminalOutput()).includes("pasted text"), {
			timeout: 10000,
			timeoutMsg: "Terminal output should include pasted text",
		});
	});

	it(TEST_CASES["terminal"][4], async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		// Open first terminal
		await openTerminalPane();
		await openTerminalSession();

		// Verify first terminal tab exists
		const firstTerminalTab = await browser.$(selectors.terminalTab);
		await firstTerminalTab.waitForDisplayed({ timeout: 10000 });

		// Open second terminal
		await openTerminalSession();
		await browser.pause(500);

		// Verify second terminal tab exists
		const tabCount = (await browser.execute(() => {
			return document.querySelectorAll(".terminal-pane__tabs .tab").length;
		})) as number;
		assert.ok(tabCount >= 2, "Should have at least 2 terminal tabs");
	});

	it(TEST_CASES["terminal"][5], async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		// Open terminal
		await openTerminalPane();
		await openTerminalSession();

		// Get initial terminal count
		const terminalTabs = await browser.$$(selectors.terminalTab);
		const initialCount = terminalTabs.length;

		// Close terminal
		const terminalClose = await browser.$(selectors.terminalClose);
		await terminalClose.waitForDisplayed({ timeout: 10000 });
		await browser.execute((selector) => {
			const button = document.querySelector(selector) as HTMLButtonElement | null;
			button?.click();
		}, selectors.terminalClose);

		// Wait for close animation
		await browser.pause(500);

		const terminalPane = await browser.$(selectors.terminalPane);
		await browser.waitUntil(
			async () => {
				const finalTabs = await browser.$$(selectors.terminalTab);
				const finalCount = finalTabs.length;
				const isPaneVisible = await terminalPane.isDisplayed();
				return finalCount < initialCount || !isPaneVisible;
			},
			{ timeout: 10000, timeoutMsg: "Terminal should be closed" },
		);
	});
});
