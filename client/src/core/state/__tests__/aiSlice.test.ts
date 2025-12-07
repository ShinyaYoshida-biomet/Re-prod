import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { type AIState, createAISlice } from "../slices/aiSlice";

function createTestStore() {
	return createStore<AIState>()((...args) => createAISlice(...args));
}

describe("aiSlice streaming helpers", () => {
	it("handles streaming lifecycle", () => {
		const store = createTestStore();
		store.getState().startStreamingMessage("msg-1", "agent");

		store.getState().appendStreamingChunk("msg-1", "Hello");
		store.getState().appendStreamingChunk("msg-1", " world");
		expect(store.getState().ai.messages.at(-1)?.content).toBe("Hello world");
		expect(store.getState().ai.messages.at(-1)?.mode).toBe("agent");

		const plan = [{ id: "plan-1", title: "Step", status: "running" as const }];
		store.getState().updateStreamingPlan("msg-1", plan);
		expect(store.getState().ai.messages.at(-1)?.planSteps).toEqual(plan);

		store.getState().recordToolEvent("msg-1", {
			id: "tool-1",
			name: "read_file",
			status: "running",
			input: { path: "analysis.R" },
		});
		expect(store.getState().ai.messages.at(-1)?.toolLogs).toHaveLength(1);

		store.getState().completeStreamingMessage("msg-1", "Hello world!");
		const message = store.getState().ai.messages.at(-1);
		expect(message?.isComplete).toBe(true);
		expect(message?.content).toBe("Hello world!");
	});

	it("merges plan updates by id", () => {
		const store = createTestStore();
		store.getState().startStreamingMessage("msg-2", "agent");

		store
			.getState()
			.updateStreamingPlan("msg-2", [{ id: "step-1", title: "Inspect data", status: "pending" }]);

		store.getState().updateStreamingPlan("msg-2", [
			{ id: "step-1", title: "Inspect data", status: "running", error: "optional" },
			{ id: "step-2", title: "Compute", status: "pending" },
		]);

		const plan = store.getState().ai.messages.at(-1)?.planSteps;
		expect(plan).toHaveLength(2);
		expect(plan?.find((step) => step.id === "step-1")?.status).toBe("running");
		expect(plan?.find((step) => step.id === "step-1")?.title).toBe("Inspect data");
	});
});
