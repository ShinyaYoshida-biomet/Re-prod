import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "@/core";
import { useSettingsStore } from "@/core/state/slices/settingsStore";
import { AIPanel } from "../AIPanel";
import type { AIPanelRef } from "../AIPanel";
import { createRef } from "react";

// Create mocks that can be overridden per test
const mockSetInput = vi.fn();
const mockAsk = vi.fn();
const mockStop = vi.fn();
const mockApplyCode = vi.fn();
const mockNavigateUp = vi.fn();
const mockNavigateDown = vi.fn();
const mockResetNavigation = vi.fn();

let mockAIState = {
	input: "",
	messages: [],
	isLoading: false,
};

vi.mock("@/hooks/useAIConversation", () => ({
	useAIConversation: () => ({
		aiState: mockAIState,
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
	}),
}));

vi.mock("@/core/commands/registry", () => ({
	commandRegistry: {
		execute: vi.fn(),
	},
}));

vi.mock("../ProviderSwitcher", () => ({
	ProviderSwitcher: () => <div data-testid="provider-switcher" />,
}));

vi.mock("../StreamingMessage", () => ({
	StreamingMessage: ({ message }: any) => (
		<div data-testid={`streaming-message-${message.id}`}>{message.content}</div>
	),
}));

vi.mock("../ProviderIcon", () => ({
	ProviderIcon: ({ metadata }: any) => (
		<div>
			<img src={metadata.icon.path} alt={metadata.icon.alt} />
			<span>{metadata.displayName}</span>
		</div>
	),
}));

describe("AIPanel provider indicator", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Mock scrollIntoView for all tests
		Element.prototype.scrollIntoView = vi.fn();

		mockAIState = {
			input: "",
			messages: [],
			isLoading: false,
		};
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

describe("AIPanel rendering", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Element.prototype.scrollIntoView = vi.fn();

		mockAIState = {
			input: "",
			messages: [],
			isLoading: false,
		};
		useStore.setState({
			activeMode: "api",
			activeAgent: null,
			detectedAgents: [],
		});
		useSettingsStore.setState({
			activeProvider: "openai",
			providers: [],
		});
	});

	it("shows welcome message when no messages", () => {
		render(<AIPanel hasConfiguredProvider />);

		// Both panel title and welcome header say "AI Assistant"
		expect(screen.getAllByText("AI Assistant")).toHaveLength(2);
		expect(screen.getByText(/Ask me anything about R programming/)).toBeInTheDocument();
	});

	it("shows user messages correctly", () => {
		mockAIState = {
			input: "",
			messages: [
				{
					id: "user-1",
					role: "user",
					content: "What is R?",
					timestamp: Date.now(),
				},
			],
			isLoading: false,
		};

		render(<AIPanel hasConfiguredProvider />);

		expect(screen.getByText("What is R?")).toBeInTheDocument();
		// Welcome message is hidden when there are messages
		expect(screen.queryByText(/Ask me anything about R programming/)).not.toBeInTheDocument();
	});

	it("shows assistant messages using StreamingMessage component", () => {
		mockAIState = {
			input: "",
			messages: [
				{
					id: "assistant-1",
					role: "assistant",
					content: "R is a programming language",
					timestamp: Date.now(),
				},
			],
			isLoading: false,
		};

		render(<AIPanel hasConfiguredProvider />);

		expect(screen.getByTestId("streaming-message-assistant-1")).toBeInTheDocument();
		expect(screen.getByText("R is a programming language")).toBeInTheDocument();
	});

	it("shows mixed user and assistant messages", () => {
		mockAIState = {
			input: "",
			messages: [
				{
					id: "user-1",
					role: "user",
					content: "Question 1",
					timestamp: Date.now(),
				},
				{
					id: "assistant-1",
					role: "assistant",
					content: "Answer 1",
					timestamp: Date.now(),
				},
				{
					id: "user-2",
					role: "user",
					content: "Question 2",
					timestamp: Date.now(),
				},
			],
			isLoading: false,
		};

		render(<AIPanel hasConfiguredProvider />);

		expect(screen.getByText("Question 1")).toBeInTheDocument();
		expect(screen.getByText("Answer 1")).toBeInTheDocument();
		expect(screen.getByText("Question 2")).toBeInTheDocument();
	});
});

describe("AIPanel mode switching", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Element.prototype.scrollIntoView = vi.fn();

		mockAIState = {
			input: "",
			messages: [],
			isLoading: false,
		};
		useStore.setState({
			activeMode: "api",
			activeAgent: null,
			detectedAgents: [],
		});
		useSettingsStore.setState({
			activeProvider: "openai",
			providers: [],
		});
	});

	it("shows agent mode placeholder by default", () => {
		render(<AIPanel hasConfiguredProvider />);

		const textarea = screen.getByPlaceholderText("Describe a task...");
		expect(textarea).toBeInTheDocument();
	});

	it("changes placeholder to chat mode", () => {
		render(<AIPanel hasConfiguredProvider />);

		const select = screen.getByRole("combobox", { name: "AI interaction mode" });
		fireEvent.change(select, { target: { value: "chat" } });

		expect(screen.getByPlaceholderText("Ask a question...")).toBeInTheDocument();
	});

	it("sends with agent mode when selected", () => {
		mockAIState.input = "test input";
		render(<AIPanel hasConfiguredProvider />);

		const sendButton = screen.getByRole("button", { name: "Send message" });
		fireEvent.click(sendButton);

		expect(mockAsk).toHaveBeenCalledWith("agent");
	});

	it("sends with chat mode when selected", () => {
		mockAIState.input = "test input";
		render(<AIPanel hasConfiguredProvider />);

		const select = screen.getByRole("combobox", { name: "AI interaction mode" });
		fireEvent.change(select, { target: { value: "chat" } });

		const sendButton = screen.getByRole("button", { name: "Send message" });
		fireEvent.click(sendButton);

		expect(mockAsk).toHaveBeenCalledWith("chat");
	});
});

describe("AIPanel input behavior", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Element.prototype.scrollIntoView = vi.fn();

		mockAIState = {
			input: "",
			messages: [],
			isLoading: false,
		};
		useStore.setState({
			activeMode: "api",
			activeAgent: null,
			detectedAgents: [],
		});
		useSettingsStore.setState({
			activeProvider: "openai",
			providers: [],
		});
	});

	it("calls setInput when typing", () => {
		render(<AIPanel hasConfiguredProvider />);

		const textarea = screen.getByPlaceholderText("Describe a task...");
		fireEvent.change(textarea, { target: { value: "hello" } });

		expect(mockSetInput).toHaveBeenCalledWith("hello");
		expect(mockResetNavigation).toHaveBeenCalled();
	});

	it("disables input during loading", () => {
		mockAIState.isLoading = true;

		render(<AIPanel hasConfiguredProvider />);

		const textarea = screen.getByPlaceholderText("Describe a task...");
		expect(textarea).toBeDisabled();
	});

	it("disables mode dropdown during loading", () => {
		mockAIState.isLoading = true;

		render(<AIPanel hasConfiguredProvider />);

		const select = screen.getByRole("combobox", { name: "AI interaction mode" });
		expect(select).toBeDisabled();
	});

	it("disables send button when input is empty", () => {
		mockAIState.input = "";

		render(<AIPanel hasConfiguredProvider />);

		const sendButton = screen.getByRole("button", { name: "Send message" });
		expect(sendButton).toBeDisabled();
	});

	it("enables send button when input has content", () => {
		mockAIState.input = "some text";

		render(<AIPanel hasConfiguredProvider />);

		const sendButton = screen.getByRole("button", { name: "Send message" });
		expect(sendButton).not.toBeDisabled();
	});
});

describe("AIPanel keyboard shortcuts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Element.prototype.scrollIntoView = vi.fn();

		mockAIState = {
			input: "test",
			messages: [],
			isLoading: false,
		};
		useStore.setState({
			activeMode: "api",
			activeAgent: null,
			detectedAgents: [],
		});
		useSettingsStore.setState({
			activeProvider: "openai",
			providers: [],
		});
	});

	it("sends message when Enter is pressed", () => {
		render(<AIPanel hasConfiguredProvider />);

		const textarea = screen.getByPlaceholderText("Describe a task...");
		fireEvent.keyDown(textarea, { key: "Enter" });

		expect(mockAsk).toHaveBeenCalledWith("agent");
	});

	it("does not send when Shift+Enter is pressed", () => {
		render(<AIPanel hasConfiguredProvider />);

		const textarea = screen.getByPlaceholderText("Describe a task...");
		fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

		expect(mockAsk).not.toHaveBeenCalled();
	});

	it("navigates history on ArrowUp when cursor at start", () => {
		mockAIState.input = "";
		mockNavigateUp.mockReturnValue(true);

		render(<AIPanel hasConfiguredProvider />);

		const textarea = screen.getByPlaceholderText("Describe a task...") as HTMLTextAreaElement;
		textarea.selectionStart = 0;
		textarea.selectionEnd = 0;

		fireEvent.keyDown(textarea, { key: "ArrowUp" });

		expect(mockNavigateUp).toHaveBeenCalled();
	});

	it("navigates history on ArrowDown when cursor at end", () => {
		mockAIState.input = "test";
		mockNavigateDown.mockReturnValue(true);

		render(<AIPanel hasConfiguredProvider />);

		const textarea = screen.getByPlaceholderText("Describe a task...") as HTMLTextAreaElement;
		textarea.selectionStart = 4;
		textarea.selectionEnd = 4;

		fireEvent.keyDown(textarea, { key: "ArrowDown" });

		expect(mockNavigateDown).toHaveBeenCalled();
	});

	it("does not navigate on ArrowUp when cursor is in middle", () => {
		mockAIState.input = "test content";

		render(<AIPanel hasConfiguredProvider />);

		const textarea = screen.getByPlaceholderText("Describe a task...") as HTMLTextAreaElement;
		textarea.selectionStart = 5;
		textarea.selectionEnd = 5;

		fireEvent.keyDown(textarea, { key: "ArrowUp" });

		expect(mockNavigateUp).not.toHaveBeenCalled();
	});
});

describe("AIPanel loading state", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Element.prototype.scrollIntoView = vi.fn();

		useStore.setState({
			activeMode: "api",
			activeAgent: null,
			detectedAgents: [],
		});
		useSettingsStore.setState({
			activeProvider: "openai",
			providers: [],
		});
	});

	it("shows stop button when loading", () => {
		mockAIState = {
			input: "test",
			messages: [],
			isLoading: true,
		};

		render(<AIPanel hasConfiguredProvider />);

		expect(screen.getByRole("button", { name: "Stop generation" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
	});

	it("shows send button when not loading", () => {
		mockAIState = {
			input: "test",
			messages: [],
			isLoading: false,
		};

		render(<AIPanel hasConfiguredProvider />);

		expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Stop generation" })).not.toBeInTheDocument();
	});

	it("calls stop action when stop button clicked", () => {
		mockAIState = {
			input: "test",
			messages: [],
			isLoading: true,
		};

		render(<AIPanel hasConfiguredProvider />);

		const stopButton = screen.getByRole("button", { name: "Stop generation" });
		fireEvent.click(stopButton);

		expect(mockStop).toHaveBeenCalled();
	});
});

describe("AIPanel ref functionality", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Element.prototype.scrollIntoView = vi.fn();

		mockAIState = {
			input: "",
			messages: [],
			isLoading: false,
		};
		useStore.setState({
			activeMode: "api",
			activeAgent: null,
			detectedAgents: [],
		});
		useSettingsStore.setState({
			activeProvider: "openai",
			providers: [],
		});
	});

	it("exposes focusInput method via ref", () => {
		const ref = createRef<AIPanelRef>();
		render(<AIPanel ref={ref} hasConfiguredProvider />);

		expect(ref.current).toBeDefined();
		expect(ref.current?.focusInput).toBeDefined();
	});

	it("focusInput focuses the textarea", () => {
		const ref = createRef<AIPanelRef>();
		render(<AIPanel ref={ref} hasConfiguredProvider />);

		const textarea = screen.getByPlaceholderText("Describe a task...");
		expect(document.activeElement).not.toBe(textarea);

		ref.current?.focusInput();

		expect(document.activeElement).toBe(textarea);
	});
});
