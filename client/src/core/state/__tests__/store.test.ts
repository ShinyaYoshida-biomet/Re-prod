import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../store";

const createExecutionResult = () => ({
	code: "x <- 1",
	stdout: "output",
	stderr: "",
	plots: [],
	timestamp: Date.now(),
	duration: 100,
	success: true,
});

const createAIMessage = () => ({
	id: "msg-1",
	role: "user" as const,
	content: "Test message",
	timestamp: Date.now(),
});

describe("Zustand Store", () => {
	beforeEach(() => {
		useStore.setState({
			editor: {
				content: "",
				filepath: "",
				isDirty: false,
				cursorPosition: { line: 1, column: 1 },
			},
			applyCodeChange: null,
			execution: {
				isRunning: false,
				results: [],
				history: [],
				currentCell: undefined,
			},
			ai: {
				messages: [],
				isLoading: false,
				suggestions: [],
			},
			settings: {
				autoRun: false,
				theme: "phylo",
				rPath: "Rscript",
				fontSize: 13,
				showCellDecorations: true,
				highlightExecutingCell: true,
			},
			isConnected: false,
		});
	});

	it("updates editor content and dirty flag", () => {
		const setEditorContent = useStore.getState().setEditorContent;

		setEditorContent("x <- 1");

		const state = useStore.getState();
		expect(state.editor.content).toBe("x <- 1");
		expect(state.editor.isDirty).toBe(true);
	});

	it("tracks execution results in history", () => {
		const appendExecutionEntry = useStore.getState().appendExecutionEntry;
		const result = createExecutionResult();

		appendExecutionEntry(result);

		const state = useStore.getState();
		expect(state.execution.results).toHaveLength(1);
		expect(state.execution.history).toHaveLength(1);
	});

	it("stores AI messages", () => {
		const addAIMessage = useStore.getState().addAIMessage;
		const message = createAIMessage();

		addAIMessage(message);

		const state = useStore.getState();
		expect(state.ai.messages).toHaveLength(1);
		expect(state.ai.messages[0]).toMatchObject({ id: "msg-1", role: "user" });
	});

	it("updates connection state", () => {
		const setConnected = useStore.getState().setConnected;

		setConnected(true);

		expect(useStore.getState().isConnected).toBe(true);
	});
});
