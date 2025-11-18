export interface TerminalSession {
  id: string;
  title: string;
  isActive: boolean;
}

export interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
}

export interface TerminalOutputEvent {
  session_id: string;
  data: string;
}

export interface TerminalExitEvent {
  session_id: string;
  exit_code: number | null;
}

export interface TerminalErrorEvent {
  session_id: string;
  message: string;
}

export interface TerminalKeepAliveEvent {
  session_id: string;
}
