import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
