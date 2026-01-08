import { expect, test } from "@playwright/test";
import { selectors } from "../shared/selectors";

test.describe("File Explorer", () => {
	test("opens a file and loads editor tab/content", async ({ page }) => {
		const fixtureFileName = "file-explorer-fixture.R";
		const fixtureText = "File Explorer fixture loaded";

		await page.goto("/");

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

		await ensureFolderExpanded("desktop", 0, "e2e", 1);
		await ensureFolderExpanded("e2e", 1, "shared", 2);
		await ensureFolderExpanded("shared", 2, "fixtures", 3);
		await ensureFolderExpanded("fixtures", 3, fixtureFileName, 4);

		const fixtureNode = fileTreeNodeByLabel(fixtureFileName).first();
		await expect(fixtureNode).toBeVisible({ timeout: 30000 });
		await fixtureNode.dblclick();

		const editorTitle = page.locator(selectors.editorTitle);
		await expect(editorTitle).toContainText(fixtureFileName, { timeout: 30000 });

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
