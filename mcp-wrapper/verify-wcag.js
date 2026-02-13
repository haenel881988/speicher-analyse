/**
 * /visual-verify: Extract COMPUTED styles of ALL text elements in optimizer + network views.
 * Reports actual rgb() values, not CSS variables.
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

async function analyzeView(page, tabName, viewSelector) {
    // Navigate
    await page.evaluate((t) => {
        document.querySelector(`.sidebar-nav-btn[data-tab="${t}"]`)?.click();
    }, tabName);
    await new Promise(r => setTimeout(r, 2000));

    // Screenshot
    const fname = `verify-${tabName}.png`;
    await page.screenshot({ path: path.resolve(__dirname, fname) });
    console.log(`\nScreenshot: ${fname}`);

    // Extract ALL text elements with their COMPUTED colors
    const elements = await page.evaluate((viewSel) => {
        const view = document.querySelector(viewSel);
        if (!view) return [{ error: `View ${viewSel} not found` }];

        // Get all elements that contain visible text
        const results = [];
        const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                const text = node.textContent.trim();
                if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent || parent.offsetParent === null) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        const seen = new Set();
        while (walker.nextNode()) {
            const el = walker.currentNode.parentElement;
            if (seen.has(el)) continue;
            seen.add(el);

            const cs = getComputedStyle(el);
            const text = el.textContent.trim().substring(0, 60);

            // Walk up to find actual background color
            let bgEl = el;
            let bgColor = 'rgba(0, 0, 0, 0)';
            while (bgEl) {
                const bg = getComputedStyle(bgEl).backgroundColor;
                if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                    bgColor = bg;
                    break;
                }
                bgEl = bgEl.parentElement;
            }

            results.push({
                tag: el.tagName.toLowerCase(),
                className: (el.className || '').toString().substring(0, 60),
                text,
                color: cs.color,
                bgColor,
                bgSource: bgEl ? bgEl.tagName.toLowerCase() + '.' + (bgEl.className || '').toString().substring(0, 30) : 'none',
                fontSize: cs.fontSize,
                fontWeight: cs.fontWeight,
            });
        }
        return results;
    }, viewSelector);

    return elements;
}

function parseRgb(str) {
    const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) };
}

function luminance(rgb) {
    const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map(c =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg, bg) {
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
}

(async () => {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('index.html')) || pages[0];

    const views = [
        ['optimizer', '#view-optimizer'],
        ['network', '#view-network'],
    ];

    for (const [tabName, viewSel] of views) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`=== VIEW: ${tabName} ===`);
        console.log('='.repeat(60));

        const elements = await analyzeView(page, tabName, viewSel);

        if (elements[0]?.error) {
            console.log('ERROR:', elements[0].error);
            continue;
        }

        // Analyze contrast
        const problems = [];
        const ok = [];

        for (const el of elements) {
            const fg = parseRgb(el.color);
            const bg = parseRgb(el.bgColor);
            if (!fg || !bg) continue;

            const ratio = parseFloat(contrast(fg, bg));
            const isSmall = parseInt(el.fontSize) < 18 && parseInt(el.fontWeight) < 700;
            const threshold = isSmall ? 4.5 : 3.0;
            const pass = ratio >= threshold;

            const entry = {
                ...el,
                ratio,
                threshold,
                pass,
            };

            if (!pass) {
                problems.push(entry);
            } else if (ratio < 5.5) {
                // Borderline - worth noting
                ok.push(entry);
            }
        }

        // Report problems
        if (problems.length > 0) {
            console.log(`\n*** ${problems.length} KONTRAST-VERLETZUNGEN ***`);
            for (const p of problems) {
                console.log(`  FAIL ${p.ratio}:1 (need ${p.threshold}:1) | color:${p.color} bg:${p.bgColor}`);
                console.log(`       ${p.tag}.${p.className}`);
                console.log(`       "${p.text}"`);
                console.log(`       bg-source: ${p.bgSource} | font: ${p.fontSize}/${p.fontWeight}`);
                console.log();
            }
        } else {
            console.log('\n  Keine Kontrastverletzungen gefunden.');
        }

        // Report borderline
        if (ok.length > 0) {
            console.log(`\n--- ${ok.length} GRENZWERTIGE Elemente (pass aber < 5.5:1) ---`);
            for (const p of ok) {
                console.log(`  ${p.ratio}:1 | "${p.text.substring(0, 40)}" | ${p.color} on ${p.bgColor}`);
            }
        }
    }

    browser.disconnect();
    console.log('\n=== ANALYSE ABGESCHLOSSEN ===');
})();
