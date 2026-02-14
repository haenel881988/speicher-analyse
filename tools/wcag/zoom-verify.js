// Zoom into specific table rows for visual verification
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const OUTDIR = path.resolve(__dirname);
const TIMEOUT = 20000;
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

function connectWS(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function makeSend(ws) {
  let msgId = 1;
  const pending = new Map();
  ws.on('message', data => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  return function send(method, params = {}, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      const tid = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout ${timeout}ms: ${method}`)); }, timeout);
      pending.set(id, msg => { clearTimeout(tid); resolve(msg); });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
}

(async () => {
  const targets = await httpGet('http://127.0.0.1:9222/json/list');
  const pageTarget = targets.find(t => t.type === 'page');
  const pageWS = await connectWS(pageTarget.webSocketDebuggerUrl);
  const pageSend = makeSend(pageWS);
  await pageSend('Page.enable');
  await pageSend('Runtime.enable');

  const eval1 = async (expr) => {
    const r = await pageSend('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  };

  // Get bounding rects of group headers and key rows
  const rects = await eval1(`JSON.stringify((() => {
    const results = {};
    // Get all group headers
    const headers = document.querySelectorAll('.netinv-group-header');
    headers.forEach(h => {
      const text = h.textContent.trim().substring(0, 40);
      const rect = h.getBoundingClientRect();
      results['header_' + text.substring(0, 20)] = { top: rect.top, left: rect.left, width: rect.width, height: rect.height, text };
    });
    // Get all device rows with their bounding rects
    const rows = document.querySelectorAll('.netinv-table tbody tr:not(.netinv-group-header)');
    rows.forEach((tr, i) => {
      const cells = tr.querySelectorAll('td');
      const name = cells[1] ? cells[1].textContent.trim().substring(0, 40) : '';
      const type = cells[2] ? cells[2].textContent.trim() : '';
      const rect = tr.getBoundingClientRect();
      results['row_' + i] = { top: rect.top, left: rect.left, width: rect.width, height: rect.height, name, type };
    });
    return results;
  })())`);

  const rectData = JSON.parse(rects || '{}');
  console.log('Found elements:');
  Object.entries(rectData).forEach(([k, v]) => {
    console.log(`  ${k}: y=${Math.round(v.top)} h=${Math.round(v.height)} ${v.text || v.name || ''} ${v.type || ''}`);
  });

  // Take zoomed clips of key areas
  async function clipScreenshot(filename, x, y, width, height) {
    const fp = path.join(OUTDIR, filename);
    try {
      // Use device pixel ratio for high quality
      const r = await pageSend('Page.captureScreenshot', {
        format: 'png',
        clip: { x, y, width, height, scale: 2 }  // 2x zoom
      }, 10000);
      if (r.result && r.result.data) {
        fs.writeFileSync(fp, Buffer.from(r.result.data, 'base64'));
        console.log(`OK: ${filename} (${Math.round(r.result.data.length / 1024)}KB)`);
        return true;
      }
    } catch (e) {
      console.log(`FAIL ${filename}: ${e.message}`);
    }
    return false;
  }

  // Screenshot the Drucker group (Fix 1: 192.168.1.132 should be here)
  const druckerHeader = Object.values(rectData).find(v => v.text && v.text.includes('Drucker'));
  if (druckerHeader) {
    const y = Math.max(0, druckerHeader.top - 5);
    await clipScreenshot('zoom-drucker.png', 0, y, 1386, 100);
  }

  // Screenshot the Router group (Fix 3: model should NOT show "Welcome to...")
  const routerHeader = Object.values(rectData).find(v => v.text && v.text.includes('Router'));
  if (routerHeader) {
    const y = Math.max(0, routerHeader.top - 5);
    await clipScreenshot('zoom-router.png', 0, y, 1386, 80);
  }

  // Screenshot the Unbekanntes Gerät group (Fix 2: random MAC device)
  const unknownHeader = Object.values(rectData).find(v => v.text && v.text.includes('Unbekannt'));
  if (unknownHeader) {
    const y = Math.max(0, unknownHeader.top - 5);
    await clipScreenshot('zoom-unknown.png', 0, y, 1386, 80);
  }

  // Also take the whole table in higher res
  const tableRect = await eval1(`(() => {
    const table = document.querySelector('.netinv-table');
    if (!table) return null;
    const r = table.getBoundingClientRect();
    return JSON.stringify({ top: r.top, left: r.left, width: r.width, height: r.height });
  })()`);

  if (tableRect) {
    const tr = JSON.parse(tableRect);
    console.log('Table rect:', tr);
    // Take full table zoomed
    await clipScreenshot('zoom-full-table.png', tr.left, tr.top, tr.width, Math.min(tr.height, 800));
  }

  pageWS.close();
  clearTimeout(timer);
  console.log('\nDONE');
  process.exit(0);
})().catch(e => { console.error('Fatal:', e.message); clearTimeout(timer); process.exit(1); });
