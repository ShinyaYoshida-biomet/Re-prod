import assert from "node:assert";
import path from "node:path";
import { TEST_CASES } from "../shared/test-registry";
import { switchProjectFolderAndWait, waitForFileTreeLabel } from "./helpers";

const CONNECTED_TIMEOUT_MS = 240000;
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

describe("Project Switch (Web)", () => {
	it(TEST_CASES["project-switch"][0], async () => {
		await waitForConnected(CONNECTED_TIMEOUT_MS);

		const repoRoot = path.resolve(__dirname, "../../..");
		const fixtureFolder = path.join(repoRoot, "desktop/e2e/shared/fixtures/open-folder");
		await switchProjectFolderAndWait(fixtureFolder, "open-folder", 30000);

		await waitForFileTreeLabel("sample.R", 30000);
		const sampleFile = await browser.$(
			'//div[contains(@class,"file-tree-node")][.//*[contains(@class,"file-tree-label") and normalize-space()="sample.R"]]',
		);
		await sampleFile.waitForExist({ timeout: 30000 });
		await sampleFile.scrollIntoView();
		assert.ok(await sampleFile.isExisting(), "Open-folder project file should be visible");
	});
});
