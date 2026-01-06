import type { AIMode } from "@/types";
import type { AcpPromptMessage } from "@/types/generated";
import prompts from "./systemPrompts.json";

const toSystemMessage = (content: string): AcpPromptMessage => ({
	role: "system",
	content,
});

export const getAcpSystemPrompts = (mode: AIMode): AcpPromptMessage[] => {
	if (mode === "chat") {
		return [toSystemMessage(prompts.chat)];
	}
	return [toSystemMessage(prompts.patch), toSystemMessage(prompts.range)];
};
