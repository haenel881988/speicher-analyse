/**
 * WCAG Contrast Gate — Automatische Prüfung aller Views.
 *
 * Verbindet sich mit der laufenden App, navigiert zu jedem View,
 * nimmt Screenshots via Electron-IPC (nicht CDP!), extrahiert alle
 * Text-Elemente mit getComputedStyle, berechnet Kontrast mit korrektem
 * Alpha-Blending, und meldet alle Verletzungen.
 *
 * Exit-Code 0 = keine Verletzungen
 * Exit-Code 1 = Verletzungen gefunden
 *
 * Nutzung: node mcp-wrapper/wcag-gate.js [--views optimizer,network] [--save-screenshots]
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// === WCAG Contrast Math ===
function parseRgba(str) {
    if (!str) return null;
    const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
}

function blendOnBackground(fg, bg) {
    // Alpha-composite fg over bg
    if (fg.a >= 1) return { r: fg.r, g: fg.g, b: fg.b };
    return {
        r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)),
        g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)),
        b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)),
    };
}

function srgbToLinear(c) {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(rgb) {
    return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
}

function contrastRatio(fg, bg) {
    const l1 = luminance(fg), l2 = luminance(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// === CLI Args ===
const args = process.argv.slice(2);
const saveScreenshots = args.includes('--save-screenshots');
const viewsArg = args.find(a => a.startsWith('--views='));
const requestedViews = viewsArg ? viewsArg.split('=')[1].split(',') : null;

// All views to check (tab-name → view-selector)
const ALL_VIEWS = [
    ['optimizer', '#view-optimizer'],
    ['network', '#view-network'],
    ['privacy', '#view-privacy'],
    ['smart', '#view-smart'],
    ['software-audit', '#view-software-audit'],
    ['system-score', '#view-system-score'],
    ['dashboard', '#view-dashboard'],
    ['explorer', '#view-explorer'],
    ['registry', '#view-registry'],
    ['autostart', '#view-autostart'],
    ['services', '#view-services'],
    ['bloatware', '#view-bloatware'],
    ['updates', '#view-updates'],
    ['cleanup', '#view-cleanup'],
];

const viewsToCheck = requestedViews
    ? ALL_VIEWS.filter(([name]) => requestedViews.includes(name))
    : ALL_VIEWS;

// === Main ===
(async () => {
    let browser;
    try {
        browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
    } catch (e) {
        console.error('FEHLER: App nicht erreichbar auf Port 9222. Ist die App gestartet?');
        process.exit(2);
    }

    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('index.html')) || pages[0];
    const cdp = await page.createCDPSession();

    let totalViolations = 0;
    let totalElements = 0;
    let totalViews = 0;

    for (const [tabName, viewSel] of viewsToCheck) {
        // Navigate
        await cdp.send('Runtime.evaluate', {
            expression: `document.querySelector('.sidebar-nav-btn[data-tab="${tabName}"]')?.click()`,
        });

        // Intelligentes Warten: Warte bis View sichtbar UND Inhalt vorhanden
        for (let wait = 0; wait < 10; wait++) {
            await new Promise(r => setTimeout(r, 500));
            const { result: readyResult } = await cdp.send('Runtime.evaluate', {
                expression: `(function() {
                    const v = document.querySelector('${viewSel}');
                    if (!v) return false;
                    return v.offsetParent !== null && v.children.length > 0;
                })()`,
                returnByValue: true,
            });
            if (readyResult.value === true) break;
        }

        // Take screenshot via Electron IPC (bypasses CDP hang)
        if (saveScreenshots) {
            try {
                const { result: ssResult } = await cdp.send('Runtime.evaluate', {
                    expression: `window.api.captureScreenshot()`,
                    awaitPromise: true,
                    returnByValue: true,
                });
                if (ssResult.value && ssResult.value.dataUrl) {
                    const base64 = ssResult.value.dataUrl.replace(/^data:image\/png;base64,/, '');
                    fs.writeFileSync(
                        path.resolve(__dirname, `wcag-${tabName}.png`),
                        Buffer.from(base64, 'base64')
                    );
                }
            } catch (e) {
                console.log(`  Screenshot-Fehler für ${tabName}: ${e.message}`);
            }
        }

        // Extract all text elements with computed styles + alpha-aware bg
        const { result } = await cdp.send('Runtime.evaluate', {
            expression: `(function() {
                const view = document.querySelector('${viewSel}');
                if (!view) return JSON.stringify({ error: 'View nicht gefunden: ${viewSel}' });

                const results = [];
                const seen = new Set();
                const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT, {
                    acceptNode: (node) => {
                        const text = node.textContent.trim();
                        if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
                        const parent = node.parentElement;
                        if (!parent || !parent.offsetParent) return NodeFilter.FILTER_REJECT;
                        return NodeFilter.FILTER_ACCEPT;
                    }
                });

                while (walker.nextNode()) {
                    const el = walker.currentNode.parentElement;
                    if (seen.has(el)) continue;
                    seen.add(el);

                    const cs = getComputedStyle(el);
                    const text = el.textContent.trim().substring(0, 60);

                    // Walk up to find ALL background layers (for alpha blending)
                    const bgLayers = [];
                    let bgEl = el;
                    while (bgEl) {
                        const bg = getComputedStyle(bgEl).backgroundColor;
                        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                            bgLayers.push(bg);
                            // If this layer is fully opaque, stop walking
                            const m = bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
                            if (m && (m[4] === undefined || parseFloat(m[4]) >= 1)) break;
                        }
                        bgEl = bgEl.parentElement;
                    }

                    results.push({
                        cls: (el.className || '').toString().substring(0, 60),
                        text,
                        color: cs.color,
                        bgLayers: bgLayers,
                        fontSize: cs.fontSize,
                        fontWeight: cs.fontWeight,
                    });

                    if (results.length >= 500) break;
                }

                // === Placeholder-Check: Alle Inputs mit Placeholder prüfen ===
                const placeholders = [];
                for (const input of view.querySelectorAll('input[placeholder], textarea[placeholder]')) {
                    if (!input.offsetParent) continue;
                    const phText = input.getAttribute('placeholder');
                    if (!phText || phText.length < 2) continue;

                    const cs = getComputedStyle(input);
                    // Placeholder-Farbe via getComputedStyle auf Pseudo-Element (nicht direkt zugreifbar)
                    // Fallback: Prüfe ob eine ::placeholder CSS-Regel existiert
                    // Wir verwenden die Input-Farbe als Annäherung (::placeholder erbt oder wird gesetzt)
                    const inputBgLayers = [];
                    let bgEl = input;
                    while (bgEl) {
                        const bg = getComputedStyle(bgEl).backgroundColor;
                        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                            inputBgLayers.push(bg);
                            const m = bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
                            if (m && (m[4] === undefined || parseFloat(m[4]) >= 1)) break;
                        }
                        bgEl = bgEl.parentElement;
                    }

                    placeholders.push({
                        cls: (input.className || '').toString().substring(0, 60),
                        text: 'placeholder: ' + phText.substring(0, 40),
                        color: cs.color, // Input text color als Proxy
                        bgLayers: inputBgLayers,
                        fontSize: cs.fontSize,
                        fontWeight: cs.fontWeight,
                        isPlaceholder: true,
                    });
                }

                return JSON.stringify({ elements: results, placeholders });
            })()`,
            returnByValue: true,
        });

        const data = JSON.parse(result.value);
        if (data.error) {
            console.log(`\n=== ${tabName.toUpperCase()} === ÜBERSPRUNGEN (${data.error})`);
            continue;
        }

        const elements = [...data.elements, ...(data.placeholders || [])];
        totalViews++;
        totalElements += elements.length;

        // Analyze contrast with proper alpha blending
        const violations = [];
        for (const el of elements) {
            const fg = parseRgba(el.color);
            if (!fg) continue;

            // Composite background layers (bottom-up)
            let compositedBg = { r: 15, g: 17, b: 23 }; // Fallback: --bg-primary
            const layers = [...el.bgLayers].reverse();
            for (const layerStr of layers) {
                const layer = parseRgba(layerStr);
                if (layer) {
                    compositedBg = blendOnBackground(layer, compositedBg);
                }
            }

            const ratio = contrastRatio(fg, compositedBg);
            const fontSize = parseInt(el.fontSize);
            const fontWeight = parseInt(el.fontWeight);
            const isLarge = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
            const threshold = isLarge ? 3.0 : 4.5;

            if (ratio < threshold) {
                violations.push({
                    text: el.text,
                    cls: el.cls,
                    color: el.color,
                    bgComposited: `rgb(${compositedBg.r}, ${compositedBg.g}, ${compositedBg.b})`,
                    bgLayers: el.bgLayers,
                    ratio: ratio.toFixed(2),
                    threshold,
                    fontSize: el.fontSize,
                    fontWeight: el.fontWeight,
                });
            }
        }

        // Report
        if (violations.length > 0) {
            console.log(`\n=== ${tabName.toUpperCase()} === ${violations.length} VERLETZUNGEN (${elements.length} Elemente geprüft)`);
            for (const v of violations) {
                console.log(`  FAIL ${v.ratio}:1 (min ${v.threshold}:1) | ${v.color} auf ${v.bgComposited}`);
                console.log(`       .${v.cls} | "${v.text}"`);
                if (v.bgLayers.length > 1) {
                    console.log(`       Hintergrund-Kette: ${v.bgLayers.join(' → ')}`);
                }
            }
            totalViolations += violations.length;
        } else {
            console.log(`\n=== ${tabName.toUpperCase()} === OK (${elements.length} Elemente geprüft)`);
        }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`ZUSAMMENFASSUNG: ${totalViews} Views, ${totalElements} Elemente, ${totalViolations} Verletzungen`);
    if (totalViolations > 0) {
        console.log(`ERGEBNIS: NICHT BESTANDEN`);
    } else {
        console.log(`ERGEBNIS: BESTANDEN`);
    }
    console.log('='.repeat(50));

    await cdp.detach();
    browser.disconnect();
    process.exit(totalViolations > 0 ? 1 : 0);
})();
