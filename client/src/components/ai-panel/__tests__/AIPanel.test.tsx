import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "@/core";
import { useSettingsStore } from "@/core/state/slices/settingsStore";
import { AIPanel } from "../AIPanel";
import { useAIConversation } from "@/hooks/useAIConversation";

// Mock dependencies
const mockSetInput = vi.fn();
const mockAsk = vi.fn();
const mockStop = vi.fn();
const mockApplyCode = vi.fn();
const mockNavigateUp = vi.fn();
const mockNavigateDown = vi.fn();
const mockResetNavigation = vi.fn();

vi.mock("@/hooks/useAIConversation", () => ({
	useAIConversation: vi.fn(),
}));

vi.mock("../ProviderSwitcher", () => ({
	ProviderSwitcher: () => <div data-testid="provider-switcher" />,
}));

vi.mock("../StreamingMessage", () => ({
	StreamingMessage: () => <div data-testid="streaming-message" />,
}));

describe("AIPanel", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Setup default mock return for useAIConversation
		(useAIConversation as any).mockReturnValue({
			aiState: {
				input: "",
				messages: [],
				isLoading: false,
			},
			aiActions: {
				setInput: mockSetInput,
				ask: mockAsk,
				stop: mockStop,
				applyCode: mockApplyCode,
			},
			promptHistory: {
				navigateUp: mockNavigateUp,
				navigateDown: mockNavigateDown,
				resetNavigation: mockResetNavigation,
			},
		});

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

	describe("Rendering", () => {
		it("renders input area", () => {
			render(<AIPanel hasConfiguredProvider />);
			expect(screen.getByPlaceholderText("Describe a task...")).toBeInTheDocument();
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

	describe("Interaction", () => {
		it("handles input change", () => {
			render(<AIPanel hasConfiguredProvider />);
			const input = screen.getByPlaceholderText("Describe a task...");

			fireEvent.change(input, { target: { value: "test input" } });

			expect(mockSetInput).toHaveBeenCalledWith("test input");
		});

		it("submits message on Enter", () => {
			(useAIConversation as any).mockReturnValue({
				aiState: { input: "hello", messages: [], isLoading: false },
				aiActions: { setInput: mockSetInput, ask: mockAsk },
				promptHistory: { navigateUp: vi.fn(), navigateDown: vi.fn() },
			});

			render(<AIPanel hasConfiguredProvider />);
			const input = screen.getByPlaceholderText("Describe a task...");

			fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

			expect(mockAsk).toHaveBeenCalled();
		});

		it("allows new lines with Shift+Enter", () => {
			render(<AIPanel hasConfiguredProvider />);
			const input = screen.getByPlaceholderText("Describe a task...");

			fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

			expect(mockAsk).not.toHaveBeenCalled();
		});

		it("handles history navigation", () => {
			render(<AIPanel hasConfiguredProvider />);
			const input = screen.getByPlaceholderText("Describe a task...");

			fireEvent.keyDown(input, { key: "ArrowUp" });
			expect(mockNavigateUp).toHaveBeenCalled();

			fireEvent.keyDown(input, { key: "ArrowDown" });
			expect(mockNavigateDown).toHaveBeenCalled();
		});

		it("stops generation when stop button clicked", () => {
			(useAIConversation as any).mockReturnValue({
				aiState: { input: "", messages: [], isLoading: true },
				aiActions: { setInput: mockSetInput, stop: mockStop },
				promptHistory: { navigateUp: vi.fn(), navigateDown: vi.fn() },
			});

			render(<AIPanel hasConfiguredProvider />);

			const stopButton = screen.getByTitle("Stop generation (Esc)");
			fireEvent.click(stopButton);

			expect(mockStop).toHaveBeenCalled();
		});
	});
});
