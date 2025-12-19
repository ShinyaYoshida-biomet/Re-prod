import type { AIMode } from "@/types";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { IconSend, IconSquare } from "@/components/shared";
import { useAIConversation } from "@/hooks/useAIConversation";
import { ProviderSwitcher } from "./ProviderSwitcher";
import { StreamingMessage } from "./StreamingMessage";
import { commandRegistry } from "@/core/commands/registry";

export interface AIPanelRef {
	focusInput: () => void;
}

interface AIPanelProps {
	hasConfiguredProvider: boolean;
}

export const AIPanel = forwardRef<AIPanelRef, AIPanelProps>(({ hasConfiguredProvider }, ref) => {
	const { input, setInput, messages, isLoading, handleAsk, handleStop, handleApplyCode } =
		useAIConversation();

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [showApiKeyError, setShowApiKeyError] = useState(false);

	useImperativeHandle(ref, () => ({
		focusInput: () => {
			textareaRef.current?.focus();
		},
	}));

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	// Auto-resize textarea
	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;

		const adjustHeight = () => {
			textarea.style.height = "auto";
			textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`;
		};

		adjustHeight();
		textarea.addEventListener("input", adjustHeight);
		return () => textarea.removeEventListener("input", adjustHeight);
	}, [input]);

	const [mode, setMode] = useState<AIMode>("agent");
	const placeholder = mode === "agent" ? "Describe a task..." : "Ask a question...";

	useEffect(() => {
		if (hasConfiguredProvider && showApiKeyError) {
			setShowApiKeyError(false);
		}
	}, [hasConfiguredProvider, showApiKeyError]);

	const handleOpenSettings = () => {
		commandRegistry.execute("session.settings");
	};

	const handleSend = (selectedMode: AIMode) => {
		if (!hasConfiguredProvider) {
			setShowApiKeyError(true);
			handleOpenSettings();
			return;
		}

		setShowApiKeyError(false);
		handleAsk(selectedMode);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
		if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.metaKey) {
			e.preventDefault();
			handleSend(mode);
		}
	};

	return (
		<div className="panel ai-panel">
			<div className="panel-header">
				<div className="panel-title">AI Assistant</div>
				<ProviderSwitcher />
			</div>
			<div className="panel-content">
				<div className="ai-messages">
					{messages.length === 0 ? (
						<div className="ai-welcome">
							<h3>AI Assistant</h3>
							<p>Ask me anything about R programming, data analysis, or visualization.</p>
						</div>
					) : (
						<>
							{messages.map((message) =>
								message.role === "assistant" ? (
									<StreamingMessage
										key={message.id}
										message={message}
										onApplyCode={handleApplyCode}
									/>
								) : (
									<div key={message.id} className="message message-user">
										<div className="message-header">
											<span className="message-role">You</span>
										</div>
										<div className="message-content">{message.content}</div>
									</div>
								),
							)}
							<div ref={messagesEndRef} />
						</>
					)}
				</div>
				<div className="ai-input-container-wrapper">
					<div className="ai-input-container vscode-style">
						<textarea
							ref={textareaRef}
							className="ai-input"
							placeholder={placeholder}
							aria-label={placeholder}
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={handleKeyDown}
							disabled={isLoading}
							rows={5}
						/>
						<div className="input-controls-bar">
							<div className="input-controls-left">
								<select
									className="mode-dropdown"
									value={mode}
									onChange={(e) => setMode(e.target.value as AIMode)}
									disabled={isLoading}
									aria-label="AI interaction mode"
								>
									<option value="agent">Agent</option>
									<option value="chat">Chat</option>
								</select>
							</div>
							<div className="input-controls-right">
								{isLoading ? (
									<button
										type="button"
										className="icon-btn stop-btn"
										onClick={handleStop}
										title="Stop generation (Esc)"
										aria-label="Stop generation"
									>
										<IconSquare width={16} height={16} aria-hidden />
									</button>
								) : (
									<button
										type="button"
										className="send-btn"
										onClick={() => handleSend(mode)}
										disabled={!input.trim()}
										title="Send message (Enter)"
										aria-label="Send message"
									>
										<IconSend width={16} height={16} aria-hidden />
										<span>Send</span>
									</button>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
});
AIPanel.displayName = "AIPanel";
