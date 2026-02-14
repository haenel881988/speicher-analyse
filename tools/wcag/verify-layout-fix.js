const puppeteer = require('puppeteer-core');
(async () => {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
    const pages = await browser.pages();
    const page = pages[0];

    // Wait for auto-reload to pick up CSS changes
    await new Promise(r => setTimeout(r, 3000));

    // Get layout measurements
    const data = await page.evaluate(() => {
        function info(sel) {
            const el = document.querySelector(sel);
            if (el === null) return { selector: sel, found: false };
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return {
                selector: sel,
                width: Math.round(r.width),
                left: Math.round(r.left),
                right: Math.round(r.right),
                display: cs.display,
                minWidth: cs.minWidth,
                widthCSS: cs.width,
            };
        }
        return {
            windowWidth: window.innerWidth,
            sidebar: info('#sidebar'),
            content: info('#content'),
            viewNetwork: info('#view-network'),
            sidebarExpanded: document.querySelector('#sidebar').classList.contains('expanded'),
        };
    });

    console.log('=== Layout nach Fix ===');
    console.log('Window:', data.windowWidth + 'px');
    console.log('Sidebar:', data.sidebar.width + 'px (min-width:', data.sidebar.minWidth + ', expanded:', data.sidebarExpanded + ')');
    console.log('Content:', data.content.width + 'px (left:', data.content.left + ', right:', data.content.right + ')');
    console.log('ViewNetwork:', data.viewNetwork.width + 'px');
    console.log('Content nutzt Fensterbreite:', data.content.right === data.windowWidth ? 'JA' : 'NEIN (' + data.content.right + ' vs ' + data.windowWidth + ')');

    const expectedSidebar = data.sidebarExpanded ? 200 : 56;
    const sidebarCorrect = Math.abs(data.sidebar.width - expectedSidebar) < 5;
    console.log('Sidebar-Breite korrekt:', sidebarCorrect ? 'JA (' + data.sidebar.width + 'px)' : 'NEIN (' + data.sidebar.width + 'px, erwartet ' + expectedSidebar + 'px)');

    // Navigate to network tab
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

    await page.screenshot({ path: 'c:/apps/vibe-coding/speicher_analyse/tools/wcag/layout-after-fix.png' });
    console.log('\nScreenshot: layout-after-fix.png');

    browser.disconnect();
})().catch(e => console.error(e));
