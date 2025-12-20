import { Allotment } from "allotment";
import { useEffect, useRef } from "react";
import "allotment/dist/style.css";
import { AIPanel } from "@/components/ai-panel";
import { BottomPane } from "@/components/bottom-pane";
import { EditorPanel } from "@/components/editor";
import { ExportDialog } from "@/components/export";
import { FileBrowserPane } from "@/components/file-browser/FileBrowserPane";
import { MenuBar, StatusBar } from "@/components/menu";
import {
	AboutModal,
	KeyboardShortcutsModal,
	ProjectManagerModal,
	SessionInfoModal,
	SettingsModal,
} from "@/components/modals";
import { ToastProvider } from "@/components/shared";
import { TimelineDialog, type TimelineDialogRef } from "@/components/timeline";
import { useStore } from "@/core";
import { useSettingsStore } from "@/core/state/slices/settingsStore";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useProjectSession } from "@/hooks/useProjectSession";
import { useSettingsPersistence } from "@/hooks/useSettingsPersistence";
import { useSocketConnection } from "@/hooks/useSocketConnection";
import { setupSocketListeners } from "@/core/init/socketListeners";
import { ACP_FEATURE_ENABLED } from "@/constants/features";

function App(): JSX.Element {
	const panes = useStore((state) => state.view.panes);
	const modals = useStore((state) => state.view.modals);
	const theme = useStore((state) => state.settings.theme);
	const setAIPanelRef = useStore((state) => state.setAIPanelRef);
	const setTimelinePanelRef = useStore((state) => state.setTimelinePanelRef);
	const setModalOpen = useStore((state) => state.setModalOpen);

	const timelineDialogRef = useRef<TimelineDialogRef | null>(null);
	const { fetchSettings, providers, activeProvider } = useSettingsStore();

	const activeProviderConfig = providers.find((provider) => provider.name === activeProvider);
	const isActiveProviderConfigured = Boolean(activeProviderConfig?.isConfigured);
	const canUseAssistant = ACP_FEATURE_ENABLED || isActiveProviderConfigured;

	// Enable global keyboard shortcuts
	useKeyboardShortcuts();
	useProjectSession();
	useSocketConnection();
	useSettingsPersistence();

	// Initialize socket listeners (global events)
	useEffect(() => {
		const cleanup = setupSocketListeners();
		return cleanup;
	}, []);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);

	useEffect(() => {
		setTimelinePanelRef(timelineDialogRef.current);
	}, [setTimelinePanelRef]);

	useEffect(() => {
		void fetchSettings();
	}, [fetchSettings]);

	return (
		<ToastProvider>
			<div className="app">
				<MenuBar />
				<div className="workspace-shell">
					<Allotment>
						{panes.files && (
							<Allotment.Pane minSize={220} preferredSize={240}>
								<FileBrowserPane />
							</Allotment.Pane>
						)}
						{/* Left side: Editor + Bottom Pane */}
						<Allotment.Pane minSize={400} preferredSize="75%">
							<Allotment vertical>
								{panes.editor && (
									<Allotment.Pane minSize={300} preferredSize="65%">
										<EditorPanel />
									</Allotment.Pane>
								)}
								<Allotment.Pane minSize={150} preferredSize={panes.editor ? "35%" : "100%"}>
									<BottomPane />
								</Allotment.Pane>
							</Allotment>
						</Allotment.Pane>
						{/* Right side: AI Assistant (full height) */}
						{panes.assistant && (
							<Allotment.Pane minSize={260} preferredSize="25%">
								<div className="ai-pane-wrapper">
									<AIPanel ref={setAIPanelRef} hasConfiguredProvider={canUseAssistant} />
								</div>
							</Allotment.Pane>
						)}
					</Allotment>
				</div>
				<StatusBar />
				<ExportDialog open={modals.export} onClose={() => setModalOpen("export", false)} />
				<TimelineDialog ref={timelineDialogRef} />
				<KeyboardShortcutsModal
					open={modals.shortcuts}
					onClose={() => setModalOpen("shortcuts", false)}
				/>
				<AboutModal open={modals.about} onClose={() => setModalOpen("about", false)} />
				<SessionInfoModal
					open={modals.sessionInfo}
					onClose={() => setModalOpen("sessionInfo", false)}
				/>
				<SettingsModal open={modals.settings} onClose={() => setModalOpen("settings", false)} />
				<ProjectManagerModal
					open={modals.projects}
					onClose={() => setModalOpen("projects", false)}
				/>
			</div>
		</ToastProvider>
	);
}

export default App;
