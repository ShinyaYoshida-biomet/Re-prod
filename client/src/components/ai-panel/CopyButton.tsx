import { useState } from "react";
import { IconCheck, IconClipboard } from "@/components/shared";

interface CopyButtonProps {
	text: string;
	className?: string;
}

const COPY_FEEDBACK_DURATION = 2000; // 2 seconds as specified in issue #425

export function CopyButton({ text, className = "" }: CopyButtonProps): JSX.Element {
	const [copied, setCopied] = useState(false);

	const handleCopy = (): void => {
		navigator.clipboard
			.writeText(text)
			.then(() => {
				setCopied(true);
				setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION);
			})
			.catch(() => {
				// Intentionally ignored: Clipboard write failures are silent.
				// The copy button simply won't show success feedback if it fails.
			});
	};

	return (
		<button
			type="button"
			className={`icon-btn copy-btn ${className}`}
			onClick={handleCopy}
			title={copied ? "Copied!" : "Copy to clipboard"}
			aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
		>
			{copied ? (
				<IconCheck width={16} height={16} aria-hidden />
			) : (
				<IconClipboard width={16} height={16} aria-hidden />
			)}
		</button>
	);
}
