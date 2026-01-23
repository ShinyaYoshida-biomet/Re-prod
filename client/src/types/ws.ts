export type { WSRequest } from "./generated/WSRequest";
export type { WSResponse } from "./generated/WSResponse";

export type ClientMessage = import("./generated/WSRequest").WSRequest;
export type ServerMessage = import("./generated/WSResponse").WSResponse;
export type ServerMessageType = ServerMessage["type"];

export type ExtractServerMessage<TType extends ServerMessageType> = Extract<
	ServerMessage,
	{ type: TType }
>;

export type ExportRMarkdownRequestPayload =
	import("./generated/ExportRMarkdownRequest").ExportRMarkdownRequest;
export type ExportRMarkdownResponsePayload =
	import("./generated/ExportRMarkdownResponse").ExportRMarkdownResponse;
export type OutputTruncationOptions =
	import("./generated/OutputTruncationPayload").OutputTruncationPayload;
export type PdfExportOptions = import("./generated/PdfOptionsPayload").PdfOptionsPayload;
export type PlotHistoryEntryPayload = import("./generated/PlotHistoryEntry").PlotHistoryEntry;

export type PlotHistoryStatePayload = Pick<
	ExtractServerMessage<"plot_history_state">,
	"activePlotId" | "plots"
>;

export type PlotHistoryExportFormat = Extract<
	ClientMessage,
	{ type: "plot_history_export" }
>["format"];

export type ExportMode = ExportRMarkdownRequestPayload["mode"];
export type ExportFormat = ExportRMarkdownRequestPayload["format"];
export type CodeFolding = ExportRMarkdownRequestPayload["codeFolding"];
