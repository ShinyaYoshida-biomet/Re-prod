import { extractDiffFromToolOutput } from "@/core/ai/diffArtifacts";
import type { ToolCallLog as ToolCallLogEntry } from "@/types";
import { DiffPreview } from "./DiffPreview";
import { asString, asOptionalString } from "@/utils/string";

interface Props {
	logs?: ToolCallLogEntry[];
}

type SearchResult = {
	title: string;
	uri: string;
	description?: string;
};

// RStudio-style minimal status icons (no colors, just symbols)
const STATUS_ICON: Record<ToolCallLogEntry["status"], string> = {
	pending: "○",
	running: "◐",
	done: "✓",
	error: "✗",
};

const isFetchTool = (log: ToolCallLogEntry): boolean => {
	if (log.kind && log.kind.toLowerCase().includes("fetch")) {
		return true;
	}
	return log.name === "web_search";
};

const extractSearchResults = (payload?: Record<string, unknown>): SearchResult[] | null => {
	if (!payload || !Array.isArray(payload.results)) return null;

	const results: SearchResult[] = [];
	for (const entry of payload.results) {
		if (!entry || typeof entry !== "object") continue;
		const record = entry as Record<string, unknown>;
		const title = asString(record.title);
		const uri = asString(record.uri);
		const description = asOptionalString(record.description) ?? asOptionalString(record.text);

		if (!title && !uri) continue;
		const result: SearchResult = {
			title,
			uri,
			...(description ? { description } : {}),
		};
		results.push(result);
	}

	return results.length > 0 ? results : null;
};

const renderSearchResults = (results: SearchResult[]): JSX.Element => {
	return (
		<div className="ai-tool-call__search">
			<div className="ai-tool-call__search-meta">{results.length} result(s)</div>
			<ul className="ai-tool-call__search-list">
				{results.map((result, index) => {
					const label = result.title || result.uri;
					return (
						<li key={`${result.uri}-${index}`} className="ai-tool-call__search-item">
							{result.uri ? (
								<a
									className="ai-tool-call__search-title"
									href={result.uri}
									target="_blank"
									rel="noreferrer"
								>
									{label}
								</a>
							) : (
								<span className="ai-tool-call__search-title">{label}</span>
							)}
							{result.uri && <div className="ai-tool-call__search-uri">{result.uri}</div>}
							{result.description && (
								<div className="ai-tool-call__search-desc">{result.description}</div>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
};

export function ToolCallLog({ logs }: Props): JSX.Element | null {
	if (!logs || logs.length === 0) {
		return null;
	}

	return (
		<div className="ai-tool-log">
			{logs.map((log) => (
				<details key={log.id} className="ai-tool-call" open={log.status === "running"}>
					<summary className="ai-tool-call__summary">
						<span className="ai-tool-call__status-icon">{STATUS_ICON[log.status]}</span>
						<span className="ai-tool-call__title">{log.name || log.id}</span>
						{log.locations && log.locations.length > 0 && (
							<span className="ai-tool-call__location">{log.locations[0]}</span>
						)}
					</summary>
					{log.status === "running" && isFetchTool(log) && (
						<div className="ai-tool-call__loading">Searching...</div>
					)}
					{log.output &&
						(() => {
							const diff = extractDiffFromToolOutput(log.output);
							if (diff) {
								return (
									<>
										{diff.status === "conflict" && (
											<pre className="ai-tool-call__error">
												Conflict detected. Reload the file and retry the edit.
											</pre>
										)}
										<DiffPreview diff={diff} />
									</>
								);
							}

							const searchResults = extractSearchResults(log.output);
							if (searchResults) {
								return renderSearchResults(searchResults);
							}

							return (
								<pre className="ai-tool-call__output">
									{typeof log.output === "object" && "text" in log.output
										? String(log.output.text)
										: JSON.stringify(log.output, null, 2)}
								</pre>
							);
						})()}
					{log.error && <pre className="ai-tool-call__error">{log.error}</pre>}
				</details>
			))}
		</div>
	);
}
