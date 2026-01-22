import { describe, expect, it, vi, beforeEach } from "vitest";
import { AcpTransport } from "../AcpTransport";
import { getExternalAgentClient } from "@/services/externalAgentClient";
import { getAcpSystemPrompts } from "@/core/ai/systemPrompts";

vi.mock("@/services/externalAgentClient", () => ({
	getExternalAgentClient: vi.fn(),
}));

vi.mock("@/core/ai/systemPrompts", () => ({
	getAcpSystemPrompts: vi.fn(() => []),
}));

vi.mock("@/core/pathUtils", () => ({
	normalizeWorkspaceRelativePath: vi.fn((path) => path),
}));

describe("AcpTransport", () => {
	const mockClient = {
		createSession: vi.fn(),
		prompt: vi.fn(),
		cancel: vi.fn(),
		onSessionUpdate: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		(getExternalAgentClient as any).mockReturnValue(mockClient);
	});

	it("should create a session and send prompt on send()", async () => {
		mockClient.createSession.mockResolvedValue("session-123");
		const transport = new AcpTransport();

		const request = {
			id: "req-1",
			mode: "agent" as const,
			messages: [{ role: "user", content: "hello" }],
			input: "hello",
			context: {
				editorFilepath: "test.ts",
				editorContent: "code",
				workspaceRoot: "/root",
			},
		};

		transport.send(request);

		// Wait for async start
		await vi.waitFor(() => {
			expect(mockClient.createSession).toHaveBeenCalled();
		});

		expect(mockClient.prompt).toHaveBeenCalledWith(
			"req-1",
			expect.objectContaining({
				session_id: "session-123",
				messages: expect.any(Array),
				context: expect.objectContaining({
					user_input: "hello",
					active_buffer_path: "test.ts",
				}),
			}),
		);
	});
	it("should emit DONE when session update is Done", async () => {
		mockClient.createSession.mockResolvedValue("session-123");
		const transport = new AcpTransport();
		const listener = vi.fn();
		transport.onEvent(listener);

		const request = {
			id: "req-1",
			mode: "agent" as const,
			messages: [],
			input: "hello",
			context: {
				editorFilepath: "test.ts",
				editorContent: "code",
				workspaceRoot: "/root",
			},
		};

		transport.send(request);

		await vi.waitFor(() => {
			expect(mockClient.onSessionUpdate).toHaveBeenCalled();
		});

		// Manually trigger handleSessionUpdate via the mocked global listener
		const updateCallback = mockClient.onSessionUpdate.mock.calls[0][0];

		// We need to have an active session first
		(transport as any).activeSessions.set("session-123", "req-1");

		updateCallback({
			session_id: "session-123",
			update: "Done",
		});

		expect(listener).toHaveBeenCalledWith({
			type: "DONE",
			streamingId: "req-1",
		});
	});

	it("should format chunks with prefixes correctly", async () => {
		mockClient.createSession.mockResolvedValue("session-123");
		const transport = new AcpTransport();
		const listener = vi.fn();
		transport.onEvent(listener);

		const request = {
			id: "req-1",
			mode: "agent" as const,
			messages: [],
			input: "hello",
			context: {
				editorFilepath: "test.ts",
				editorContent: "code",
				workspaceRoot: "/root",
			},
		};

		transport.send(request);

		await vi.waitFor(() => {
			expect(mockClient.onSessionUpdate).toHaveBeenCalled();
		});

		(transport as any).activeSessions.set("session-123", "req-1");
		const updateCallback = mockClient.onSessionUpdate.mock.calls[0][0];

		// First thought
		updateCallback({
			session_id: "session-123",
			update: { AgentThoughtChunk: { text: "Thinking..." } },
		});

		expect(listener).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "CHUNK",
				content: "[Thought]\nThinking...",
			}),
		);

		// Subsequent thought (no prefix)
		updateCallback({
			session_id: "session-123",
			update: { AgentThoughtChunk: { text: " more" } },
		});
		expect(listener).toHaveBeenLastCalledWith(
			expect.objectContaining({
				content: " more",
			}),
		);

		// Switch to message
		updateCallback({
			session_id: "session-123",
			update: { AgentMessageChunk: { text: "Result" } },
		});
		expect(listener).toHaveBeenLastCalledWith(
			expect.objectContaining({
				content: "\n\nResult",
			}),
		);
	});
});
