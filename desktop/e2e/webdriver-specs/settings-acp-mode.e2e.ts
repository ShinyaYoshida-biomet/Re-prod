import assert from "node:assert";
import { TEST_CASES } from "../shared/test-registry";
import { openSettingsDialog } from "./helpers";

const settingsDialogTitle = "Settings";

describe("Settings ACP mode", () => {
	it(TEST_CASES["settings-acp-mode"][0], async () => {
		await openSettingsDialog();
		const settingsTitle = await browser.$(`//h2[normalize-space()="${settingsDialogTitle}"]`);
		await settingsTitle.waitForDisplayed({ timeout: 10000 });

		await browser.execute(() => {
			const helper = (window as any).reprodTest as
				| { setActiveMode?: (mode: "api" | "external_agent") => void }
				| undefined;
			helper?.setActiveMode?.("external_agent");
		});
		await browser.waitUntil(
			async () =>
				browser.execute(() => {
					const radio = document.querySelector(
						'input[aria-label="External Agent (ACP)"]',
					) as HTMLInputElement | null;
					return Boolean(radio?.checked);
				}),
			{
				timeout: 10000,
				timeoutMsg: "External Agent (ACP) should be selected",
			},
		);

		await browser.waitUntil(
			async () =>
				browser.execute(() => {
					const heading = document.querySelector(".external-agent-header h3");
					return heading?.textContent?.trim() === "External Agents (ACP)";
				}),
			{
				timeout: 20000,
				timeoutMsg: "External Agents (ACP) heading should be visible",
			},
		);

		const refreshButton = await browser.$(".external-agent-header button");
		await refreshButton.waitForExist({ timeout: 10000 });
		await browser.execute(() => {
			const button = document.querySelector(
				".external-agent-header button",
			) as HTMLButtonElement | null;
			button?.scrollIntoView();
			button?.click();
		});

		const externalAgentSelected = (await browser.execute(() => {
			const radio = document.querySelector(
				'input[aria-label="External Agent (ACP)"]',
			) as HTMLInputElement | null;
			return Boolean(radio?.checked);
		})) as boolean;
		assert.ok(externalAgentSelected, "External Agent (ACP) should remain selected");

		const apiProvidersSelected = (await browser.execute(() => {
			const radio = document.querySelector(
				'input[aria-label="API Providers"]',
			) as HTMLInputElement | null;
			return Boolean(radio?.checked);
		})) as boolean;
		assert.ok(!apiProvidersSelected, "API Providers should not be selected");
	});
});
