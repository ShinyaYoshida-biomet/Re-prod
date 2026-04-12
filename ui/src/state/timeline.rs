use leptos::prelude::*;
use reprod_protocol::ExecutionEvent;

#[derive(Clone, Copy)]
pub struct TimelineState {
    pub events: RwSignal<Vec<ExecutionEvent>>,
    pub total: RwSignal<u32>,
    pub has_more: RwSignal<bool>,
    pub loading: RwSignal<bool>,
    pub error: RwSignal<Option<String>>,
    pub sort: RwSignal<String>,
    pub limit: RwSignal<u32>,
    pub offset: RwSignal<u32>,
}

impl TimelineState {
    pub fn new() -> Self {
        Self {
            events: RwSignal::new(Vec::new()),
            total: RwSignal::new(0),
            has_more: RwSignal::new(false),
            loading: RwSignal::new(false),
            error: RwSignal::new(None),
            sort: RwSignal::new("desc".to_string()),
            limit: RwSignal::new(50),
            offset: RwSignal::new(0),
        }
    }

    pub fn set_events(&self, events: Vec<ExecutionEvent>, total: u32, has_more: bool) {
        self.events.set(events);
        self.total.set(total);
        self.has_more.set(has_more);
    }

    pub fn add_event(&self, event: ExecutionEvent) {
        self.events.update(|events| events.insert(0, event));
        self.total.update(|t| *t += 1);
    }

    pub fn reset(&self) {
        self.events.set(Vec::new());
        self.total.set(0);
        self.has_more.set(false);
        self.offset.set(0);
        self.error.set(None);
    }
}
