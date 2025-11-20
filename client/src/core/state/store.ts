import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createEditorSlice, type EditorState } from './slices/editorSlice';
import { createExecutionSlice, type ExecutionState } from './slices/executionSlice';
import { createAISlice, type AIState } from './slices/aiSlice';
import { createSettingsSlice, type SettingsState } from './slices/settingsSlice';
import { createConnectionSlice, type ConnectionState } from './slices/connectionSlice';
import { createTimelineSlice, type TimelineState } from './slices/timelineSlice';
import { createViewSlice, type ViewState } from './slices/viewSlice';
import { createProjectSlice, type ProjectState } from './slices/projectSlice';

export type StoreState = EditorState &
  ExecutionState &
  AIState &
  SettingsState &
  ConnectionState &
  TimelineState &
  ViewState &
  ProjectState;

export const useStore = create<StoreState>()(
  devtools(
    (...args) => ({
      ...createEditorSlice(...args),
      ...createExecutionSlice(...args),
      ...createAISlice(...args),
      ...createSettingsSlice(...args),
      ...createConnectionSlice(...args),
      ...createTimelineSlice(...args),
      ...createViewSlice(...args),
      ...createProjectSlice(...args),
    }),
    { name: 'Re-prod Store' }
  )
);
