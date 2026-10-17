'use client';
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const ToastContext = createContext();

let toastIdCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const removeToast = useCallback((id) => {
    // Mark toast as exiting for slide-out animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    // Remove from DOM after animation completes
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const showToast = useCallback(
    (message, type = 'info') => {
      const id = ++toastIdCounter;
      const toast = { id, message, type, exiting: false };

      setToasts((prev) => [...prev, toast]);

      // Auto-dismiss after 3 seconds
      timersRef.current[id] = setTimeout(() => {
        removeToast(id);
        delete timersRef.current[id];
      }, 3000);

      return id;
    },
    [removeToast]
  );

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container */}
      <div className="toast-container" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  const { message, type, exiting } = toast;

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '🍯';

  const typeClass =
    type === 'success'
      ? 'toast-success'
      : type === 'error'
      ? 'toast-error'
      : 'toast-info';

  return (
    <div
      className={`toast ${typeClass} ${exiting ? 'toast-exit' : ''}`}
      role="alert"
    >
      <span className="text-lg flex-shrink-0">{icon}</span>
      <p className="flex-1 leading-snug">{message}</p>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 ml-2 opacity-70 hover:opacity-100 transition-opacity text-white text-lg leading-none cursor-pointer"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
