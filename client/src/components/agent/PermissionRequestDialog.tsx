import type { AcpPermissionOption, AcpPermissionRequestPayload } from "@/types/generated";
import "./PermissionRequestDialog.css";

interface Props {
	request: AcpPermissionRequestPayload;
	onAllow: (optionId?: string) => void;
	onReject: (optionId?: string) => void;
	onCancel: () => void;
}

export function PermissionRequestDialog({
	request,
	onAllow,
	onReject,
	onCancel,
}: Props): JSX.Element {
	const allowOption = request.options.find((opt) => opt.kind.toLowerCase().includes("allow"));
	const rejectOption = request.options.find((opt) => opt.kind.toLowerCase().includes("reject"));

	const renderOption = (opt: AcpPermissionOption) => (
		<div key={opt.option_id} className="acp-permission-option">
			<div className="acp-permission-option-name">{opt.name}</div>
			<div className="acp-permission-option-kind">{opt.kind}</div>
		</div>
	);

	return (
		<div className="acp-permission-backdrop">
			<div className="acp-permission-dialog">
				<div className="acp-permission-header">
					<span className="acp-permission-title">Agent Requesting Permission</span>
					<button className="acp-permission-close" onClick={onCancel} aria-label="Close">
						×
					</button>
				</div>
				<div className="acp-permission-body">
					<div className="acp-permission-section">
						<div className="acp-permission-label">Tool Call</div>
						<div className="acp-permission-value">{request.tool_title ?? request.tool_call_id}</div>
					</div>
					<div className="acp-permission-section">
						<div className="acp-permission-label">Options</div>
						<div className="acp-permission-options">
							{request.options.map((opt) => renderOption(opt))}
						</div>
					</div>
				</div>
				<div className="acp-permission-actions">
					<button
						type="button"
						className="acp-permission-btn reject"
						onClick={() => onReject(rejectOption?.option_id)}
					>
						Reject once
					</button>
					<button
						type="button"
						className="acp-permission-btn allow"
						onClick={() => onAllow(allowOption?.option_id)}
					>
						Allow once
					</button>
				</div>
			</div>
		</div>
	);
}
