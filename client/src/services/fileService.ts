import type { CodeBlock } from "@/types";

export async function applyCodeChangeFile(codeBlock: CodeBlock): Promise<void> {
	const response = await fetch("/api/ai/code-change", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ codeBlock }),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(text || `Failed to apply code change (${response.status})`);
	}
}
