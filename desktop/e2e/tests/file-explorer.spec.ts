import { expect, test } from "@playwright/test";
import { waitForAppConnected } from "../shared/helpers";
import { selectors } from "../shared/selectors";

test.describe("File Explorer", () => {
	test("opens a file and loads editor tab/content", async ({ page }) => {
		const projectFolder = "alpha";
		const fixtureFileName = "alpha.R";
		const fixtureText = "Alpha project loaded";

		await page.goto("/");
		await waitForAppConnected(page);

		const fileBrowser = page.locator(selectors.fileBrowser);
		await expect(fileBrowser).toBeVisible({ timeout: 30000 });

		const fileTreeNodeAtDepth = (name: string, depth: number) => {
			const padding = depth * 16 + 12;
			return page.locator(`${selectors.fileTreeNode}[style*="padding-left: ${padding}px"]`).filter({
				has: page.locator(selectors.fileTreeLabel, { hasText: name }),
			});
		};

		const fileTreeNodeByLabel = (name: string) =>
			page
				.locator(selectors.fileTreeNode)
				.filter({ has: page.locator(selectors.fileTreeLabel, { hasText: name }) });

		const ensureFolderExpanded = async (
			name: string,
			depth: number,
			childName: string,
			childDepth: number,
		) => {
			const node = fileTreeNodeAtDepth(name, depth).first();
			await expect(node).toBeVisible({ timeout: 30000 });

			const childNode = fileTreeNodeAtDepth(childName, childDepth);
			if ((await childNode.count()) === 0) {
				await node.click();
			}

			await expect(childNode.first()).toBeVisible({ timeout: 30000 });
		};

		await ensureFolderExpanded(projectFolder, 0, fixtureFileName, 1);

		const fixtureNode = fileTreeNodeByLabel(fixtureFileName).first();
		await expect(fixtureNode).toBeVisible({ timeout: 30000 });
		await fixtureNode.dblclick();

		const activeTab = page.locator(selectors.tabActive);
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
});
