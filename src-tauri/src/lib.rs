use tauri::{Manager, RunEvent, WindowEvent};

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            {
                // ⌥Space summons or hides the pad from anywhere.
                let toggle = Shortcut::new(Some(Modifiers::ALT), Code::Space);
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            if shortcut != &toggle || event.state() != ShortcutState::Pressed {
                                return;
                            }
                            if let Some(w) = app.get_webview_window("main") {
                                let visible = w.is_visible().unwrap_or(false);
                                let focused = w.is_focused().unwrap_or(false);
                                if visible && focused {
                                    let _ = w.hide();
                                } else {
                                    show_main(app);
                                }
                            }
                        })
                        .build(),
                )?;
                // Another app may already own ⌥Space; Margin works fine without it.
                if let Err(e) = app.global_shortcut().register(toggle) {
                    eprintln!("Margin: couldn't register ⌥Space: {e}");
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window hides it so the hotkey can bring it straight back. ⌘Q still quits.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Margin");

    app.run(|handle, event| {
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = event {
            show_main(handle);
        }
        let _ = (handle, &event);
    });
}
