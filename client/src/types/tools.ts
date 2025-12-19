export type ToolKind = "r-package" | "cli";
export type CapabilityKind = "r-function" | "r-snippet" | "cli-command";

export interface ToolManifest {
	id: string;
	displayName: string;
	kind: ToolKind;
	description: string;
	version?: string;
	homepage?: string;
	tags: string[];
	runtime: RuntimeConfig;
	validation: ValidationConfig;
	capabilities: CapabilityDescriptor[];
}

export interface RuntimeConfig {
	rLibrary?: string;
	imports: string[];
	cliBinary?: string;
	args: string[];
}

export interface ValidationConfig {
	requiresPackages: string[];
	requiresCli: string[];
	preflightR?: string;
	preflightCli?: string;
}

export interface CapabilityDescriptor {
	id: string;
	displayName: string;
	kind: CapabilityKind;
	description: string;
	entrypoint: string;
	template?: string;
	inputSpec: ParameterSpec[];
	outputSpec: OutputSpec[];
	postValidation?: string;
}

export type ParameterType = "string" | "integer" | "float" | "enum" | "file";
export type OutputType = "stdout" | "stderr" | "file" | "r-object";
export type ArtifactRecord = "artifact" | "preview" | "internal";

export interface ParameterSpec {
	name: string;
	type: ParameterType;
	format?: string;
	options?: string[];
	default?: string | number | boolean | null;
	min?: number;
	max?: number;
	role?: "generated";
}

export interface OutputSpec {
	type: OutputType;
	path?: string;
	class?: string;
	recordAs?: ArtifactRecord;
}

export interface ToolExecutionRequest {
	toolId: string;
	capabilityId: string;
	parameters: Record<string, string>;
}

export interface ArtifactSummary {
	path: string;
	type: "file" | "plot";
	label?: string;
}

export interface ToolExecutionResult {
	toolId: string;
	capabilityId: string;
	stdout?: string;
	stderr?: string;
	artifacts?: ArtifactSummary[];
}
