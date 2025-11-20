import type { ToolManifest } from './tools';
import type {
  AIMode,
  ChatMessagePayload,
  CodeBlock,
  ExecutionRequestPayload,
  ExecutionResultPayload,
  FileEntryPayload,
  FileSystemAction,
  FileSystemEventPayload,
  PlanStep,
  ProjectRecord,
  ToolCallLog,
  ToolExecutionRequestPayload,
} from './types';
import type { TimelineMessage, TimelineQuery, TimelineResponse, TimelineStats } from './timeline';

type ToolExecutionResponse = {
  tool_id: string;
  capability_id: string;
  success: boolean;
  stdout?: string | null;
  stderr?: string | null;
  execution_time_ms: number;
  error?: string | null;
};

export type ExportMode = 'timeline' | 'document';

export interface ExportRMarkdownRequestPayload {
  mode: ExportMode;
  outputPath: string;
  documentPath?: string;
  includeTimestamps: boolean;
  showActor: boolean;
  embedPlots: boolean;
  includeOutputs: boolean;
  includeErrors: boolean;
  includeSummary: boolean;
}

export interface ExportRMarkdownResponsePayload {
  success: boolean;
  outputPath: string;
  error?: string | null;
}

export type ClientMessage =
  | { type: 'execute'; request: ExecutionRequestPayload }
  | {
      type: 'ai_message';
      messages: ChatMessagePayload[];
      enable_tools?: boolean;
      request_id?: string;
      stream?: boolean;
      mode?: AIMode;
    }
  | { type: 'list_tools' }
  | ({ type: 'execute_tool' } & ToolExecutionRequestPayload)
  | { type: 'timeline_query'; query: TimelineQuery }
  | { type: 'timeline_stats_query' }
  | {
      type: 'export_rmarkdown';
      request: ExportRMarkdownRequestPayload;
    }
  | { type: 'interrupt_execution' }
  | { type: 'restart_session' }
  | {
      type: 'fs_action';
      action: FileSystemAction;
      path: string;
      content?: string;
      to?: string;
    }
  | { type: 'project_list' }
  | { type: 'project_open'; projectId: string }
  | { type: 'project_create'; name: string; path: string }
  | { type: 'project_add_existing'; path: string }
  | { type: 'project_clone'; remote: string; path: string; name?: string }
  | { type: 'project_state_load'; projectId: string }
  | { type: 'project_state_save'; projectId: string; state: Record<string, unknown> };

type TimelineEventPush = Extract<TimelineMessage, { type: 'timeline_event_added' }>;

export type ServerMessage =
  | { type: 'execution_result'; result: ExecutionResultPayload }
  | { type: 'ai_response'; response: string }
  | { type: 'ai_response_with_tools'; response: { content: string; tool_calls?: Array<{ name: string; input: Record<string, any> }> } }
  | { type: 'ai_response_chunk'; id: string; chunk: string }
  | { type: 'ai_response_complete'; id: string; final: string; codeBlocks?: CodeBlock[] }
  | { type: 'ai_plan_updated'; id: string; plan: PlanStep[] }
  | { type: 'ai_tool_started'; id: string; tool: ToolCallLog }
  | { type: 'ai_tool_finished'; id: string; tool: ToolCallLog }
  | { type: 'error'; message: string }
  | { type: 'tools'; tools: ToolManifest[] }
  | ({ type: 'tool_execution_result' } & ToolExecutionResponse)
  | { type: 'timeline_response'; data: TimelineResponse }
  | { type: 'timeline_stats_response'; stats: TimelineStats }
  | { type: 'export_rmarkdown_response'; response: ExportRMarkdownResponsePayload }
  | { type: 'execution_interrupted'; success: boolean }
  | { type: 'session_restarted'; cleared_events: number }
  | { type: 'fs_event'; event: FileSystemEventPayload }
  | {
      type: 'fs_result';
      action: FileSystemAction;
      path: string;
      to?: string;
      success: boolean;
      data?: FileEntryPayload[] | string | null;
      error?: string | null;
    }
  | { type: 'project_list'; projects: ProjectRecord[] }
  | { type: 'project_opened'; project: ProjectRecord; state?: Record<string, unknown> | null }
  | { type: 'project_state'; project_id: string; state?: Record<string, unknown> | null }
  | { type: 'project_state_saved'; project_id: string }
  | TimelineEventPush;

export type ServerMessageType = ServerMessage['type'];

export type ExtractServerMessage<TType extends ServerMessageType> = Extract<
  ServerMessage,
  { type: TType }
>;
