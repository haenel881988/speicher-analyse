import React, { useState, useCallback, useEffect } from 'react';
import * as api from '../api/tauri-api';
import { useAppContext } from '../context/AppContext';
import { formatBytes } from '../utils/format';

interface SystemProfile {
  computer?: { manufacturer?: string; model?: string; name?: string; systemType?: string; user?: string };
  bios?: { serialNumber?: string; version?: string; releaseDate?: string };
  motherboard?: { manufacturer?: string; product?: string };
  os?: { name?: string; version?: string; build?: string; architecture?: string; installDate?: string; lastBoot?: string; uptime?: string; productKeyPartial?: string };
  cpu?: { name?: string; cores?: number; threads?: number; maxClockMHz?: number; l2CacheKB?: number; l3CacheKB?: number };
  gpu?: { name?: string; manufacturer?: string; driverVersion?: string; vramBytes?: number; resolution?: string; refreshRate?: number }[];
  ram?: { totalBytes?: number; usedBytes?: number; totalFormatted?: string; sticks?: { capacityFormatted: string; speedMHz?: number; manufacturer?: string }[] };
  disks?: { model?: string; sizeFormatted?: string; interface?: string; partitions?: number }[];
  network?: { description?: string; ip?: string[]; mac?: string; dhcp?: boolean }[];
  links?: { label: string; url: string }[];
}

export default function SystemProfilView() {
  const { showToast } = useAppContext();
  const [profile, setProfile] = useState<SystemProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Kopieren');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getSystemProfile();
      setProfile(data);
      setLoaded(true);
    } catch (e: any) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Auto-load on mount
  useEffect(() => {
    if (!loaded && !loading) load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !profile) return <div className="loading-state">System-Informationen werden gesammelt...</div>;

  const val = (v: any, fallback = '—') => (v === null || v === undefined || v === '') ? fallback : String(v);

  const copyAsText = () => {
    if (!profile) return;
    const p = profile;
    const c = p.computer || {};
    const o = p.os || {};
    const cpu = p.cpu || {};
    const r = p.ram || {};

    const lines = [
      '=== System-Profil ===', '',
      '--- Gerät ---',
      `Hersteller: ${val(c.manufacturer)}`, `Modell: ${val(c.model)}`,
      `Seriennummer: ${val(p.bios?.serialNumber)}`, `Computername: ${val(c.name)}`, '',
      '--- Betriebssystem ---',
      `${val(o.name, 'Windows')} ${val(o.version, '')}`,
      `Build: ${val(o.build)}`, `Architektur: ${val(o.architecture)}`, `Laufzeit: ${val(o.uptime)}`, '',
      '--- Prozessor ---',
      val(cpu.name),
      `Kerne: ${cpu.cores || '?'} / Threads: ${cpu.threads || '?'}`,
      `Takt: ${cpu.maxClockMHz ? (cpu.maxClockMHz / 1000).toFixed(2) + ' GHz' : '—'}`, '',
      '--- Grafikkarte ---',
      ...(p.gpu || []).map(g => `${val(g.name)} (${val(g.driverVersion)})`), '',
      '--- Arbeitsspeicher ---',
      `Gesamt: ${val(r.totalFormatted)}`,
      ...(r.sticks || []).map((s, i) => `Slot ${i + 1}: ${s.capacityFormatted}${s.speedMHz ? ' @ ' + s.speedMHz + ' MHz' : ''}`), '',
      '--- Festplatten ---',
      ...(p.disks || []).map(d => `${val(d.model)} — ${d.sizeFormatted} (${val(d.interface)})`), '',
      '--- Netzwerk ---',
      ...(p.network || []).map(n => `${val(n.description)}: ${(n.ip || []).join(', ')} (${val(n.mac)})`),
    ];

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopyLabel('Kopiert!');
      setTimeout(() => setCopyLabel('Kopieren'), 2000);
    });
  };

  if (!profile) return <div className="empty-state">Keine Daten verfügbar</div>;

  const p = profile;
  const c = p.computer || {};
  const bios = p.bios || {};
  const mb = p.motherboard || {};
  const o = p.os || {};
  const cpu = p.cpu || {};
  const r = p.ram || {};
  const clockGHz = cpu.maxClockMHz ? (cpu.maxClockMHz / 1000).toFixed(2) + ' GHz' : '—';
  const cache: string[] = [];
  if (cpu.l2CacheKB) cache.push(`L2: ${(cpu.l2CacheKB / 1024).toFixed(1)} MB`);
  if (cpu.l3CacheKB) cache.push(`L3: ${(cpu.l3CacheKB / 1024).toFixed(1)} MB`);
  const usedPct = r.totalBytes ? Math.round(((r.usedBytes || 0) / r.totalBytes) * 100) : 0;

  return (
    <div className="sysprofil-page">
      <div className="sysprofil-header">
        <h2 className="sysprofil-title">System-Profil</h2>
        <div className="sysprofil-actions">
          <button className="network-btn" onClick={copyAsText}>{copyLabel}</button>
          <button className="network-btn" onClick={() => { setLoaded(false); load(); }}>Aktualisieren</button>
        </div>
      </div>

      <div className="sysprofil-grid">
        {/* Gerät */}
        <div className="sysprofil-card">
          <div className="sysprofil-card-header">Gerät</div>
          <div className="sysprofil-card-body">
            <table className="sysprofil-table">
              <tbody>
                <tr><td>Hersteller</td><td>{val(c.manufacturer)}</td></tr>
                <tr><td>Modell</td><td>{val(c.model)}</td></tr>
                <tr><td>Computername</td><td>{val(c.name)}</td></tr>
                <tr><td>Seriennummer</td><td>{val(bios.serialNumber)}</td></tr>
                <tr><td>Systemtyp</td><td>{val(c.systemType)}</td></tr>
                {mb.product && <tr><td>Mainboard</td><td>{val(mb.manufacturer)} {val(mb.product, '')}</td></tr>}
                {bios.version && <tr><td>BIOS</td><td>{val(bios.version)}{bios.releaseDate ? ` (${bios.releaseDate})` : ''}</td></tr>}
                <tr><td>Benutzer</td><td>{val(c.user)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Betriebssystem */}
        <div className="sysprofil-card">
          <div className="sysprofil-card-header">Betriebssystem</div>
          <div className="sysprofil-card-body">
            <table className="sysprofil-table">
              <tbody>
                <tr><td>Name</td><td>{val(o.name)}</td></tr>
                <tr><td>Version</td><td>{val(o.version)}{o.build ? ` (Build ${o.build})` : ''}</td></tr>
                <tr><td>Architektur</td><td>{val(o.architecture)}</td></tr>
                {o.installDate && <tr><td>Installiert am</td><td>{o.installDate}</td></tr>}
                {o.lastBoot && <tr><td>Letzter Start</td><td>{o.lastBoot}</td></tr>}
                {o.uptime && <tr><td>Laufzeit</td><td>{o.uptime}</td></tr>}
                {o.productKeyPartial && <tr><td>Produktschlüssel</td><td>XXXXX-XXXXX-XXXXX-XXXXX-{val(o.productKeyPartial)}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Prozessor */}
        <div className="sysprofil-card">
          <div className="sysprofil-card-header">Prozessor</div>
          <div className="sysprofil-card-body">
            <table className="sysprofil-table">
              <tbody>
                <tr><td>Modell</td><td>{val(cpu.name)}</td></tr>
                <tr><td>Kerne / Threads</td><td>{cpu.cores || '?'} Kerne / {cpu.threads || '?'} Threads</td></tr>
                <tr><td>Taktfrequenz</td><td>{clockGHz}</td></tr>
                {cache.length > 0 && <tr><td>Cache</td><td>{cache.join(', ')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Grafikkarte(n) */}
        {p.gpu && p.gpu.length > 0 && (
          <div className="sysprofil-card">
            <div className="sysprofil-card-header">Grafikkarte{p.gpu.length > 1 ? 'n' : ''}</div>
            <div className="sysprofil-card-body">
              <table className="sysprofil-table">
                <tbody>
                  {p.gpu.map((g, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <tr><td colSpan={2} style={{ borderBottom: '1px solid var(--border-color)', padding: '4px 0' }} /></tr>}
                      <tr><td>Modell</td><td>{val(g.name)}</td></tr>
                      <tr><td>Hersteller</td><td>{val(g.manufacturer)}</td></tr>
                      <tr><td>Treiber</td><td>{val(g.driverVersion)}</td></tr>
                      <tr><td>VRAM</td><td>{g.vramBytes && g.vramBytes > 0 ? formatBytes(g.vramBytes) : '—'}</td></tr>
                      {g.resolution && <tr><td>Auflösung</td><td>{val(g.resolution)}{g.refreshRate ? ` @ ${g.refreshRate} Hz` : ''}</td></tr>}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Arbeitsspeicher */}
        <div className="sysprofil-card">
          <div className="sysprofil-card-header">Arbeitsspeicher</div>
          <div className="sysprofil-card-body">
            <div className="sysprofil-ram-bar">
              <div className="sysprofil-ram-used" style={{ width: usedPct + '%' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {formatBytes(r.usedBytes || 0)} von {r.totalFormatted || '?'} belegt ({usedPct}%)
            </div>
            <table className="sysprofil-table">
              <tbody>
                <tr><td>Gesamt</td><td>{val(r.totalFormatted)}</td></tr>
                {(r.sticks || []).map((s, i) => (
                  <tr key={i}><td>Slot {i + 1}</td><td>{s.capacityFormatted}{s.speedMHz ? ` @ ${s.speedMHz} MHz` : ''}{s.manufacturer ? ` (${s.manufacturer.trim()})` : ''}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Festplatten */}
        {p.disks && p.disks.length > 0 && (
          <div className="sysprofil-card sysprofil-card-wide">
            <div className="sysprofil-card-header">Festplatten</div>
            <div className="sysprofil-card-body">
              <table className="sysprofil-table sysprofil-table-full">
                <thead><tr><th>Modell</th><th>Größe</th><th>Schnittstelle</th><th>Partitionen</th></tr></thead>
                <tbody>
                  {p.disks.map((d, i) => (
                    <tr key={i}>
                      <td>{val(d.model)}</td>
                      <td>{d.sizeFormatted}</td>
                      <td>{val(d.interface)}</td>
                      <td>{d.partitions} Partition{d.partitions !== 1 ? 'en' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Netzwerk */}
        {p.network && p.network.length > 0 && (
          <div className="sysprofil-card sysprofil-card-wide">
            <div className="sysprofil-card-header">Netzwerk</div>
            <div className="sysprofil-card-body">
              <table className="sysprofil-table sysprofil-table-full">
                <thead><tr><th>Adapter</th><th>IP-Adresse</th><th>MAC</th><th>Typ</th></tr></thead>
                <tbody>
                  {p.network.map((n, i) => (
                    <tr key={i}>
                      <td>{val(n.description)}</td>
                      <td>{(n.ip || []).join(', ') || '—'}</td>
                      <td>{val(n.mac)}</td>
                      <td>{n.dhcp ? 'DHCP' : 'Statisch'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Hersteller-Links */}
        {p.links && p.links.length > 0 && (
          <div className="sysprofil-card">
            <div className="sysprofil-card-header">Hersteller-Links</div>
            <div className="sysprofil-card-body sysprofil-links">
              {p.links.map((l, i) => (
                <a key={i} href="#" className="sysprofil-link" onClick={(e) => { e.preventDefault(); api.openExternal(l.url); }}>
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
