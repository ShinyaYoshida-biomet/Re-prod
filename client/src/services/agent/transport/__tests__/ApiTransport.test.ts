import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { ApiTransport } from "../ApiTransport";
import type { PendingEditPayload } from "@/types/generated/PendingEditPayload";
import { socketService } from "@/services/socket";

vi.mock("@/services/socket", () => ({
	socketService: {
		send: vi.fn(),
		on: vi.fn(),
	},
}));

describe("ApiTransport", () => {
	let mockHandlers: Map<string, (message: any) => void>;

	beforeEach(() => {
		mockHandlers = new Map();
		vi.mocked(socketService.send).mockReturnValue(true);
		vi.mocked(socketService.on).mockImplementation((event, handler) => {
			mockHandlers.set(event, handler);
			return () => mockHandlers.delete(event);
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
		mockHandlers.clear();
	});

	it("emits PENDING_EDIT when pending_edit_created arrives", () => {
		const transport = new ApiTransport();
		const events: any[] = [];
		transport.onEvent((event) => events.push(event));

		transport.send({
			id: "req-1",
			agentSessionId: "session-1",
			mode: "agent",
			messages: [{ role: "user", content: "edit" }],
			context: {
				editorFilepath: "notes.txt",
				editorContent: "old",
				workspaceRoot: "/workspace",
			},
		});

		const handler = mockHandlers.get("pending_edit_created");
		expect(handler).toBeDefined();

		const payload: PendingEditPayload = {
			id: "api-edit-123",
			session_id: "session-1",
			tool_call_id: "tool-1",
			file_path: "notes.txt",
			old_text: "old",
			new_text: "new",
			unified_diff: "@@ -1 +1 @@",
			base_sha256: "base",
			expected_sha256: null,
		};

		handler!({ type: "pending_edit_created", edit: payload });

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("PENDING_EDIT");
		expect(events[0].edit.filePath).toBe("notes.txt");
		expect(events[0].edit.source).toEqual({ type: "api-key", codeBlockId: "tool-1" });
	});
});
