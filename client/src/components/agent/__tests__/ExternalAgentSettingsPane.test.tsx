import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "@/core";
import { ExternalAgentSettingsPane } from "../ExternalAgentSettingsPane";

const setConfigMock = vi.fn();
const detectAgentsMock = vi.fn();

vi.mock("@/services/acpAdminClient", () => ({
	getAcpAdminClient: () => ({
		bootstrap: vi.fn(),
		setConfig: (...args: any[]) => setConfigMock(...args),
		detectAgents: (...args: any[]) => detectAgentsMock(...args),
		getConfig: vi.fn(),
	}),
}));

describe("ExternalAgentSettingsPane", () => {
	beforeEach(() => {
		setConfigMock.mockReset();
		detectAgentsMock.mockReset();
		useStore.setState({
			activeMode: "api",
			activeAgent: null,
			detectedAgents: [],
		});
	});

	it("loads available agents on mount", async () => {
		detectAgentsMock.mockResolvedValue([
			{ id: "claude", name: "Claude", command: "claude-code-acp", available: true, path: null },
		]);

		render(<ExternalAgentSettingsPane />);

		await waitFor(() => expect(detectAgentsMock).toHaveBeenCalled());
		expect(useStore.getState().activeMode).toBe("api");
		expect(useStore.getState().activeAgent).toBeNull();
		expect(useStore.getState().detectedAgents).toHaveLength(1);
	});

	it("does not reset active mode while refreshing agents", async () => {
		useStore.setState({
			activeMode: "external_agent",
			activeAgent: "claude",
			detectedAgents: [],
		});
		detectAgentsMock.mockResolvedValue([
			{ id: "claude", name: "Claude", command: "claude-code-acp", available: true, path: null },
		]);

		render(<ExternalAgentSettingsPane />);

		await waitFor(() => expect(detectAgentsMock).toHaveBeenCalled());
		expect(useStore.getState().activeMode).toBe("external_agent");
		expect(useStore.getState().activeAgent).toBe("claude");
	});

	it("persists selection when choosing an agent", async () => {
		detectAgentsMock.mockResolvedValue([
			{ id: "claude", name: "Claude", command: "claude-code-acp", available: true, path: null },
		]);
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

	it("toggles the refresh button label based on loading state", async () => {
		let resolveAgents: ((value: any) => void) | null = null;
		detectAgentsMock.mockReturnValue(
			new Promise((resolve) => {
				resolveAgents = resolve;
			}),
		);

		const { getByText } = render(<ExternalAgentSettingsPane />);

		await waitFor(() => expect(getByText("Refreshing...")).toBeTruthy());

		resolveAgents?.([]);

		await waitFor(() => expect(getByText("Refresh")).toBeTruthy());
	});
});
