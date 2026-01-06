import type { RefObject } from "react";
import type { StateCreator } from "zustand";
import type { EditorRef } from "@/components/editor/editorRef";
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

export interface EditorState {
	editor: {
		content: string;
		filepath: string;
		isDirty: boolean;
		cursorPosition: {
			line: number;
			column: number;
		};
	};
	monacoEditor: any | null;
	applyCodeChange: ((codeBlock: CodeBlock) => Promise<AppliedCodeChange | null>) | null;
	runCurrentCell: (() => void) | null;
	runAll: (() => void) | null;
	editorRef: RefObject<EditorRef> | null;
	setEditorContent: (content: string) => void;
	setEditorFilepath: (filepath: string) => void;
	setEditorCursorPosition: (position: { line: number; column: number }) => void;
	setEditorIsDirty: (isDirty: boolean) => void;
	setMonacoEditor: (editor: any) => void;
	setApplyCodeChange: (
		handler: (codeBlock: CodeBlock) => Promise<AppliedCodeChange | null>,
	) => void;
	setRunCurrentCell: (handler: () => void) => void;
	setRunAll: (handler: () => void) => void;
	setEditorRef: (editorRef: RefObject<EditorRef> | null) => void;
}

export const createEditorSlice: StateCreator<EditorState> = (set) => ({
	editor: {
		content: DEFAULT_R_SCRIPT,
		filepath: "",
		isDirty: false,
		cursorPosition: { line: 1, column: 1 },
	},
	monacoEditor: null,
	applyCodeChange: null,
	runCurrentCell: null,
	runAll: null,
	editorRef: null,
	setEditorContent: (content) =>
		set((state) => ({
			editor: { ...state.editor, content, isDirty: true },
		})),
	setEditorFilepath: (filepath) =>
		set((state) => ({
			editor: { ...state.editor, filepath },
		})),
	setEditorCursorPosition: (cursorPosition) =>
		set((state) => ({
			editor: { ...state.editor, cursorPosition },
		})),
	setEditorIsDirty: (isDirty) =>
		set((state) => ({
			editor: { ...state.editor, isDirty },
		})),
	setMonacoEditor: (monacoEditor) => set({ monacoEditor }),
	setApplyCodeChange: (handler) => set({ applyCodeChange: handler }),
	setRunCurrentCell: (handler) => set({ runCurrentCell: handler }),
	setRunAll: (handler) => set({ runAll: handler }),
	setEditorRef: (editorRef: RefObject<EditorRef> | null) => set({ editorRef }),
});
