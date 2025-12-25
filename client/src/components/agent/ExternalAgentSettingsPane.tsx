import type { AcpAgentConfig, AcpDetectedAgent } from "@/types/generated";
import { useCallback, useEffect, useMemo } from "react";
import { ACP_FEATURE_ENABLED, IS_TAURI } from "@/constants/features";
import { useStore } from "@/core";
import { useAsyncState } from "@/hooks/useAsyncState";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	if (!response.ok) {
		throw new Error(`Request failed: ${response.status}`);
	}
	return (await response.json()) as T;
}

export function ExternalAgentSettingsPane(): JSX.Element {
	const activeMode = useStore((state) => state.activeMode);
	const activeAgent = useStore((state) => state.activeAgent);
	const detectedAgents = useStore((state) => state.detectedAgents);
	const setActiveMode = useStore((state) => state.setActiveMode);
	const setActiveAgent = useStore((state) => state.setActiveAgent);
	const setDetectedAgents = useStore((state) => state.setDetectedAgents);
	const enabled = ACP_FEATURE_ENABLED;
	const isWindows = typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

	const availableAgents = useMemo(
		() => detectedAgents.filter((agent) => agent.available),
		[detectedAgents],
	);

	const fetchAgentsAsync = useCallback(async () => {
		if (!enabled) return null;
		if (IS_TAURI) {
			const { invoke } = await import("@tauri-apps/api/core");
			const [agents, config] = await Promise.all([
				invoke<AcpDetectedAgent[]>("acp_detect_agents"),
				invoke<{ active_mode: string; active_agent: string | null }>("acp_get_agent_config"),
			]);
			setDetectedAgents(agents);
			setActiveMode((config.active_mode as "api" | "external_agent") ?? "api");
			setActiveAgent(config.active_agent);
		} else {
			const [agents, config] = await Promise.all([
				fetchJson<AcpDetectedAgent[]>("/api/acp/agents"),
				fetchJson<AcpAgentConfig>("/api/acp/config"),
			]);
			setDetectedAgents(agents);
			setActiveMode((config.active_mode as "api" | "external_agent") ?? "api");
			setActiveAgent(config.active_agent);
		}
		return null;
	}, [enabled, setDetectedAgents, setActiveMode, setActiveAgent]);

	const { loading, execute: fetchAgents } = useAsyncState(fetchAgentsAsync, {
		onError: (error) => console.error("Failed to load ACP agents/config", error),
	});

	useEffect(() => {
		if (enabled) {
			void fetchAgents();
		}
	}, [enabled, fetchAgents]);

	const persistConfig = async (mode: "api" | "external_agent", agent: string | null) => {
		if (!enabled) return;
		if (IS_TAURI) {
			const { invoke } = await import("@tauri-apps/api/core");
			await invoke("acp_set_agent_config", { active_mode: mode, active_agent: agent });
			return;
		}
		await fetchJson<AcpAgentConfig>("/api/acp/config", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ active_mode: mode, active_agent: agent }),
		});
	};

	const handleModeChange = async (mode: "api" | "external_agent") => {
		setActiveMode(mode);
		if (mode === "api") {
			setActiveAgent(null);
			await persistConfig(mode, null);
		} else {
			await persistConfig(mode, activeAgent);
		}
	};

	const handleSelectAgent = async (agentId: string) => {
		setActiveMode("external_agent");
		setActiveAgent(agentId);
		await persistConfig("external_agent", agentId);
	};

	return (
		<div className="external-agent-pane">
			<div className="settings-row">
				<span>
					Mode
					<small>Switch between built-in providers and an external ACP agent.</small>
				</span>
				<div
					className="settings-radio-group"
					style={{ display: "flex", flexDirection: "column", gap: 8 }}
				>
					<label>
						<input
							type="radio"
							name="agent-mode"
							checked={activeMode === "api"}
							onChange={() => handleModeChange("api")}
						/>
						Use API providers
					</label>
					<label>
						<input
							type="radio"
							name="agent-mode"
							checked={activeMode === "external_agent"}
							onChange={() => handleModeChange("external_agent")}
							disabled={!ACP_FEATURE_ENABLED}
						/>
						External agent (ACP)
						{!ACP_FEATURE_ENABLED && (
							<small className="hint">Enable ACP feature flag to activate.</small>
						)}
					</label>
				</div>
			</div>
			{activeMode === "external_agent" && (
				<div className="settings-block">
					<div className="settings-row">
						<span>
							Detected agents
							<small>macOS/Linux only; refresh after installing binaries.</small>
						</span>
						<button
							type="button"
							className="btn btn-secondary"
							onClick={fetchAgents}
							disabled={loading}
						>
							{loading ? "Checking..." : "Refresh"}
						</button>
					</div>
					<div className="agent-list">
						{detectedAgents.map((agent) => (
							<label key={agent.id} className={`agent-row ${!agent.available ? "disabled" : ""}`}>
								<input
									type="radio"
									name="agent-select"
									disabled={!agent.available}
									checked={activeAgent === agent.id}
									onChange={() => handleSelectAgent(agent.id)}
								/>
								<div className="agent-info">
									<div className="agent-name">
										{agent.name} {agent.available ? "" : "(not found)"}
									</div>
									<div className="agent-path">{agent.path ?? agent.command}</div>
								</div>
							</label>
						))}
						{detectedAgents.length === 0 && <div className="agent-empty">No known agents yet.</div>}
						{availableAgents.length === 0 && (
							<div className="agent-empty-note">
								Install an ACP agent (e.g. claude-code-acp) and refresh.
								{isWindows && " On Windows, ensure the binary (or .cmd) is on PATH."}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
