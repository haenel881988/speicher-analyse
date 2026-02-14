// Debug: Why does Page.captureScreenshot timeout?
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

const TIMEOUT = 15000;
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
  // Check version info for capabilities
  const version = await httpGet('http://127.0.0.1:9222/json/version');
  console.log('Browser:', version.Browser);
  console.log('Protocol:', version['Protocol-Version']);
  console.log('WS URL:', version.webSocketDebuggerUrl);

  // Connect to BROWSER endpoint (not page) for Page.captureScreenshot
  const browserWS = version.webSocketDebuggerUrl;
  if (!browserWS) {
    console.error('No browser WS endpoint!');
    // Fall back to page endpoint
  }

  // Try page endpoint first
  const targets = await httpGet('http://127.0.0.1:9222/json/list');
  const pageTarget = targets.find(t => t.type === 'page');
  console.log('Page target:', pageTarget.id);

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();

  ws.on('message', data => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) {
      // Log events
    }
  });

  function send(method, params = {}, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      const tid = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout after ${timeout}ms: ${method}`));
      }, timeout);
      pending.set(id, msg => { clearTimeout(tid); resolve(msg); });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise(resolve => ws.on('open', resolve));
  console.log('Connected to page');

  // Enable required domains
  try {
    await send('Page.enable', {}, 3000);
    console.log('Page.enable OK');
  } catch (e) {
    console.log('Page.enable failed:', e.message);
  }

  try {
    await send('Runtime.enable', {}, 3000);
    console.log('Runtime.enable OK');
  } catch (e) {
    console.log('Runtime.enable failed:', e.message);
  }

  // Try screenshot with minimal params
  console.log('\nAttempt 1: Page.captureScreenshot (no params)...');
  try {
    const r1 = await send('Page.captureScreenshot', {}, 5000);
    if (r1.error) {
      console.log('Error:', JSON.stringify(r1.error));
    } else if (r1.result && r1.result.data) {
      fs.writeFileSync('tools/wcag/screenshot-test1.png', Buffer.from(r1.result.data, 'base64'));
      console.log('SUCCESS! Saved screenshot-test1.png (' + r1.result.data.length + ' bytes base64)');
    }
  } catch (e) {
    console.log('Failed:', e.message);
  }

  // Try with format jpeg (smaller, faster)
  console.log('\nAttempt 2: Page.captureScreenshot (jpeg, quality 50)...');
  try {
    const r2 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 50 }, 5000);
    if (r2.error) {
      console.log('Error:', JSON.stringify(r2.error));
    } else if (r2.result && r2.result.data) {
      fs.writeFileSync('tools/wcag/screenshot-test2.jpg', Buffer.from(r2.result.data, 'base64'));
      console.log('SUCCESS! Saved screenshot-test2.jpg (' + r2.result.data.length + ' bytes base64)');
    }
  } catch (e) {
    console.log('Failed:', e.message);
  }

  // Try with clip (small area)
  console.log('\nAttempt 3: Page.captureScreenshot (small clip 100x100)...');
  try {
    const r3 = await send('Page.captureScreenshot', {
      format: 'jpeg', quality: 50,
      clip: { x: 0, y: 0, width: 100, height: 100, scale: 1 }
    }, 5000);
    if (r3.error) {
      console.log('Error:', JSON.stringify(r3.error));
    } else if (r3.result && r3.result.data) {
      fs.writeFileSync('tools/wcag/screenshot-test3.jpg', Buffer.from(r3.result.data, 'base64'));
      console.log('SUCCESS! Saved screenshot-test3.jpg (' + r3.result.data.length + ' bytes base64)');
    }
  } catch (e) {
    console.log('Failed:', e.message);
  }

  // Check if window is visible/focused
  console.log('\nChecking window state...');
  try {
    const winState = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        hidden: document.hidden,
        visibilityState: document.visibilityState,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      })`,
      returnByValue: true
    }, 3000);
    console.log('Window:', winState.result?.result?.value);
  } catch (e) {
    console.log('Failed:', e.message);
  }

  ws.close();
  clearTimeout(timer);
  console.log('\nDONE');
  process.exit(0);
})().catch(e => { console.error('Error:', e.message); clearTimeout(timer); process.exit(1); });
