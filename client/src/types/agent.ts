import type { PendingEdit } from "./pendingEdit";
import type { CodeBlock, PlanStep, ToolCallLog, ApprovalRequest } from "./ui";

export type TransportEvent =
	| { type: "CHUNK"; content: string; streamingId: string }
	| { type: "TOOL_CALL"; tool: ToolCallLog; streamingId: string }
	| { type: "TOOL_UPDATE"; tool: ToolCallLog; streamingId: string }
	| { type: "PENDING_EDIT"; edit: PendingEdit; streamingId: string }
	| { type: "PLAN_UPDATE"; steps: PlanStep[]; streamingId: string }
	| { type: "APPROVAL_REQUEST"; request: ApprovalRequest; streamingId: string }
	| { type: "DONE"; streamingId: string; codeBlocks?: CodeBlock[] }
	| { type: "ERROR"; error: string; streamingId: string };
