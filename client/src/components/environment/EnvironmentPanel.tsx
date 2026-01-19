import { useEnvironmentPanelState } from "@/hooks/useEnvironmentPanelState";

export function EnvironmentPanel(): JSX.Element {
	const { variables, isLoading } = useEnvironmentPanelState();

	return (
		<div className="panel panel--transparent environment-panel">
			<div className="panel-content environment-content">
				{isLoading ? (
					<div className="environment-loading">
						<span className="spinner" aria-hidden />
						<span>Loading environment...</span>
					</div>
				) : variables.length === 0 ? (
					<div className="environment-empty">
						<p>No variables in the environment.</p>
						<p className="text-muted">Run R code to create variables.</p>
					</div>
				) : (
					<div className="environment-table-container">
						<table className="environment-table">
							<thead>
								<tr>
									<th>Name</th>
									<th>Type</th>
									<th>Size</th>
									<th>Value</th>
								</tr>
							</thead>
							<tbody>
								{variables.map((variable, index) => (
									<tr key={index} className="environment-row">
										<td className="environment-name">{variable.name}</td>
										<td className="environment-type">{variable.type}</td>
										<td className="environment-size">{variable.size}</td>
										<td className="environment-value">
											<code>{variable.value}</code>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}
