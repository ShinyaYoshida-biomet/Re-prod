import { useStore } from "@/core";
import { commandRegistry } from "@/core/commands/registry";
import { useSettingsStore } from "@/core/state/slices/settingsStore";
import { classNames } from "@/utils/classNames";

// Removed StatusBarProps interface as it's now empty/unused
// interface StatusBarProps {
// 	onOpenSettings: () => void;
// }

export function StatusBar(): JSX.Element {
	const activeBuffer = useStore((state) => state.getActiveBuffer());
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

	const handleOpenSettings = () => {
		commandRegistry.execute("session.settings");
	};

	return (
		<div className="statusbar">
			<div className="statusbar-left">
				{project && <span className="statusbar-item">Project: {project.name}</span>}
				<span className="statusbar-item">
					{activeBuffer?.filepath || activeBuffer?.displayName || "Untitled"}
				</span>
				{activeBuffer?.isDirty && (
					<span className="statusbar-item statusbar-modified">Modified</span>
				)}
				<span className="statusbar-item">
					Ln {activeBuffer?.cursorPosition.line ?? 1}, Col{" "}
					{activeBuffer?.cursorPosition.column ?? 1}
				</span>
			</div>
			<div className="statusbar-right">
				<button
					type="button"
					className={classNames(
						"statusbar-item",
						"statusbar-ai",
						isActiveProviderConfigured ? "configured" : "warning",
					)}
					onClick={handleOpenSettings}
				>
					<span
						className={classNames("statusbar-dot", isActiveProviderConfigured ? "ok" : "warn")}
					/>
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
