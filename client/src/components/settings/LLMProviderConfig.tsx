import type React from "react";
import { useState } from "react";
import { useSettingsStore } from "../../core/state/slices/settingsStore";
import { TEST_STATUS_RESET_DELAY } from "../../constants/timeouts";
import "./LLMProviderConfig.css";

interface Props {
	providerName: string;
	displayName: string;
	models: string[];
	activeModel: string;
	isConfigured: boolean;
	apiKeyMasked?: string;
	onModelChange: (model: string) => void;
}

export const LLMProviderConfig: React.FC<Props> = ({
	providerName,
	displayName,
	models,
	activeModel,
	isConfigured,
	apiKeyMasked,
	onModelChange,
}) => {
	const { setApiKey, testConnection } = useSettingsStore();
	const [apiKey, setLocalApiKey] = useState("");
	const [isEditing, setIsEditing] = useState(!isConfigured);
	const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "failed">("idle");

	const handleSave = async () => {
		if (!apiKey) return;
		await setApiKey(providerName, apiKey);
		setIsEditing(false);
		setLocalApiKey("");
	};

	const handleTest = async () => {
		setTestStatus("testing");
		const success = await testConnection(providerName);
		setTestStatus(success ? "success" : "failed");
		setTimeout(() => setTestStatus("idle"), TEST_STATUS_RESET_DELAY);
	};

	return (
		<div className="llm-provider-config">
			<div className="provider-header">
				<span className="provider-name">{displayName}</span>
				{isConfigured && <span className="status-badge success">Configured</span>}
			</div>

			<div className="config-row">
				<label>API Key:</label>
				{isEditing ? (
					<div className="input-group">
						<input
							type="password"
							value={apiKey}
							onChange={(e) => setLocalApiKey(e.target.value)}
							placeholder="sk-..."
						/>
						<button onClick={handleSave} disabled={!apiKey} className="btn btn-primary">
							Save
						</button>
						<button onClick={() => setIsEditing(false)} className="btn">
							Cancel
						</button>
					</div>
				) : (
					<div className="display-group">
						<span className="masked-key">{apiKeyMasked || "Not configured"}</span>
						<button onClick={() => setIsEditing(true)} className="btn">
							Update
						</button>
					</div>
				)}
			</div>

			<div className="config-row">
				<label>Model:</label>
				<div className="input-group">
					<select
						value={activeModel}
						disabled={!isConfigured || testStatus === "testing"}
						onChange={(e) => onModelChange(e.target.value)}
						className="model-select"
					>
						{models.map((model) => (
							<option key={model} value={model}>
								{model}
							</option>
						))}
					</select>
				</div>
			</div>

			<div className="actions-row">
				<button
					className={`btn test-button ${testStatus}`}
					onClick={handleTest}
					disabled={!isConfigured || isEditing || testStatus === "testing"}
				>
					{testStatus === "testing"
						? "Testing..."
						: testStatus === "success"
							? "✓ Working"
							: testStatus === "failed"
								? "✗ Failed"
								: "Test Connection"}
				</button>
			</div>
		</div>
	);
};
