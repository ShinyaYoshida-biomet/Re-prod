import type { AppSettings } from "@shared/types";
import { useEffect, useState } from "react";
import { IconSettings } from "@/components/shared";
import { DEFAULT_SETTINGS } from "@/constants/defaultSettings";
import { useStore } from "@/core";
import { SettingsPanel } from "../settings/SettingsPanel";
import { ModalShell } from "./ModalShell";

interface SettingsModalProps {
	open: boolean;
	onClose: () => void;
}

type SettingKey = keyof AppSettings;

export function SettingsModal({ open, onClose }: SettingsModalProps): JSX.Element | null {
	const settings = useStore((state) => state.settings);
	const updateSettings = useStore((state) => state.updateSettings);
	const [draft, setDraft] = useState<AppSettings>(settings);

	useEffect(() => {
		if (open) {
			setDraft(settings);
		}
	}, [open, settings]);

	const handleChange = <K extends SettingKey>(key: K, value: AppSettings[K]) => {
		setDraft((prev) => ({ ...prev, [key]: value }));
	};

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		updateSettings(draft);
		onClose();
	};

	const handleReset = () => {
		setDraft({ ...DEFAULT_SETTINGS });
	};

	return (
		<ModalShell
			open={open}
			onClose={onClose}
			title="Settings"
			subtitle="Personalize the editor and runtime"
			icon={<IconSettings width={22} height={22} aria-hidden />}
			maxWidth={720}
			footer={
				<div className="modal-footer-actions">
					<button className="btn" type="button" onClick={handleReset}>
						Reset defaults
					</button>
					<div className="settings-footer-spacer" />
					<button className="btn" type="button" onClick={onClose}>
						Cancel
					</button>
					<button className="btn btn-primary" type="submit" form="settings-form">
						Save changes
					</button>
				</div>
			}
		>
			<form id="settings-form" className="settings-form" onSubmit={handleSubmit}>
				<section>
					<h3>General</h3>
					<label className="settings-row">
						<span>
							Auto-run new code blocks
							<small>Automatically execute when AI inserts snippets.</small>
						</span>
						<input
							type="checkbox"
							checked={draft.autoRun}
							onChange={(event) => handleChange("autoRun", event.target.checked)}
						/>
					</label>
				</section>

				<section>
					<h3>Editor</h3>
					<label className="settings-row">
						<span>
							Font size
							<small>Applies to instantly Monaco editor.</small>
						</span>
						<div className="settings-number-input">
							<input
								type="range"
								min={11}
								max={22}
								value={draft.fontSize}
								onChange={(event) => handleChange("fontSize", Number(event.target.value))}
							/>
							<span>{draft.fontSize}px</span>
						</div>
					</label>
					<label className="settings-row">
						<span>
							Show cell decorations
							<small>Draw section markers for `# ----` blocks.</small>
						</span>
						<input
							type="checkbox"
							checked={draft.showCellDecorations}
							onChange={(event) => handleChange("showCellDecorations", event.target.checked)}
						/>
					</label>
					<label className="settings-row">
						<span>
							Highlight executing cell
							<small>Shade the currently running block.</small>
						</span>
						<input
							type="checkbox"
							checked={draft.highlightExecutingCell}
							onChange={(event) => handleChange("highlightExecutingCell", event.target.checked)}
						/>
					</label>
				</section>

				<section>
					<h3>R Runtime</h3>
					<label className="settings-row">
						<span>
							R executable path
							<small>Used by the backend when launching scripts.</small>
						</span>
						<input
							type="text"
							value={draft.rPath}
							onChange={(event) => handleChange("rPath", event.target.value)}
							placeholder="Rscript"
						/>
					</label>
				</section>

				<section>
					<h3>LLM Providers</h3>
					<SettingsPanel />
				</section>
			</form>
		</ModalShell>
	);
}
