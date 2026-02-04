import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/core";
import { useAsyncState } from "@/hooks/useAsyncState";
import { getAcpAdminClient } from "@/services/acpAdminClient";
import { classNames } from "@/utils/classNames";

export function ExternalAgentSettingsPane(): JSX.Element {
	const activeAgent = useStore((state) => state.activeAgent);
	const activeAgentArgs = useStore((state) => state.activeAgentArgs);
	const detectedAgents = useStore((state) => state.detectedAgents) ?? [];
	const setActiveMode = useStore((state) => state.setActiveMode);
	const setActiveAgent = useStore((state) => state.setActiveAgent);
	const setActiveAgentArgs = useStore((state) => state.setActiveAgentArgs);
	const setDetectedAgents = useStore((state) => state.setDetectedAgents);
	const acpAdminClient = useMemo(() => getAcpAdminClient(), []);
	const [argsDraft, setArgsDraft] = useState("");

	const fetchAgentsAsync = useCallback(async () => {
		const agents = await acpAdminClient.detectAgents();
		setDetectedAgents(agents);
		return null;
	}, [acpAdminClient, setDetectedAgents]);

	const { loading, execute: fetchAgents } = useAsyncState(fetchAgentsAsync, {
		onError: (error) => console.error("Failed to load ACP agents", error),
	});

	useEffect(() => {
		void fetchAgents();
	}, [fetchAgents]);

	useEffect(() => {
		setArgsDraft(activeAgentArgs.join("\n"));
	}, [activeAgentArgs]);

	const parseArgs = (text: string): string[] =>
		text
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

	const persistConfig = async (
		mode: "api" | "external_agent",
		agent: string | null,
		args: string[] | null,
	) => {
		await acpAdminClient.setConfig(mode, agent, args);
	};

	const handleSelectAgent = async (agentId: string) => {
		setActiveMode("external_agent");
		setActiveAgent(agentId);
		await persistConfig("external_agent", agentId, activeAgentArgs);
	};

	const handleSaveArgs = async () => {
		const parsedArgs = parseArgs(argsDraft);
		setActiveAgentArgs(parsedArgs);
		if (!activeAgent) {
			return;
		}
		await persistConfig("external_agent", activeAgent, parsedArgs);
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
			<div className="agent-args-row">
				<label className="agent-args-label" htmlFor="acp-agent-args">
					Extra launch args (one per line)
				</label>
				<textarea
					id="acp-agent-args"
					className="agent-args-input"
					rows={4}
					value={argsDraft}
					onChange={(event) => setArgsDraft(event.target.value)}
					placeholder={"--approval-mode\nauto_edit"}
				/>
				<div className="agent-args-actions">
					<button
						type="button"
						className="btn btn-secondary"
						onClick={() => setArgsDraft(activeAgentArgs.join("\n"))}
					>
						Reset
					</button>
					<button
						type="button"
						className="btn btn-primary"
						onClick={() => void handleSaveArgs()}
						disabled={!activeAgent}
					>
						Save args
					</button>
				</div>
			</div>
		</div>
	);
}
