const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

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

  // Get ALL device rows with full detail
  const deviceRows = await evaluate(`JSON.stringify((() => {
    const rows = document.querySelectorAll('.netinv-table tbody tr:not(.netinv-group-header)');
    return Array.from(rows).map(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 2) return null;
      return {
        name: cells[0] ? cells[0].textContent.trim().substring(0, 100) : '',
        type: cells[1] ? cells[1].textContent.trim().substring(0, 60) : '',
        vendor: cells[2] ? cells[2].textContent.trim().substring(0, 60) : '',
        model: cells[3] ? cells[3].textContent.trim().substring(0, 60) : '',
        ip: cells[4] ? cells[4].textContent.trim().substring(0, 30) : '',
        mac: cells[5] ? cells[5].textContent.trim().substring(0, 30) : '',
        ports: cells[6] ? cells[6].textContent.trim().substring(0, 80) : '',
        rtt: cells[7] ? cells[7].textContent.trim().substring(0, 20) : '',
        cellCount: cells.length,
        rowClass: tr.className
      };
    }).filter(Boolean);
  })())`);

  const devices = JSON.parse(deviceRows || '[]');
  console.log('=== ALL DEVICE ROWS (' + devices.length + ') ===\n');
  devices.forEach((d, i) => {
    console.log(`--- Device ${i + 1} ---`);
    console.log(`  Name:    ${d.name}`);
    console.log(`  Type:    ${d.type}`);
    console.log(`  Vendor:  ${d.vendor}`);
    console.log(`  Model:   ${d.model}`);
    console.log(`  IP:      ${d.ip}`);
    console.log(`  MAC:     ${d.mac}`);
    console.log(`  Ports:   ${d.ports}`);
    console.log(`  RTT:     ${d.rtt}`);
    console.log('');
  });

  // Also get the group headers
  const groups = await evaluate(`JSON.stringify((() => {
    const headers = document.querySelectorAll('.netinv-group-header');
    return Array.from(headers).map(h => {
      const label = h.querySelector('.netinv-group-label');
      const count = h.querySelector('.netinv-group-count');
      return {
        label: label ? label.textContent.trim() : 'no label',
        count: count ? count.textContent.trim() : '0'
      };
    });
  })())`);

  const groupData = JSON.parse(groups || '[]');
  console.log('=== GROUPS ===');
  groupData.forEach(g => console.log(`  ${g.label}: ${g.count}`));

  // Get the raw data behind the display (from network.js internal state)
  const rawData = await evaluate(`JSON.stringify((() => {
    // Try to access the network view's internal data
    // The data is stored when rendering
    const allTrs = document.querySelectorAll('.netinv-table tbody tr[data-ip]');
    return Array.from(allTrs).map(tr => ({
      ip: tr.dataset.ip || '',
      hostname: tr.dataset.hostname || '',
      type: tr.dataset.type || '',
      vendor: tr.dataset.vendor || '',
      modelName: tr.dataset.model || '',
      identifiedBy: tr.dataset.identifiedBy || '',
      attrs: Object.keys(tr.dataset).join(',')
    }));
  })())`);

  const raw = JSON.parse(rawData || '[]');
  if (raw.length > 0) {
    console.log('\n=== RAW DATA ATTRIBUTES ===');
    raw.forEach((d, i) => console.log(`Device ${i + 1}: ip=${d.ip} type=${d.type} vendor=${d.vendor} hostname=${d.hostname} model=${d.modelName} identifiedBy=${d.identifiedBy} attrs=[${d.attrs}]`));
  }

  ws.close();
  clearTimeout(timer);
  console.log('\nDONE');
  process.exit(0);
})().catch(e => { console.error('Error:', e.message); clearTimeout(timer); process.exit(1); });
