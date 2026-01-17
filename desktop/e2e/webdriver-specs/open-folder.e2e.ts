import assert from "node:assert";
import path from "node:path";
import { TEST_CASES } from "../shared/test-registry";
import {
	getFileTreeLabels,
	openFileInWorkspace,
	switchProjectFolderAndWait,
	waitForFileTreeLabel,
} from "./helpers";

const CONNECTED_TIMEOUT_MS = 240000;
const repoRoot = path.resolve(__dirname, "../../..");
const fileTreeNodeByLabel = (name: string) =>
	browser.$(
		`//div[contains(@class,"file-tree-node")][.//*[contains(@class,"file-tree-label") and normalize-space()="${name}"]]`,
	);
const activeTabLabelSelector = ".tab-bar .tab.active .tab-label";
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
const getActiveTabLabel = async () =>
	(await browser.execute((selector) => {
		return document.querySelector(selector)?.textContent?.trim() ?? "";
	}, activeTabLabelSelector)) as string;
const waitForConnected = async (timeoutMs = CONNECTED_TIMEOUT_MS) => {
	const fileBrowser = await browser.$(".file-browser");
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

describe("Open Folder", () => {
	it(TEST_CASES["open-folder"][0], async () => {
		const fixtureFolder = path.join(repoRoot, "desktop/e2e/shared/fixtures/open-folder");
		const fixtureFileName = "sample.R";

		await waitForConnected(CONNECTED_TIMEOUT_MS);
		await switchProjectFolderAndWait(fixtureFolder, "open-folder", 30000);

		await reloadFileTree();
		await waitForFileTreeLabel(fixtureFileName, 30000);

		const fixtureLabel = await browser.$(
			`//*[contains(@class,"file-tree-label") and normalize-space()="${fixtureFileName}"]`,
		);
		await fixtureLabel.waitForExist({ timeout: 30000 });
		await fixtureLabel.scrollIntoView();

		const repoFileLabels = await browser.$$(
			'//*[contains(@class,"file-tree-label") and normalize-space()="AGENTS.md"]',
		);
		assert.strictEqual(repoFileLabels.length, 0);
	});

	it(TEST_CASES["open-folder"][1], async () => {
		const fixtureFolder = path.join(repoRoot, "desktop/e2e/shared/fixtures/open-folder");
		const fixtureFileName = "sample.R";
		const fixtureText = "Open folder fixture loaded";

		await waitForConnected(CONNECTED_TIMEOUT_MS);
		await switchProjectFolderAndWait(fixtureFolder, "open-folder", 30000);

		await reloadFileTree();
		await waitForFileTreeLabel(fixtureFileName, 30000);
		const fileNode = await fileTreeNodeByLabel(fixtureFileName);
		await fileNode.waitForExist({ timeout: 30000 });
		await fileNode.scrollIntoView();

		await openFileInWorkspace(fixtureFileName);
		await browser.waitUntil(async () => (await getActiveTabLabel()).includes(fixtureFileName), {
			timeout: 30000,
			timeoutMsg: "Expected active tab to update with fixture file",
		});

		await waitForEditorContains(fixtureText);
	});

	it(TEST_CASES["open-folder"][2], async () => {
		const invalidFolder = path.join(repoRoot, "path-does-not-exist");

		await waitForConnected(CONNECTED_TIMEOUT_MS);

		const initialLabels = await getFileTreeLabels();
		assert.ok(initialLabels.length > 0, "Expected file tree to be populated");

		const didSend = await browser.execute((folderPath) => {
			const helper = (window as any).reprodTest as
				| { sendMessage?: (payload: { type: string; path: string }) => boolean }
				| undefined;
			if (!helper?.sendMessage) {
				throw new Error("reprodTest helper not available");
			}
			return helper.sendMessage({ type: "project_switch_folder", path: folderPath });
		}, invalidFolder);
		assert.ok(didSend, "Expected project switch message to be sent");

		await browser.pause(500);
		const labels = await getFileTreeLabels();
		assert.deepStrictEqual(labels, initialLabels);
	});
});
