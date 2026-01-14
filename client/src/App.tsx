import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { PermissionRequestManager } from "@/components/agent/PermissionRequestManager";
import { AIPanel } from "@/components/ai-panel";
import { BottomPane } from "@/components/bottom-pane";
import { EditorPanel } from "@/components/editor";
import { ExportDialog } from "@/components/export";
import { FileBrowserPane } from "@/components/file-browser/FileBrowserPane";
import { MenuBar, StatusBar } from "@/components/menu";
import {
	AboutModal,
	KeyboardShortcutsModal,
	ProjectSwitchModal,
	SessionInfoModal,
	SettingsModal,
} from "@/components/modals";
import { ToastProvider } from "@/components/shared";
import { TimelineDialog } from "@/components/timeline";
import { useStore } from "@/core";
import { useACPBootstrap } from "@/hooks/useACPBootstrap";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useProjectSession } from "@/hooks/useProjectSession";
import { useSettingsPersistence } from "@/hooks/useSettingsPersistence";
import { useSocketConnection } from "@/hooks/useSocketConnection";
import { useSocketListeners } from "@/hooks/useSocketListeners";
import { useThemeSync } from "@/hooks/useThemeSync";
import { useTimelineRefSync } from "@/hooks/useTimelineRefSync";

function App(): JSX.Element {
	const panes = useStore((state) => state.view.panes);
	const modals = useStore((state) => state.view.modals);
	const activeMode = useStore((state) => state.activeMode);
	const activeAgent = useStore((state) => state.activeAgent);
	const setAIPanelRef = useStore((state) => state.setAIPanelRef);
	const setModalOpen = useStore((state) => state.setModalOpen);

	const canUseAssistant = activeMode === "external_agent" ? Boolean(activeAgent) : true;

	// Initialization hooks
	useKeyboardShortcuts();
	useProjectSession();
	useSocketConnection();
	useSocketListeners();
	useSettingsPersistence();
	useThemeSync();
	useACPBootstrap();
	const timelineDialogRef = useTimelineRefSync();

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
				<ProjectSwitchModal
					open={modals.projectSwitch}
					onClose={() => setModalOpen("projectSwitch", false)}
				/>
				<PermissionRequestManager />
			</div>
		</ToastProvider>
	);
}

export default App;
