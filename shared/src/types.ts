import type {
  ExecutionSource as ProtocolExecutionSource,
  ExecutionActor as ProtocolExecutionActor,
  CodeBlockKind as ProtocolCodeBlockKind,
  CodeBlockMetadata as ProtocolCodeBlockMetadata,
  ExecutionContext as ProtocolExecutionContext,
  ExecutionRequest as ProtocolExecutionRequest,
  ExecutionEvent as ProtocolExecutionEvent,
  ExecutionResult as ProtocolExecutionResult,
  PlotInfo as ProtocolPlotInfo,
  EnvironmentSnapshot as ProtocolEnvironmentSnapshot,
  ChatMessage as ProtocolChatMessage,
  FileChangeEvent as ProtocolFileChangeEvent,
  ArtifactInfo as ProtocolArtifactInfo,
  ToolExecutionRequest as ProtocolToolExecutionRequest,
  ToolExecutionResult as ProtocolToolExecutionResult,
} from './protocol-types';

// Protocol aliases to keep existing payload naming conventions in the client.
export type ExecutionSource = ProtocolExecutionSource;
export type ExecutionActor = ProtocolExecutionActor;
export type CodeBlockKind = ProtocolCodeBlockKind;
export type ExecutionContextPayload = ProtocolExecutionContext;
export type CodeBlockMetadataPayload = ProtocolCodeBlockMetadata;
export type ExecutionRequestPayload = ProtocolExecutionRequest;
export type ExecutionEventPayload = ProtocolExecutionEvent;
export type ExecutionResultPayload = ProtocolExecutionResult;
export type PlotInfoPayload = ProtocolPlotInfo;
export type EnvironmentSnapshotPayload = ProtocolEnvironmentSnapshot;
export type ChatMessagePayload = ProtocolChatMessage;
export type FileChangeEventPayload = ProtocolFileChangeEvent;
export type ArtifactInfoPayload = ProtocolArtifactInfo;
export type ToolExecutionRequestPayload = ProtocolToolExecutionRequest;
export type ToolExecutionResultPayload = ProtocolToolExecutionResult;

export type AIMode = 'agent' | 'chat';

// UI-facing execution log structures
export interface ExecutionLogPlot {
  id: string;
  path: string;
  data: string; // base64 encoded image
  timestamp: number;
}

export interface ExecutionLogEntry {
  stdout: string;
  stderr: string;
  plots: ExecutionLogPlot[];
  timestamp: number;
  duration: number;
  success: boolean;
}

export type CodeChangeAction =
  | 'replace-all'
  | 'replace-range'
  | 'insert'
  | 'create-file'
  | 'delete-range';

export interface PatchChunk {
  context?: string;
  oldLines: string[];
  newLines: string[];
}

export interface SimpleCodeChange {
  beforeContext: string[];
  afterContext: string[];
  oldLines: string[];
  newLines: string[];
}

export interface CodeRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface CodeBlock {
  id: string;
  code: string;
  language: 'r';
  action: CodeChangeAction;
  targetRange?: CodeRange;
  filepath?: string;
  patchChunks?: PatchChunk[];
  simpleChanges?: SimpleCodeChange[];
  patchText?: string;
  checksum?: string;
  explanation?: string;
  originalCode?: string;
}

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'error';

export interface PlanStep {
  id: string;
  title: string;
  status: PlanStepStatus;
}

export type ToolCallStatus = 'pending' | 'running' | 'done' | 'error';

export interface ToolCallLog {
  id: string;
  name: string;
  status: ToolCallStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface AIResponse {
  message: string;
  suggestedCode?: string; // Deprecated: use codeBlocks instead
  codeBlocks?: CodeBlock[];
  explanation?: string;
  timestamp: number;
}

// UI State Types
export interface LayoutState {
  editorWidth: number;
  rightPanelWidth: number;
  aiPanelHeight: number;
  consoleHeight: number;
}

export interface EditorState {
  content: string;
  filepath: string;
  isDirty: boolean;
  cursorPosition: { line: number; column: number };
}

export interface ExecutionState {
  isRunning: boolean;
  currentCell?: number;
  results: ExecutionLogEntry[];
  history: ExecutionLogEntry[];
}

export interface AIState {
  messages: AIMessage[];
  isLoading: boolean;
  suggestions: string[];
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  code?: string; // Deprecated: use codeBlocks instead
  codeBlocks?: CodeBlock[];
  planSteps?: PlanStep[];
  toolLogs?: ToolCallLog[];
  streamingId?: string;
  isComplete?: boolean;
  timestamp: number;
}

export interface AppSettings {
  autoRun: boolean;
  theme: 'light' | 'dark' | 'phylo';
  rPath: string;
  fontSize: number;
  // Cell execution features (easy to disable)
  showCellDecorations: boolean;
  highlightExecutingCell: boolean;
}
