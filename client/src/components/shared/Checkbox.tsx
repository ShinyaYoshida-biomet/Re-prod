import type React from "react";
import { classNames } from "@/utils/classNames";

export interface CheckboxProps {
	label: string;

	checked: boolean;

	onChange: (checked: boolean) => void;

	id?: string;

	disabled?: boolean;

	className?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
	label,
	checked,
	onChange,
	id,
	disabled = false,
	className = "",
}) => {
	const inputId = id || `checkbox-${label.replace(/\s+/g, "-").toLowerCase()}`;

	return (
		<label
			htmlFor={inputId}
			className={classNames("checkbox", disabled && "checkbox--disabled", className)}
		>
			<input
				id={inputId}
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				disabled={disabled}
				aria-label={label}
			/>
			<span className="checkbox-label">{label}</span>
		</label>
	);
};
