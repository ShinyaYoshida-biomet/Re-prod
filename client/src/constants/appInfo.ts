/**
 * Application information constants
 * Centralized definitions for app metadata, links, and tech stack
 */

import { DOCS_URL, GITHUB_ISSUE_URL, GITHUB_URL } from "./urls";

export interface AppLink {
	label: string;
	href: string;
}

export interface TechStackItem {
	title: string;
	description: string;
}

export const LINKS: AppLink[] = [
	{ label: "Documentation", href: DOCS_URL },
	{ label: "GitHub", href: GITHUB_URL },
	{ label: "Report Issue", href: GITHUB_ISSUE_URL },
];

export const TECH_STACK: TechStackItem[] = [
	{
		title: "Rust Core",
		description: "Tokio + Axum orchestrate the execution engine and WebSocket shell.",
	},
	{
		title: "Tauri Desktop",
		description: "Native desktop wrapper with secure command bridge.",
	},
	{
		title: "React + Monaco",
		description: "TypeScript UI with Monaco editor, Zustand state, and AI tooling.",
	},
];
