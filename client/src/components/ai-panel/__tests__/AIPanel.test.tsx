import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "@/core";
import { useSettingsStore } from "@/core/state/slices/settingsStore";
import { AIPanel } from "../AIPanel";

vi.mock("@/hooks/useAIConversation", () => ({
	useAIConversation: () => ({
		aiState: {
			input: "",
			messages: [],
			isLoading: false,
		},
		aiActions: {
			setInput: vi.fn(),
			ask: vi.fn(),
			stop: vi.fn(),
			applyCode: vi.fn(),
		},
		promptHistory: {
			navigateUp: vi.fn(),
			navigateDown: vi.fn(),
			resetNavigation: vi.fn(),
		},
	}),
}));

vi.mock("../ProviderSwitcher", () => ({
	ProviderSwitcher: () => <div data-testid="provider-switcher" />,
}));

vi.mock("../StreamingMessage", () => ({
	StreamingMessage: () => <div data-testid="streaming-message" />,
}));

describe("AIPanel provider indicator", () => {
	beforeEach(() => {
		useStore.setState({
			activeMode: "api",
			activeAgent: null,
			detectedAgents: [],
		});
		useSettingsStore.setState({
			activeProvider: "openai",
			providers: [
				{
					name: "openai",
					displayName: "OpenAI",
					models: [],
					activeModel: "gpt-4o",
					isConfigured: true,
					metadata: {
						name: "openai",
						displayName: "OpenAI",
						icon: {
							path: "/icons/providers/OpenAI-black-monoblossom.svg",
							alt: "OpenAI",
							format: "svg",
						},
					},
				},
			],
		});
	});

	it("shows the active API provider icon and label", () => {
		render(<AIPanel hasConfiguredProvider />);

		expect(screen.getByAltText("OpenAI")).toBeInTheDocument();
		expect(screen.getByText("OpenAI")).toBeInTheDocument();
	});

	it("shows the active external agent icon and label", () => {
		useStore.setState({
			activeMode: "external_agent",
			activeAgent: "gemini",
			detectedAgents: [
				{
					id: "gemini",
					name: "Gemini CLI",
					command: "gemini",
					available: true,
					path: null,
				},
			],
		});

		render(<AIPanel hasConfiguredProvider />);

		expect(screen.getByAltText("Google Gemini")).toBeInTheDocument();
		expect(screen.getByText("Gemini")).toBeInTheDocument();
	});
});
