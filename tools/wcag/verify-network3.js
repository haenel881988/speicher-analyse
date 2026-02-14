// Verify network scan AFTER fixes — trigger scan and check results
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

const TIMEOUT = 120000; // 2 min for scan
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
      const tid = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 100000);
      pending.set(id, msg => { clearTimeout(tid); resolve(msg); });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      console.error('JS Error:', r.result.exceptionDetails.text || r.result.exceptionDetails.exception?.description);
    }
    return r.result?.result?.value;
  }

  await new Promise(resolve => ws.on('open', resolve));
  await send('Runtime.enable');

  // Navigate to network tab
  await evaluate(`(() => {
    const btn = document.querySelector('.sidebar-nav-btn[data-tab="network"]');
    if (btn) btn.click();
    return 'ok';
  })()`);
  await new Promise(r => setTimeout(r, 2000));

  // Click "Lokale Geräte" sub-tab
  await evaluate(`(() => {
    const tabs = document.querySelectorAll('.network-tab');
    for (const t of tabs) {
      if (t.dataset.subtab === 'devices') { t.click(); return 'clicked devices'; }
    }
    return 'no devices tab';
  })()`);
  await new Promise(r => setTimeout(r, 1000));

  // Start active network scan
  console.log('Starting network scan...');
  const scanStarted = await evaluate(`(() => {
    const btn = document.querySelector('#network-scan-active');
    if (btn && !btn.disabled) { btn.click(); return 'scan started'; }
    return 'scan button not found or disabled: ' + (btn ? btn.disabled : 'null');
  })()`);
  console.log(scanStarted);

  // Wait for scan to complete (check every 5 seconds)
  let scanDone = false;
  for (let i = 0; i < 24; i++) { // max 2 minutes
    await new Promise(r => setTimeout(r, 5000));
    const status = await evaluate(`(() => {
      const btn = document.querySelector('#network-scan-active');
      const progress = document.querySelector('.network-scan-progress');
      return {
        btnText: btn ? btn.textContent.trim() : '',
        btnDisabled: btn ? btn.disabled : true,
        hasProgress: !!progress,
        progressText: progress ? progress.textContent.trim().substring(0, 100) : ''
      };
    })()`);
    // status is a string since evaluate returns value
    const s = typeof status === 'string' ? JSON.parse(status) : status;
    console.log(`[${(i+1)*5}s]`, typeof status === 'string' ? status : JSON.stringify(status));

    if (typeof status === 'object' && !status.btnDisabled) {
      scanDone = true;
      break;
    }
    // If status is returned as non-object, parse manually
    if (typeof status === 'string' && status.includes('"btnDisabled":false')) {
      scanDone = true;
      break;
    }
  }

  if (!scanDone) {
    console.log('Scan may still be running, checking results anyway...');
  }

  await new Promise(r => setTimeout(r, 2000));

  // Get ALL device rows with full detail
  const deviceRows = await evaluate(`JSON.stringify((() => {
    const rows = document.querySelectorAll('.netinv-table tbody tr:not(.netinv-group-header)');
    return Array.from(rows).map(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 3) return null;
      return {
        icon: cells[0] ? cells[0].textContent.trim() : '',
        name: cells[1] ? cells[1].textContent.trim().substring(0, 80) : '',
        type: cells[2] ? cells[2].textContent.trim() : '',
        vendor: cells[3] ? cells[3].textContent.trim() : '',
        model: cells[4] ? cells[4].textContent.trim().substring(0, 80) : '',
        mac: cells[5] ? cells[5].textContent.trim() : '',
        ports: cells[6] ? cells[6].textContent.trim().substring(0, 80) : '',
        rtt: cells[7] ? cells[7].textContent.trim() : ''
      };
    }).filter(Boolean);
  })())`);

  const devices = JSON.parse(deviceRows || '[]');
  console.log('\n=== DEVICE ROWS AFTER FIXES (' + devices.length + ') ===\n');
  devices.forEach((d, i) => {
    console.log(`${i+1}. ${d.name.substring(0, 40).padEnd(40)} | Type: ${d.type.padEnd(22)} | Vendor: ${d.vendor.substring(0, 30).padEnd(30)} | Model: ${d.model.substring(0, 40)}`);
  });

  // Get group summary
  const groups = await evaluate(`JSON.stringify((() => {
    const badges = document.querySelectorAll('.netinv-summary-types .netinv-type-badge');
    return Array.from(badges).map(b => b.textContent.trim());
  })())`);
  console.log('\n=== SUMMARY BADGES ===');
  const groupData = JSON.parse(groups || '[]');
  groupData.forEach(g => console.log('  ' + g));

  ws.close();
  clearTimeout(timer);
  console.log('\nDONE');
  process.exit(0);
})().catch(e => { console.error('Error:', e.message); clearTimeout(timer); process.exit(1); });
