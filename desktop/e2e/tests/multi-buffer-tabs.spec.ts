import { expect, test, type Page } from "@playwright/test";
import { waitForAppConnected } from "../shared/helpers";
import { selectors } from "../shared/selectors";

test.describe("Editor tabs", () => {
	const fileTreeNodeAtDepth = (page: Page, name: string, depth: number) => {
		const padding = depth * 16 + 12;
		return page.locator(`${selectors.fileTreeNode}[style*="padding-left: ${padding}px"]`).filter({
			has: page.locator(selectors.fileTreeLabel, { hasText: name }),
		});
	};

	const fileTreeNodeByLabel = (page: Page, name: string) =>
		page
			.locator(selectors.fileTreeNode)
			.filter({ has: page.locator(selectors.fileTreeLabel, { hasText: name }) });

	const ensureFolderExpanded = async (
		page: Page,
		name: string,
		depth: number,
		childName: string,
		childDepth: number,
	) => {
		const node = fileTreeNodeAtDepth(page, name, depth).first();
		await expect(node).toBeVisible({ timeout: 30000 });

		const childNode = fileTreeNodeAtDepth(page, childName, childDepth);
		if ((await childNode.count()) === 0) {
			await node.click();
		}

		await expect(childNode.first()).toBeVisible({ timeout: 30000 });
	};

	const openFixture = async (page: Page, folderName: string, filename: string) => {
		await ensureFolderExpanded(page, folderName, 0, filename, 1);

		const fixtureNode = fileTreeNodeByLabel(page, filename).first();
		await expect(fixtureNode).toBeVisible({ timeout: 30000 });
		await fixtureNode.dblclick();
	};

	test("opens multiple files in tabs and handles dirty close", async ({ page }) => {
		const firstFile = "alpha.R";
		const secondFile = "beta.R";
		const firstFixtureText = "Alpha project loaded";
		const secondFixtureText = "Beta project loaded";

		await page.goto("/");
		await waitForAppConnected(page);
		await expect(page.locator(selectors.fileBrowser)).toBeVisible({ timeout: 30000 });

		await openFixture(page, "alpha", firstFile);
		await page.waitForFunction(
			(expected) => {
				const monaco = (window as { monaco?: any }).monaco;
				const editors = monaco?.editor?.getEditors?.() ?? [];
				return (editors[0]?.getValue?.() ?? "").includes(expected);
			},
			firstFixtureText,
			{ timeout: 30000 },
		);
		await openFixture(page, "beta", secondFile);
		await expect(page.locator(selectors.tab).filter({ hasText: secondFile })).toHaveCount(1);
		await page.waitForFunction(
			(expected) => {
				const monaco = (window as { monaco?: any }).monaco;
				const editors = monaco?.editor?.getEditors?.() ?? [];
				return (editors[0]?.getValue?.() ?? "").includes(expected);
			},
			secondFixtureText,
			{ timeout: 30000 },
		);

		const tabs = page.locator(selectors.tab);
		await expect(tabs.filter({ hasText: firstFile })).toHaveCount(1);
		await expect(tabs.filter({ hasText: secondFile })).toHaveCount(1);

		await openFixture(page, "alpha", firstFile);
		await expect(tabs.filter({ hasText: firstFile })).toHaveCount(1);
		await expect(tabs.filter({ hasText: secondFile })).toHaveCount(1);

		await page.locator(selectors.tab).filter({ hasText: firstFile }).first().click();
		await page.waitForFunction(
			(expected) => {
				const monaco = (window as { monaco?: any }).monaco;
				const editors = monaco?.editor?.getEditors?.() ?? [];
				return (editors[0]?.getValue?.() ?? "").includes(expected);
			},
			firstFixtureText,
			{ timeout: 30000 },
		);

		await page.waitForSelector(".monaco-editor", { timeout: 30000 });
		await page.evaluate(() => {
			const monaco = (window as any).monaco;
			const editors = monaco?.editor?.getEditors?.() ?? [];
			if (!editors.length) return;
			const editor = editors[0];
			editor.setValue(`${editor.getValue()}\n# dirty`);
			editor.focus();
		});
		await expect(
			page.locator(selectors.tab).filter({ hasText: firstFile }).locator(selectors.tabDirty),
		).toBeVisible();

		await page.locator(selectors.tabActive).locator(selectors.tabClose).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText(`Save changes to "${firstFile}"?`);

		await page.getByRole("button", { name: "Cancel" }).click();
		await expect(page.locator(selectors.tabActive)).toContainText(firstFile);

		await page.locator(selectors.tabActive).locator(selectors.tabClose).click();
		await page.getByRole("button", { name: "Don't Save" }).click();
		await expect(
			page
				.locator(selectors.tab)
				.filter({ has: page.locator(selectors.tabLabel, { hasText: firstFile }) }),
		).toHaveCount(0);
	});
});
