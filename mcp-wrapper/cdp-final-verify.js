/**
 * Final WCAG verification after CSS fixes.
 * Navigates to each view, waits for render, extracts all text elements, checks contrast.
 */
const puppeteer = require('puppeteer-core');

function parseRgb(str) {
    const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
}
function lum(rgb) {
    const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map(c =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function cr(fg, bg) {
    const l1 = lum(fg), l2 = lum(bg);
    return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
}

async function analyzeView(cdp, tabName, viewSel) {
    // Navigate
    await cdp.send('Runtime.evaluate', {
        expression: `document.querySelector('.sidebar-nav-btn[data-tab="${tabName}"]')?.click()`,
    });
    await new Promise(r => setTimeout(r, 3000));

    // Extract ALL text elements without class filter — comprehensive
    const { result } = await cdp.send('Runtime.evaluate', {
        expression: `(function() {
            const view = document.querySelector('${viewSel}');
            if (!view) return JSON.stringify([{error:'not found'}]);
            const results = [];
            const seen = new Set();
            // Use TreeWalker for comprehensive coverage
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
                const text = el.textContent.trim().substring(0, 50);
                let bgEl = el, bgColor = 'rgba(0, 0, 0, 0)';
                while (bgEl) {
                    const bg = getComputedStyle(bgEl).backgroundColor;
                    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') { bgColor = bg; break; }
                    bgEl = bgEl.parentElement;
                }
                results.push({
                    cls: (el.className||'').toString().substring(0,60),
                    text, color: cs.color, bgColor,
                    fontSize: cs.fontSize, fontWeight: cs.fontWeight,
                });
                if (results.length >= 300) break;
            }
            return JSON.stringify(results);
        })()`,
        returnByValue: true,
    });
    return JSON.parse(result.value);
}

(async () => {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('index.html')) || pages[0];
    const cdp = await page.createCDPSession();

    const totalProblems = {};

    for (const [tabName, viewSel] of [['optimizer', '#view-optimizer'], ['network', '#view-network']]) {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`=== ${tabName.toUpperCase()} ===`);
        console.log('='.repeat(50));

        const elements = await analyzeView(cdp, tabName, viewSel);
        if (elements[0]?.error) { console.log('ERROR:', elements[0].error); continue; }

        console.log(`Elements: ${elements.length}`);
        const problems = [];
        const borderline = [];

        for (const el of elements) {
            const fg = parseRgb(el.color), bg = parseRgb(el.bgColor);
            if (!fg || !bg) continue;
            const ratio = parseFloat(cr(fg, bg));
            const isLarge = parseInt(el.fontSize) >= 18 || (parseInt(el.fontSize) >= 14 && parseInt(el.fontWeight) >= 700);
            const threshold = isLarge ? 3.0 : 4.5;

            if (ratio < threshold) {
                problems.push({ ...el, ratio, threshold });
            } else if (ratio < 5.0) {
                borderline.push({ ...el, ratio, threshold });
            }
        }

        if (problems.length > 0) {
            console.log(`\n*** ${problems.length} KONTRAST-VERLETZUNGEN ***`);
            for (const p of problems) {
                console.log(`  FAIL ${p.ratio}:1 (need ${p.threshold}:1) | ${p.color} on ${p.bgColor}`);
                console.log(`       .${p.cls} | "${p.text}"`);
            }
        } else {
            console.log('\n  Keine Kontrastverletzungen!');
        }

        if (borderline.length > 0) {
            console.log(`\n--- ${borderline.length} Grenzwertige (pass aber < 5.0:1) ---`);
            for (const b of borderline) {
                console.log(`  ${b.ratio}:1 | "${b.text.substring(0, 30)}" | ${b.color} on ${b.bgColor}`);
            }
        }

        totalProblems[tabName] = problems.length;
    }

    console.log('\n=== ZUSAMMENFASSUNG ===');
    for (const [name, count] of Object.entries(totalProblems)) {
        console.log(`${name}: ${count} Verletzungen`);
    }

    await cdp.detach();
    browser.disconnect();
    console.log('=== DONE ===');
})();
