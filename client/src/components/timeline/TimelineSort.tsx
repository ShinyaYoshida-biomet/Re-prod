import type { TimelineSortProps } from "@/types/timeline";

export function TimelineSort({ sort, onChange }: TimelineSortProps): JSX.Element {
	const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		onChange(e.target.value as "asc" | "desc");
	};

	return (
		<div className="timeline-sort">
			<label htmlFor="timeline-sort-select">Sort by time:</label>
			<select id="timeline-sort-select" value={sort} onChange={handleChange}>
				<option value="desc">Newest First</option>
				<option value="asc">Oldest First</option>
			</select>
		</div>
	);
}
