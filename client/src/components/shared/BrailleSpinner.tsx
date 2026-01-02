import { useEffect, useState } from "react";
import { classNames } from "@/utils/classNames";

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export interface BrailleSpinnerProps {
	intervalMs?: number;
	className?: string;
}

export function BrailleSpinner({ intervalMs = 80, className }: BrailleSpinnerProps): JSX.Element {
	const [frameIndex, setFrameIndex] = useState(0);

	useEffect(() => {
		const timer = window.setInterval(() => {
			setFrameIndex((previousIndex) => (previousIndex + 1) % BRAILLE_FRAMES.length);
		}, intervalMs);

		return () => window.clearInterval(timer);
	}, [intervalMs]);

	return (
		<span className={classNames("braille-spinner", className)} aria-hidden="true">
			{BRAILLE_FRAMES[frameIndex]}
		</span>
	);
}
