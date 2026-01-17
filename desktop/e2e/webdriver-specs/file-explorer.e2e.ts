import assert from "node:assert";
import path from "node:path";
import { TEST_CASES } from "../shared/test-registry";
import { openFileInWorkspace, switchProjectFolderAndWait, waitForFileTreeLabel } from "./helpers";

const fileBrowserSelector = ".file-browser";
const activeTabLabelSelector = ".tab-bar .tab.active .tab-label";
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
const getActiveTabLabel = async () =>
	(await browser.execute((selector) => {
		return document.querySelector(selector)?.textContent?.trim() ?? "";
	}, activeTabLabelSelector)) as string;
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

describe("File Explorer", () => {
	it(TEST_CASES["file-explorer"][0], async () => {
		const projectFolder = "alpha";
		const fixtureFileName = "alpha.R";
		const fixturePath = `${projectFolder}/${fixtureFileName}`;
		const fixtureText = "Alpha project loaded";

		await waitForConnected();
		await openFixturesRoot();

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

		await ensureFolderExpanded(projectFolder, fixtureFileName);

		const fixtureNode = await fileTreeNodeByLabel(fixtureFileName);
		await fixtureNode.waitForExist({ timeout: 30000 });
		await fixtureNode.scrollIntoView();
		await openFileInWorkspace(fixturePath);

		await browser.waitUntil(async () => (await getActiveTabLabel()).includes(fixtureFileName), {
			timeout: 30000,
			timeoutMsg: "Active tab should show fixture file",
		});

		await waitForEditorContains(fixtureText);
	});
});
