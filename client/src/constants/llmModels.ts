export const LLM_MODELS: Record<string, string[]> = {
	openai: ["gpt-5.1", "gpt-5", "gpt-4o", "o1-preview"],
	anthropic: ["claude-3-5-sonnet-20240620", "claude-3-opus-20240229", "claude-4.5-sonnet"],
};

export const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
	openai: "gpt-4o",
	anthropic: "claude-3-5-sonnet-20240620",
};
