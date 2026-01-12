import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/constants/defaultSettings";
import { useStore } from "@/core";
import { SettingsModal } from "../SettingsModal";

const detectAgentsMock = vi.fn();

vi.mock("@/services/acpAdminClient", () => ({
	getAcpAdminClient: () => ({
		bootstrap: vi.fn(),
		setConfig: vi.fn(),
		detectAgents: (...args: any[]) => detectAgentsMock(...args),
		getConfig: vi.fn(),
	}),
}));

describe("SettingsModal", () => {
	beforeEach(() => {
		detectAgentsMock.mockResolvedValue([]);

		useStore.setState({
			settings: { ...DEFAULT_SETTINGS },
			activeAgent: null,
			detectedAgents: [],
		});

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url.includes("/config/provider")) {
					return { ok: true, json: async () => ({ provider: "openai" }) } as Response;
				}
				if (url.includes("/config/model/")) {
					return { ok: true, json: async () => ({ model: "gpt-4o-mini" }) } as Response;
				}
				if (url.includes("/config/key/")) {
					return { ok: true, json: async () => ({ api_key: "sk-***" }) } as Response;
				}
				return { ok: true, json: async () => ({}) } as Response;
			}),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("shows API providers section when API mode is active", () => {
		useStore.setState({ activeMode: "api" });

		render(<SettingsModal open onClose={vi.fn()} />);

		expect(screen.getByRole("heading", { name: "AI Provider" })).toBeTruthy();
		expect(screen.getByRole("heading", { name: "API Providers" })).toBeTruthy();
		expect(screen.queryByRole("heading", { name: "External Agents (ACP)" })).toBeNull();
	});

	it("shows external agents section when external agent mode is active", async () => {
		useStore.setState({ activeMode: "external_agent" });

		render(<SettingsModal open onClose={vi.fn()} />);

		await waitFor(() => expect(detectAgentsMock).toHaveBeenCalled());
		expect(screen.getByRole("heading", { name: "AI Provider" })).toBeTruthy();
		expect(screen.getByRole("heading", { name: "External Agents (ACP)" })).toBeTruthy();
		expect(screen.queryByRole("heading", { name: "API Providers" })).toBeNull();
	});
});
