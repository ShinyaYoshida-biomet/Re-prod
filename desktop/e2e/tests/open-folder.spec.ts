import path from "node:path";
import { expect, test } from "@playwright/test";
import { selectors } from "../shared/selectors";

const CONNECTED_TIMEOUT_MS = 240000;

test.describe("Open Folder", () => {
	test("updates file explorer after workspace switch", async ({ page }) => {
		const repoRoot = path.resolve(process.cwd(), "../..");
		const fixtureFolder = path.join(repoRoot, "desktop/e2e/shared/fixtures/open-folder");
		const fixtureFileName = "sample.R";

		await page.goto("/");

		const fileBrowser = page.locator(selectors.fileBrowser);
		await expect(fileBrowser).toBeVisible({ timeout: CONNECTED_TIMEOUT_MS });
		await expect(page.getByText("Connected", { exact: true })).toBeVisible({
			timeout: CONNECTED_TIMEOUT_MS,
		});
		await page.waitForFunction(
			() => {
				const helper = (window as { reprodTest?: { isConnected?: () => boolean } }).reprodTest;
				return helper?.isConnected?.();
			},
			{ timeout: CONNECTED_TIMEOUT_MS },
		);

		const waitForProjectOpened = page.evaluate(() => {
			const helper = (
				window as {
					reprodTest?: { waitForProjectOpened?: (projectName: string, timeoutMs?: number) => any };
				}
			).reprodTest;
			if (!helper?.waitForProjectOpened) {
				throw new Error("reprodTest waitForProjectOpened not available");
			}
			return helper.waitForProjectOpened("open-folder", 30000);
		});

		const didSend = await page.evaluate((folderPath) => {
			const helper = (window as { reprodTest?: { sendMessage: (payload: any) => boolean } })
				.reprodTest;
			if (!helper?.sendMessage) {
				throw new Error("reprodTest helper not available");
			}
			return helper.sendMessage({ type: "project_switch_folder", path: folderPath });
		}, fixtureFolder);
		expect(didSend).toBeTruthy();
		await waitForProjectOpened;

		await expect(page.getByText("Project: open-folder")).toBeVisible({ timeout: 30000 });

		const fixtureLabel = page.locator(selectors.fileTreeLabel).filter({ hasText: fixtureFileName });
		await expect(fixtureLabel).toBeVisible({ timeout: 30000 });

		const repoFile = page.locator(selectors.fileTreeLabel).filter({ hasText: "AGENTS.md" });
		await expect(repoFile).toHaveCount(0);
	});

	test("switches workspace and loads file content", async ({ page }) => {
		const repoRoot = path.resolve(process.cwd(), "../..");
		const fixtureFolder = path.join(repoRoot, "desktop/e2e/shared/fixtures/open-folder");
		const fixtureFileName = "sample.R";
		const fixtureText = "Open folder fixture loaded";

		await page.goto("/");

		const fileBrowser = page.locator(selectors.fileBrowser);
		await expect(fileBrowser).toBeVisible({ timeout: CONNECTED_TIMEOUT_MS });
		await expect(page.getByText("Connected", { exact: true })).toBeVisible({
			timeout: CONNECTED_TIMEOUT_MS,
		});
		await page.waitForFunction(
			() => {
				const helper = (window as { reprodTest?: { isConnected?: () => boolean } }).reprodTest;
				return helper?.isConnected?.();
			},
			{ timeout: CONNECTED_TIMEOUT_MS },
		);

		const waitForProjectOpened = page.evaluate(() => {
			const helper = (
				window as {
					reprodTest?: { waitForProjectOpened?: (projectName: string, timeoutMs?: number) => any };
				}
			).reprodTest;
			if (!helper?.waitForProjectOpened) {
				throw new Error("reprodTest waitForProjectOpened not available");
			}
			return helper.waitForProjectOpened("open-folder", 30000);
		});

		const didSend = await page.evaluate((folderPath) => {
			const helper = (window as { reprodTest?: { sendMessage: (payload: any) => boolean } })
				.reprodTest;
			if (!helper?.sendMessage) {
				throw new Error("reprodTest helper not available");
			}
			return helper.sendMessage({ type: "project_switch_folder", path: folderPath });
		}, fixtureFolder);
		expect(didSend).toBeTruthy();
		await waitForProjectOpened;

		await page.waitForFunction(
			(expected) => {
				const labels = Array.from(document.querySelectorAll(".file-tree-label"));
				return labels.some((label) => label.textContent?.trim() === expected);
			},
			fixtureFileName,
			{ timeout: 30000 },
		);

		const fileNode = page
			.locator(selectors.fileTreeNode)
			.filter({
				has: page.locator(selectors.fileTreeLabel, { hasText: fixtureFileName }),
			})
			.first();
		await expect(fileNode).toBeVisible({ timeout: 30000 });

		const activeTab = page.locator(selectors.tabActive);
		await expect(activeTab).toContainText("Untitled", { timeout: 30000 });

		await fileNode.dblclick();
		await expect(activeTab).toContainText(fixtureFileName, { timeout: 30000 });

		await page.waitForFunction(
			(expected) => {
				const monaco = (window as { monaco?: any }).monaco;
				const editors = monaco?.editor?.getEditors?.() ?? [];
				return (editors[0]?.getValue?.() ?? "").includes(expected);
			},
			fixtureText,
			{ timeout: 30000 },
		);
	});

	test("ignores non-existent folder paths", async ({ page }) => {
		const repoRoot = path.resolve(process.cwd(), "../..");
		const invalidFolder = path.join(repoRoot, "path-does-not-exist");

		await page.goto("/");

		const fileBrowser = page.locator(selectors.fileBrowser);
		await expect(fileBrowser).toBeVisible({ timeout: CONNECTED_TIMEOUT_MS });
		await expect(page.getByText("Connected", { exact: true })).toBeVisible({
			timeout: CONNECTED_TIMEOUT_MS,
		});
		await page.waitForFunction(
			() => {
				const helper = (window as { reprodTest?: { isConnected?: () => boolean } }).reprodTest;
				return helper?.isConnected?.();
			},
			{ timeout: CONNECTED_TIMEOUT_MS },
		);

		const rootLabel = page.locator(selectors.fileTreeLabel).filter({ hasText: "alpha" }).first();
		await expect(rootLabel).toBeVisible({ timeout: CONNECTED_TIMEOUT_MS });

		const didSend = await page.evaluate((folderPath) => {
			const helper = (window as { reprodTest?: { sendMessage: (payload: any) => boolean } })
				.reprodTest;
			if (!helper?.sendMessage) {
				throw new Error("reprodTest helper not available");
			}
			return helper.sendMessage({ type: "project_switch_folder", path: folderPath });
		}, invalidFolder);
		expect(didSend).toBeTruthy();

		await page.waitForTimeout(500);
		await expect(rootLabel).toBeVisible();

		const fixtureLabel = page.locator(selectors.fileTreeLabel).filter({ hasText: "sample.R" });
		await expect(fixtureLabel).toHaveCount(0);
	});
});
