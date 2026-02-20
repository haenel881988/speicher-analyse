import React, { lazy, Suspense, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './context/AppContext';
import { ToastContainer } from './components/Toast';
import './style.css';

const PdfEditorView = lazy(() => import('./views/PdfEditorView'));

// Polyfill: Uint8Array.toHex/fromHex (benötigt von pdf.js v5.4)
if (!(Uint8Array.prototype as any).toHex) {
  (Uint8Array.prototype as any).toHex = function () {
    const hex: string[] = [];
    for (let i = 0; i < this.length; i++) {
      hex.push(this[i].toString(16).padStart(2, '0'));
    }
    return hex.join('');
  };
}
if (!(Uint8Array as any).fromHex) {
  (Uint8Array as any).fromHex = function (hexString: string) {
    const bytes = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
      bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
    }
    return bytes;
  };
}

// Global error handlers
window.addEventListener('error', (event) => {
  console.error('[Global Error]', event.message, event.filename, event.lineno);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Rejection]', event.reason);
});

// Standalone PDF-Fenster: ?pdf=<encoded-path> Parameter erkennen
const urlParams = new URLSearchParams(window.location.search);
const pdfPath = urlParams.get('pdf');

// Detached PDF Window — eigene Mini-App mit Theme + Toast
function DetachedPdfApp({ path }: { path: string }) {
  // Theme aus localStorage anwenden (gleicher Key wie App.tsx)
  useEffect(() => {
    const theme = localStorage.getItem('speicher-analyse-theme') || 'dark';
    document.documentElement.dataset.theme = theme;
  }, []);

  return (
    <AppProvider>
      <Suspense fallback={<div className="loading-state">PDF wird geladen...</div>}>
        <PdfEditorView filePath={decodeURIComponent(path)} onClose={() => window.close()} />
      </Suspense>
      <ToastContainer />
    </AppProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {pdfPath ? <DetachedPdfApp path={pdfPath} /> : <App />}
  </React.StrictMode>
);
