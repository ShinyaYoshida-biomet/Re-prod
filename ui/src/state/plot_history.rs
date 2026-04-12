use leptos::prelude::*;
use reprod_protocol::PlotHistoryEntry;

#[derive(Clone, Copy)]
pub struct PlotHistoryState {
    pub items: RwSignal<Vec<PlotHistoryEntry>>,
    pub active_plot_id: RwSignal<Option<String>>,
    pub is_loading: RwSignal<bool>,
}

impl PlotHistoryState {
    pub fn new() -> Self {
        Self {
            items: RwSignal::new(Vec::new()),
            active_plot_id: RwSignal::new(None),
            is_loading: RwSignal::new(false),
        }
    }

    pub fn apply_snapshot(&self, active_id: Option<String>, plots: Vec<PlotHistoryEntry>) {
        self.items.set(plots);
        self.active_plot_id.set(active_id);
    }

    pub fn select_next(&self) {
        let items = self.items.get();
        let current = self.active_plot_id.get();
        if items.is_empty() { return; }
        let idx = current.and_then(|id| items.iter().position(|p| p.id == id)).unwrap_or(0);
        let next = (idx + 1).min(items.len() - 1);
        self.active_plot_id.set(Some(items[next].id.clone()));
    }

    pub fn select_previous(&self) {
        let items = self.items.get();
        let current = self.active_plot_id.get();
        if items.is_empty() { return; }
        let idx = current.and_then(|id| items.iter().position(|p| p.id == id)).unwrap_or(0);
        let prev = idx.saturating_sub(1);
        self.active_plot_id.set(Some(items[prev].id.clone()));
    }
}
