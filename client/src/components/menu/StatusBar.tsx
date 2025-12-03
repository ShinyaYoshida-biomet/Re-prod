import { useStore } from "@/core";
import { useSettingsStore } from "@/core/state/slices/settingsStore";

interface StatusBarProps {
	onOpenSettings: () => void;
}

export function StatusBar({ onOpenSettings }: StatusBarProps): JSX.Element {
	const editor = useStore((state) => state.editor);
	const settings = useStore((state) => state.settings);
	const execution = useStore((state) => state.execution);
	const project = useStore((state) => state.project);
	const { providers, activeProvider, isLoading } = useSettingsStore();

	const activeProviderConfig = providers.find((provider) => provider.name === activeProvider);
	const isActiveProviderConfigured = Boolean(activeProviderConfig?.isConfigured);
	const activeProviderLabel = activeProviderConfig?.displayName || activeProvider || "AI";
	const providerStatusLabel = isLoading
		? "Checking..."
		: isActiveProviderConfigured
			? `${activeProviderLabel} ready`
			: "Add API key";

	return (
		<div className="statusbar">
			<div className="statusbar-left">
				{project && <span className="statusbar-item">Project: {project.name}</span>}
				<span className="statusbar-item">{editor.filepath || "Untitled"}</span>
				{editor.isDirty && <span className="statusbar-item statusbar-modified">Modified</span>}
				<span className="statusbar-item">
					Ln {editor.cursorPosition.line}, Col {editor.cursorPosition.column}
				</span>
			</div>
			<div className="statusbar-right">
				<button
					type="button"
					className={`statusbar-item statusbar-ai ${isActiveProviderConfigured ? "configured" : "warning"}`}
					onClick={onOpenSettings}
				>
					<span className={`statusbar-dot ${isActiveProviderConfigured ? "ok" : "warn"}`} />
					<span>{providerStatusLabel}</span>
				</button>
				{execution.isRunning && (
					<span className="statusbar-item statusbar-running">
						<div className="spinner"></div>
						Running R...
					</span>
				)}
				<span className="statusbar-item">R: {settings.rPath}</span>
			</div>
		</div>
	);
}
