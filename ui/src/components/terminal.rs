use leptos::prelude::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = initXterm)]
    fn init_xterm(container_id: &str) -> JsValue;

    #[wasm_bindgen(js_name = writeXterm)]
    fn write_xterm(container_id: &str, data: &str);

    #[wasm_bindgen(js_name = fitXterm)]
    fn fit_xterm(container_id: &str);

    #[wasm_bindgen(js_name = onXtermData)]
    fn on_xterm_data(container_id: &str, callback: &Closure<dyn Fn(String)>);

    #[wasm_bindgen(js_name = disposeXterm)]
    fn dispose_xterm(container_id: &str);
}

const TERMINAL_CONTAINER_ID: &str = "xterm-container";

#[component]
pub fn TerminalPanel() -> impl IntoView {
    let _init = Effect::new(move |_| {
        spawn_local(async move {
            // Small delay to ensure DOM is ready
            gloo_timers::future::TimeoutFuture::new(100).await;
            init_xterm(TERMINAL_CONTAINER_ID);

            let data_callback = Closure::wrap(Box::new(move |data: String| {
                write_xterm(TERMINAL_CONTAINER_ID, &data);
            }) as Box<dyn Fn(String)>);
            on_xterm_data(TERMINAL_CONTAINER_ID, &data_callback);
            data_callback.forget();
        });
    });

    view! {
        <div class="terminal-wrapper">
            <div id={TERMINAL_CONTAINER_ID} class="terminal-container"></div>
        </div>
    }
}
