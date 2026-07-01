#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    use tracing_subscriber::EnvFilter;
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,harmony_protocol=debug,matrix_sdk=debug")),
        )
        .with_writer(std::io::stderr)
        .init();

    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("media", |_ctx, request, responder| {
            harmony_bindings_desktop::desktop::serve_media(&request, responder);
        })
        .invoke_handler(harmony_bindings_desktop::harmony_handlers!())
        .run(tauri::generate_context!())
        .expect("error while running harmony desktop");
}
