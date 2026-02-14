const puppeteer = require('puppeteer-core');
(async () => {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
    const pages = await browser.pages();
    const page = pages[0];

    // Navigate to network tab / devices sub-tab
    await page.evaluate(() => {
        const btn = document.querySelector('.sidebar-nav-btn[data-tab="network"]');
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // Click devices sub-tab
    await page.evaluate(() => {
        const tabs = document.querySelectorAll('.network-tab');
        for (const t of tabs) {
            if (t.textContent.includes('Geräte') || t.textContent.includes('Lokale')) t.click();
        }
    });
    await new Promise(r => setTimeout(r, 500));

    // Get computed widths of the entire chain
    const data = await page.evaluate(() => {
        const tabView = document.querySelector('#view-network');
        const networkPage = document.querySelector('.network-page');
        const networkContent = document.querySelector('.network-content');
        const devicesSection = document.querySelector('.network-devices-section');
        const table = document.querySelector('.netinv-table');

        function info(el, name) {
            if (el === null) return { name, found: false };
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return {
                name,
                width: Math.round(r.width),
                left: Math.round(r.left),
                right: Math.round(r.right),
                display: cs.display,
                position: cs.position,
                overflow: cs.overflow,
                overflowX: cs.overflowX,
                maxWidth: cs.maxWidth,
                tableLayout: cs.tableLayout || '',
                boxSizing: cs.boxSizing,
            };
        }

        // Also check columns
        const cols = {};
        if (table) {
            const ths = table.querySelectorAll('th');
            const headerTexts = ['icon','Name','Typ','Hersteller','Modell','MAC','Ports','Ping'];
            ths.forEach((th, i) => {
                const r = th.getBoundingClientRect();
                cols[headerTexts[i] || String(i)] = { width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right) };
            });
        }

        // Check first row cells
        const firstRowCells = {};
        if (table) {
            const tds = table.querySelectorAll('tbody tr:first-child td');
            const cellNames = ['icon','name','type','vendor','model','mac','ports','rtt'];
            tds.forEach((td, i) => {
                const r = td.getBoundingClientRect();
                const cs = getComputedStyle(td);
                firstRowCells[cellNames[i] || String(i)] = {
                    width: Math.round(r.width),
                    maxWidth: cs.maxWidth,
                    whiteSpace: cs.whiteSpace,
                    overflow: cs.overflow,
                };
            });
        }

        return {
            windowWidth: window.innerWidth,
            tabView: info(tabView, 'tabView'),
            networkPage: info(networkPage, 'networkPage'),
            networkContent: info(networkContent, 'networkContent'),
            devicesSection: info(devicesSection, 'devicesSection'),
            table: info(table, 'table'),
            columns: cols,
            firstRowCells,
        };
    });

    console.log(JSON.stringify(data, null, 2));

    // Take screenshot
    await page.screenshot({ path: 'c:/apps/vibe-coding/speicher_analyse/tools/wcag/table-debug.png' });
    console.log('\nScreenshot saved');

    browser.disconnect();
})().catch(e => console.error(e));
