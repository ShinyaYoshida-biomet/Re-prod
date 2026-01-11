import type { StateCreator } from "zustand";

export type ViewPane = "files" | "editor" | "assistant";
export type ModalType =
	| "export"
	| "shortcuts"
	| "about"
	| "sessionInfo"
	| "settings"
	| "projectSwitch";

export interface ViewData {
	panes: Record<ViewPane, boolean>;
	modals: Record<ModalType, boolean>;
	zoom: number;
}

export interface ViewState {
	view: ViewData;
	togglePaneVisibility: (pane: ViewPane) => void;
	setPaneVisibility: (pane: ViewPane, visible: boolean) => void;
	setModalOpen: (modal: ModalType, open: boolean) => void;
	toggleModal: (modal: ModalType) => void;
	setZoomLevel: (zoom: number) => void;
	adjustZoom: (delta: number) => void;
	resetZoom: () => void;
}

const clampZoom = (value: number): number => Math.min(2, Math.max(0.5, value));

const applyZoomToDom = (zoom: number): void => {
	if (typeof window === "undefined") {
		return;
	}

	const rounded = zoom.toFixed(2);
	document.documentElement.style.setProperty("--app-zoom", rounded);

	const bodyStyle = document.body.style as CSSStyleDeclaration & {
		zoom?: string;
	};
	if ("zoom" in bodyStyle) {
		bodyStyle.zoom = rounded;
		document.body.style.removeProperty("transform");
		document.body.style.removeProperty("transform-origin");
	} else {
		document.body.style.setProperty("transform-origin", "0 0");
		document.body.style.setProperty("transform", `scale(${rounded})`);
	}
};

export const createViewSlice: StateCreator<ViewState> = (set, get) => ({
	view: {
		panes: {
			files: true,
			editor: true,
			assistant: true,
		},
		modals: {
			export: false,
			shortcuts: false,
			about: false,
			sessionInfo: false,
			settings: false,
			projectSwitch: false,
		},
		zoom: 1,
	},
	togglePaneVisibility: (pane) => {
		const current = get().view.panes[pane];
		set((state) => ({
			view: {
				...state.view,
				panes: {
					...state.view.panes,
					[pane]: !current,
				},
			},
		}));
	},
	setPaneVisibility: (pane, visible) => {
		set((state) => ({
			view: {
				...state.view,
				panes: {
					...state.view.panes,
					[pane]: visible,
				},
			},
		}));
	},
	setModalOpen: (modal, open) => {
		set((state) => ({
			view: {
				...state.view,
				modals: {
					...state.view.modals,
					[modal]: open,
				},
			},
		}));
	},
	toggleModal: (modal) => {
		const current = get().view.modals[modal];
		set((state) => ({
			view: {
				...state.view,
				modals: {
					...state.view.modals,
					[modal]: !current,
				},
			},
		}));
	},
	setZoomLevel: (zoom) => {
		const next = clampZoom(zoom);
		applyZoomToDom(next);
		set((state) => ({
			view: {
				...state.view,
				zoom: next,
			},
		}));
	},
	adjustZoom: (delta) => {
		const { view, setZoomLevel } = get();
		setZoomLevel(view.zoom + delta);
	},
	resetZoom: () => {
		const { setZoomLevel } = get();
		setZoomLevel(1);
	},
});
