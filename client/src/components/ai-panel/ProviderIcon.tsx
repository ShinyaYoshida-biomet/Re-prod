import type { ProviderMetadata } from "@/domain/provider/ProviderMetadata";
import "./ProviderIcon.css";

interface ProviderIconProps {
	metadata: ProviderMetadata;
	showLabel?: boolean;
	size?: "small" | "medium" | "large";
}

export function ProviderIcon({ metadata, showLabel = false, size = "medium" }: ProviderIconProps) {
	const { icon, displayName } = metadata;

	return (
		<span className={`provider-icon provider-icon--${size}`} title={displayName}>
			<img src={icon.path} alt={icon.alt} className="provider-icon__image" aria-label={icon.alt} />
			{showLabel && <span className="provider-icon__label">{displayName}</span>}
		</span>
	);
}
