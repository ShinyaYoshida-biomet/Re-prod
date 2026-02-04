import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "@/core";
import { AIProviderSettingsPane } from "../AIProviderSettingsPane";

const setConfigMock = vi.fn();

vi.mock("@/services/acpAdminClient", () => ({
	getAcpAdminClient: () => ({
		setConfig: (...args: any[]) => setConfigMock(...args),
	}),
}));

describe("AIProviderSettingsPane", () => {
	beforeEach(() => {
		setConfigMock.mockReset();
		useStore.setState({
			activeMode: "api",
			activeAgent: "codex",
			activeAgentArgs: [],
		});
	});

	it("switches to API providers and clears active agent", async () => {
		setConfigMock.mockResolvedValue({
			active_mode: "api",
			active_agent: null,
			active_agent_command: null,
			active_agent_args: null,
		});

		useStore.setState({
			activeMode: "external_agent",
			activeAgent: "codex",
			activeAgentArgs: ["--approval-mode", "auto_edit"],
		});
		const { getByLabelText } = render(<AIProviderSettingsPane />);

		fireEvent.click(getByLabelText("API Providers"));

		await waitFor(() => expect(setConfigMock).toHaveBeenCalledWith("api", null, null));
		expect(useStore.getState().activeMode).toBe("api");
		expect(useStore.getState().activeAgent).toBeNull();
		expect(useStore.getState().activeAgentArgs).toEqual([]);
	});

	it("switches to external agent mode and persists the agent", async () => {
		setConfigMock.mockResolvedValue({
			active_mode: "external_agent",
			active_agent: "codex",
			active_agent_command: null,
			active_agent_args: ["--approval-mode", "auto_edit"],
		});

		useStore.setState({
			activeMode: "api",
			activeAgent: "codex",
			activeAgentArgs: ["--approval-mode", "auto_edit"],
		});
		const { getByLabelText } = render(<AIProviderSettingsPane />);

		fireEvent.click(getByLabelText("External Agent (ACP)"));

		await waitFor(() =>
			expect(setConfigMock).toHaveBeenCalledWith("external_agent", "codex", [
				"--approval-mode",
				"auto_edit",
			]),
		);
		expect(useStore.getState().activeMode).toBe("external_agent");
	});
});
