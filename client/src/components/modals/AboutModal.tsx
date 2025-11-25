import { IconInfo } from "@/components/shared";
import { LINKS, TECH_STACK } from "@/constants/appInfo";
import { useStore } from "@/core";
import packageJson from "../../../package.json";
import { ModalShell } from "./ModalShell";

interface AboutModalProps {
	open: boolean;
	onClose: () => void;
}

export function AboutModal({ open, onClose }: AboutModalProps): JSX.Element | null {
	const settings = useStore((state) => state.settings);
	const version = packageJson.version ?? "dev";
	const mode = import.meta.env.MODE;
	const build = import.meta.env.VITE_GIT_SHA || "local-build";
	const platform = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";

	return (
		<ModalShell
			open={open}
			onClose={onClose}
			title="About Re-prod"
			subtitle="AI-powered R analysis workspace"
			icon={<IconInfo width={24} height={24} aria-hidden />}
		>
			<div className="about-grid">
				<div className="about-card">
					<h3>Version</h3>
					<p className="about-metric">v{version}</p>
					<dl>
						<div>
							<dt>Build channel</dt>
							<dd>{mode}</dd>
						</div>
						<div>
							<dt>Commit</dt>
							<dd>{build}</dd>
						</div>
						<div>
							<dt>R Path</dt>
							<dd>{settings.rPath}</dd>
						</div>
					</dl>
				</div>
				<div className="about-card">
					<h3>Runtime</h3>
					<p className="about-metric">{platform}</p>
					<p className="about-note">
						Electron-free desktop shell powered by Tauri and Axum server bridge.
					</p>
					<ul className="about-tech-list">
						{TECH_STACK.map((tech) => (
							<li key={tech.title}>
								<strong>{tech.title}</strong>
								<span>{tech.description}</span>
							</li>
						))}
					</ul>
				</div>
			</div>
			<div className="about-links">
				{LINKS.map((link) => (
					<a key={link.href} href={link.href} target="_blank" rel="noreferrer">
						{link.label}
					</a>
				))}
			</div>
		</ModalShell>
	);
}
