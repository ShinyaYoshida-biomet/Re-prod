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
	const { aiState, aiActions, promptHistory } = useAIConversation();

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
	}, [aiState.messages]);

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
	}, [aiState.input]);

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
		aiActions.ask(selectedMode);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
		const textarea = e.currentTarget;
		const { selectionStart, selectionEnd } = textarea;
		const isAtStart = selectionStart === 0 && selectionEnd === 0;
		const isAtEnd =
			selectionStart === aiState.input.length && selectionEnd === aiState.input.length;
		const hasSelection = selectionStart !== selectionEnd;

		// Arrow Up - Navigate to previous prompt
		if (e.key === "ArrowUp" && !e.shiftKey && !e.altKey && !e.metaKey) {
			// Only trigger if cursor is at the start (or input is empty)
			if ((isAtStart || aiState.input.length === 0) && !hasSelection) {
				if (promptHistory.navigateUp()) {
					e.preventDefault();
					// Move cursor to end of restored prompt
					requestAnimationFrame(() => {
						textarea.selectionStart = textarea.value.length;
						textarea.selectionEnd = textarea.value.length;
					});
				}
			}
			return;
		}

		// Arrow Down - Navigate to next prompt
		if (e.key === "ArrowDown" && !e.shiftKey && !e.altKey && !e.metaKey) {
			// Only trigger if cursor is at the end (or input is empty)
			if ((isAtEnd || aiState.input.length === 0) && !hasSelection) {
				if (promptHistory.navigateDown()) {
					e.preventDefault();
					// Move cursor to end
					requestAnimationFrame(() => {
						textarea.selectionStart = textarea.value.length;
						textarea.selectionEnd = textarea.value.length;
					});
				}
			}
			return;
		}

		// Enter - Send message
		if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.metaKey) {
			e.preventDefault();
			handleSend(mode);
			return;
		}
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		aiActions.setInput(e.target.value);
		promptHistory.resetNavigation();
	};

	return (
		<div className="panel ai-panel">
			<div className="panel-header">
				<div className="panel-title">AI Assistant</div>
				<ProviderSwitcher />
			</div>
			<div className="panel-content">
				<div className="ai-messages">
					{aiState.messages.length === 0 ? (
						<div className="ai-welcome">
							<h3>AI Assistant</h3>
							<p>Ask me anything about R programming, data analysis, or visualization.</p>
						</div>
					) : (
						<>
							{aiState.messages.map((message) =>
								message.role === "assistant" ? (
									<StreamingMessage
										key={message.id}
										message={message}
										onApplyCode={aiActions.applyCode}
									/>
								) : (
									<div key={message.id} className="message message-user">
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
							value={aiState.input}
							onChange={handleInputChange}
							onKeyDown={handleKeyDown}
							disabled={aiState.isLoading}
							rows={5}
						/>
						<div className="input-controls-bar">
							<div className="input-controls-left">
								<select
									className="mode-dropdown"
									value={mode}
									onChange={(e) => setMode(e.target.value as AIMode)}
									disabled={aiState.isLoading}
									aria-label="AI interaction mode"
								>
									<option value="agent">Agent</option>
									<option value="chat">Chat</option>
								</select>
							</div>
							<div className="input-controls-right">
								{aiState.isLoading ? (
									<button
										type="button"
										className="icon-btn stop-btn"
										onClick={aiActions.stop}
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
										disabled={!aiState.input.trim()}
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
