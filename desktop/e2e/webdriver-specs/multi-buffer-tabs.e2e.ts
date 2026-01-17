import assert from "node:assert";
import path from "node:path";
import { TEST_CASES } from "../shared/test-registry";
import { openFileInWorkspace, switchProjectFolderAndWait, waitForFileTreeLabel } from "./helpers";

const fileBrowserSelector = ".file-browser";
const tabActiveSelector = ".tab-bar .tab.active";
const tabDirtySelector = ".tab-bar .tab.active .tab-dirty-indicator";
const tabCloseSelector = ".tab-bar .tab.active .tab-close";
const fileTreeNodeByLabel = (name: string) =>
	browser.$(
		`//div[contains(@class,"file-tree-node")][.//*[contains(@class,"file-tree-label") and normalize-space()="${name}"]]`,
	);
const waitForEditorContains = async (expected: string, timeoutMs = 30000) => {
	await browser.waitUntil(
		async () =>
			browser.execute((value) => {
				const monaco = (window as any).monaco;
				const editors = monaco?.editor?.getEditors?.() ?? [];
				return (editors[0]?.getValue?.() ?? "").includes(value);
			}, expected),
		{
			timeout: timeoutMs,
			timeoutMsg: `Expected editor to contain "${expected}"`,
		},
	);
};
const CONNECTED_TIMEOUT_MS = 240000;
const repoRoot = path.resolve(__dirname, "../../..");
const waitForConnected = async (timeoutMs = CONNECTED_TIMEOUT_MS) => {
	const fileBrowser = await browser.$(fileBrowserSelector);
	await fileBrowser.waitForDisplayed({ timeout: timeoutMs });

	const connectedStatus = await browser.$('//*[text()="Connected"]');
	await connectedStatus.waitForDisplayed({ timeout: timeoutMs });

	await browser.waitUntil(
		async () =>
			browser.execute(() => {
				const helper = (window as any).reprodTest as { isConnected?: () => boolean } | undefined;
				return helper?.isConnected?.() ?? false;
			}),
		{ timeout: timeoutMs, timeoutMsg: "Expected app to be connected" },
	);
};
const reloadFileTree = async () => {
	await browser.executeAsync((done) => {
		const helper = (window as any).reprodTest as
			| { reloadFileTree?: () => Promise<void> }
			| undefined;
		if (!helper?.reloadFileTree) {
			done(false);
			return;
		}
		Promise.resolve(helper.reloadFileTree())
			.then(() => done(true))
			.catch(() => done(false));
	});
};
const openFixturesRoot = async () => {
	const fixturesRoot = path.join(repoRoot, "desktop/e2e/shared/fixtures/projects");

	await switchProjectFolderAndWait(fixturesRoot, "projects", 30000);
	await reloadFileTree();

	await waitForFileTreeLabel("alpha", 30000);
};

describe("Editor tabs", () => {
	const ensureFolderExpanded = async (name: string, childName: string) => {
		await waitForFileTreeLabel(name, 30000);
		const node = await fileTreeNodeByLabel(name);
		await node.waitForExist({ timeout: 30000 });

		const childNode = await fileTreeNodeByLabel(childName);
		if (!(await childNode.isExisting())) {
			await node.scrollIntoView();
			await node.click();
		}

		await waitForFileTreeLabel(childName, 30000);
		await childNode.waitForExist({ timeout: 30000 });
	};

	const openFixture = async (folderName: string, filename: string) => {
		await ensureFolderExpanded(folderName, filename);

		const fixtureNode = await fileTreeNodeByLabel(filename);
		await fixtureNode.waitForExist({ timeout: 30000 });
		await fixtureNode.scrollIntoView();
		await openFileInWorkspace(`${folderName}/${filename}`);
	};

	const countTabsByName = async (name: string) => {
		const labels = (await browser.execute(() => {
			return Array.from(document.querySelectorAll(".tab-bar .tab .tab-label"))
				.map((label) => label.textContent?.trim() ?? "")
				.filter(Boolean);
		})) as string[];
		return labels.filter((label) => label.includes(name)).length;
	};
	const waitForTabCount = async (name: string, expected: number, timeoutMs = 30000) => {
		await browser.waitUntil(async () => (await countTabsByName(name)) === expected, {
			timeout: timeoutMs,
			timeoutMsg: `Expected ${expected} tab(s) named "${name}"`,
		});
	};

	const tabByName = async (name: string) =>
		browser.$(
			`//div[contains(@class,"tab")][.//span[contains(@class,"tab-label") and normalize-space()="${name}"]]`,
		);

	it(TEST_CASES["multi-buffer-tabs"][0], async () => {
		const firstFile = "alpha.R";
		const secondFile = "beta.R";
		const firstFixtureText = "Alpha project loaded";
		const secondFixtureText = "Beta project loaded";

		await waitForConnected();
		await openFixturesRoot();

		await openFixture("alpha", firstFile);
		await waitForEditorContains(firstFixtureText);
		await waitForTabCount(firstFile, 1);

		await openFixture("beta", secondFile);
		await waitForEditorContains(secondFixtureText);
		await waitForTabCount(secondFile, 1);

		await waitForTabCount(firstFile, 1);
		await waitForTabCount(secondFile, 1);

		await openFixture("alpha", firstFile);
		await waitForTabCount(firstFile, 1);
		await waitForTabCount(secondFile, 1);

		const firstTab = await tabByName(firstFile);
		await firstTab.click();
		await waitForEditorContains(firstFixtureText);

		await browser.execute(() => {
			const monaco = (window as any).monaco;
			const editors = monaco?.editor?.getEditors?.() ?? [];
			if (!editors.length) return false;
			const editor = editors[0];
			editor.setValue(`${editor.getValue()}\n# dirty`);
			editor.focus();
			return true;
		});

		const dirtyIndicator = await browser.$(tabDirtySelector);
		await dirtyIndicator.waitForDisplayed({ timeout: 30000 });

		const closeButton = await browser.$(tabCloseSelector);
		await closeButton.waitForDisplayed({ timeout: 10000 });
		await browser.execute((selector) => {
			const button = document.querySelector(selector) as HTMLButtonElement | null;
			button?.click();
		}, tabCloseSelector);

		const dialog = await browser.$(".confirm-dialog[role='dialog']");
		await dialog.waitForDisplayed({ timeout: 10000 });
		const dialogText = await dialog.getText();
		assert.ok(dialogText.includes(`Save changes to "${firstFile}"?`));

		const cancelButton = await browser.$("button=Cancel");
		await cancelButton.click();
		const activeTab = await browser.$(tabActiveSelector);
		await activeTab.waitForDisplayed({ timeout: 30000 });
		const activeText = await activeTab.getText();
		assert.ok(activeText.includes(firstFile));

		const closeButtonAgain = await browser.$(tabCloseSelector);
		await closeButtonAgain.waitForDisplayed({ timeout: 10000 });
		await browser.execute((selector) => {
			const button = document.querySelector(selector) as HTMLButtonElement | null;
			button?.click();
		}, tabCloseSelector);
		const dontSaveButton = await browser.$('//button[normalize-space()="Don\'t Save"]');
		await dontSaveButton.click();

		await browser.waitUntil(async () => (await countTabsByName(firstFile)) === 0, {
			timeout: 10000,
			timeoutMsg: "Expected first tab to close without saving",
		});
	});
});
