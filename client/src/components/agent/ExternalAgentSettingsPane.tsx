import { useCallback, useEffect, useMemo } from "react";
import { useStore } from "@/core";
import { useAsyncState } from "@/hooks/useAsyncState";
import { getAcpAdminClient } from "@/services/acpAdminClient";
import { classNames } from "@/utils/classNames";

export function ExternalAgentSettingsPane(): JSX.Element {
	const activeMode = useStore((state) => state.activeMode);
	const activeAgent = useStore((state) => state.activeAgent);
	const detectedAgents = useStore((state) => state.detectedAgents);
	const setActiveMode = useStore((state) => state.setActiveMode);
	const setActiveAgent = useStore((state) => state.setActiveAgent);
	const setDetectedAgents = useStore((state) => state.setDetectedAgents);
	const isWindows = typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");
	const acpAdminClient = useMemo(() => getAcpAdminClient(), []);

	const availableAgents = useMemo(
		() => detectedAgents.filter((agent) => agent.available),
		[detectedAgents],
	);

	const fetchAgentsAsync = useCallback(async () => {
		const { config, agents } = await acpAdminClient.bootstrap();
		setDetectedAgents(agents);
		setActiveMode((config.active_mode as "api" | "external_agent") ?? "api");
		setActiveAgent(config.active_agent);
		return null;
	}, [acpAdminClient, setDetectedAgents, setActiveMode, setActiveAgent]);

	const { loading, execute: fetchAgents } = useAsyncState(fetchAgentsAsync, {
		onError: (error) => console.error("Failed to load ACP agents/config", error),
	});

	useEffect(() => {
		void fetchAgents();
	}, [fetchAgents]);

	const persistConfig = async (mode: "api" | "external_agent", agent: string | null) => {
		await acpAdminClient.setConfig(mode, agent);
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
						/>
						External agent (ACP)
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
							<label
								key={agent.id}
								className={classNames("agent-row", !agent.available && "disabled")}
							>
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
								Install an ACP agent (e.g. claude-code-acp, codex-acp) and refresh.
								{isWindows && " On Windows, ensure the binary (or .cmd) is on PATH."}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
