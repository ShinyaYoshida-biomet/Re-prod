import type { MenuSection } from '@/types/menu';
import type { ViewPane } from '@/core/state/slices/viewSlice';
import { menuActions } from '@/services/menuActions';

export interface MenuStateSnapshot {
  isEditorDirty: boolean;
  isExecutionRunning: boolean;
  viewPanes: Record<ViewPane, boolean>;
}

export function buildMenuSections(snapshot: MenuStateSnapshot): MenuSection[] {
  const { isEditorDirty, isExecutionRunning, viewPanes } = snapshot;

  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'file:new', label: 'New R Script', shortcut: '⌘N', action: () => menuActions.file.new() },
        { id: 'file:open', label: 'Open...', shortcut: '⌘O', action: () => menuActions.file.open() },
        { type: 'separator' },
        {
          id: 'file:save',
          label: 'Save',
          shortcut: '⌘S',
          action: () => menuActions.file.save(),
          enabled: () => isEditorDirty,
        },
        { id: 'file:save-as', label: 'Save As...', shortcut: '⌘⇧S', action: () => menuActions.file.saveAs() },
        { type: 'separator' },
        {
          id: 'file:export-session',
          label: 'Export Reproducible Session...',
          action: () => menuActions.file.exportSession(),
        },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'edit:undo', label: 'Undo', shortcut: '⌘Z', action: () => menuActions.edit.undo() },
        { id: 'edit:redo', label: 'Redo', shortcut: '⌘⇧Z', action: () => menuActions.edit.redo() },
        { type: 'separator' },
        { id: 'edit:cut', label: 'Cut', shortcut: '⌘X', action: () => menuActions.edit.cut() },
        { id: 'edit:copy', label: 'Copy', shortcut: '⌘C', action: () => menuActions.edit.copy() },
        { id: 'edit:paste', label: 'Paste', shortcut: '⌘V', action: () => menuActions.edit.paste() },
        { type: 'separator' },
        { id: 'edit:find', label: 'Find...', shortcut: '⌘F', action: () => menuActions.edit.find() },
        { id: 'edit:replace', label: 'Replace...', shortcut: '⌘H', action: () => menuActions.edit.replace() },
        { type: 'separator' },
        {
          id: 'edit:ai-assist',
          label: '💡 Ask AI Assistant...',
          shortcut: '⌘K',
          action: () => menuActions.edit.aiAssist(),
          prominent: true,
        },
      ],
    },
    {
      id: 'code',
      label: 'Code',
      items: [
        {
          id: 'code:run-selection',
          label: 'Run Current Line/Selection',
          shortcut: '⌘↵',
          action: () => menuActions.code.runSelection(),
          description: 'Uses Editor execution with metadata',
        },
        {
          id: 'code:run-all',
          label: 'Run All',
          shortcut: '⌘⇧↵',
          action: () => menuActions.code.runAll(),
          description: 'Uses Editor execution with metadata',
        },
        { id: 'code:source-file', label: 'Source File', action: () => menuActions.code.sourceFile() },
        { type: 'separator' },
        {
          id: 'code:interrupt',
          label: 'Interrupt R',
          shortcut: 'Esc',
          action: () => menuActions.code.interrupt(),
          enabled: () => isExecutionRunning,
        },
        { id: 'code:restart-session', label: 'Restart R Session', shortcut: '⌘⇧0', action: () => menuActions.code.restartSession() },
        { type: 'separator' },
        { id: 'code:comment', label: 'Comment/Uncomment Lines', shortcut: '⌘/', action: () => menuActions.code.comment() },
      ],
    },
    {
      id: 'session',
      label: 'Session',
      items: [
        { id: 'session:timeline', label: 'Timeline...', shortcut: '⌘T', action: () => menuActions.session.showTimeline() },
        { type: 'separator' },
        { id: 'session:new', label: 'New Session', shortcut: '⌘⇧N', action: () => menuActions.session.new() },
        { id: 'session:save', label: 'Save Session...', action: () => menuActions.session.save() },
        { id: 'session:load', label: 'Load Session...', action: () => menuActions.session.load() },
        { type: 'separator' },
        { id: 'session:info', label: 'Session Info', action: () => menuActions.session.info() },
        { id: 'session:settings', label: 'Settings...', shortcut: '⌘,', action: () => menuActions.session.settings() },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'view:toggle-editor',
          label: 'Show/Hide Editor',
          shortcut: '⌘1',
          action: () => menuActions.view.togglePane('editor'),
          checked: () => viewPanes.editor,
        },
        {
          id: 'view:toggle-ai-assistant',
          label: 'Show/Hide AI Assistant',
          shortcut: '⌘2',
          action: () => menuActions.view.togglePane('assistant'),
          checked: () => viewPanes.assistant,
        },
        { type: 'separator' },
        { id: 'view:zoom-in', label: 'Zoom In', shortcut: '⌘+', action: () => menuActions.view.zoomIn() },
        { id: 'view:zoom-out', label: 'Zoom Out', shortcut: '⌘-', action: () => menuActions.view.zoomOut() },
        { id: 'view:zoom-reset', label: 'Reset Zoom', shortcut: '⌘0', action: () => menuActions.view.zoomReset() },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { id: 'help:docs', label: 'Documentation', action: () => menuActions.help.docs() },
        { id: 'help:shortcuts', label: 'Keyboard Shortcuts', action: () => menuActions.help.shortcuts() },
        { type: 'separator' },
        { id: 'help:report-issue', label: 'Report Issue', action: () => menuActions.help.reportIssue() },
        { id: 'help:about', label: 'About Re-prod', action: () => menuActions.help.about() },
      ],
    },
  ];
}
