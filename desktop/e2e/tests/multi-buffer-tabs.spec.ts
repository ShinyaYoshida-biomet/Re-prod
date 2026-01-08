import { expect, test, type Page } from "@playwright/test";
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

	const openFixture = async (page: Page, filename: string) => {
		await ensureFolderExpanded(page, "desktop", 0, "e2e", 1);
		await ensureFolderExpanded(page, "e2e", 1, "shared", 2);
		await ensureFolderExpanded(page, "shared", 2, "fixtures", 3);
		await ensureFolderExpanded(page, "fixtures", 3, filename, 4);

		const fixtureNode = fileTreeNodeByLabel(page, filename).first();
		await expect(fixtureNode).toBeVisible({ timeout: 30000 });
		await fixtureNode.dblclick();
	};

	test("opens multiple files in tabs and handles dirty close", async ({ page }) => {
		const firstFile = "file-explorer-fixture.R";
		const secondFile = "tab-switch-fixture.R";

		await page.goto("/");
		await expect(page.locator(selectors.fileBrowser)).toBeVisible({ timeout: 30000 });

		await openFixture(page, firstFile);
		await expect(page.locator(selectors.tabActive)).toContainText(firstFile);
		await openFixture(page, secondFile);
		await expect(page.locator(selectors.tabActive)).toContainText(secondFile);

		const tabs = page.locator(selectors.tab);
		await expect(tabs.filter({ hasText: firstFile })).toHaveCount(1);
		await expect(tabs.filter({ hasText: secondFile })).toHaveCount(1);

		const activeTab = page.locator(selectors.tabActive);
		await expect(activeTab).toContainText(secondFile);

		await page.locator(selectors.tab).filter({ hasText: firstFile }).first().click();
		await expect(page.locator(selectors.tabActive)).toContainText(firstFile);

		await page.locator(selectors.editor).click();
		await page.keyboard.type("\n# dirty");
		await expect(page.locator(selectors.tabActive).locator(selectors.tabDirty)).toBeVisible();

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
