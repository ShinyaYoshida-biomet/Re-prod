import { UI_TIMING } from "@/constants/ui";
import { useStore } from "@/core/state/store";
import { commandRegistry } from "../registry";

export function setupAICommands() {
	commandRegistry.registerMany([
		{
			id: "ai.assist",
			title: "Ask AI Assistant...",
			category: "AI",
			keybinding: "Mod+K",
			execute: () => {
				setTimeout(() => {
					const { aiPanelRef } = useStore.getState();
					if (aiPanelRef) {
						aiPanelRef.focusInput();
					}
				}, UI_TIMING.AI_INPUT_FOCUS_DELAY_MS);
			},
		},
	]);
}
