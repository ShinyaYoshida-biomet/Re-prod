import { LoadingSpinner } from "@/components/shared";
import type { TimelineStatsProps } from "@/types/timeline";

export function TimelineStats({ stats, loading }: TimelineStatsProps): JSX.Element {
	if (loading || !stats) {
		return (
			<div className="timeline-stats">
				<LoadingSpinner size="small" message="Loading stats..." />
			</div>
		);
	}

	// Format session duration
	const formatDuration = (ms: number): string => {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) {
			return `${hours}h ${minutes % 60}m`;
		} else if (minutes > 0) {
			return `${minutes}m ${seconds % 60}s`;
		} else {
			return `${seconds}s`;
		}
	};

	const duration = formatDuration(stats.sessionDuration);

	return (
		<div className="timeline-stats">
			<div className="timeline-stats-grid">
				<div className="timeline-stat">
					<div className="timeline-stat-value">{stats.totalEvents}</div>
					<div className="timeline-stat-label">Total Events</div>
				</div>

				<div className="timeline-stat">
					<div className="timeline-stat-value">{stats.userActions}</div>
					<div className="timeline-stat-label">User</div>
				</div>

				<div className="timeline-stat">
					<div className="timeline-stat-value">{stats.aiActions}</div>
					<div className="timeline-stat-label">AI</div>
				</div>

				<div className="timeline-stat">
					<div className="timeline-stat-value">{stats.totalPlots}</div>
					<div className="timeline-stat-label">Plots</div>
				</div>

				<div className="timeline-stat">
					<div className="timeline-stat-value">{stats.totalErrors}</div>
					<div className="timeline-stat-label">Errors</div>
				</div>

				<div className="timeline-stat">
					<div className="timeline-stat-value">{duration}</div>
					<div className="timeline-stat-label">Duration</div>
				</div>
			</div>
		</div>
	);
}
