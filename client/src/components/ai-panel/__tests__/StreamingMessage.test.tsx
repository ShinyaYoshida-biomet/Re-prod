import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "@/core";
import type { AIMessage } from "@/types";
import { StreamingMessage } from "../StreamingMessage";

const { readFileMock } = vi.hoisted(() => ({
	readFileMock: vi.fn().mockResolvedValue("file contents"),
}));

vi.mock("@/services/fileSystem", () => ({
	fileSystem: {
		readFile: readFileMock,
	},
}));

vi.mock("@/components/shared", async () => {
	const actual = await vi.importActual<typeof import("@/components/shared")>("@/components/shared");
	return {
		...actual,
		useToast: () => ({
			showToast: vi.fn(),
			showInfo: vi.fn(),
			showSuccess: vi.fn(),
			showWarning: vi.fn(),
			showError: vi.fn(),
		}),
	};
});

const renderMessage = (overrides: Partial<AIMessage> = {}) => {
	const message: AIMessage = {
		id: "msg-1",
		role: "assistant",
		content: "",
		timestamp: Date.now(),
		...overrides,
	};

	return render(<StreamingMessage message={message} onApplyCode={async () => undefined} />);
};

beforeEach(() => {
	readFileMock.mockClear();
	useStore.setState((state) => ({
		editor: {
			...state.editor,
			buffers: [
				{
					id: "buffer-1",
					filepath: null,
					content: "",
					isDirty: false,
					cursorPosition: { line: 1, column: 1 },
				},
			],
			activeBufferId: "buffer-1",
		},
	}));
});

describe("StreamingMessage read file indicator", () => {
	it("renders completed read tool paths", () => {
		renderMessage({
			toolLogs: [
				{
					id: "tool-1",
					name: "read_text_file",
					status: "done",
					input: { path: "analysis.R" },
				},
			],
		});

		expect(screen.getByRole("button", { name: "analysis.R" })).toBeInTheDocument();
	});

	it("opens the file in the editor when a path is clicked", async () => {
		renderMessage({
			toolLogs: [
				{
					id: "tool-2",
					name: "read_text_file",
					status: "done",
					input: { path: "analysis.R" },
				},
			],
		});

		await userEvent.click(screen.getByRole("button", { name: "analysis.R" }));

		await waitFor(() => {
			expect(readFileMock).toHaveBeenCalledWith("analysis.R");
		});

		const activeBuffer = useStore.getState().getActiveBuffer();
		expect(activeBuffer?.filepath).toBe("analysis.R");
		expect(activeBuffer?.content).toBe("file contents");
		expect(activeBuffer?.isDirty).toBe(false);
	});
});
