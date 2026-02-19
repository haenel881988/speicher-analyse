/**
 * Prüft ob eine Backend-Antwort ein Stub ist.
 * Stubs geben { stub: true, message: "..." } zurück.
 *
 * Nutzung: Vor dem Aufruf einmalig setStubToastCallback mit
 * showToast aus AppContext registrieren (passiert in App.tsx).
 */

let toastCallback: ((msg: string, type?: string) => void) | null = null;

/** Registriert die showToast-Funktion aus AppContext */
export function setStubToastCallback(cb: (msg: string, type?: string) => void): void {
  toastCallback = cb;
}

export function isStub(result: any, featureName = ''): boolean {
  if (result && result.stub === true) {
    const msg = featureName
      ? `„${featureName}" ist noch nicht verfügbar.`
      : (result.message || 'Diese Funktion ist noch nicht verfügbar.');
    if (toastCallback) {
      toastCallback(msg, 'warning');
    } else {
      console.warn('[Stub]', msg);
    }
    return true;
  }
  return false;
}
