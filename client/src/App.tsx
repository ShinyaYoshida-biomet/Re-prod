import { Allotment } from "allotment";
import { useEffect, useState } from "react";
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
import { TimelineDialog } from "@/components/timeline";
import { useStore } from "@/core";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useProjectSession } from "@/hooks/useProjectSession";
import { useSessionControlEvents } from "@/hooks/useSessionControlEvents";
import { useSettingsPersistence } from "@/hooks/useSettingsPersistence";
import { useSocketConnection } from "@/hooks/useSocketConnection";

function App(): JSX.Element {
	const panes = useStore((state) => state.view.panes);
	const theme = useStore((state) => state.settings.theme);
	const setAIPanelRef = useStore((state) => state.setAIPanelRef);
	const setTimelinePanelRef = useStore((state) => state.setTimelinePanelRef);
	const [exportDialogOpen, setExportDialogOpen] = useState(false);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const [aboutOpen, setAboutOpen] = useState(false);
	const [sessionInfoOpen, setSessionInfoOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [projectManagerOpen, setProjectManagerOpen] = useState(false);

	// Enable global keyboard shortcuts
	useKeyboardShortcuts();
	useProjectSession();
	useSocketConnection();
	useSettingsPersistence();
	useSessionControlEvents();

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);

	useEffect(() => {
		const globalScope = window as typeof window & Record<string, () => void>;
		globalScope.openExportDialog = () => setExportDialogOpen(true);
		globalScope.openShortcutsDialog = () => setShortcutsOpen(true);
		globalScope.openAboutDialog = () => setAboutOpen(true);
		globalScope.openSessionInfoDialog = () => setSessionInfoOpen(true);
		globalScope.openSettingsDialog = () => setSettingsOpen(true);
		globalScope.openProjectsDialog = () => setProjectManagerOpen(true);

		return () => {
			delete globalScope.openExportDialog;
			delete globalScope.openShortcutsDialog;
			delete globalScope.openAboutDialog;
			delete globalScope.openSessionInfoDialog;
			delete globalScope.openSettingsDialog;
			delete globalScope.openProjectsDialog;
		};
	}, []);

	return (
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
								<AIPanel ref={setAIPanelRef} />
							</div>
						</Allotment.Pane>
					)}
				</Allotment>
			</div>
			<StatusBar />
			<ExportDialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} />
			<TimelineDialog ref={setTimelinePanelRef} />
			<KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
			<AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
			<SessionInfoModal open={sessionInfoOpen} onClose={() => setSessionInfoOpen(false)} />
			<SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
			<ProjectManagerModal open={projectManagerOpen} onClose={() => setProjectManagerOpen(false)} />
		</div>
	);
}

export default App;
