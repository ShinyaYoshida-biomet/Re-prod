import { useState, useCallback, useMemo } from "react";
import type { AIMessage } from "@/types";

interface UsePromptHistoryOptions {
	messages: AIMessage[];
	currentInput: string;
	setInput: (value: string) => void;
}

interface UsePromptHistoryReturn {
	navigateUp: () => boolean; // Returns true if navigation occurred
	navigateDown: () => boolean; // Returns true if navigation occurred
	resetNavigation: () => void; // Called when user types
	isNavigating: boolean; // True if viewing history
	historyIndex: number; // Current position (-1 = not navigating)
	historyLength: number; // Total user prompts available
}

export function usePromptHistory(options: UsePromptHistoryOptions): UsePromptHistoryReturn {
	const { messages, currentInput, setInput } = options;

	// Extract user prompts from messages (most recent last)
	const userPrompts = useMemo(
		() => messages.filter((m) => m.role === "user").map((m) => m.content),
		[messages],
	);

	// -1 means "not navigating" (showing current input)
	const [historyIndex, setHistoryIndex] = useState(-1);

	// Store the "draft" input when user starts navigating
	const [draftInput, setDraftInput] = useState("");

	const navigateUp = useCallback(() => {
		if (userPrompts.length === 0) return false;

		if (historyIndex === -1) {
			// Starting navigation - save current input as draft
			setDraftInput(currentInput);
			const newIndex = userPrompts.length - 1;
			setHistoryIndex(newIndex);
			setInput(userPrompts[newIndex]);
		} else if (historyIndex > 0) {
			// Navigate to older prompt
			const newIndex = historyIndex - 1;
			setHistoryIndex(newIndex);
			setInput(userPrompts[newIndex]);
		} else {
			// Already at oldest - don't navigate
			return false;
		}
		return true;
	}, [userPrompts, historyIndex, currentInput, setInput]);

	const navigateDown = useCallback(() => {
		if (historyIndex === -1) return false; // Not navigating

		if (historyIndex < userPrompts.length - 1) {
			// Navigate to newer prompt
			const newIndex = historyIndex + 1;
			setHistoryIndex(newIndex);
			setInput(userPrompts[newIndex]);
		} else {
			// Return to draft input
			setHistoryIndex(-1);
			setInput(draftInput);
		}
		return true;
	}, [userPrompts, historyIndex, draftInput, setInput]);

	const resetNavigation = useCallback(() => {
		if (historyIndex !== -1) {
			setHistoryIndex(-1);
			setDraftInput("");
		}
	}, [historyIndex]);

	return {
		navigateUp,
		navigateDown,
		resetNavigation,
		isNavigating: historyIndex !== -1,
		historyIndex,
		historyLength: userPrompts.length,
	};
}
