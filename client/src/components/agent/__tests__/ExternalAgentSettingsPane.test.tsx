import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { ExternalAgentSettingsPane } from "../ExternalAgentSettingsPane";
import { useStore } from "@/core";

vi.mock("@/constants/features", () => ({
	ACP_FEATURE_ENABLED: true,
	IS_TAURI: true,
}));

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: any[]) => invokeMock(...args),
}));

describe("ExternalAgentSettingsPane", () => {
	beforeEach(() => {
		invokeMock.mockReset();
		useStore.setState({
			activeMode: "api",
			activeAgent: null,
			detectedAgents: [],
		});
	});

	it("bootstraps agent config and detection on mount", async () => {
		invokeMock.mockImplementation((cmd: string) => {
			if (cmd === "acp_detect_agents") {
				return Promise.resolve([
					{ id: "claude", name: "Claude", command: "claude-code-acp", available: true, path: null },
				]);
			}
			if (cmd === "acp_get_agent_config") {
				return Promise.resolve({ active_mode: "external_agent", active_agent: "claude" });
			}
			return Promise.resolve();
		});

		render(<ExternalAgentSettingsPane />);

		await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("acp_detect_agents"));
		expect(useStore.getState().activeMode).toBe("external_agent");
		expect(useStore.getState().activeAgent).toBe("claude");
		expect(useStore.getState().detectedAgents).toHaveLength(1);
	});

	it("persists selection when choosing an agent", async () => {
		invokeMock.mockImplementation((cmd: string, payload?: any) => {
			if (cmd === "acp_detect_agents") {
				return Promise.resolve([
					{ id: "claude", name: "Claude", command: "claude-code-acp", available: true, path: null },
				]);
			}
			if (cmd === "acp_get_agent_config") {
				return Promise.resolve({ active_mode: "external_agent", active_agent: null });
			}
			if (cmd === "acp_set_agent_config") {
				return Promise.resolve(payload);
			}
			return Promise.resolve();
		});

		const { getByLabelText } = render(<ExternalAgentSettingsPane />);

		const radio = await waitFor(() => getByLabelText(/Claude/));
		fireEvent.click(radio);

		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith("acp_set_agent_config", {
				active_mode: "external_agent",
				active_agent: "claude",
			}),
		);
		expect(useStore.getState().activeAgent).toBe("claude");
	});
});
