import { useCallback, useMemo } from "react";
import { useStore } from "@/core";
import { getAcpAdminClient } from "@/services/acpAdminClient";

type ProviderMode = "api" | "external_agent";

interface ModeOptionProps {
	checked: boolean;
	description: string;
	label: string;
	mode: ProviderMode;
	onSelect: (mode: ProviderMode) => void;
}

function ModeOption({ checked, description, label, mode, onSelect }: ModeOptionProps): JSX.Element {
	return (
		<label className="mode-option">
			<input
				aria-label={label}
				type="radio"
				name="ai-provider-mode"
				checked={checked}
				onChange={() => void onSelect(mode)}
			/>
			<div className="mode-content">
				<div className="mode-title">{label}</div>
				<div className="mode-description">{description}</div>
			</div>
		</label>
	);
}

export function AIProviderSettingsPane(): JSX.Element {
	const activeMode = useStore((state) => state.activeMode);
	const activeAgent = useStore((state) => state.activeAgent);
	const setActiveMode = useStore((state) => state.setActiveMode);
	const setActiveAgent = useStore((state) => state.setActiveAgent);
	const acpAdminClient = useMemo(() => getAcpAdminClient(), []);

	const handleModeChange = useCallback(
		async (mode: ProviderMode) => {
			setActiveMode(mode);
			if (mode === "api") {
				setActiveAgent(null);
				await acpAdminClient.setConfig(mode, null);
				return;
			}

			await acpAdminClient.setConfig(mode, activeAgent);
		},
		[acpAdminClient, activeAgent, setActiveAgent, setActiveMode],
	);

	return (
		<div className="ai-provider-pane">
			<div className="mode-selection">
				<ModeOption
					checked={activeMode === "api"}
					description="Use built-in API providers (Claude, Gemini, etc.)"
					label="API Providers"
					mode="api"
					onSelect={handleModeChange}
				/>
				<ModeOption
					checked={activeMode === "external_agent"}
					description="Use an ACP-compatible agent."
					label="External Agent (ACP)"
					mode="external_agent"
					onSelect={handleModeChange}
				/>
			</div>
		</div>
	);
}
