use leptos::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ViewPane {
    Files,
    Editor,
    Assistant,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModalType {
    Export,
    Shortcuts,
    About,
    SessionInfo,
    Settings,
    ProjectSwitch,
}

#[derive(Clone, Copy)]
pub struct ViewState {
    pub files_visible: RwSignal<bool>,
    pub editor_visible: RwSignal<bool>,
    pub assistant_visible: RwSignal<bool>,
    pub active_modal: RwSignal<Option<ModalType>>,
    pub zoom: RwSignal<f64>,
    pub active_bottom_tab: RwSignal<String>,
}

impl ViewState {
    pub fn new() -> Self {
        Self {
            files_visible: RwSignal::new(true),
            editor_visible: RwSignal::new(true),
            assistant_visible: RwSignal::new(true),
            active_modal: RwSignal::new(None),
            zoom: RwSignal::new(1.0),
            active_bottom_tab: RwSignal::new("console".to_string()),
        }
    }

    pub fn toggle_pane(&self, pane: ViewPane) {
        match pane {
            ViewPane::Files => self.files_visible.update(|v| *v = !*v),
            ViewPane::Editor => self.editor_visible.update(|v| *v = !*v),
            ViewPane::Assistant => self.assistant_visible.update(|v| *v = !*v),
        }
    }

    pub fn set_pane_visible(&self, pane: ViewPane, visible: bool) {
        match pane {
            ViewPane::Files => self.files_visible.set(visible),
            ViewPane::Editor => self.editor_visible.set(visible),
            ViewPane::Assistant => self.assistant_visible.set(visible),
        }
    }

    pub fn open_modal(&self, modal: ModalType) {
        self.active_modal.set(Some(modal));
    }

    pub fn close_modal(&self) {
        self.active_modal.set(None);
    }

    pub fn toggle_modal(&self, modal: ModalType) {
        self.active_modal.update(|current| {
            if *current == Some(modal) {
                *current = None;
            } else {
                *current = Some(modal);
            }
        });
    }

    pub fn adjust_zoom(&self, delta: f64) {
        self.zoom.update(|z| {
            *z = (*z + delta).clamp(0.5, 2.0);
        });
    }

    pub fn reset_zoom(&self) {
        self.zoom.set(1.0);
    }
}
