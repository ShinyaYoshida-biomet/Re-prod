import "./FileAccessIndicator.css";

interface Props {
	filePaths: string[];
	onOpenPath?: (path: string) => void;
}

export function FileAccessIndicator({ filePaths, onOpenPath }: Props): JSX.Element {
	return (
		<div className="file-access-indicator">
			{filePaths.map((path) => (
				<div key={path} className="file-access-item">
					<span className="file-access-icon" aria-hidden="true">
						🔍
					</span>
					<button
						type="button"
						className="file-access-button file-access-path"
						onClick={() => onOpenPath?.(path)}
					>
						{path}
					</button>
				</div>
			))}
		</div>
	);
}
