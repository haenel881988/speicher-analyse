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

    await page.evaluate(() => {
        const tabs = document.querySelectorAll('.network-tab');
        for (const t of tabs) {
            if (t.textContent.includes('Lokale') || t.textContent.includes('Geräte')) t.click();
        }
    });
    await new Promise(r => setTimeout(r, 500));

    // Start active scan
    await page.evaluate(() => {
        const btn = document.querySelector('#network-scan-active');
        if (btn) btn.click();
    });
    console.log('Scan gestartet... warte 70s');

    // Wait for scan to complete (poll for completion)
    let done = false;
    for (let i = 0; i < 80; i++) {
        await new Promise(r => setTimeout(r, 1000));
        done = await page.evaluate(() => {
            const btn = document.querySelector('#network-scan-active');
            return btn !== null && !btn.disabled;
        });
        if (done && i > 10) {
            console.log(`Scan fertig nach ${i}s`);
            break;
        }
    }

    await new Promise(r => setTimeout(r, 1000));

    // Now check the table
    const data = await page.evaluate(() => {
        const tabView = document.querySelector('#view-network');
        const table = document.querySelector('.netinv-table');

        if (table === null) return { error: 'No table found after scan' };

        const cs = getComputedStyle(table);
        const tr = table.getBoundingClientRect();
        const cr = tabView ? tabView.getBoundingClientRect() : null;

        const cols = {};
        const ths = table.querySelectorAll('th');
        const names = ['icon','Name','Typ','Hersteller','Modell','MAC','Ports','Ping'];
        ths.forEach((th, i) => {
            const r = th.getBoundingClientRect();
            cols[names[i] || String(i)] = Math.round(r.width);
        });

        // Check first row model cell
        const modelCell = table.querySelector('.netinv-col-model');
        let modelInfo = null;
        if (modelCell) {
            const r = modelCell.getBoundingClientRect();
            modelInfo = {
                width: Math.round(r.width),
                text: modelCell.textContent.trim().substring(0, 80),
                scrollWidth: modelCell.scrollWidth,
                clientWidth: modelCell.clientWidth,
            };
        }

        // Count devices
        const rows = table.querySelectorAll('tbody tr');

        return {
            windowWidth: window.innerWidth,
            tabViewWidth: cr ? Math.round(cr.width) : 0,
            tableWidth: Math.round(tr.width),
            tableLeft: Math.round(tr.left),
            tableRight: Math.round(tr.right),
            tabViewRight: cr ? Math.round(cr.right) : 0,
            tableLayout: cs.tableLayout,
            columnWidths: cols,
            fitsInView: tr.right <= (cr ? cr.right + 2 : window.innerWidth + 2),
            deviceCount: rows.length,
            modelColumn: modelInfo,
        };
    });

    console.log(JSON.stringify(data, null, 2));

    await page.screenshot({ path: 'c:/apps/vibe-coding/speicher_analyse/tools/wcag/table-fixed.png' });
    console.log('\nScreenshot: table-fixed.png');

    browser.disconnect();
})().catch(e => console.error(e));
