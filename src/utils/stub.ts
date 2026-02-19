/**
 * Prüft ob eine Backend-Antwort ein Stub ist.
 * Stubs geben { stub: true, message: "..." } zurück.
 */
export function isStub(result: any, featureName = ''): boolean {
  if (result && result.stub === true) {
    const msg = featureName
      ? `„${featureName}" ist noch nicht verfügbar.`
      : (result.message || 'Diese Funktion ist noch nicht verfügbar.');
    showStubWarning(msg);
    return true;
  }
  return false;
}

function showStubWarning(message: string): void {
  const existing = document.querySelector('.stub-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'stub-toast';
  toast.setAttribute('role', 'alert');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    background: var(--warning, #f59e0b); color: #000; padding: 10px 20px;
    border-radius: 8px; font-size: 13px; font-weight: 600; z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 400px; text-align: center;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
