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
			activeAgentArgs: [],
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
			active_agent_args: [],
		});

		const { getByLabelText } = render(<ExternalAgentSettingsPane />);

		const radio = await waitFor(() => getByLabelText(/Claude/));
		fireEvent.click(radio);

		await waitFor(() => expect(setConfigMock).toHaveBeenCalledWith("external_agent", "claude", []));
		expect(useStore.getState().activeAgent).toBe("claude");
	});

	it("persists custom launch args", async () => {
		detectAgentsMock.mockResolvedValue([
			{ id: "gemini", name: "Gemini CLI", command: "gemini", available: true, path: null },
		]);
		useStore.setState({
			activeMode: "external_agent",
			activeAgent: "gemini",
			activeAgentArgs: [],
			detectedAgents: [],
		});

		setConfigMock.mockResolvedValue({
			active_mode: "external_agent",
			active_agent: "gemini",
			active_agent_command: "/opt/homebrew/bin/gemini",
			active_agent_args: ["--approval-mode", "auto_edit"],
		});

		const { getByLabelText, getByText } = render(<ExternalAgentSettingsPane />);
		const input = await waitFor(() => getByLabelText(/Extra launch args/));
		fireEvent.change(input, { target: { value: "--approval-mode\nauto_edit" } });
		fireEvent.click(getByText("Save args"));

		await waitFor(() =>
			expect(setConfigMock).toHaveBeenCalledWith("external_agent", "gemini", [
				"--approval-mode",
				"auto_edit",
			]),
		);
		expect(useStore.getState().activeAgentArgs).toEqual(["--approval-mode", "auto_edit"]);
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
