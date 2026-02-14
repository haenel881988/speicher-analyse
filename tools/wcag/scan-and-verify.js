// Trigger network scan, wait for completion, take zoomed table screenshot
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUTDIR = path.resolve(__dirname);
const TIMEOUT = 180000; // 3 min
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
  return function send(method, params = {}, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      const tid = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout ${timeout}ms: ${method}`)); }, timeout);
      pending.set(id, msg => { clearTimeout(tid); resolve(msg); });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
}

(async () => {
  // Step 0: Ensure window is visible via Win32
  try {
    execFileSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', path.join(OUTDIR, 'restore-window.ps1')], { timeout: 10000 });
    console.log('Window restored via Win32');
  } catch(e) { console.log('Win32 restore:', e.message?.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 1000));

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

  // Navigate to network > devices
  await eval1(`document.querySelector('.sidebar-nav-btn[data-tab="network"]')?.click()`);
  await new Promise(r => setTimeout(r, 1500));
  await eval1(`(() => { for (const t of document.querySelectorAll('.network-tab')) { if (t.dataset.subtab === 'devices') { t.click(); return 'ok'; } } return 'no'; })()`);
  await new Promise(r => setTimeout(r, 1000));

  // Start scan
  console.log('Starting network scan...');
  const scanResult = await eval1(`(() => {
    const btn = document.querySelector('#network-scan-active');
    if (btn && !btn.disabled) { btn.click(); return 'scan started'; }
    return 'btn state: ' + (btn ? 'disabled=' + btn.disabled : 'null');
  })()`);
  console.log(scanResult);

  // Wait for scan (up to 2.5 min)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const status = await eval1(`JSON.stringify({
      disabled: document.querySelector('#network-scan-active')?.disabled,
      text: document.querySelector('#network-scan-active')?.textContent?.trim()?.substring(0, 30)
    })`);
    const s = JSON.parse(status || '{}');
    console.log(`[${(i+1)*5}s] disabled=${s.disabled} "${s.text}"`);
    if (!s.disabled) { console.log('Scan complete!'); break; }
  }
  await new Promise(r => setTimeout(r, 2000));

  // Take zoomed table screenshot
  const tableRect = await eval1(`(() => {
    const table = document.querySelector('.netinv-table');
    if (!table) return null;
    const r = table.getBoundingClientRect();
    return JSON.stringify({ top: r.top, left: r.left, width: r.width, height: Math.min(r.height, 800) });
  })()`);

  if (tableRect) {
    const tr = JSON.parse(tableRect);
    const fp = path.join(OUTDIR, 'verify-after-fixes.png');
    const r = await pageSend('Page.captureScreenshot', {
      format: 'png',
      clip: { x: tr.left, y: tr.top, width: tr.width, height: tr.height, scale: 2 }
    }, 15000);
    if (r.result?.data) {
      fs.writeFileSync(fp, Buffer.from(r.result.data, 'base64'));
      console.log(`OK: verify-after-fixes.png (${Math.round(r.result.data.length / 1024)}KB)`);
    }
  }

  pageWS.close();
  clearTimeout(timer);
  console.log('\nDONE');
  process.exit(0);
})().catch(e => { console.error('Fatal:', e.message); clearTimeout(timer); process.exit(1); });
