import { create } from 'zustand';
import { API_CONFIG_PROVIDER_URL, getApiKeyUrl, getTestConnectionUrl } from '@/constants/urls';

interface Provider {
  name: string;
  displayName: string;
  models: string[];
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
}

const DEFAULT_PROVIDERS: Provider[] = [
  {
    name: 'anthropic',
    displayName: 'Anthropic Claude',
    models: ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229'],
    isConfigured: false,
  },
  {
    name: 'openai',
    displayName: 'OpenAI GPT',
    models: ['gpt-5', 'gpt-4-turbo', 'gpt-4o'],
    isConfigured: false,
  },
];

export const useSettingsStore = create<SettingsState>((set, get) => ({
  activeProvider: 'openai',
  providers: DEFAULT_PROVIDERS,
  isLoading: false,
  error: null,

  fetchSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      // Fetch active provider
      const providerRes = await fetch(API_CONFIG_PROVIDER_URL);
      if (!providerRes.ok) throw new Error('Failed to fetch active provider');
      const { provider } = await providerRes.json();

      // Fetch API key status for each provider
      const updatedProviders = await Promise.all(
        DEFAULT_PROVIDERS.map(async (p) => {
          try {
            const res = await fetch(getApiKeyUrl(p.name));
            if (res.ok) {
              const { api_key } = await res.json();
              return { ...p, isConfigured: true, apiKeyMasked: api_key };
            }
          } catch (e) {
            // Ignore errors, means not configured
          }
          return p;
        })
      );

      set({ activeProvider: provider, providers: updatedProviders, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  setActiveProvider: async (provider: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(API_CONFIG_PROVIDER_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error('Failed to set active provider');
      set({ activeProvider: provider, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  setApiKey: async (provider: string, apiKey: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(getApiKeyUrl(provider), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });
      if (!res.ok) throw new Error('Failed to set API key');
      
      // Refresh settings to get the masked key
      await get().fetchSettings();
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  testConnection: async (provider: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(getTestConnectionUrl(provider), {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Connection test failed');
      set({ isLoading: false });
      return true;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return false;
    }
  },
}));
