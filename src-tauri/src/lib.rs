mod commands;
mod oui;
mod ps;
mod scan;

use tauri::{Emitter, Manager};

fn init_logging() {
    #[cfg(debug_assertions)]
    {
        use tracing_subscriber::{EnvFilter, fmt, prelude::*};

        let filter = EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("speicher_analyse_lib=debug,warn"));

        // Log-Datei in docs/logs/ anlegen
        let log_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../docs/logs");
        let _ = std::fs::create_dir_all(&log_dir);
        let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
        let log_file = std::fs::File::create(log_dir.join(format!("dev_{}.log", timestamp)))
            .expect("Log-Datei konnte nicht erstellt werden");

        // Konsole + Datei gleichzeitig
        let console_layer = fmt::layer()
            .with_target(true)
            .with_thread_ids(false)
            .with_file(false)
            .with_line_number(false);

        let file_layer = fmt::layer()
            .with_writer(std::sync::Mutex::new(log_file))
            .with_target(true)
            .with_thread_ids(false)
            .with_ansi(false);

        tracing_subscriber::registry()
            .with(filter)
            .with(console_layer)
            .with(file_layer)
            .init();

        tracing::info!("Logging initialisiert (Dev-Modus) — Datei: docs/logs/dev_{}.log", timestamp);
    }
}

pub fn run() {
    init_logging();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

            // === Menüleiste (Datei, Bearbeiten, Ansicht, Terminal, Hilfe) ===
            let file_menu = Submenu::with_items(app, "Datei", true, &[
                &PredefinedMenuItem::close_window(app, Some("Fenster schließen"))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, Some("Beenden"))?,
            ])?;

            let edit_menu = Submenu::with_items(app, "Bearbeiten", true, &[
                &PredefinedMenuItem::undo(app, Some("Rückgängig"))?,
                &PredefinedMenuItem::redo(app, Some("Wiederholen"))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::cut(app, Some("Ausschneiden"))?,
                &PredefinedMenuItem::copy(app, Some("Kopieren"))?,
                &PredefinedMenuItem::paste(app, Some("Einfügen"))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::select_all(app, Some("Alles auswählen"))?,
            ])?;

            let view_menu = Submenu::with_items(app, "Ansicht", true, &[
                &MenuItem::with_id(app, "reload", "Neu laden", true, Some("F5"))?,
                &MenuItem::with_id(app, "dev-tools", "Entwicklertools", true, Some("F12"))?,
            ])?;

            let terminal_menu = Submenu::with_items(app, "Terminal", true, &[
                &MenuItem::with_id(app, "toggle-terminal", "Terminal ein-/ausblenden", true, None::<&str>)?,
                &MenuItem::with_id(app, "new-terminal", "Neues Terminal", true, None::<&str>)?,
            ])?;

            let help_menu = Submenu::with_items(app, "Hilfe", true, &[
                &MenuItem::with_id(app, "about", "Über Speicher Analyse", true, None::<&str>)?,
            ])?;

            let menu = Menu::with_items(app, &[
                &file_menu,
                &edit_menu,
                &view_menu,
                &terminal_menu,
                &help_menu,
            ])?;

            app.set_menu(menu)?;

            tracing::info!("App gestartet, Menüleiste erstellt");

            Ok(())
        })
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "reload" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.eval("location.reload()");
                    }
                }
                "dev-tools" => {
                    #[cfg(debug_assertions)]
                    if let Some(w) = app.get_webview_window("main") {
                        w.open_devtools();
                    }
                }
                "toggle-terminal" => {
                    let _ = app.emit("toggle-terminal", serde_json::json!({}));
                }
                "new-terminal" => {
                    let _ = app.emit("new-terminal", serde_json::json!({}));
                }
                "about" => {
                    let _ = app.emit("menu-action", serde_json::json!({"action": "about"}));
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Drive & Scan
            commands::get_drives,
            commands::start_scan,
            // Tree Data
            commands::get_tree_node,
            commands::get_treemap_data,
            // File Data
            commands::get_top_files,
            commands::get_file_types,
            commands::search,
            commands::get_files_by_extension,
            commands::get_files_by_category,
            // Export
            commands::export_csv,
            commands::show_save_dialog,
            // File Management
            commands::delete_to_trash,
            commands::delete_permanent,
            commands::create_folder,
            commands::file_rename,
            commands::file_move,
            commands::file_copy,
            commands::file_properties,
            commands::open_file,
            commands::show_in_explorer,
            // Context Menu
            commands::show_context_menu,
            // Dialog
            commands::show_confirm_dialog,
            // Old Files
            commands::get_old_files,
            // Duplicate Finder
            commands::start_duplicate_scan,
            commands::cancel_duplicate_scan,
            commands::get_size_duplicates,
            // Memory
            commands::release_scan_bulk_data,
            // Cleanup
            commands::scan_cleanup_categories,
            commands::clean_category,
            // Preview / Editor
            commands::read_file_preview,
            commands::read_file_content,
            commands::write_file_content,
            commands::read_file_binary,
            // Registry
            commands::scan_registry,
            commands::export_registry_backup,
            commands::clean_registry,
            commands::restore_registry_backup,
            // Autostart
            commands::get_autostart_entries,
            commands::toggle_autostart,
            commands::delete_autostart,
            // Services
            commands::get_services,
            commands::control_service,
            commands::set_service_start_type,
            // Optimizer
            commands::get_optimizations,
            commands::apply_optimization,
            // Bloatware
            commands::scan_bloatware,
            commands::uninstall_bloatware,
            // Updates
            commands::check_windows_updates,
            commands::get_update_history,
            commands::check_software_updates,
            commands::update_software,
            commands::get_driver_info,
            commands::get_hardware_info,
            // Hybrid Search
            commands::search_name_index,
            commands::get_name_index_info,
            commands::deep_search_start,
            commands::deep_search_cancel,
            // Explorer
            commands::list_directory,
            commands::get_known_folders,
            commands::calculate_folder_size,
            commands::find_empty_folders,
            commands::copy_to_clipboard,
            commands::open_in_terminal,
            commands::open_with_dialog,
            // Admin
            commands::is_admin,
            commands::restart_as_admin,
            commands::get_restored_session,
            // System
            commands::get_system_capabilities,
            commands::get_battery_status,
            // Platform
            commands::get_platform,
            commands::open_external,
            // File Tags
            commands::get_tag_colors,
            commands::set_file_tag,
            commands::remove_file_tag,
            commands::get_file_tag,
            commands::get_tags_for_directory,
            commands::get_all_tags,
            // Shell Integration
            commands::register_shell_context_menu,
            commands::unregister_shell_context_menu,
            commands::is_shell_context_menu_registered,
            // Global Hotkey
            commands::set_global_hotkey,
            commands::get_global_hotkey,
            // Terminal
            commands::terminal_get_shells,
            commands::terminal_create,
            commands::terminal_write,
            commands::terminal_resize,
            commands::terminal_destroy,
            commands::terminal_open_external,
            // Privacy Dashboard
            commands::get_privacy_settings,
            commands::apply_privacy_setting,
            commands::apply_all_privacy,
            commands::reset_privacy_setting,
            commands::reset_all_privacy,
            commands::get_scheduled_tasks_audit,
            commands::disable_scheduled_task,
            commands::check_sideloading,
            commands::fix_sideloading,
            commands::fix_sideloading_with_elevation,
            commands::get_privacy_recommendations,
            // System Profile
            commands::get_system_profile,
            // S.M.A.R.T.
            commands::get_disk_health,
            // Software Audit
            commands::audit_software,
            commands::correlate_software,
            commands::check_audit_updates,
            // Network Monitor
            commands::get_connections,
            commands::get_bandwidth,
            commands::get_firewall_rules,
            commands::block_process,
            commands::unblock_process,
            commands::get_network_summary,
            commands::get_grouped_connections,
            commands::resolve_ips,
            commands::get_polling_data,
            commands::get_connection_diff,
            commands::get_bandwidth_history,
            commands::get_wifi_info,
            commands::get_dns_cache,
            commands::clear_dns_cache,
            commands::start_network_recording,
            commands::stop_network_recording,
            commands::get_network_recording_status,
            commands::append_network_recording_events,
            commands::list_network_recordings,
            commands::delete_network_recording,
            commands::open_network_recordings_dir,
            commands::save_network_snapshot,
            commands::get_network_history,
            commands::clear_network_history,
            commands::export_network_history,
            commands::scan_local_network,
            commands::scan_network_active,
            commands::get_last_network_scan,
            commands::scan_device_ports,
            commands::get_smb_shares,
            commands::update_oui_database,
            // System Info
            commands::get_system_info,
            // Security Audit
            commands::run_security_audit,
            commands::get_audit_history,
            // System Score
            commands::get_system_score,
            // Preferences
            commands::get_preferences,
            commands::set_preference,
            commands::set_preferences_multiple,
            // Session
            commands::get_session_info,
            commands::save_session_now,
            commands::update_ui_state,
            // Folder Sizes
            commands::get_folder_sizes_bulk,
            // Screenshot
            commands::capture_screenshot,
            // Frontend Logging
            commands::log_frontend,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Anwendung");
}
