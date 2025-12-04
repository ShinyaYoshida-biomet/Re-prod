import { create } from "zustand";
import {
	getApiKeyUrl,
	getModelUrl,
	getApiConfigProviderUrl,
	getTestConnectionUrl,
} from "@/constants/urls";
import { DEFAULT_MODEL_BY_PROVIDER, LLM_MODELS } from "@/constants/llmModels";

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
	hasFetched: boolean;

	fetchSettings: () => Promise<void>;
	setActiveProvider: (provider: string) => Promise<void>;
	setApiKey: (provider: string, apiKey: string) => Promise<void>;
	testConnection: (provider: string) => Promise<boolean>;
	setModel: (provider: string, model: string) => Promise<void>;
	hasAnyConfiguredProvider: () => boolean;
}

const DEFAULT_PROVIDERS: Provider[] = [
	{
		name: "anthropic",
		displayName: "Anthropic Claude",
		models: LLM_MODELS.anthropic,
		activeModel: DEFAULT_MODEL_BY_PROVIDER.anthropic,
		isConfigured: false,
	},
	{
		name: "openai",
		displayName: "OpenAI GPT",
		models: [...LLM_MODELS.openai, "gpt-4o-mini"],
		activeModel: DEFAULT_MODEL_BY_PROVIDER.openai,
		isConfigured: false,
	},
];

export const useSettingsStore = create<SettingsState>((set, get) => ({
	activeProvider: "openai",
	providers: DEFAULT_PROVIDERS,
	isLoading: false,
	error: null,
	hasFetched: false,

	fetchSettings: async () => {
		set({ isLoading: true, error: null });
		try {
			// Fetch active provider
			const providerRes = await fetch(getApiConfigProviderUrl());
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
				hasFetched: true,
			});
		} catch (err: any) {
			set({ error: err.message, isLoading: false, hasFetched: true });
		}
	},

	setActiveProvider: async (provider: string) => {
		set({ isLoading: true, error: null });
		try {
			const res = await fetch(getApiConfigProviderUrl(), {
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

	hasAnyConfiguredProvider: () => {
		const { providers } = get();
		return providers.some((provider) => provider.isConfigured);
	},
}));
