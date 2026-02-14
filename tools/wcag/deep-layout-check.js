const puppeteer = require('puppeteer-core');
(async () => {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
    const pages = await browser.pages();
    const page = pages[0];

    const data = await page.evaluate(() => {
        function info(sel) {
            const el = document.querySelector(sel);
            if (!el) return { selector: sel, found: false };
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return {
                selector: sel,
                width: Math.round(r.width),
                height: Math.round(r.height),
                left: Math.round(r.left),
                right: Math.round(r.right),
                display: cs.display,
                flex: cs.flex,
                flexGrow: cs.flexGrow,
                position: cs.position,
                overflow: cs.overflow,
                overflowX: cs.overflowX,
                maxWidth: cs.maxWidth,
                minWidth: cs.minWidth,
                widthCSS: cs.width,
                visibility: cs.visibility,
                inlineStyle: el.getAttribute('style') || '',
            };
        }

        // Check ALL children of #app-layout
        const appLayout = document.querySelector('#app-layout');
        const children = [];
        if (appLayout) {
            for (const child of appLayout.children) {
                const r = child.getBoundingClientRect();
                const cs = getComputedStyle(child);
                children.push({
                    tag: child.tagName,
                    id: child.id,
                    className: child.className,
                    display: cs.display,
                    width: Math.round(r.width),
                    left: Math.round(r.left),
                    right: Math.round(r.right),
                    flex: cs.flex,
                    flexGrow: cs.flexGrow,
                    flexShrink: cs.flexShrink,
                    flexBasis: cs.flexBasis,
                    inlineStyle: child.getAttribute('style') || '',
                });
            }
        }

        return {
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            body: info('body'),
            app: info('#app'),
            appLayout: info('#app-layout'),
            sidebar: info('#sidebar'),
            content: info('#content'),
            tabContent: info('#tab-content'),
            viewNetwork: info('#view-network'),
            previewPanel: info('#preview-panel'),
            terminalGlobal: info('#terminal-global'),
            appLayoutChildren: children,
            sidebarExpanded: document.querySelector('#sidebar')?.classList.contains('expanded'),
            appClassList: document.querySelector('#app')?.className,
        };
    });

    console.log(JSON.stringify(data, null, 2));

    await page.screenshot({ path: 'c:/apps/vibe-coding/speicher_analyse/tools/wcag/layout-debug.png', fullPage: false });
    console.log('\nScreenshot: layout-debug.png');

    browser.disconnect();
})().catch(e => console.error(e));
