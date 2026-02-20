use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;

use pdfium_render::prelude::*;

use super::validate_path;

// === PDFium Factory ===
// Pdfium ist nicht Send+Sync (C-Bibliothek), daher kein Singleton.
// Stattdessen wird in jedem spawn_blocking ein neues Pdfium erstellt.
// Die DLL wird vom OS gecacht — Overhead ist minimal.

fn create_pdfium() -> Result<Pdfium, String> {
    // In prod: pdfium.dll liegt neben der .exe (Tauri bundled als resource)
    let exe_dir = std::env::current_exe()
        .map(|p| p.parent().unwrap_or(Path::new(".")).to_path_buf())
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    let bindings = Pdfium::bind_to_library(
        Pdfium::pdfium_platform_library_name_at_path(&exe_dir)
    ).or_else(|_| {
        // Fallback: aktuelles Verzeichnis (cargo tauri dev)
        Pdfium::bind_to_library(
            Pdfium::pdfium_platform_library_name_at_path("./")
        )
    }).map_err(|e| format!("PDFium laden fehlgeschlagen: {e}"))?;

    Ok(Pdfium::new(bindings))
}

// === Data Types ===

#[derive(Serialize, Deserialize, Clone)]
pub struct AnnotationData {
    #[serde(rename = "type")]
    pub anno_type: String,   // "highlight", "text", "freetext", "ink"
    pub page: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rect: Option<RectData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paths: Option<Vec<Vec<PointData>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<f32>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RectData {
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PointData {
    pub x: f32,
    pub y: f32,
}

// === Commands ===

/// PDF-Infos lesen: Seitenzahl, Metadaten, OCR-Bedarf
#[tauri::command]
pub async fn pdf_get_info(file_path: String) -> Result<Value, String> {
    let fp = file_path.clone();
    tokio::task::spawn_blocking(move || {
        let pdfium = create_pdfium()?;
        let doc = pdfium.load_pdf_from_file(&fp, None)
            .map_err(|e| format!("PDF öffnen fehlgeschlagen: {e}"))?;

        let page_count = doc.pages().len();

        // Prüfe ob Text extrahierbar ist (= ob OCR nötig)
        let is_text_searchable = if page_count > 0 {
            if let Ok(page) = doc.pages().get(0) {
                if let Ok(text) = page.text() {
                    let all_text: String = text.all();
                    !all_text.trim().is_empty()
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            false
        };

        // Metadaten via get(TagType)
        let metadata = doc.metadata();
        let title = metadata.get(PdfDocumentMetadataTagType::Title)
            .map(|t| t.value().to_string()).unwrap_or_default();
        let author = metadata.get(PdfDocumentMetadataTagType::Author)
            .map(|t| t.value().to_string()).unwrap_or_default();
        let creator = metadata.get(PdfDocumentMetadataTagType::Creator)
            .map(|t| t.value().to_string()).unwrap_or_default();
        let creation_date = metadata.get(PdfDocumentMetadataTagType::CreationDate)
            .map(|t| t.value().to_string()).unwrap_or_default();

        Ok(json!({
            "pageCount": page_count,
            "title": title,
            "author": author,
            "creator": creator,
            "creationDate": creation_date,
            "isTextSearchable": is_text_searchable,
        }))
    }).await.map_err(|e| format!("Task fehlgeschlagen: {e}"))?
}

/// Annotationen einer PDF-Seite auslesen
#[tauri::command]
pub async fn pdf_get_annotations(file_path: String, page_num: u32) -> Result<Value, String> {
    let fp = file_path.clone();
    tokio::task::spawn_blocking(move || {
        let pdfium = create_pdfium()?;
        let doc = pdfium.load_pdf_from_file(&fp, None)
            .map_err(|e| format!("PDF öffnen fehlgeschlagen: {e}"))?;

        let page = doc.pages().get(page_num as u16)
            .map_err(|e| format!("Seite {page_num} nicht gefunden: {e}"))?;

        // Seitenhöhe für Koordinaten-Konvertierung (PDF bottom-up → Frontend top-down)
        let page_height = page.height().value;

        let mut annotations = Vec::new();

        for annotation in page.annotations().iter() {
            let anno_type = match annotation.annotation_type() {
                PdfPageAnnotationType::Highlight => "highlight",
                PdfPageAnnotationType::Text => "text",
                PdfPageAnnotationType::FreeText => "freetext",
                PdfPageAnnotationType::Ink => "ink",
                PdfPageAnnotationType::Underline => "underline",
                PdfPageAnnotationType::Strikeout => "strikeout",
                PdfPageAnnotationType::Square => "square",
                PdfPageAnnotationType::Circle => "circle",
                PdfPageAnnotationType::Line => "line",
                _ => "unknown",
            };

            // PDF-Koordinaten (Ursprung unten-links) → Frontend-Koordinaten (Ursprung oben-links)
            let bounds = annotation.bounds()
                .map(|b| {
                    let pdf_bottom = b.bottom().value;
                    let pdf_top = b.top().value;
                    json!({
                        "x1": b.left().value,
                        "y1": page_height - pdf_top,     // PDF top → Frontend y1 (oben)
                        "x2": b.right().value,
                        "y2": page_height - pdf_bottom,   // PDF bottom → Frontend y2 (unten)
                    })
                })
                .unwrap_or(json!(null));

            let contents = annotation.contents().unwrap_or_default();

            annotations.push(json!({
                "type": anno_type,
                "rect": bounds,
                "text": contents,
            }));
        }

        Ok(json!(annotations))
    }).await.map_err(|e| format!("Task fehlgeschlagen: {e}"))?
}

/// Annotationen in PDF speichern
#[tauri::command]
pub async fn pdf_save_annotations(
    file_path: String,
    output_path: String,
    annotations: Vec<AnnotationData>,
    clear_pages: Option<Vec<u32>>,
) -> Result<Value, String> {
    validate_path(&output_path)?;
    let fp = file_path.clone();
    let op = output_path.clone();

    tokio::task::spawn_blocking(move || {
        let pdfium = create_pdfium()?;
        let doc = pdfium.load_pdf_from_file(&fp, None)
            .map_err(|e| format!("PDF öffnen fehlgeschlagen: {e}"))?;

        // Bestehende Annotationen von betroffenen Seiten entfernen,
        // damit wiederholtes Speichern keine Duplikate erzeugt.
        // Enthält sowohl Seiten mit aktuellen Annotationen als auch
        // explizit per clear_pages angeforderte Seiten (für Undo-Fall).
        let mut cleared_pages = std::collections::HashSet::new();
        for anno in &annotations {
            cleared_pages.insert(anno.page as u16);
        }
        if let Some(ref extra) = clear_pages {
            for &p in extra {
                cleared_pages.insert(p as u16);
            }
        }
        for &page_idx in &cleared_pages {
            if let Ok(mut page) = doc.pages().get(page_idx) {
                let count = page.annotations().len();
                // Rückwärts löschen, damit Indices stabil bleiben
                for i in (0..count).rev() {
                    if let Ok(existing) = page.annotations().get(i) {
                        let _ = page.annotations_mut().delete_annotation(existing);
                    }
                }
            }
        }

        for anno in &annotations {
            let page_index = anno.page as u16;
            let mut page = doc.pages().get(page_index)
                .map_err(|e| format!("Seite {} nicht gefunden: {e}", anno.page))?;

            let anno_text = anno.text.as_deref().unwrap_or("");

            // Seitenhöhe für Koordinaten-Konvertierung:
            // Frontend (pdf.js): Ursprung oben-links, Y nach unten
            // PDF-Standard: Ursprung unten-links, Y nach oben
            let page_height = page.height().value;

            match anno.anno_type.as_str() {
                "highlight" => {
                    if let Some(ref rect) = anno.rect {
                        let mut new_anno = page.annotations_mut()
                            .create_highlight_annotation()
                            .map_err(|e| format!("Highlight erstellen: {e}"))?;

                        // Y-Achse invertieren: screen_y → pdf_y = page_height - screen_y
                        let pdf_bottom = page_height - rect.y2;
                        let pdf_top = page_height - rect.y1;
                        new_anno.set_bounds(PdfRect::new_from_values(
                            pdf_bottom, rect.x1, pdf_top, rect.x2
                        )).map_err(|e| format!("Bounds setzen: {e}"))?;

                        if let Some(ref color) = anno.color {
                            if let Some(c) = parse_hex_color(color) {
                                let _ = new_anno.set_stroke_color(c);
                                let _ = new_anno.set_fill_color(c.with_alpha(80));
                            }
                        }
                    }
                }
                "text" => {
                    if let Some(ref rect) = anno.rect {
                        let mut new_anno = page.annotations_mut()
                            .create_text_annotation(anno_text)
                            .map_err(|e| format!("Text-Annotation erstellen: {e}"))?;

                        let pdf_bottom = page_height - rect.y2;
                        let pdf_top = page_height - rect.y1;
                        new_anno.set_bounds(PdfRect::new_from_values(
                            pdf_bottom, rect.x1, pdf_top, rect.x2
                        )).map_err(|e| format!("Bounds setzen: {e}"))?;

                        if let Some(ref color) = anno.color {
                            if let Some(c) = parse_hex_color(color) {
                                let _ = new_anno.set_stroke_color(c);
                            }
                        }
                    }
                }
                "freetext" => {
                    if let Some(ref rect) = anno.rect {
                        let mut new_anno = page.annotations_mut()
                            .create_free_text_annotation(anno_text)
                            .map_err(|e| format!("FreeText-Annotation erstellen: {e}"))?;

                        let pdf_bottom = page_height - rect.y2;
                        let pdf_top = page_height - rect.y1;
                        new_anno.set_bounds(PdfRect::new_from_values(
                            pdf_bottom, rect.x1, pdf_top, rect.x2
                        )).map_err(|e| format!("Bounds setzen: {e}"))?;

                        if let Some(ref color) = anno.color {
                            if let Some(c) = parse_hex_color(color) {
                                let _ = new_anno.set_stroke_color(c);
                            }
                        }
                    }
                }
                "ink" => {
                    if let Some(ref rect) = anno.rect {
                        let mut new_anno = page.annotations_mut()
                            .create_ink_annotation()
                            .map_err(|e| format!("Ink-Annotation erstellen: {e}"))?;

                        let pdf_bottom = page_height - rect.y2;
                        let pdf_top = page_height - rect.y1;
                        new_anno.set_bounds(PdfRect::new_from_values(
                            pdf_bottom, rect.x1, pdf_top, rect.x2
                        )).map_err(|e| format!("Bounds setzen: {e}"))?;

                        if let Some(ref color) = anno.color {
                            if let Some(c) = parse_hex_color(color) {
                                let _ = new_anno.set_stroke_color(c);
                            }
                        }

                        // Hinweis: pdfium-render 0.8 bietet keine API für InkList-Pfaddaten.
                        // Ink-Annotationen werden nur mit Bounds und Farbe gespeichert.
                        // Freihand-Pfade sind in der App sichtbar, aber in externen Editoren
                        // wird nur die Bounding-Box angezeigt.
                    }
                }
                _ => {
                    tracing::warn!(anno_type = %anno.anno_type, "Unbekannter Annotationstyp ignoriert");
                }
            }
        }

        doc.save_to_file(&op)
            .map_err(|e| format!("PDF speichern fehlgeschlagen: {e}"))?;

        Ok(json!({ "success": true, "path": op }))
    }).await.map_err(|e| format!("Task fehlgeschlagen: {e}"))?
}

/// OCR einer einzelnen Seite via Windows.Media.Ocr
#[tauri::command]
pub async fn pdf_ocr_page(image_base64: String, language: String) -> Result<Value, String> {
    // Sprache validieren (Whitelist)
    let lang = match language.as_str() {
        "de" | "de-DE" => "de",
        "en" | "en-US" | "en-GB" => "en",
        "fr" | "fr-FR" => "fr",
        "es" | "es-ES" => "es",
        "it" | "it-IT" => "it",
        "pt" | "pt-BR" => "pt",
        "nl" | "nl-NL" => "nl",
        "pl" | "pl-PL" => "pl",
        "ru" | "ru-RU" => "ru",
        "zh" | "zh-CN" | "zh-Hans" => "zh-Hans",
        "ja" | "ja-JP" => "ja",
        "ko" | "ko-KR" => "ko",
        _ => return Err(format!("Nicht unterstützte Sprache: {language}")),
    };

    // Base64 in Temp-Datei schreiben (vermeidet Command Injection)
    let temp_dir = std::env::temp_dir();
    let temp_img = temp_dir.join(format!("speicher_ocr_{}.png", std::process::id()));
    let temp_img_path = temp_img.to_string_lossy().to_string();

    // Data-URL-Prefix entfernen falls vorhanden
    let clean_b64 = if let Some(pos) = image_base64.find(',') {
        &image_base64[pos + 1..]
    } else {
        &image_base64
    };

    let decoded = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        clean_b64,
    ).map_err(|e| format!("Base64 dekodieren fehlgeschlagen: {e}"))?;

    tokio::fs::write(&temp_img, &decoded).await
        .map_err(|e| format!("Temp-Datei schreiben fehlgeschlagen: {e}"))?;

    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
try {{
    Add-Type -AssemblyName 'System.Runtime.WindowsRuntime'

    # Async-Hilfsfunktion
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {{
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    }})[0]
    function Await($WinRtTask, $ResultType) {{
        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
        $netTask = $asTask.Invoke($null, @($WinRtTask))
        $netTask.Wait(-1) | Out-Null
        $netTask.Result
    }}

    # OCR-Engine erstellen
    $ocrLang = [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime]::new('{lang}')
    $ocrEngine = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]::TryCreateFromLanguage($ocrLang)
    if (-not $ocrEngine) {{ throw "OCR-Engine für Sprache '{lang}' nicht verfügbar" }}

    # Bild laden via StorageFile (vermeidet Extension-Method-Problem in PS 5.1)
    $imgPath = '{img_path}'
    $storageFile = Await ([Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]::GetFileFromPathAsync($imgPath)) ([Windows.Storage.StorageFile])
    $stream = Await ($storageFile.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType=WindowsRuntime]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

    # OCR ausführen
    $result = Await ($ocrEngine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

    # Ergebnis als JSON
    $words = @()
    foreach ($line in $result.Lines) {{
        foreach ($word in $line.Words) {{
            $rect = $word.BoundingRect
            $words += @{{
                text = $word.Text
                x = [math]::Round($rect.X, 1)
                y = [math]::Round($rect.Y, 1)
                width = [math]::Round($rect.Width, 1)
                height = [math]::Round($rect.Height, 1)
            }}
        }}
    }}

    @{{
        fullText = $result.Text
        words = $words
    }} | ConvertTo-Json -Depth 3 -Compress

    $stream.Dispose()
}} catch {{
    Write-Error $_.Exception.Message
}}
"#,
        lang = lang,
        img_path = temp_img_path.replace('\'', "''"),
    );

    let result = crate::ps::run_ps_with_timeout(&script, 60).await;

    // Temp-Datei aufräumen
    let _ = tokio::fs::remove_file(&temp_img).await;

    let output = result?;
    let parsed: Value = serde_json::from_str(&output)
        .map_err(|e| format!("OCR-Ausgabe parsen fehlgeschlagen: {e}"))?;

    Ok(parsed)
}

/// Unsichtbaren Textlayer in PDF einfügen (für Durchsuchbarkeit nach OCR)
#[tauri::command]
pub async fn pdf_add_text_layer(
    file_path: String,
    output_path: String,
    ocr_results: Vec<Value>,
) -> Result<Value, String> {
    validate_path(&output_path)?;
    let fp = file_path.clone();
    let op = output_path.clone();

    tokio::task::spawn_blocking(move || {
        let pdfium = create_pdfium()?;
        let doc = pdfium.load_pdf_from_file(&fp, None)
            .map_err(|e| format!("PDF öffnen fehlgeschlagen: {e}"))?;

        for (page_idx, ocr_data) in ocr_results.iter().enumerate() {
            let words = ocr_data.get("words").and_then(|w| w.as_array());
            if words.is_none() { continue; }

            let mut page = match doc.pages().get(page_idx as u16) {
                Ok(p) => p,
                Err(_) => continue,
            };

            // Bestehende FreeText-Annotationen (von vorherigem OCR-Lauf) entfernen,
            // damit wiederholtes OCR keine Duplikate erzeugt.
            let anno_count = page.annotations().len();
            for i in (0..anno_count).rev() {
                if let Ok(existing) = page.annotations().get(i) {
                    if existing.annotation_type() == PdfPageAnnotationType::FreeText {
                        let _ = page.annotations_mut().delete_annotation(existing);
                    }
                }
            }

            let page_height = page.height().value;

            if let Some(words) = words {
                for word in words {
                    let text = word.get("text").and_then(|t| t.as_str()).unwrap_or("");
                    let x = word.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
                    let y = word.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
                    let w = word.get("width").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
                    let h = word.get("height").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;

                    if text.is_empty() || w < 1.0 || h < 1.0 { continue; }

                    // PDF-Koordinaten: Ursprung unten-links, OCR: oben-links
                    let pdf_y = page_height - y - h;

                    let result = page.annotations_mut()
                        .create_free_text_annotation(text);

                    if let Ok(mut anno) = result {
                        let _ = anno.set_bounds(PdfRect::new_from_values(
                            pdf_y, x, pdf_y + h, x + w
                        ));
                        // Unsichtbar: Transparente Farbe, kein Rahmen
                        let _ = anno.set_fill_color(PdfColor::new(0, 0, 0, 0));
                        let _ = anno.set_stroke_color(PdfColor::new(0, 0, 0, 0));
                    }
                }
            }
        }

        doc.save_to_file(&op)
            .map_err(|e| format!("PDF speichern fehlgeschlagen: {e}"))?;

        Ok(json!({ "success": true, "path": op }))
    }).await.map_err(|e| format!("Task fehlgeschlagen: {e}"))?
}

/// Seite drehen (0, 90, 180, 270 Grad)
#[tauri::command]
pub async fn pdf_rotate_page(
    file_path: String,
    output_path: String,
    page_num: u32,
    rotation: i32,
) -> Result<Value, String> {
    validate_path(&output_path)?;

    // Rotation validieren
    if !matches!(rotation, 0 | 90 | 180 | 270) {
        return Err(format!("Ungültige Rotation: {rotation}. Erlaubt: 0, 90, 180, 270"));
    }

    let fp = file_path.clone();
    let op = output_path.clone();

    tokio::task::spawn_blocking(move || {
        let pdfium = create_pdfium()?;
        let doc = pdfium.load_pdf_from_file(&fp, None)
            .map_err(|e| format!("PDF öffnen fehlgeschlagen: {e}"))?;

        let mut page = doc.pages().get(page_num as u16)
            .map_err(|e| format!("Seite {page_num} nicht gefunden: {e}"))?;

        // Aktuelle Rotation lesen und neue berechnen
        let current = page.rotation().unwrap_or(PdfPageRenderRotation::None);
        let current_deg: i32 = match current {
            PdfPageRenderRotation::None => 0,
            PdfPageRenderRotation::Degrees90 => 90,
            PdfPageRenderRotation::Degrees180 => 180,
            PdfPageRenderRotation::Degrees270 => 270,
        };
        let new_deg = (current_deg + rotation) % 360;

        let new_rot = match new_deg {
            90 => PdfPageRenderRotation::Degrees90,
            180 => PdfPageRenderRotation::Degrees180,
            270 => PdfPageRenderRotation::Degrees270,
            _ => PdfPageRenderRotation::None,
        };

        page.set_rotation(new_rot);

        doc.save_to_file(&op)
            .map_err(|e| format!("PDF speichern fehlgeschlagen: {e}"))?;

        Ok(json!({ "success": true, "rotation": new_deg }))
    }).await.map_err(|e| format!("Task fehlgeschlagen: {e}"))?
}

/// Seiten aus PDF löschen
#[tauri::command]
pub async fn pdf_delete_pages(
    file_path: String,
    output_path: String,
    page_nums: Vec<u32>,
) -> Result<Value, String> {
    validate_path(&output_path)?;
    let fp = file_path.clone();
    let op = output_path.clone();

    tokio::task::spawn_blocking(move || {
        let pdfium = create_pdfium()?;
        let doc = pdfium.load_pdf_from_file(&fp, None)
            .map_err(|e| format!("PDF öffnen fehlgeschlagen: {e}"))?;

        let total = doc.pages().len();
        if page_nums.len() >= total as usize {
            return Err("Mindestens eine Seite muss übrig bleiben".to_string());
        }

        // Von hinten nach vorne löschen (damit Indices nicht verschieben)
        let mut sorted: Vec<u32> = page_nums.clone();
        sorted.sort_unstable();
        sorted.dedup();
        sorted.reverse();

        for &num in &sorted {
            if num < total as u32 {
                let page = doc.pages().get(num as u16)
                    .map_err(|e| format!("Seite {num} nicht gefunden: {e}"))?;
                page.delete()
                    .map_err(|e| format!("Seite {num} löschen fehlgeschlagen: {e}"))?;
            }
        }

        doc.save_to_file(&op)
            .map_err(|e| format!("PDF speichern fehlgeschlagen: {e}"))?;

        let remaining = total as usize - sorted.len();
        Ok(json!({ "success": true, "remainingPages": remaining }))
    }).await.map_err(|e| format!("Task fehlgeschlagen: {e}"))?
}

/// Mehrere PDFs zusammenfügen
#[tauri::command]
pub async fn pdf_merge(
    file_paths: Vec<String>,
    output_path: String,
) -> Result<Value, String> {
    validate_path(&output_path)?;
    if file_paths.len() < 2 {
        return Err("Mindestens 2 PDFs zum Zusammenfügen nötig".to_string());
    }

    let op = output_path.clone();

    tokio::task::spawn_blocking(move || {
        let pdfium = create_pdfium()?;

        // Erstes Dokument als Basis laden
        let mut base_doc = pdfium.load_pdf_from_file(&file_paths[0], None)
            .map_err(|e| format!("PDF 1 öffnen fehlgeschlagen: {e}"))?;

        // Weitere Dokumente anhängen
        for (i, path) in file_paths.iter().enumerate().skip(1) {
            let source_doc = pdfium.load_pdf_from_file(path, None)
                .map_err(|e| format!("PDF {} öffnen fehlgeschlagen: {e}", i + 1))?;

            base_doc.pages_mut().append(&source_doc)
                .map_err(|e| format!("PDF {} anhängen fehlgeschlagen: {e}", i + 1))?;
        }

        let total_pages = base_doc.pages().len();

        base_doc.save_to_file(&op)
            .map_err(|e| format!("PDF speichern fehlgeschlagen: {e}"))?;

        Ok(json!({ "success": true, "totalPages": total_pages, "path": op }))
    }).await.map_err(|e| format!("Task fehlgeschlagen: {e}"))?
}

/// Ausgewählte Seiten als neue PDF extrahieren
#[tauri::command]
pub async fn pdf_extract_pages(file_path: String, output_path: String, pages: Vec<u32>) -> Result<Value, String> {
    validate_path(&output_path)?;
    if pages.is_empty() { return Err("Keine Seiten ausgewählt".into()); }
    let fp = file_path.clone();
    let op = output_path.clone();

    tokio::task::spawn_blocking(move || {
        // Datei kopieren, dann nicht-ausgewählte Seiten löschen
        std::fs::copy(&fp, &op).map_err(|e| format!("Kopieren fehlgeschlagen: {e}"))?;
        let pdfium = create_pdfium()?;
        let doc = pdfium.load_pdf_from_file(&op, None)
            .map_err(|e| format!("PDF öffnen fehlgeschlagen: {e}"))?;
        let total = doc.pages().len();
        let keep: std::collections::HashSet<u32> = pages.iter().cloned().collect();
        // Rückwärts löschen (gleiche Pattern wie pdf_delete_pages)
        for i in (0..total).rev() {
            if !keep.contains(&(i as u32)) {
                let page = doc.pages().get(i as u16)
                    .map_err(|e| format!("Seite {} nicht gefunden: {e}", i))?;
                page.delete()
                    .map_err(|e| format!("Seite {} löschen fehlgeschlagen: {e}", i))?;
            }
        }
        doc.save_to_file(&op).map_err(|e| format!("Speichern fehlgeschlagen: {e}"))?;
        Ok(json!({ "success": true, "pages": pages.len(), "path": op }))
    }).await.map_err(|e| format!("Task fehlgeschlagen: {e}"))?
}

/// Leere Seite an Position einfügen
#[tauri::command]
pub async fn pdf_insert_blank_page(file_path: String, output_path: String, after_page: u32, width: f32, height: f32) -> Result<Value, String> {
    validate_path(&output_path)?;
    let fp = file_path.clone();
    let op = output_path.clone();

    tokio::task::spawn_blocking(move || {
        if fp != op { std::fs::copy(&fp, &op).map_err(|e| format!("Kopieren fehlgeschlagen: {e}"))?; }
        let pdfium = create_pdfium()?;
        let mut doc = pdfium.load_pdf_from_file(&op, None)
            .map_err(|e| format!("PDF öffnen fehlgeschlagen: {e}"))?;
        // Seitenmaße: Standard A4 = 595x842 Punkte (72 dpi)
        let w = if width > 0.0 { width } else { 595.0 };
        let h = if height > 0.0 { height } else { 842.0 };
        let size = PdfPagePaperSize::Custom(PdfPoints::new(w), PdfPoints::new(h));
        let insert_idx = (after_page + 1) as u16;
        doc.pages_mut().create_page_at_index(
            size,
            insert_idx,
        ).map_err(|e| format!("Seite erstellen fehlgeschlagen: {e}"))?;
        doc.save_to_file(&op).map_err(|e| format!("Speichern fehlgeschlagen: {e}"))?;
        let total = doc.pages().len();
        Ok(json!({ "success": true, "totalPages": total, "path": op }))
    }).await.map_err(|e| format!("Task fehlgeschlagen: {e}"))?
}

/// Lesezeichen/Inhaltsverzeichnis auslesen
#[tauri::command]
pub async fn pdf_get_bookmarks(file_path: String) -> Result<Value, String> {
    let fp = file_path.clone();
    tokio::task::spawn_blocking(move || {
        let pdfium = create_pdfium()?;
        let doc = pdfium.load_pdf_from_file(&fp, None)
            .map_err(|e| format!("PDF öffnen fehlgeschlagen: {e}"))?;

        // Rekursive Lesezeichen-Sammlung: root → first_child → Geschwister → Kinder
        fn collect_bookmark(bookmark: &PdfBookmark, result: &mut Vec<Value>) {
            let title = bookmark.title().unwrap_or_default();
            let dest_page = bookmark.destination()
                .and_then(|d| d.page_index().ok())
                .map(|idx| idx as u32);
            let mut children_json = Vec::new();
            // Direkte Kinder durchlaufen
            for child in bookmark.iter_direct_children() {
                collect_bookmark(&child, &mut children_json);
            }
            result.push(json!({
                "title": title,
                "page": dest_page,
                "children": children_json,
            }));
        }

        let mut bookmarks = Vec::new();
        if let Some(root) = doc.bookmarks().root() {
            // Root und dessen Geschwister (Top-Level-Einträge)
            collect_bookmark(&root, &mut bookmarks);
            for sibling in root.iter_siblings() {
                collect_bookmark(&sibling, &mut bookmarks);
            }
        }
        Ok(json!(bookmarks))
    }).await.map_err(|e| format!("Task fehlgeschlagen: {e}"))?
}

/// Bild auf einer PDF-Seite einfügen
#[tauri::command]
pub async fn pdf_add_image(
    file_path: String,
    output_path: String,
    page_num: u32,
    image_base64: String,
    rect: RectData,
) -> Result<Value, String> {
    validate_path(&output_path)?;
    let fp = file_path.clone();
    let op = output_path.clone();

    tokio::task::spawn_blocking(move || {
        if fp != op { std::fs::copy(&fp, &op).map_err(|e| format!("Kopieren fehlgeschlagen: {e}"))?; }
        let pdfium = create_pdfium()?;
        let doc = pdfium.load_pdf_from_file(&op, None)
            .map_err(|e| format!("PDF öffnen fehlgeschlagen: {e}"))?;
        let mut page = doc.pages().get(page_num as u16)
            .map_err(|e| format!("Seite {page_num} nicht gefunden: {e}"))?;

        // Base64 → Bild-Bytes → DynamicImage
        use base64::Engine;
        let raw = image_base64.split(',').last().unwrap_or(&image_base64);
        let img_bytes = base64::engine::general_purpose::STANDARD.decode(raw)
            .map_err(|e| format!("Base64-Dekodierung fehlgeschlagen: {e}"))?;
        let dyn_image = image::load_from_memory(&img_bytes)
            .map_err(|e| format!("Bild dekodieren fehlgeschlagen: {e}"))?;

        // Gewünschte Größe in PDF-Punkten
        let width = PdfPoints::new(rect.x2 - rect.x1);
        let height = PdfPoints::new(rect.y2 - rect.y1);
        let mut img_obj = PdfPageImageObject::new_with_size(&doc, &dyn_image, width, height)
            .map_err(|e| format!("Bild-Objekt erstellen fehlgeschlagen: {e}"))?;

        // Position: Frontend (top-down) → PDF (bottom-up)
        let page_height = page.height().value;
        let pdf_bottom = page_height - rect.y2;
        img_obj.translate(PdfPoints::new(rect.x1), PdfPoints::new(pdf_bottom))
            .map_err(|e| format!("Position setzen fehlgeschlagen: {e}"))?;

        page.objects_mut().add_image_object(img_obj)
            .map_err(|e| format!("Bild einfügen fehlgeschlagen: {e}"))?;

        doc.save_to_file(&op).map_err(|e| format!("Speichern fehlgeschlagen: {e}"))?;
        Ok(json!({ "success": true }))
    }).await.map_err(|e| format!("Task fehlgeschlagen: {e}"))?
}

/// Seiten in neuer Reihenfolge anordnen
#[tauri::command]
pub async fn pdf_reorder_pages(file_path: String, output_path: String, order: Vec<u32>) -> Result<Value, String> {
    validate_path(&output_path)?;
    if order.is_empty() { return Err("Leere Reihenfolge".into()); }
    let fp = file_path.clone();
    let op = output_path.clone();

    tokio::task::spawn_blocking(move || {
        let pdfium = create_pdfium()?;
        let source = pdfium.load_pdf_from_file(&fp, None)
            .map_err(|e| format!("PDF öffnen fehlgeschlagen: {e}"))?;
        let mut dest = pdfium.create_new_pdf()
            .map_err(|e| format!("Neues PDF erstellen fehlgeschlagen: {e}"))?;

        for (i, &page_idx) in order.iter().enumerate() {
            let dest_idx = i as u16;
            dest.pages_mut().copy_page_from_document(&source, page_idx as u16, dest_idx)
                .map_err(|e| format!("Seite {} kopieren fehlgeschlagen: {e}", page_idx))?;
        }

        dest.save_to_file(&op).map_err(|e| format!("Speichern fehlgeschlagen: {e}"))?;
        Ok(json!({ "success": true, "totalPages": order.len() }))
    }).await.map_err(|e| format!("Task fehlgeschlagen: {e}"))?
}

// === Detached Window ===

#[tauri::command]
pub async fn open_pdf_window(app: tauri::AppHandle, file_path: String) -> Result<Value, String> {
    use tauri::WebviewWindowBuilder;

    validate_path(&file_path)?;

    let label = format!("pdf-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());

    // Einfache URL-Kodierung für Dateipfade (Backslash, Leerzeichen, etc.)
    let encoded_path: String = file_path.bytes().map(|b| match b {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b':' | b'/' => (b as char).to_string(),
        b'\\' => "%5C".to_string(),
        _ => format!("%{:02X}", b),
    }).collect();
    let url = format!("/index.html?pdf={}", encoded_path);

    let window = WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App(url.into()))
        .title(format!("PDF — {}", file_path.split(&['\\', '/'][..]).last().unwrap_or("PDF")))
        .inner_size(1000.0, 800.0)
        .min_inner_size(600.0, 400.0)
        .resizable(true)
        .build()
        .map_err(|e| format!("Fenster konnte nicht erstellt werden: {e}"))?;

    let _ = window.set_focus();

    Ok(json!({ "success": true, "label": label }))
}

// === Helpers ===

/// Hex-Farbstring (#RRGGBB oder #RRGGBBAA) zu PdfColor parsen
fn parse_hex_color(hex: &str) -> Option<PdfColor> {
    let hex = hex.trim_start_matches('#');
    if hex.len() >= 6 {
        let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
        let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
        let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
        let a = if hex.len() >= 8 {
            u8::from_str_radix(&hex[6..8], 16).ok()?
        } else {
            255
        };
        Some(PdfColor::new(r, g, b, a))
    } else {
        None
    }
}
