import type { AcpDetectedAgent } from "@/types/generated";
import { useEffect, useMemo, useState } from "react";
import { ACP_FEATURE_ENABLED, IS_TAURI } from "@/constants/features";
import { useStore } from "@/core";

export function ExternalAgentSettingsPane(): JSX.Element {
	const activeMode = useStore((state) => state.activeMode);
	const activeAgent = useStore((state) => state.activeAgent);
	const detectedAgents = useStore((state) => state.detectedAgents);
	const setActiveMode = useStore((state) => state.setActiveMode);
	const setActiveAgent = useStore((state) => state.setActiveAgent);
	const setDetectedAgents = useStore((state) => state.setDetectedAgents);
	const [loading, setLoading] = useState(false);
	const enabled = ACP_FEATURE_ENABLED && IS_TAURI;

	const availableAgents = useMemo(
		() => detectedAgents.filter((agent) => agent.available),
		[detectedAgents],
	);

	const fetchAgents = async () => {
		if (!enabled) return;
		setLoading(true);
		try {
			const { invoke } = await import("@tauri-apps/api/core");
			const [agents, config] = await Promise.all([
				invoke<AcpDetectedAgent[]>("acp_detect_agents"),
				invoke<{ active_mode: string; active_agent: string | null }>("acp_get_agent_config"),
			]);
			setDetectedAgents(agents);
			setActiveMode((config.active_mode as "api" | "external_agent") ?? "api");
			setActiveAgent(config.active_agent);
		} catch (error) {
			console.error("Failed to load ACP agents/config", error);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void fetchAgents();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [enabled]);

	const persistConfig = async (mode: "api" | "external_agent", agent: string | null) => {
		if (!enabled) return;
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("acp_set_agent_config", { active_mode: mode, active_agent: agent });
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
							disabled={!ACP_FEATURE_ENABLED || !IS_TAURI}
						/>
						External agent (ACP)
						{!enabled && (
							<small className="hint">
								Enable ACP feature and run inside the desktop app to activate.
							</small>
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
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
