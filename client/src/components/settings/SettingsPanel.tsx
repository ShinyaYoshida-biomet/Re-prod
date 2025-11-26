import type React from "react";
import { useEffect } from "react";
import { useSettingsStore } from "../../core/state/slices/settingsStore";
import { LLMProviderConfig } from "./LLMProviderConfig";
import "./SettingsPanel.css";

export const SettingsPanel: React.FC = () => {
	const { providers, activeProvider, setActiveProvider, fetchSettings, isLoading } =
		useSettingsStore();

	useEffect(() => {
		fetchSettings();
	}, []);

	if (isLoading && providers.length === 0) {
		return <div className="settings-loading">Loading settings...</div>;
	}

	return (
		<div className="settings-panel">
			<div className="settings-section">
				<h3>Active Provider</h3>
				<select
					value={activeProvider}
					onChange={(e) => setActiveProvider(e.target.value)}
					className="provider-select"
				>
					{providers.map((p) => (
						<option key={p.name} value={p.name}>
							{p.displayName} {p.isConfigured ? "(Configured)" : "(Not Configured)"}
						</option>
					))}
				</select>
			</div>

			<div className="settings-section">
				<h3>Provider Configuration</h3>
				{providers.map((provider) => (
					<LLMProviderConfig
						key={provider.name}
						providerName={provider.name}
						displayName={provider.displayName}
						models={provider.models}
						isConfigured={provider.isConfigured}
						apiKeyMasked={provider.apiKeyMasked}
					/>
				))}
			</div>
		</div>
	);
};
