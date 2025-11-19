import { useEffect, useState } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { MenuBar, StatusBar } from "@/components/menu";
import { EditorPanel } from "@/components/editor";
import { AIPanel } from "@/components/ai-panel";
import { BottomPane } from "@/components/bottom-pane";
import { ExportDialog } from "@/components/export";
import { TimelineDialog } from "@/components/timeline";
import { FileBrowserPane } from "@/components/file-browser/FileBrowserPane";
import { AboutModal, KeyboardShortcutsModal, SessionInfoModal, SettingsModal } from "@/components/modals";
import { useStore } from "@/core";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSocketConnection } from "@/hooks/useSocketConnection";
import { useSettingsPersistence } from "@/hooks/useSettingsPersistence";
import { useSessionControlEvents } from "@/hooks/useSessionControlEvents";

function App(): JSX.Element {
  const panes = useStore((state) => state.view.panes);
  const theme = useStore((state) => state.settings.theme);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [timelineDialogOpen, setTimelineDialogOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [sessionInfoOpen, setSessionInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Enable global keyboard shortcuts
  useKeyboardShortcuts();
  useSocketConnection();
  useSettingsPersistence();
  useSessionControlEvents();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const globalScope = window as typeof window & Record<string, () => void>;
    globalScope.openExportDialog = () => setExportDialogOpen(true);
    globalScope.openTimelineDialog = () => setTimelineDialogOpen(true);
    globalScope.openShortcutsDialog = () => setShortcutsOpen(true);
    globalScope.openAboutDialog = () => setAboutOpen(true);
    globalScope.openSessionInfoDialog = () => setSessionInfoOpen(true);
    globalScope.openSettingsDialog = () => setSettingsOpen(true);

    return () => {
      delete globalScope.openExportDialog;
      delete globalScope.openTimelineDialog;
      delete globalScope.openShortcutsDialog;
      delete globalScope.openAboutDialog;
      delete globalScope.openSessionInfoDialog;
      delete globalScope.openSettingsDialog;
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
          <Allotment.Pane minSize={400} preferredSize="60%">
            <Allotment vertical>
              {panes.editor && (
                <Allotment.Pane minSize={300} preferredSize="65%">
                  <EditorPanel />
                </Allotment.Pane>
              )}
              <Allotment.Pane
                minSize={150}
                preferredSize={panes.editor ? "35%" : "100%"}
              >
                <BottomPane />
              </Allotment.Pane>
            </Allotment>
          </Allotment.Pane>
          {/* Right side: AI Assistant (full height) */}
          {panes.assistant && (
            <Allotment.Pane minSize={300} preferredSize="40%">
              <div className="ai-pane-wrapper">
                <AIPanel />
              </div>
            </Allotment.Pane>
          )}
        </Allotment>
      </div>
      <StatusBar />
      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
      />
      <TimelineDialog
        open={timelineDialogOpen}
        onClose={() => setTimelineDialogOpen(false)}
      />
      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <SessionInfoModal
        open={sessionInfoOpen}
        onClose={() => setSessionInfoOpen(false)}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default App;
