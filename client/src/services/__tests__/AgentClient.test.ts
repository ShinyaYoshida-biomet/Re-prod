import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "@/core";
import type { AITransportRequest } from "@/services/agent/transport/AITransport";
import { AgentClientService } from "../AgentClient";

const sentRequests: AITransportRequest[] = [];

vi.mock("@/services/agent/transport/ApiTransport", () => {
	class MockApiTransport {
		onEvent() {
			return () => {};
		}

		send(request: AITransportRequest) {
			sentRequests.push(request);
			return () => {};
		}

		async cancel(): Promise<void> {}
	}

	return { ApiTransport: MockApiTransport };
});

describe("AgentClientService", () => {
	beforeEach(() => {
		sentRequests.length = 0;
		useStore.setState((state) => ({
			ai: {
				...state.ai,
				agentSessionId: null,
				activeRequestId: null,
				isLoading: false,
				messages: [],
			},
		}));
	});

	it("rotates ACP session id when workspace root changes", async () => {
		const client = new AgentClientService();
		const contextA = {
			editorFilepath: "",
			editorContent: "",
			workspaceRoot: "/workspace-a",
		};
		const contextB = {
			editorFilepath: "",
			editorContent: "",
			workspaceRoot: "/workspace-b",
		};

		await client.sendMessage("first", { mode: "agent", context: contextA });
		const firstSessionId = sentRequests[0]?.agentSessionId;
		expect(firstSessionId).toBeTruthy();
		expect(useStore.getState().ai.agentSessionId).toBe(firstSessionId);

		await client.sendMessage("second", { mode: "agent", context: contextA });
		expect(sentRequests[1]?.agentSessionId).toBe(firstSessionId);

		await client.sendMessage("third", { mode: "agent", context: contextB });
		const switchedSessionId = sentRequests[2]?.agentSessionId;
		expect(switchedSessionId).toBeTruthy();
		expect(switchedSessionId).not.toBe(firstSessionId);
		expect(useStore.getState().ai.agentSessionId).toBe(switchedSessionId);
	});
});
