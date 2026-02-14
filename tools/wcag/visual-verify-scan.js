const puppeteer = require('puppeteer-core');
(async () => {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
    const pages = await browser.pages();
    const page = pages[0];

    // Collect console errors
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // 1. Navigate to network tab
    await page.evaluate(() => {
        const btn = document.querySelector('.sidebar-nav-btn[data-tab="network"]');
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // 2. Click devices sub-tab
    await page.evaluate(() => {
        const tabs = document.querySelectorAll('.network-tab');
        for (const t of tabs) {
            if (t.textContent.includes('Lokale') || t.textContent.includes('Geräte')) t.click();
        }
    });
    await new Promise(r => setTimeout(r, 500));

    // 3. Start active scan
    const scanStarted = await page.evaluate(() => {
        const btn = document.querySelector('#network-scan-active');
        if (btn && !btn.disabled) { btn.click(); return true; }
        return false;
    });
    console.log('Scan gestartet:', scanStarted);

    if (scanStarted) {
        // 4. Wait for scan to complete (poll, max 90s)
        for (let i = 0; i < 90; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const status = await page.evaluate(() => {
                const btn = document.querySelector('#network-scan-active');
                const progress = document.querySelector('#network-scan-progress-bar');
                return {
                    btnDisabled: btn ? btn.disabled : null,
                    btnText: btn ? btn.textContent.trim() : '',
                    progressVisible: progress !== null,
                    progressText: progress ? progress.textContent.trim() : '',
                };
            });
            if (i % 10 === 0) console.log(`  ${i}s: ${status.progressText || status.btnText}`);
            if (!status.btnDisabled && i > 5) {
                console.log(`Scan fertig nach ${i}s`);
                break;
            }
        }
        await new Promise(r => setTimeout(r, 1500));
    }

    // 5. Screenshot top of table
    await page.screenshot({ path: 'c:/apps/vibe-coding/speicher_analyse/tools/wcag/verify-scan-top.png' });

    // 6. Analyze table content
    const tableData = await page.evaluate(() => {
        const table = document.querySelector('.netinv-table');
        if (!table) return { error: 'Keine Tabelle gefunden' };

        const rows = table.querySelectorAll('tbody tr');
        const devices = [];
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 8) return;
            const nameEl = cells[1].querySelector('.netinv-device-name');
            const modelEl = cells[4];
            const modelName = modelEl.querySelector('.netinv-model-name');
            const fwBadge = modelEl.querySelector('.netinv-fw-badge');
            const snBadge = modelEl.querySelector('.netinv-serial');
            const sshBadge = modelEl.querySelector('.netinv-ssh-badge');
            const mdnsBadge = modelEl.querySelector('.netinv-mdns-badge');
            const sourceBadge = modelEl.querySelector('.netinv-source-badge');
            const snmpName = modelEl.querySelector('.netinv-snmp-name');

            devices.push({
                name: nameEl ? nameEl.textContent.trim() : cells[1].textContent.trim(),
                type: cells[2].textContent.trim(),
                vendor: cells[3].textContent.trim(),
                model: modelName ? modelName.textContent.trim() : '',
                hasFW: fwBadge !== null,
                hasSN: snBadge !== null,
                hasSSH: sshBadge !== null,
                hasMdns: mdnsBadge !== null,
                hasSource: sourceBadge !== null,
                sourceText: sourceBadge ? sourceBadge.textContent.trim() : '',
                hasSNMP: snmpName !== null,
                mac: cells[5].textContent.trim(),
                ports: cells[6].textContent.trim(),
                rtt: cells[7].textContent.trim(),
            });
        });

        // Layout check
        const tableRect = table.getBoundingClientRect();
        const viewRect = document.querySelector('#view-network').getBoundingClientRect();

        return {
            deviceCount: devices.length,
            devices,
            layout: {
                tableWidth: Math.round(tableRect.width),
                viewWidth: Math.round(viewRect.width),
                tableLeft: Math.round(tableRect.left),
                tableRight: Math.round(tableRect.right),
                viewRight: Math.round(viewRect.right),
                fillsWidth: Math.abs(tableRect.right - viewRect.right) < 50,
            }
        };
    });

    // 7. Print results
    console.log('\n=== SCAN-ERGEBNIS ===');
    if (tableData.error) {
        console.log('FEHLER:', tableData.error);
    } else {
        console.log(`Geräte gefunden: ${tableData.deviceCount}`);
        console.log(`\nLayout: Tabelle ${tableData.layout.tableWidth}px in View ${tableData.layout.viewWidth}px → ${tableData.layout.fillsWidth ? 'FÜLLT BREITE' : 'FÜLLT NICHT'}`);

        console.log('\n--- Geräte-Details ---');
        const withModel = tableData.devices.filter(d => d.model);
        const withSource = tableData.devices.filter(d => d.hasSource);
        const withFW = tableData.devices.filter(d => d.hasFW);
        const withSN = tableData.devices.filter(d => d.hasSN);
        const withSSH = tableData.devices.filter(d => d.hasSSH);
        const withSNMP = tableData.devices.filter(d => d.hasSNMP);

        console.log(`  Mit Modellname: ${withModel.length}/${tableData.deviceCount}`);
        console.log(`  Mit Erkennungsquelle: ${withSource.length}/${tableData.deviceCount}`);
        console.log(`  Mit Firmware: ${withFW.length}`);
        console.log(`  Mit Seriennr: ${withSN.length}`);
        console.log(`  Mit SSH: ${withSSH.length}`);
        console.log(`  Mit SNMP: ${withSNMP.length}`);

        console.log('\n--- Einzelne Geräte ---');
        for (const d of tableData.devices) {
            const badges = [];
            if (d.hasFW) badges.push('FW');
            if (d.hasSN) badges.push('S/N');
            if (d.hasSSH) badges.push('SSH');
            if (d.hasSNMP) badges.push('SNMP');
            if (d.hasMdns) badges.push('mDNS');
            const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : '';
            const src = d.sourceText ? ` (via ${d.sourceText})` : '';
            console.log(`  ${d.name} | ${d.type} | ${d.vendor || '—'} | ${d.model || '—'}${badgeStr}${src}`);
        }
    }

    // 8. Console errors
    console.log(`\n--- Konsolen-Fehler: ${consoleErrors.length} ---`);
    for (const e of consoleErrors.slice(0, 10)) {
        console.log(`  ERROR: ${e.substring(0, 120)}`);
    }

    // 9. Scroll down and take second screenshot
    await page.evaluate(() => {
        const view = document.querySelector('#view-network');
        if (view) view.scrollTop = view.scrollHeight;
    });
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: 'c:/apps/vibe-coding/speicher_analyse/tools/wcag/verify-scan-bottom.png' });

    console.log('\nScreenshots: verify-scan-top.png, verify-scan-bottom.png');
    browser.disconnect();
})().catch(e => console.error(e));
