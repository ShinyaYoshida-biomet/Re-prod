use leptos::prelude::*;

#[derive(Clone, Debug, PartialEq)]
pub struct AppSettings {
    pub auto_run: bool,
    pub theme: String,
    pub r_path: String,
    pub font_size: u32,
    pub show_cell_decorations: bool,
    pub highlight_executing_cell: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_run: false,
            theme: "phylo".to_string(),
            r_path: "Rscript".to_string(),
            font_size: 14,
            show_cell_decorations: true,
            highlight_executing_cell: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct DetectedAgent {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
}

#[derive(Clone, Copy)]
pub struct SettingsState {
    pub settings: RwSignal<AppSettings>,
    pub active_mode: RwSignal<String>,
    pub active_agent: RwSignal<Option<String>>,
    pub active_agent_args: RwSignal<Vec<String>>,
    pub detected_agents: RwSignal<Vec<DetectedAgent>>,
}

impl SettingsState {
    pub fn new() -> Self {
        Self {
            settings: RwSignal::new(AppSettings::default()),
            active_mode: RwSignal::new("api".to_string()),
            active_agent: RwSignal::new(None),
            active_agent_args: RwSignal::new(Vec::new()),
            detected_agents: RwSignal::new(Vec::new()),
        }
    }

    pub fn update_settings(&self, updater: impl FnOnce(&mut AppSettings)) {
        self.settings.update(updater);
    }
}
