// Visual verification: Screenshots via CDP
// Problem solved: Window might be minimized → use Target.activateTarget to bring it back
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const OUTDIR = path.resolve(__dirname);
const TIMEOUT = 30000;
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
  const version = await httpGet('http://127.0.0.1:9222/json/version');
  const targets = await httpGet('http://127.0.0.1:9222/json/list');
  const pageTarget = targets.find(t => t.type === 'page');

  // Step 1: Use BROWSER endpoint to activate (unminimize) the window
  console.log('Activating window via browser endpoint...');
  const browserWS = await connectWS(version.webSocketDebuggerUrl);
  const browserSend = makeSend(browserWS);
  try {
    await browserSend('Target.activateTarget', { targetId: pageTarget.id }, 3000);
    console.log('Window activated');
  } catch (e) {
    console.log('activateTarget:', e.message);
  }
  browserWS.close();

  // Wait for window to become visible
  await new Promise(r => setTimeout(r, 1500));

  // Step 2: Connect to page endpoint
  const pageWS = await connectWS(pageTarget.webSocketDebuggerUrl);
  const pageSend = makeSend(pageWS);
  await pageSend('Page.enable');
  await pageSend('Runtime.enable');

  const eval1 = async (expr) => {
    const r = await pageSend('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  };

  // Verify window is now visible
  const winState = await eval1(`JSON.stringify({
    hidden: document.hidden,
    visibility: document.visibilityState,
    w: window.innerWidth,
    h: window.innerHeight
  })`);
  console.log('Window state:', winState);

  const state = JSON.parse(winState);
  if (state.hidden) {
    console.error('Window STILL hidden! Cannot take screenshots.');
    pageWS.close();
    clearTimeout(timer);
    process.exit(1);
  }

  // Step 3: Navigate to network devices view
  console.log('\nNavigating to network devices...');
  await eval1(`(() => {
    const btn = document.querySelector('.sidebar-nav-btn[data-tab="network"]');
    if (btn) btn.click();
    return 'ok';
  })()`);
  await new Promise(r => setTimeout(r, 1500));

  await eval1(`(() => {
    const tabs = document.querySelectorAll('.network-tab');
    for (const t of tabs) {
      if (t.dataset.subtab === 'devices') { t.click(); return 'devices'; }
    }
    return 'no tab';
  })()`);
  await new Promise(r => setTimeout(r, 1000));

  // Step 4: Take screenshots
  async function screenshot(filename) {
    const fp = path.join(OUTDIR, filename);
    try {
      const r = await pageSend('Page.captureScreenshot', { format: 'png' }, 10000);
      if (r.result && r.result.data) {
        fs.writeFileSync(fp, Buffer.from(r.result.data, 'base64'));
        console.log(`OK: ${filename} (${Math.round(r.result.data.length / 1024)}KB)`);
        return true;
      }
      console.log('No data:', JSON.stringify(r.error || r).substring(0, 100));
    } catch (e) {
      console.log(`FAIL ${filename}: ${e.message}`);
    }
    return false;
  }

  console.log('\n--- Screenshots ---');
  await screenshot('network-devices-1.png');

  // Scroll down
  await eval1(`(() => {
    const el = document.querySelector('#view-network');
    if (el) { el.scrollTop = el.scrollHeight; return 'scrolled view-network'; }
    const page = document.querySelector('.network-page');
    if (page) { page.scrollTop = page.scrollHeight; return 'scrolled page'; }
    window.scrollTo(0, document.body.scrollHeight);
    return 'window scroll';
  })()`);
  await new Promise(r => setTimeout(r, 500));
  await screenshot('network-devices-2.png');

  pageWS.close();
  clearTimeout(timer);
  console.log('\nDONE');
  process.exit(0);
})().catch(e => { console.error('Fatal:', e.message); clearTimeout(timer); process.exit(1); });
