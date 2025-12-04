import { create } from "zustand";
import {
	API_CONFIG_PROVIDER_URL,
	getApiKeyUrl,
	getModelUrl,
	getTestConnectionUrl,
} from "@/constants/urls";

interface Provider {
	name: string;
	displayName: string;
	models: string[];
	activeModel: string;
	apiKeyMasked?: string;
	isConfigured: boolean;
}

interface SettingsState {
	activeProvider: string;
	providers: Provider[];
	isLoading: boolean;
	error: string | null;

	fetchSettings: () => Promise<void>;
	setActiveProvider: (provider: string) => Promise<void>;
	setApiKey: (provider: string, apiKey: string) => Promise<void>;
	testConnection: (provider: string) => Promise<boolean>;
	setModel: (provider: string, model: string) => Promise<void>;
}

const DEFAULT_PROVIDERS: Provider[] = [
	{
		name: "anthropic",
		displayName: "Anthropic Claude",
		models: ["claude-3-5-sonnet-20240620", "claude-3-opus-20240229", "claude-4.5-sonnet"],
		activeModel: "claude-3-5-sonnet-20240620",
		isConfigured: false,
	},
	{
		name: "openai",
		displayName: "OpenAI GPT",
		models: ["gpt-5.1", "gpt-5", "gpt-4o", "o1-preview"],
		activeModel: "gpt-4o",
		isConfigured: false,
	},
];

export const useSettingsStore = create<SettingsState>((set, get) => ({
	activeProvider: "openai",
	providers: DEFAULT_PROVIDERS,
	isLoading: false,
	error: null,

	fetchSettings: async () => {
		set({ isLoading: true, error: null });
		try {
			// Fetch active provider
			const providerRes = await fetch(API_CONFIG_PROVIDER_URL);
			if (!providerRes.ok) throw new Error("Failed to fetch active provider");
			const { provider } = await providerRes.json();

			// Fetch API key status and model for each provider
			const updatedProviders = await Promise.all(
				DEFAULT_PROVIDERS.map(async (p) => {
					let activeModel = p.activeModel;
					let models = [...p.models];
					try {
						const modelRes = await fetch(getModelUrl(p.name));
						if (modelRes.ok) {
							const { model } = await modelRes.json();
							activeModel = model;
							if (!models.includes(activeModel)) {
								models = [...models, activeModel];
							}
						}
					} catch (_) {
						// Ignore errors, fallback to default activeModel
					}

					try {
						const res = await fetch(getApiKeyUrl(p.name));
						if (res.ok) {
							const { api_key } = await res.json();
							return {
								...p,
								isConfigured: true,
								apiKeyMasked: api_key,
								activeModel,
								models,
							};
						}
					} catch (_) {
						// Ignore errors, means not configured
					}
					return { ...p, activeModel, models };
				}),
			);

			set({
				activeProvider: provider,
				providers: updatedProviders,
				isLoading: false,
			});
		} catch (err: any) {
			set({ error: err.message, isLoading: false });
		}
	},

	setActiveProvider: async (provider: string) => {
		set({ isLoading: true, error: null });
		try {
			const res = await fetch(API_CONFIG_PROVIDER_URL, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider }),
			});
			if (!res.ok) throw new Error("Failed to set active provider");
			set({ activeProvider: provider, isLoading: false });
		} catch (err: any) {
			set({ error: err.message, isLoading: false });
		}
	},

	setApiKey: async (provider: string, apiKey: string) => {
		set({ isLoading: true, error: null });
		try {
			const res = await fetch(getApiKeyUrl(provider), {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ api_key: apiKey }),
			});
			if (!res.ok) throw new Error("Failed to set API key");

			// Refresh settings to get the masked key
			await get().fetchSettings();
		} catch (err: any) {
			set({ error: err.message, isLoading: false });
		}
	},

	setModel: async (provider: string, model: string) => {
		set((state) => ({
			isLoading: true,
			error: null,
			providers: state.providers.map((p) =>
				p.name === provider
					? {
							...p,
							activeModel: model,
							models: p.models.includes(model) ? p.models : [...p.models, model],
						}
					: p,
			),
		}));
		try {
			const res = await fetch(getModelUrl(provider), {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ model }),
			});
			if (!res.ok) throw new Error("Failed to set model");

			set({ isLoading: false });
		} catch (err: any) {
			set((state) => ({
				error: err.message,
				isLoading: false,
				providers: state.providers,
			}));
		}
	},

	testConnection: async (provider: string) => {
		set({ isLoading: true, error: null });
		try {
			const res = await fetch(getTestConnectionUrl(provider), {
				method: "POST",
			});
			if (!res.ok) throw new Error("Connection test failed");
			set({ isLoading: false });
			return true;
		} catch (err: any) {
			set({ error: err.message, isLoading: false });
			return false;
		}
	},
}));
