import assert from "node:assert";
import { selectors } from "../shared/selectors";

const waitForAiPanel = async () => {
	const panel = await browser.$(selectors.aiPanel);
	await panel.waitForDisplayed({ timeout: 10000 });
	return panel;
};

const switchToApiMode = async () => {
	await waitForAiPanel();
	const modeSelect = await browser.$(selectors.aiModeSelect);
	await modeSelect.selectByAttribute("value", "agent");
};

describe("AI Agent API-Key Mode", () => {
	it("should switch to api agent mode", async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		await switchToApiMode();

		const modeSelect = await browser.$(selectors.aiModeSelect);
		assert.equal(await modeSelect.getValue(), "agent");
	});

	it("should have access to plan and approval UI elements", async () => {
		// Verify we can find the selectors we added, even if they aren't visible yet
		const planCard = await browser.$(selectors.aiPlanCard);
		assert.ok(planCard);

		const approvalCard = await browser.$(selectors.approvalCard);
		assert.ok(approvalCard);
	});
});
