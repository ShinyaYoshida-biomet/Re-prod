export type AcpSessionUpdate =
	| { UserMessageChunk: { text: string } }
	| { AgentMessageChunk: { text: string } }
	| { AgentThoughtChunk: { text: string } }
	| Record<string, unknown>;

export interface AcpSessionUpdateEnvelope {
	session_id: string;
	update: AcpSessionUpdate;
}

export interface AcpPromptMessage {
	role: string;
	content: string;
}
