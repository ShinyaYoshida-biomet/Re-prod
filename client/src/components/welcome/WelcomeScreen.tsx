type WelcomeScreenProps = {
	onOpenFolder: () => void;
	onCreateProject: () => void;
	onCloneProject: () => void;
	onSetupApiKeys: () => void;
	onClose?: () => void;
};

export function WelcomeScreen({
	onOpenFolder,
	onCreateProject,
	onCloneProject,
	onSetupApiKeys,
	onClose,
}: WelcomeScreenProps): JSX.Element {
	return (
		<div className="welcome-screen">
			<div className="welcome-surface">
				<header className="welcome-header">
					<div className="welcome-header-top">
						<div className="welcome-pill">Re-prod</div>
						{onClose ? (
							<button type="button" className="welcome-close" onClick={onClose}>
								Return to workspace
							</button>
						) : null}
					</div>
					<h1>Reproducible research, zero guesswork.</h1>
					<p>
						Start from a project so timelines, plots, and AI context stay in sync. Choose how you
						want to get going:
					</p>
				</header>

				<div className="welcome-grid">
					<section className="welcome-card">
						<div className="welcome-card-header">
							<div>
								<h2>Get started</h2>
								<p>Pick a workspace to unlock the timeline, plots, and AI tools.</p>
							</div>
						</div>
						<div className="welcome-actions">
							<button type="button" className="btn btn-primary" onClick={onOpenFolder}>
								Open Existing Folder
							</button>
							<button type="button" className="btn btn-secondary" onClick={onCreateProject}>
								Create New Project
							</button>
							<button type="button" className="btn btn-outline" onClick={onCloneProject}>
								Clone from Git
							</button>
						</div>
					</section>

					<section className="welcome-card">
						<div className="welcome-card-header">
							<div>
								<h2>Configure</h2>
								<p>Connect AI providers before you start chatting or patching code.</p>
							</div>
						</div>
						<div className="welcome-actions">
							<button type="button" className="btn btn-outline" onClick={onSetupApiKeys}>
								Setup API Keys
							</button>
						</div>
						<ul className="welcome-list">
							<li>
								Timeline saves to <code>.reprod/timeline.ndjson</code>
							</li>
							<li>Plots and exports live inside your project folder</li>
							<li>AI suggestions stay aware of your project files</li>
						</ul>
					</section>
				</div>
			</div>
		</div>
	);
}
