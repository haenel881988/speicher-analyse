// Just read current device data (don't start new scan)
const http = require('http');
const WebSocket = require('ws');

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
      const tid = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 10000);
      pending.set(id, msg => { clearTimeout(tid); resolve(msg); });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  }

  await new Promise(resolve => ws.on('open', resolve));
  await send('Runtime.enable');

  // Check scan status
  const status = await evaluate(`JSON.stringify((() => {
    const btn = document.querySelector('#network-scan-active');
    const progress = document.querySelector('.network-scan-progress');
    return {
      scanRunning: btn ? btn.disabled : false,
      progressText: progress ? progress.textContent.trim().substring(0, 100) : 'none'
    };
  })())`);
  console.log('Status:', status);

  // Get device rows
  const deviceRows = await evaluate(`JSON.stringify((() => {
    const rows = document.querySelectorAll('.netinv-table tbody tr:not(.netinv-group-header)');
    return Array.from(rows).map(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 3) return null;
      return {
        name: cells[1] ? cells[1].textContent.trim().substring(0, 80) : '',
        type: cells[2] ? cells[2].textContent.trim() : '',
        vendor: cells[3] ? cells[3].textContent.trim().substring(0, 40) : '',
        model: cells[4] ? cells[4].textContent.trim().substring(0, 60) : '',
        mac: cells[5] ? cells[5].textContent.trim() : '',
        ports: cells[6] ? cells[6].textContent.trim().substring(0, 60) : '',
      };
    }).filter(Boolean);
  })())`);

  const devices = JSON.parse(deviceRows || '[]');
  console.log('\n=== DEVICES (' + devices.length + ') ===\n');
  devices.forEach((d, i) => {
    console.log(`${(i+1).toString().padStart(2)}. ${d.name.substring(0, 40).padEnd(42)}| ${d.type.padEnd(22)}| ${d.vendor.substring(0, 28).padEnd(30)}| ${d.model.substring(0, 40)}`);
  });

  // Summary badges
  const badges = await evaluate(`JSON.stringify(Array.from(document.querySelectorAll('.netinv-summary-types .netinv-type-badge')).map(b => b.textContent.trim()))`);
  console.log('\n=== SUMMARY ===');
  JSON.parse(badges || '[]').forEach(b => console.log('  ' + b));

  ws.close();
  clearTimeout(timer);
  process.exit(0);
})().catch(e => { console.error('Error:', e.message); clearTimeout(timer); process.exit(1); });
