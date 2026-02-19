import { useState, useEffect, useCallback } from 'react';
import { setToastCallback } from '../context/AppContext';

interface ToastItem {
  id: number;
  message: string;
  type: string;
}

let nextId = 0;

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: string) => {
    const id = ++nextId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    setToastCallback(addToast);
    return () => setToastCallback(null);
  }, [addToast]);

  return (
    <div id="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`} role="alert">
          {t.message}
        </div>
      ))}
    </div>
  );
}
