/**
 * Targeted WCAG check: Extract computed styles of specific problem elements.
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

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

(async () => {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('index.html')) || pages[0];

    // === OPTIMIZER VIEW ===
    console.log('=== OPTIMIZER ===');
    await page.evaluate(() => document.querySelector('.sidebar-nav-btn[data-tab="optimizer"]')?.click());
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.resolve(__dirname, 'verify-optimizer.png') });

    const optElements = await page.evaluate(() => {
        const view = document.querySelector('#view-optimizer');
        if (!view) return [{ error: 'view not found' }];
        // Get specific types of elements
        const selectors = [
            'h3', 'h4', '.opt-category-title', '.opt-title', '.opt-name',
            'p', '.opt-desc', '.opt-description', '.opt-detail', '.opt-path',
            '.opt-impact', '.opt-savings', 'code', 'pre',
            '.opt-tech-detail', 'summary', '.opt-manual',
            'span', 'li', 'td'
        ];
        const results = [];
        const seen = new Set();
        for (const sel of selectors) {
            for (const el of view.querySelectorAll(sel)) {
                if (seen.has(el) || !el.offsetParent || !el.textContent.trim()) continue;
                // Skip if too deep (child of already captured)
                seen.add(el);
                const cs = getComputedStyle(el);
                let bgEl = el, bgColor = 'rgba(0, 0, 0, 0)';
                while (bgEl) {
                    const bg = getComputedStyle(bgEl).backgroundColor;
                    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') { bgColor = bg; break; }
                    bgEl = bgEl.parentElement;
                }
                results.push({
                    sel, tag: el.tagName,
                    cls: (el.className || '').toString().substring(0, 80),
                    text: el.textContent.trim().substring(0, 60),
                    color: cs.color, bgColor,
                    fontSize: cs.fontSize, fontWeight: cs.fontWeight,
                });
            }
        }
        return results;
    });

    console.log(`Found ${optElements.length} elements`);
    const optProblems = [];
    for (const el of optElements) {
        if (el.error) { console.log('ERROR:', el.error); continue; }
        const fg = parseRgb(el.color), bg = parseRgb(el.bgColor);
        if (!fg || !bg) continue;
        const ratio = parseFloat(cr(fg, bg));
        const pass = ratio >= 4.5;
        if (!pass) {
            optProblems.push({ ...el, ratio });
            console.log(`  FAIL ${ratio}:1 | ${el.color} on ${el.bgColor} | ${el.sel} .${el.cls}`);
            console.log(`       "${el.text}"`);
        }
    }
    if (optProblems.length === 0) console.log('  No failures found');

    // === NETWORK VIEW ===
    console.log('\n=== NETWORK ===');
    await page.evaluate(() => document.querySelector('.sidebar-nav-btn[data-tab="network"]')?.click());
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.resolve(__dirname, 'verify-network.png') });

    const netElements = await page.evaluate(() => {
        const view = document.querySelector('#view-network');
        if (!view) return [{ error: 'view not found' }];
        const selectors = [
            'h2', 'h3', '.network-tab', 'button', 'input',
            '.network-info', '.network-subnet', '.network-stat',
            'th', 'td', 'span', '.badge', '.tag', '.chip',
            'label', 'small', '.text-muted', '.text-secondary'
        ];
        const results = [];
        const seen = new Set();
        for (const sel of selectors) {
            for (const el of view.querySelectorAll(sel)) {
                if (seen.has(el) || !el.offsetParent || !el.textContent.trim()) continue;
                seen.add(el);
                const cs = getComputedStyle(el);
                let bgEl = el, bgColor = 'rgba(0, 0, 0, 0)';
                while (bgEl) {
                    const bg = getComputedStyle(bgEl).backgroundColor;
                    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') { bgColor = bg; break; }
                    bgEl = bgEl.parentElement;
                }
                results.push({
                    sel, tag: el.tagName,
                    cls: (el.className || '').toString().substring(0, 80),
                    text: el.textContent.trim().substring(0, 60),
                    color: cs.color, bgColor,
                    fontSize: cs.fontSize, fontWeight: cs.fontWeight,
                });
            }
        }
        return results;
    });

    console.log(`Found ${netElements.length} elements`);
    const netProblems = [];
    for (const el of netElements) {
        if (el.error) { console.log('ERROR:', el.error); continue; }
        const fg = parseRgb(el.color), bg = parseRgb(el.bgColor);
        if (!fg || !bg) continue;
        const ratio = parseFloat(cr(fg, bg));
        const pass = ratio >= 4.5;
        if (!pass) {
            netProblems.push({ ...el, ratio });
            console.log(`  FAIL ${ratio}:1 | ${el.color} on ${el.bgColor} | ${el.sel} .${el.cls}`);
            console.log(`       "${el.text}"`);
        }
    }
    if (netProblems.length === 0) console.log('  No failures found');

    console.log(`\n=== ZUSAMMENFASSUNG ===`);
    console.log(`Optimizer: ${optProblems.length} Verletzungen`);
    console.log(`Network: ${netProblems.length} Verletzungen`);

    browser.disconnect();
})();
