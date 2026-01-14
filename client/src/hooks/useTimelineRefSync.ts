import { useEffect, useRef } from "react";
import { useStore } from "@/core";
import type { TimelineDialogRef } from "@/components/timeline";

/**
 * Creates and synchronizes a TimelineDialog ref with the store.
 *
 * This hook manages the lifecycle of the timeline dialog ref, registering
 * it with the store on mount and cleaning up on unmount.
 *
 * @returns The ref object to be passed to TimelineDialog
 */
export function useTimelineRefSync(): React.RefObject<TimelineDialogRef> {
	const setTimelinePanelRef = useStore((state) => state.setTimelinePanelRef);
	const timelineDialogRef = useRef<TimelineDialogRef>(null);

	useEffect(() => {
		setTimelinePanelRef(timelineDialogRef.current);
		return () => {
			setTimelinePanelRef(null);
		};
	}, [setTimelinePanelRef]);

	return timelineDialogRef;
}
