/**
 * Conditionally joins CSS class names together.
 * Filters out falsy values for clean className strings.
 *
 * @param classes - Class names or conditional expressions
 * @returns Joined class name string
 *
 * @example
 * classNames("btn", "primary")
 * // returns "btn primary"
 *
 * @example
 * classNames("btn", isActive && "active", isDisabled && "disabled")
 * // returns "btn active" (if isActive=true, isDisabled=false)
 *
 * @example
 * classNames("base", condition ? "true-class" : "false-class")
 * // returns "base true-class" or "base false-class"
 *
 * @example
 * classNames("menu-item", isOpen && "active", !isConnected && "disabled")
 * // returns "menu-item active" (if isOpen=true, isConnected=true)
 */
export function classNames(...classes: (string | false | null | undefined)[]): string {
	return classes.filter(Boolean).join(" ");
}
