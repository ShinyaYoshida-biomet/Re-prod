import { IS_TAURI } from "@/constants/features";
import { getApiBaseUrl } from "@/constants/urls";
import type { AcpAgentConfig, AcpDetectedAgent } from "@/types/generated";

export type AcpMode = "api" | "external_agent";

export interface AcpAdminClient {
	detectAgents(): Promise<AcpDetectedAgent[]>;
	getConfig(): Promise<AcpAgentConfig>;
	setConfig(mode: AcpMode, agent: string | null, args: string[] | null): Promise<AcpAgentConfig>;
	bootstrap(): Promise<{ config: AcpAgentConfig; agents: AcpDetectedAgent[] }>;
}

const clients: { desktop?: AcpAdminClient; web?: AcpAdminClient } = {};

export const getAcpAdminClient = (): AcpAdminClient => {
	if (IS_TAURI) {
		if (!clients.desktop) {
			clients.desktop = new DesktopAcpAdminClient();
		}
		return clients.desktop;
	}

	if (!clients.web) {
		clients.web = new WebAcpAdminClient();
	}
	return clients.web;
};

class DesktopAcpAdminClient implements AcpAdminClient {
	async detectAgents(): Promise<AcpDetectedAgent[]> {
		const { invoke } = await import("@tauri-apps/api/core");
		return invoke<AcpDetectedAgent[]>("acp_detect_agents");
	}

	async getConfig(): Promise<AcpAgentConfig> {
		const { invoke } = await import("@tauri-apps/api/core");
		return invoke<AcpAgentConfig>("acp_get_agent_config");
	}

	async setConfig(
		mode: AcpMode,
		agent: string | null,
		args: string[] | null,
	): Promise<AcpAgentConfig> {
		const { invoke } = await import("@tauri-apps/api/core");
		return invoke<AcpAgentConfig>("acp_set_agent_config", {
			activeMode: mode,
			activeAgent: agent,
			activeAgentArgs: args,
		});
	}

	async bootstrap(): Promise<{ config: AcpAgentConfig; agents: AcpDetectedAgent[] }> {
		const [config, agents] = await Promise.all([this.getConfig(), this.detectAgents()]);
		return { config, agents };
	}
}

class WebAcpAdminClient implements AcpAdminClient {
	async detectAgents(): Promise<AcpDetectedAgent[]> {
		return fetchJson<AcpDetectedAgent[]>(getAcpApiUrl("agents"));
	}

	async getConfig(): Promise<AcpAgentConfig> {
		return fetchJson<AcpAgentConfig>(getAcpApiUrl("config"));
	}

	async setConfig(
		mode: AcpMode,
		agent: string | null,
		args: string[] | null,
	): Promise<AcpAgentConfig> {
		return fetchJson<AcpAgentConfig>(getAcpApiUrl("config"), {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ active_mode: mode, active_agent: agent, active_agent_args: args }),
		});
	}

	async bootstrap(): Promise<{ config: AcpAgentConfig; agents: AcpDetectedAgent[] }> {
		const [config, agents] = await Promise.all([this.getConfig(), this.detectAgents()]);
		return { config, agents };
	}
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	if (!response.ok) {
		throw new Error(`Request failed: ${response.status}`);
	}
	return (await response.json()) as T;
}

const getAcpApiUrl = (path: string): string => `${getApiBaseUrl()}/acp/${path}`;
