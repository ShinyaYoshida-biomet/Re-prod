import type { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useRef } from "react";
import { XTermWrapper } from "./XTermWrapper";

interface TerminalSessionProps {
	sessionId: string;
	isActive: boolean;
	onInput: (value: string) => void;
	onResize: (cols: number, rows: number) => void;
	registerOutputHandler: (sessionId: string, handler: (chunk: string) => void) => void;
	unregisterOutputHandler: (sessionId: string) => void;
}

export function TerminalSession({
	sessionId,
	isActive,
	onInput,
	onResize,
	registerOutputHandler,
	unregisterOutputHandler,
}: TerminalSessionProps): JSX.Element {
	const termRef = useRef<Terminal | null>(null);

	const handleReady = useCallback((term: Terminal) => {
		termRef.current = term;
	}, []);

	const handleTerminalOutput = useCallback((chunk: string) => {
		const terminal = termRef.current;
		if (!terminal) {
			return;
		}

		terminal.write(chunk);
		terminal.scrollToBottom();
	}, []);

	useEffect(() => {
		registerOutputHandler(sessionId, handleTerminalOutput);
		return () => {
			unregisterOutputHandler(sessionId);
		};
	}, [sessionId, registerOutputHandler, unregisterOutputHandler, handleTerminalOutput]);

	useEffect(() => {
		if (isActive) {
			termRef.current?.focus();
		}
	}, [isActive]);

	const className = [
		"terminal-session",
		isActive ? "terminal-session--active" : "terminal-session--inactive",
	].join(" ");

	return (
		<div className={className}>
			<XTermWrapper
				className="terminal-session__term"
				onInput={onInput}
				onResize={onResize}
				onReady={handleReady}
				autoFocus={isActive}
			/>
		</div>
	);
}
