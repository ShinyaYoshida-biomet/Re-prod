import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "@/core";
import { ExternalAgentSettingsPane } from "../ExternalAgentSettingsPane";

const bootstrapMock = vi.fn();
const setConfigMock = vi.fn();

vi.mock("@/services/acpAdminClient", () => ({
	getAcpAdminClient: () => ({
		bootstrap: (...args: any[]) => bootstrapMock(...args),
		setConfig: (...args: any[]) => setConfigMock(...args),
		detectAgents: vi.fn(),
		getConfig: vi.fn(),
	}),
}));

describe("ExternalAgentSettingsPane", () => {
	beforeEach(() => {
		bootstrapMock.mockReset();
		setConfigMock.mockReset();
		useStore.setState({
			activeMode: "api",
			activeAgent: null,
			detectedAgents: [],
		});
	});

	it("bootstraps agent config and detection on mount", async () => {
		bootstrapMock.mockResolvedValue({
			config: {
				active_mode: "external_agent",
				active_agent: "claude",
				active_agent_command: null,
			},
			agents: [
				{ id: "claude", name: "Claude", command: "claude-code-acp", available: true, path: null },
			],
		});

		render(<ExternalAgentSettingsPane />);

		await waitFor(() => expect(bootstrapMock).toHaveBeenCalled());
		expect(useStore.getState().activeMode).toBe("external_agent");
		expect(useStore.getState().activeAgent).toBe("claude");
		expect(useStore.getState().detectedAgents).toHaveLength(1);
	});

	it("persists selection when choosing an agent", async () => {
		bootstrapMock.mockResolvedValue({
			config: {
				active_mode: "external_agent",
				active_agent: null,
				active_agent_command: null,
			},
			agents: [
				{ id: "claude", name: "Claude", command: "claude-code-acp", available: true, path: null },
			],
		});
		setConfigMock.mockResolvedValue({
			active_mode: "external_agent",
			active_agent: "claude",
			active_agent_command: null,
		});

		const { getByLabelText } = render(<ExternalAgentSettingsPane />);

		const radio = await waitFor(() => getByLabelText(/Claude/));
		fireEvent.click(radio);

		await waitFor(() => expect(setConfigMock).toHaveBeenCalledWith("external_agent", "claude"));
		expect(useStore.getState().activeAgent).toBe("claude");
	});
});
