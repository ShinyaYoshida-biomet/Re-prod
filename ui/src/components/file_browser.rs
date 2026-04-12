use leptos::prelude::*;
use crate::state::use_app_state;
use crate::services::socket::send_ws_message;
use reprod_protocol::{WSRequest, FileEntry};

#[component]
pub fn FileBrowserPane() -> impl IntoView {
    let _state = use_app_state();
    let files = RwSignal::new(Vec::<FileEntry>::new());
    let _current_path = RwSignal::new(".".to_string());

    // Request file listing on mount
    let _init = Effect::new(move |_| {
        send_ws_message(&WSRequest::FileSystemAction {
            action: "list".to_string(),
            path: ".".to_string(),
            content: None,
            to: None,
        });
    });

    let on_file_click = move |entry: FileEntry| {
        if entry.is_dir {
            send_ws_message(&WSRequest::FileSystemAction {
                action: "list".to_string(),
                path: entry.path.clone(),
                content: None,
                to: None,
            });
        } else {
            // Open file in editor
            send_ws_message(&WSRequest::FileSystemAction {
                action: "read".to_string(),
                path: entry.path.clone(),
                content: None,
                to: None,
            });
        }
    };

    view! {
        <div class="file-browser">
            <div class="file-browser-header">
                <h3>"Files"</h3>
            </div>
            <div class="file-tree">
                <For
                    each=move || files.get()
                    key=|entry| entry.path.clone()
                    let:entry
                >
                    {
                        let entry_clone = entry.clone();
                        let on_click = move |_| on_file_click(entry_clone.clone());
                        view! {
                            <div class="file-tree-item" class:directory=entry.is_dir on:click=on_click>
                                <span class="file-icon">
                                    {if entry.is_dir { "📁" } else { "📄" }}
                                </span>
                                <span class="file-name">{entry.name.clone()}</span>
                            </div>
                        }
                    }
                </For>
            </div>
        </div>
    }
}
