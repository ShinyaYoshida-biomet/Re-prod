import { useCallback, useEffect, useMemo } from "react";
import { useStore } from "@/core";
import { useAsyncState } from "@/hooks/useAsyncState";
import { getAcpAdminClient } from "@/services/acpAdminClient";
import { classNames } from "@/utils/classNames";

export function ExternalAgentSettingsPane(): JSX.Element {
	const activeAgent = useStore((state) => state.activeAgent);
	const detectedAgents = useStore((state) => state.detectedAgents);
	const setActiveMode = useStore((state) => state.setActiveMode);
	const setActiveAgent = useStore((state) => state.setActiveAgent);
	const setDetectedAgents = useStore((state) => state.setDetectedAgents);
	const acpAdminClient = useMemo(() => getAcpAdminClient(), []);

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

	const handleSelectAgent = async (agentId: string) => {
		setActiveMode("external_agent");
		setActiveAgent(agentId);
		await persistConfig("external_agent", agentId);
	};

	return (
		<div className="external-agent-pane">
			<div className="external-agent-header">
				<h3>External Agents (ACP)</h3>
				<button
					type="button"
					className="btn btn-secondary"
					onClick={fetchAgents}
					disabled={loading}
				>
					{loading ? "Refreshing..." : "Refresh"}
				</button>
			</div>
			<div className="agent-list">
				{detectedAgents.map((agent) => (
					<label
						key={agent.id}
						className={classNames("agent-item", !agent.available && "disabled")}
					>
						<input
							type="radio"
							name="agent-select"
							disabled={!agent.available}
							checked={activeAgent === agent.id}
							onChange={() => void handleSelectAgent(agent.id)}
						/>
						<div className="agent-info">
							<div className="agent-name">
								{agent.name} {agent.available ? "" : "(not found)"}
							</div>
							<div className="agent-path">{agent.path ?? agent.command}</div>
						</div>
					</label>
				))}
				{detectedAgents.length === 0 && (
					<div className="agent-empty">No agents found. Install an ACP agent and refresh.</div>
				)}
			</div>
		</div>
	);
}
