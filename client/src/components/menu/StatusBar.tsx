import { useStore } from '@/core';

export function StatusBar(): JSX.Element {
  const editor = useStore((state) => state.editor);
  const settings = useStore((state) => state.settings);
  const execution = useStore((state) => state.execution);
  const project = useStore((state) => state.project);

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        {project && (
          <span className="statusbar-item">
            Project: {project.name}
          </span>
        )}
        <span className="statusbar-item">
          {editor.filepath || 'Untitled'}
        </span>
        {editor.isDirty && (
          <span className="statusbar-item statusbar-modified">Modified</span>
        )}
        <span className="statusbar-item">
          Ln {editor.cursorPosition.line}, Col {editor.cursorPosition.column}
        </span>
      </div>
      <div className="statusbar-right">
        {execution.isRunning && (
          <span className="statusbar-item statusbar-running">
            <div className="spinner"></div>
            Running R...
          </span>
        )}
        <span className="statusbar-item">
          R: {settings.rPath}
        </span>
      </div>
    </div>
  );
}
