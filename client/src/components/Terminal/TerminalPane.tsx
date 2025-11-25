import { useCallback, useEffect, useMemo, useRef } from "react";
import { IconPlus, IconXCircle, PanelTabs } from "@/components/shared";
import { useTerminal } from "@/hooks/useTerminal";
import { TerminalSession } from "./TerminalSession";

const TERMINAL_NEW_EVENT = "terminal:new";

export function TerminalPane(): JSX.Element {
	const {
		state,
		isAvailable,
		error,
		errorDetail,
		createSession,
		closeSession,
		setActiveSession,
		writeToSession,
		resizeSession,
		registerOutputHandler,
		unregisterOutputHandler,
	} = useTerminal();

	const { sessions, activeSessionId } = state;
	const didBootstrapRef = useRef(false);

	const sessionTabs = useMemo(
		() => sessions.map((session) => ({ id: session.id, label: session.title })),
		[sessions],
	);

	useEffect(() => {
		if (!isAvailable || didBootstrapRef.current) {
			return;
		}

		if (sessions.length === 0) {
			didBootstrapRef.current = true;
			void createSession();
		}
	}, [isAvailable, sessions.length, createSession]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const handleNewSession = () => {
			void createSession();
		};

		window.addEventListener(TERMINAL_NEW_EVENT, handleNewSession);

		return () => {
			window.removeEventListener(TERMINAL_NEW_EVENT, handleNewSession);
		};
	}, [createSession]);

	const handleCreateSession = useCallback(() => {
		void createSession();
	}, [createSession]);

	const handleCloseSession = useCallback(() => {
		if (!activeSessionId) {
			return;
		}

		void closeSession(activeSessionId);
	}, [activeSessionId, closeSession]);

	return (
		<div className="terminal-pane">
			<div className="terminal-pane__header">
				{sessionTabs.length > 0 && (
					<PanelTabs
						items={sessionTabs}
						activeId={activeSessionId ?? sessionTabs[0].id}
						onSelect={setActiveSession}
						className="terminal-pane__tabs panel-tabs--compact"
					/>
				)}
				<div className="terminal-pane__actions">
					<button
						className="btn btn-icon"
						type="button"
						title="New terminal session"
						aria-label="New terminal session"
						onClick={handleCreateSession}
						disabled={!isAvailable}
					>
						<IconPlus width={18} height={18} aria-hidden />
					</button>
					<button
						className="btn btn-icon"
						type="button"
						title="Close terminal session"
						aria-label="Close terminal session"
						onClick={handleCloseSession}
						disabled={!activeSessionId}
					>
						<IconXCircle width={18} height={18} aria-hidden />
					</button>
				</div>
			</div>
			<div className="terminal-pane__content">
				{error && (
					<div className="alert alert-error mb-2">
						<p>{error}</p>
						{errorDetail && <p className="muted">{errorDetail}</p>}
					</div>
				)}
				{!isAvailable && (
					<div className="terminal-pane__empty">
						<p>Terminal access is only available inside the desktop experience.</p>
					</div>
				)}
				{isAvailable && sessionTabs.length === 0 && (
					<div className="terminal-pane__empty">
						<p>Starting terminal session...</p>
					</div>
				)}
				{isAvailable && sessionTabs.length > 0 && (
					<div className="terminal-pane__sessions">
						{sessions.map((session) => (
							<TerminalSession
								key={session.id}
								sessionId={session.id}
								isActive={session.id === activeSessionId}
								onInput={(data) => {
									void writeToSession(session.id, data);
								}}
								onResize={(cols, rows) => {
									void resizeSession(session.id, cols, rows);
								}}
								registerOutputHandler={registerOutputHandler}
								unregisterOutputHandler={unregisterOutputHandler}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
