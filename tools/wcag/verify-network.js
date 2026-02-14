// Direct CDP approach - no puppeteer
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

const TIMEOUT = 25000;
const timer = setTimeout(() => { console.error('GLOBAL TIMEOUT'); process.exit(1); }, TIMEOUT);

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

(async () => {
  const targets = await httpGet('http://127.0.0.1:9222/json/list');
  const pageTarget = targets.find(t => t.type === 'page');
  if (!pageTarget) { console.error('No page target'); process.exit(1); }

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();

  ws.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      const timeoutId = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 10000);
      pending.set(id, msg => { clearTimeout(timeoutId); resolve(msg); });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  }

  await new Promise(resolve => ws.on('open', resolve));
  console.log('Connected');

  await send('Runtime.enable');
  await send('Page.enable');

  // Navigate to network tab
  console.log('Nav:', await evaluate(`(() => {
    const btn = document.querySelector('.sidebar-nav-btn[data-tab="network"]');
    if (btn) { btn.click(); return 'clicked network tab'; }
    return 'no network tab found';
  })()`));

  await new Promise(r => setTimeout(r, 2000));

  // Screenshot
  try {
    const screenshot = await send('Page.captureScreenshot', { format: 'png', quality: 80 });
    if (screenshot.result?.data) {
      fs.writeFileSync('tools/wcag/network-view-1.png', Buffer.from(screenshot.result.data, 'base64'));
      console.log('Screenshot 1 saved');
    }
  } catch (e) {
    console.log('Screenshot failed:', e.message);
  }

  // Get full view structure - what's visible?
  console.log('\n=== VIEW STRUCTURE ===');
  console.log(await evaluate(`(() => {
    // Find all view containers
    const views = document.querySelectorAll('.view-content');
    const results = [];
    views.forEach(v => {
      const display = getComputedStyle(v).display;
      if (display !== 'none') {
        results.push('VISIBLE: ' + v.id + ' (' + v.className + ') display=' + display);
        results.push('  children: ' + v.children.length);
        results.push('  first 500 chars: ' + v.innerHTML.substring(0, 500));
      }
    });
    if (results.length === 0) {
      // Try different selectors
      const body = document.body.innerHTML.substring(0, 300);
      results.push('No visible .view-content found');
      results.push('Body: ' + body);
    }
    return results.join('\\n');
  })()`));

  // Find the network-specific section
  console.log('\n=== NETWORK SECTION ===');
  console.log(await evaluate(`(() => {
    // Look for anything network-related that's visible
    const selectors = [
      '#network-view', '#network', '.network-view',
      '[data-view="network"]', '#view-network',
      '.network-content', '.netinv-content'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const display = getComputedStyle(el).display;
        return sel + ' found, display=' + display + ', children=' + el.children.length + '\\n' + el.innerHTML.substring(0, 1500);
      }
    }
    return 'No network element found with standard selectors';
  })()`));

  // Look for device data/cards/tables - broader search
  console.log('\n=== DEVICE DISPLAY ===');
  console.log(await evaluate(`(() => {
    // Any element with "device" or "netinv" in class
    const all = document.querySelectorAll('[class*="netinv"], [class*="device-card"], [class*="network-device"]');
    const result = [];
    all.forEach((el, i) => {
      if (i < 20) {
        result.push(el.tagName + '.' + el.className.substring(0, 80) + ' visible=' + (el.offsetParent !== null) + ' text=' + el.textContent.trim().substring(0, 100));
      }
    });
    return result.length > 0 ? result.join('\\n') : 'No netinv/device elements found';
  })()`));

  // Check if scan button exists and what state it's in
  console.log('\n=== SCAN CONTROLS ===');
  console.log(await evaluate(`(() => {
    const btns = document.querySelectorAll('button');
    const relevant = [];
    btns.forEach(b => {
      const txt = b.textContent.trim().toLowerCase();
      if (txt.includes('scan') || txt.includes('netzwerk') || txt.includes('ger') || b.id.includes('network') || b.id.includes('scan') || b.id.includes('device')) {
        relevant.push(b.id + ' | ' + b.className.substring(0, 40) + ' | "' + b.textContent.trim().substring(0, 60) + '" | disabled=' + b.disabled + ' | visible=' + (b.offsetParent !== null));
      }
    });
    return relevant.length > 0 ? relevant.join('\\n') : 'No scan-related buttons found';
  })()`));

  ws.close();
  clearTimeout(timer);
  console.log('\nDONE');
  process.exit(0);
})().catch(e => { console.error('Error:', e.message); clearTimeout(timer); process.exit(1); });
