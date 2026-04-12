use leptos::prelude::*;

#[derive(Clone, Copy)]
pub struct ConnectionState {
    pub is_connected: RwSignal<bool>,
    pub server_port: RwSignal<u16>,
}

impl ConnectionState {
    pub fn new() -> Self {
        Self {
            is_connected: RwSignal::new(false),
            server_port: RwSignal::new(3001),
        }
    }
}
