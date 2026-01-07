export interface ProviderIcon {
	path: string;
	alt: string;
	format: "svg" | "png";
}

export interface ProviderMetadata {
	name: string;
	displayName: string;
	icon: ProviderIcon;
	brandColor?: string;
}

export type ProviderId = "anthropic" | "openai" | "gemini";

const PROVIDER_ICON_FILENAMES: Record<ProviderId, string> = {
	anthropic: "Claude symbol - Clay.svg",
	openai: "OpenAI-black-monoblossom.svg",
	gemini: "gemini-color.png",
};

export const PROVIDER_METADATA: Record<ProviderId, ProviderMetadata> = {
	anthropic: {
		name: "anthropic",
		displayName: "Claude",
		icon: {
			path: `/icons/providers/${PROVIDER_ICON_FILENAMES.anthropic}`,
			alt: "Anthropic Claude",
			format: "svg",
		},
		brandColor: "#D97757",
	},
	openai: {
		name: "openai",
		displayName: "OpenAI",
		icon: {
			path: `/icons/providers/${PROVIDER_ICON_FILENAMES.openai}`,
			alt: "OpenAI",
			format: "svg",
		},
		brandColor: "#10A37F",
	},
	gemini: {
		name: "gemini",
		displayName: "Gemini",
		icon: {
			path: `/icons/providers/${PROVIDER_ICON_FILENAMES.gemini}`,
			alt: "Google Gemini",
			format: "png",
		},
		brandColor: "#4285F4",
	},
};

const PROVIDER_ALIASES: Record<string, ProviderId> = {
	"claude-code-acp": "anthropic",
	anthropic: "anthropic",
	claude: "anthropic",
	codex: "openai",
	openai: "openai",
	"openai-gpt": "openai",
	gemini: "gemini",
};

export const resolveProviderMetadata = (name?: string | null): ProviderMetadata | null => {
	if (!name) return null;
	const key = PROVIDER_ALIASES[name] ?? name;
	return key in PROVIDER_METADATA ? PROVIDER_METADATA[key as ProviderId] : null;
};
