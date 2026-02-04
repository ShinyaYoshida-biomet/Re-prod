import { useEffect } from "react";
import { useStore } from "@/core";
import { getAcpAdminClient } from "@/services/acpAdminClient";

/**
 * Bootstraps ACP (Agent Communication Protocol) configuration on mount.
 *
 * This hook fetches the initial ACP config and detected agents from the
 * admin client, then updates the store with the active mode and agent list.
 */
export function useACPBootstrap(): void {
	const setActiveMode = useStore((state) => state.setActiveMode);
	const setActiveAgent = useStore((state) => state.setActiveAgent);
	const setActiveAgentArgs = useStore((state) => state.setActiveAgentArgs);
	const setDetectedAgents = useStore((state) => state.setDetectedAgents);

	useEffect(() => {
		const initialMode = useStore.getState().activeMode;
		const initialAgent = useStore.getState().activeAgent;
		const bootstrap = async () => {
			try {
				const acpAdminClient = getAcpAdminClient();
				const { config, agents } = await acpAdminClient.bootstrap();
				const current = useStore.getState();
				if (current.activeMode === initialMode) {
					setActiveMode((config.active_mode as "api" | "external_agent") ?? "api");
				}
				if (current.activeAgent === initialAgent) {
					setActiveAgent(config.active_agent);
				}
				setActiveAgentArgs(config.active_agent_args ?? []);
				setDetectedAgents(agents);
			} catch (error) {
				console.error("Failed to bootstrap ACP config", error);
			}
		};

		void bootstrap();
	}, [setActiveAgent, setActiveAgentArgs, setActiveMode, setDetectedAgents]);
}
