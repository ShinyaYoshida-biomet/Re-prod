import { useCallback, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { BrailleSpinner, useToast } from "@/components/shared";
import { useStore } from "@/core";
import type { Buffer } from "@/core/state/slices/editorSlice";
import { createBufferId } from "@/core/state/utils/createBufferId";
import { fileSystem } from "@/services/fileSystem";
import type { AIMessage, CodeBlock, ToolCallLog as ToolCallLogEntry } from "@/types";
import { classNames } from "@/utils/classNames";
import { AIPlanCard } from "./AIPlanCard";
import { AgentEventStream } from "./AgentEventStream";
import { CodeBlockWithApply } from "./CodeBlockWithApply";
import { CopyButton } from "./CopyButton";
import { FileAccessIndicator } from "./FileAccessIndicator";
import { ToolCallLog } from "./ToolCallLog";
import "github-markdown-css/github-markdown.css";
import "./Markdown.css";

interface Props {
	message: AIMessage;
	onApplyCode: (codeBlock: CodeBlock) => Promise<void>;
}

// Remove patch blocks from content for display
function stripPatchBlocks(content: string): string {
	return content.replace(/\*\*\* Begin Patch[\s\S]*?\*\*\* End Patch/g, "").trim();
}

const READ_TOOL_NAMES = new Set(["read", "read file", "read_file", "read_text_file"]);

const isReadTool = (name?: string): boolean => {
	if (!name) return false;
	const normalized = name.trim().toLowerCase();
	if (READ_TOOL_NAMES.has(normalized)) return true;
	return normalized.includes("read") && normalized.includes("file");
};

const extractReadPathFromInput = (input?: Record<string, unknown>): string | null => {
	if (!input) return null;
	const candidate = input.path ?? input.file_path ?? input.filePath;
	if (typeof candidate === "string" && candidate.trim()) {
		return candidate.trim();
	}
	return null;
};

const extractReadFilePaths = (logs?: ToolCallLogEntry[]): string[] => {
	if (!logs || logs.length === 0) return [];
	const seen = new Set<string>();
	const result: string[] = [];

	for (const log of logs) {
		if (log.status !== "done") continue;
		if (!isReadTool(log.name)) continue;

		const path =
			extractReadPathFromInput(log.input) ??
			(log.locations && log.locations.length > 0 ? log.locations[0] : null);

		if (typeof path === "string" && path.trim()) {
			const trimmed = path.trim();
			if (!seen.has(trimmed)) {
				seen.add(trimmed);
				result.push(trimmed);
			}
		}
	}

	return result;
};

export function StreamingMessage({ message, onApplyCode }: Props): JSX.Element {
	const addBuffer = useStore((state) => state.addBuffer);
	const setActiveBuffer = useStore((state) => state.setActiveBuffer);
	const getBufferByFilepath = useStore((state) => state.getBufferByFilepath);
	const toast = useToast();
	const isAssistant = message.role === "assistant";
	const isStreaming = Boolean(message.streamingId && !message.isComplete);
	const hasPlan = Boolean(message.planSteps && message.planSteps.length > 0);
	const hasTools = Boolean(message.toolLogs && message.toolLogs.length > 0);
	const hasCodeBlocks = Boolean(message.codeBlocks && message.codeBlocks.length > 0);
	const hasEvents = Boolean(message.events && message.events.length > 0);
	const shouldShowLegacyCode = Boolean(message.code && !hasCodeBlocks);
	console.log("----------- message: ", message);

	// Strip patch blocks from content to avoid duplicate display
	const displayContent = message.content ? stripPatchBlocks(message.content) : "";
	const readFilePaths = useMemo(() => extractReadFilePaths(message.toolLogs), [message.toolLogs]);
	const handleOpenPath = useCallback(
		async (path: string) => {
			try {
				const existingBuffer = getBufferByFilepath(path);
				if (existingBuffer) {
					setActiveBuffer(existingBuffer.id);
					return;
				}
				const content = await fileSystem.readFile(path);
				const buffer: Buffer = {
					id: createBufferId(),
					filepath: path,
					content,
					isDirty: false,
					cursorPosition: { line: 1, column: 1 },
				};
				addBuffer(buffer);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				toast.showError(`Failed to open file: ${message}`);
			}
		},
		[addBuffer, getBufferByFilepath, setActiveBuffer, toast],
	);

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
						<BrailleSpinner intervalMs={80} />
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
			{displayContent && <CopyButton text={displayContent} className="message-copy-btn" />}

			{isAssistant && (
				<>
					{readFilePaths.length > 0 && (
						<FileAccessIndicator filePaths={readFilePaths} onOpenPath={handleOpenPath} />
					)}

					{hasEvents && (
						<AgentEventStream events={message.events} approvals={message.approvalQueue} />
					)}

					{!hasEvents && hasPlan && <AIPlanCard steps={message.planSteps} />}

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
