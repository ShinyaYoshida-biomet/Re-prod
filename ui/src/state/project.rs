use leptos::prelude::*;
use reprod_protocol::ProjectRecord;

#[derive(Clone, Copy)]
pub struct ProjectState {
    pub project: RwSignal<Option<ProjectRecord>>,
}

impl ProjectState {
    pub fn new() -> Self {
        Self {
            project: RwSignal::new(None),
        }
    }

    pub fn set_project(&self, project: Option<ProjectRecord>) {
        self.project.set(project);
    }
}
