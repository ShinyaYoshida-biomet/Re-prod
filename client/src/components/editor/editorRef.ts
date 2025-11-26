export interface EditorRef {
	navigateToLine: (lineNumber: number) => void;
	focus: () => void;
}
