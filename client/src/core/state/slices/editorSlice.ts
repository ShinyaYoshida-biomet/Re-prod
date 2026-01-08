import type { RefObject } from "react";
import type { StateCreator } from "zustand";
import type { EditorRef } from "@/components/editor/editorRef";
import { createBufferId } from "@/core/state/utils/createBufferId";
import type { CodeBlock } from "@/types";

export interface AppliedCodeChange {
	oldContent: string;
	newContent: string;
}

export const DEFAULT_R_SCRIPT = `# Welcome to Re-prod ----
# AI-Powered R Analysis IDE
# Try Cmd/Ctrl+Enter to run current section

# Start coding here
`;

export interface Buffer {
	id: string;
	filepath: string | null;
	content: string;
	isDirty: boolean;
	cursorPosition: {
		line: number;
		column: number;
	};
	scrollPosition?: {
		top: number;
		left: number;
	};
	displayName?: string;
}

export interface EditorState {
	editor: {
		buffers: Buffer[];
		activeBufferId: string | null;
	};
	monacoEditor: any | null;
	applyCodeChange: ((codeBlock: CodeBlock) => Promise<AppliedCodeChange | null>) | null;
	runCurrentCell: (() => void) | null;
	runAll: (() => void) | null;
	editorRef: RefObject<EditorRef> | null;
	addBuffer: (buffer: Buffer) => void;
	removeBuffer: (bufferId: string) => void;
	updateBuffer: (bufferId: string, updates: Partial<Buffer>) => void;
	setActiveBuffer: (bufferId: string) => void;
	getActiveBuffer: () => Buffer | null;
	getBufferById: (id: string) => Buffer | null;
	getBufferByFilepath: (filepath: string) => Buffer | null;
	setMonacoEditor: (editor: any) => void;
	setApplyCodeChange: (
		handler: (codeBlock: CodeBlock) => Promise<AppliedCodeChange | null>,
	) => void;
	setRunCurrentCell: (handler: () => void) => void;
	setRunAll: (handler: () => void) => void;
	setEditorRef: (editorRef: RefObject<EditorRef> | null) => void;
}

const createDefaultBuffer = (): Buffer => ({
	id: createBufferId(),
	filepath: null,
	content: DEFAULT_R_SCRIPT,
	isDirty: false,
	cursorPosition: { line: 1, column: 1 },
	displayName: "Untitled-1",
});

export const createEditorSlice: StateCreator<EditorState> = (set, get) => {
	const initialBuffer = createDefaultBuffer();
	return {
		editor: {
			buffers: [initialBuffer],
			activeBufferId: initialBuffer.id,
		},
		monacoEditor: null,
		applyCodeChange: null,
		runCurrentCell: null,
		runAll: null,
		editorRef: null,
		addBuffer: (buffer) =>
			set((state) => ({
				editor: {
					...state.editor,
					buffers: [...state.editor.buffers, buffer],
					activeBufferId: buffer.id,
				},
			})),
		removeBuffer: (bufferId) =>
			set((state) => ({
				editor: (() => {
					const buffers = state.editor.buffers.filter((buffer) => buffer.id !== bufferId);
					if (buffers.length === 0) {
						const fallback = createDefaultBuffer();
						return {
							...state.editor,
							buffers: [fallback],
							activeBufferId: fallback.id,
						};
					}
					let activeBufferId = state.editor.activeBufferId;
					if (bufferId === state.editor.activeBufferId) {
						const currentIndex = state.editor.buffers.findIndex((buffer) => buffer.id === bufferId);
						const nextIndex = currentIndex < buffers.length ? currentIndex : currentIndex - 1;
						activeBufferId = buffers[nextIndex]?.id ?? null;
					}
					return {
						...state.editor,
						buffers,
						activeBufferId,
					};
				})(),
			})),
		updateBuffer: (bufferId, updates) =>
			set((state) => ({
				editor: {
					...state.editor,
					buffers: state.editor.buffers.map((buffer) =>
						buffer.id === bufferId ? { ...buffer, ...updates } : buffer,
					),
				},
			})),
		setActiveBuffer: (bufferId) =>
			set((state) => ({
				editor: {
					...state.editor,
					activeBufferId: bufferId,
				},
			})),
		getActiveBuffer: () => {
			const state = get();
			const { activeBufferId, buffers } = state.editor;
			if (!activeBufferId) {
				return buffers[0] ?? null;
			}
			return buffers.find((buffer) => buffer.id === activeBufferId) ?? null;
		},
		getBufferById: (id) => {
			const state = get();
			return state.editor.buffers.find((buffer) => buffer.id === id) ?? null;
		},
		getBufferByFilepath: (filepath) => {
			const state = get();
			return state.editor.buffers.find((buffer) => buffer.filepath === filepath) ?? null;
		},
		setMonacoEditor: (monacoEditor) => set({ monacoEditor }),
		setApplyCodeChange: (handler) => set({ applyCodeChange: handler }),
		setRunCurrentCell: (handler) => set({ runCurrentCell: handler }),
		setRunAll: (handler) => set({ runAll: handler }),
		setEditorRef: (editorRef: RefObject<EditorRef> | null) => set({ editorRef }),
	};
};
