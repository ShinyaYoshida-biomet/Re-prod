import type { TimelineFiltersProps } from "@/types/timeline";
import { Checkbox } from "../shared/Checkbox";

export function TimelineFilters({ filters = {}, onChange }: TimelineFiltersProps): JSX.Element {
	const handleActorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const value = e.target.value;
		onChange({
			...filters,
			actor: value === "all" ? undefined : (value as "user" | "ai"),
		});
	};

	const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const value = e.target.value;
		onChange({
			...filters,
			source: value === "all" ? undefined : (value as "selection" | "cell" | "whole_document"),
		});
	};

	const handleCodeSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		onChange({
			...filters,
			codeContains: value ? value : undefined,
		});
	};

	const handleClearFilters = () => {
		onChange({});
	};

	const hasActiveFilters = Object.keys(filters).length > 0;

	return (
		<div className="timeline-filters">
			<div className="timeline-filters-row">
				<div className="timeline-filter">
					<label htmlFor="filter-actor">Actor:</label>
					<select id="filter-actor" value={filters.actor || "all"} onChange={handleActorChange}>
						<option value="all">All</option>
						<option value="user">User</option>
						<option value="ai">AI</option>
					</select>
				</div>

				<div className="timeline-filter">
					<label htmlFor="filter-source">Source:</label>
					<select id="filter-source" value={filters.source || "all"} onChange={handleSourceChange}>
						<option value="all">All</option>
						<option value="selection">Selection</option>
						<option value="cell">Cell</option>
						<option value="whole_document">Document</option>
					</select>
				</div>

				<Checkbox
					className="timeline-filter timeline-filter-checkbox"
					label="With Plots"
					checked={filters.hasPlots || false}
					onChange={(checked) => onChange({ ...filters, hasPlots: checked ? true : undefined })}
				/>

				<Checkbox
					className="timeline-filter timeline-filter-checkbox"
					label="With Errors"
					checked={filters.hasErrors || false}
					onChange={(checked) => onChange({ ...filters, hasErrors: checked ? true : undefined })}
				/>
			</div>

			<div className="timeline-filters-row">
				<div className="timeline-filter timeline-filter-search">
					<label htmlFor="filter-code">Code contains:</label>
					<input
						type="text"
						id="filter-code"
						placeholder="Search code..."
						value={filters.codeContains || ""}
						onChange={handleCodeSearchChange}
					/>
				</div>

				{hasActiveFilters && (
					<button className="timeline-filter-clear" onClick={handleClearFilters}>
						Clear Filters
					</button>
				)}
			</div>
		</div>
	);
}
