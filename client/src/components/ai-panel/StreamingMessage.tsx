import type { AIMessage, CodeBlock } from "@/types";
import { AIPlanCard } from "./AIPlanCard";
import { CodeBlockWithApply } from "./CodeBlockWithApply";
import { ToolCallLog } from "./ToolCallLog";
import { classNames } from "@/utils/classNames";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "github-markdown-css/github-markdown.css";
import "./Markdown.css";
import type { Components } from "react-markdown";

interface Props {
	message: AIMessage;
	onApplyCode: (codeBlock: CodeBlock) => Promise<void>;
}

// Remove patch blocks from content for display
function stripPatchBlocks(content: string): string {
	return content.replace(/\*\*\* Begin Patch[\s\S]*?\*\*\* End Patch/g, "").trim();
}

export function StreamingMessage({ message, onApplyCode }: Props): JSX.Element {
	const isAssistant = message.role === "assistant";
	const isStreaming = Boolean(message.streamingId && !message.isComplete);
	const hasPlan = Boolean(message.planSteps && message.planSteps.length > 0);
	const hasTools = Boolean(message.toolLogs && message.toolLogs.length > 0);
	const hasCodeBlocks = Boolean(message.codeBlocks && message.codeBlocks.length > 0);
	const shouldShowLegacyCode = Boolean(message.code && !hasCodeBlocks);

	// Strip patch blocks from content to avoid duplicate display
	const displayContent = message.content ? stripPatchBlocks(message.content) : "";

	// Custom components for react-markdown
	const markdownComponents: Components = {
		code: (props) => {
			const { node, className, children, ...rest } = props;
			// Check if this is inline code by checking the node type or presence of className
			const isInline = !className || !className.startsWith("language-");

			if (isInline) {
				return (
					<code className={className} {...rest}>
						{children}
					</code>
				);
			}

			// Block code - integrate with existing CodeBlockWithApply
			const match = /language-(\w+)/.exec(className || "");
			const language = match?.[1] || "";
			const codeString = String(children).replace(/\n$/, "");

			// For agent mode with apply functionality
			// Only use R language since CodeBlock.language is typed as "r"
			if (message.mode === "agent" && onApplyCode && language === "r") {
				return (
					<CodeBlockWithApply
						codeBlock={{
							id: `md-${Math.random().toString(36).substr(2, 9)}`,
							language: "r",
							code: codeString,
							action: "replace-all",
						}}
						onApply={onApplyCode}
						showDiffPreview={true}
					/>
				);
			}

			// Otherwise, render as plain code block with syntax highlighting
			return (
				<pre className={className}>
					<code {...rest}>{children}</code>
				</pre>
			);
		},
		a: (props) => {
			const { node, href, children, ...rest } = props;
			return (
				<a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
					{children}
				</a>
			);
		},
	};

	return (
		<div
			className={classNames("message", `message-${message.role}`)}
			data-streaming={isStreaming ? "true" : "false"}
		>
			{isStreaming && (
				<div className="message-header">
					<span className="message-role">💡 Thinking</span>
				</div>
			)}
			<div className="message-content message-streaming">
				{isStreaming && (
					<div className="message-streaming-indicator">
						<span className="spinner" aria-hidden />
						<span>Streaming response…</span>
					</div>
				)}
				{displayContent && (
					<div className="message-streaming-text markdown-body">
						<ReactMarkdown
							remarkPlugins={[remarkGfm]}
							rehypePlugins={[rehypeHighlight]}
							components={markdownComponents}
						>
							{displayContent}
						</ReactMarkdown>
					</div>
				)}
			</div>

			{isAssistant && (
				<>
					{hasPlan && <AIPlanCard steps={message.planSteps} />}

					{hasTools && <ToolCallLog logs={message.toolLogs} />}

					{shouldShowLegacyCode && (
						<div className="message-code">
							<pre>
								<code>{message.code}</code>
							</pre>
						</div>
					)}

					{hasCodeBlocks &&
						message.codeBlocks!.map((codeBlock) => (
							<CodeBlockWithApply
								key={codeBlock.id}
								codeBlock={codeBlock}
								onApply={onApplyCode}
								showDiffPreview={message.mode === "agent"}
							/>
						))}
				</>
			)}
		</div>
	);
}
