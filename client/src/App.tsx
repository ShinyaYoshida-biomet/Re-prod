import { useState } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { MenuBar, StatusBar } from "@/components/menu";
import { EditorPanel } from "@/components/editor";
import { AIPanel } from "@/components/ai-panel";
import { BottomPane } from "@/components/bottom-pane";
import { ExportDialog } from "@/components/export";
import { TimelineDialog } from "@/components/timeline";
import { useStore } from "@/core";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSocketConnection } from "@/hooks/useSocketConnection";

function App(): JSX.Element {
  const panes = useStore((state) => state.view.panes);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [timelineDialogOpen, setTimelineDialogOpen] = useState(false);

  // Enable global keyboard shortcuts
  useKeyboardShortcuts();
  useSocketConnection();

  // Expose export dialog handler globally for menu actions
  (window as any).openExportDialog = () => setExportDialogOpen(true);
  // Expose timeline dialog handler globally for menu actions
  (window as any).openTimelineDialog = () => setTimelineDialogOpen(true);

  return (
    <div className="app">
      <MenuBar />
      <div className="workspace-shell">
        <Allotment>
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
    </div>
  );
}

export default App;
