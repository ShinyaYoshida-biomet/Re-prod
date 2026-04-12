use futures::stream::SplitSink;
use futures::{SinkExt, StreamExt};
use gloo_net::websocket::{futures::WebSocket, Message};
use reprod_protocol::{WSRequest, WSResponse};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen_futures::spawn_local;

type MessageCallback = Box<dyn Fn(WSResponse)>;
type WsSink = SplitSink<WebSocket, Message>;

pub struct SocketService {
    handlers: Rc<RefCell<Vec<MessageCallback>>>,
    is_connected: Rc<RefCell<bool>>,
}

impl SocketService {
    pub fn new() -> Self {
        Self {
            handlers: Rc::new(RefCell::new(Vec::new())),
            is_connected: Rc::new(RefCell::new(false)),
        }
    }

    pub fn connect(&self, port: u16, on_connected: impl Fn(bool) + 'static) {
        let url = format!("ws://127.0.0.1:{}/ws", port);
        let ws_result = WebSocket::open(&url);

        match ws_result {
            Ok(ws) => {
                let (write, mut read) = ws.split();
                *self.is_connected.borrow_mut() = true;
                on_connected(true);

                let handlers = self.handlers.clone();
                let is_connected = self.is_connected.clone();

                // Store writer globally for sending
                let write_rc: Rc<RefCell<Option<WsSink>>> =
                    Rc::new(RefCell::new(Some(write)));
                WS_WRITER.with(|w| {
                    *w.borrow_mut() = Some(write_rc);
                });

                // Spawn reader task
                spawn_local(async move {
                    while let Some(msg) = read.next().await {
                        match msg {
                            Ok(Message::Text(text)) => {
                                match serde_json::from_str::<WSResponse>(&text) {
                                    Ok(response) => {
                                        let handlers_ref = handlers.borrow();
                                        for handler in handlers_ref.iter() {
                                            handler(response.clone());
                                        }
                                    }
                                    Err(e) => {
                                        let preview =
                                            &text[..text.len().min(200)];
                                        web_sys::console::warn_1(
                                            &format!(
                                                "Failed to parse WS message: {} - {}",
                                                e, preview
                                            )
                                            .into(),
                                        );
                                    }
                                }
                            }
                            Ok(Message::Bytes(_)) => {}
                            Err(e) => {
                                web_sys::console::error_1(
                                    &format!("WS error: {:?}", e).into(),
                                );
                                break;
                            }
                        }
                    }
                    *is_connected.borrow_mut() = false;
                });
            }
            Err(e) => {
                web_sys::console::error_1(
                    &format!("Failed to connect WS: {:?}", e).into(),
                );
                on_connected(false);
            }
        }
    }

    pub fn on_message(&self, handler: impl Fn(WSResponse) + 'static) {
        self.handlers.borrow_mut().push(Box::new(handler));
    }

    pub fn is_connected(&self) -> bool {
        *self.is_connected.borrow()
    }
}

thread_local! {
    static WS_WRITER: RefCell<Option<Rc<RefCell<Option<WsSink>>>>> = const { RefCell::new(None) };
}

pub fn send_ws_message(request: &WSRequest) {
    if let Ok(json) = serde_json::to_string(request) {
        WS_WRITER.with(|w: &RefCell<Option<Rc<RefCell<Option<WsSink>>>>>| {
            if let Some(writer_rc) = w.borrow().as_ref().cloned() {
                spawn_local(async move {
                    if let Some(writer) = writer_rc.borrow_mut().as_mut() {
                        if let Err(e) = writer.send(Message::Text(json)).await {
                            web_sys::console::error_1(
                                &format!("Failed to send WS: {:?}", e).into(),
                            );
                        }
                    }
                });
            }
        });
    }
}
