import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => {
          let bgClass = 'bg-blue-600 text-white border-blue-700';
          let icon = 'ℹ️';

          if (toast.type === 'success') {
            bgClass = 'bg-emerald-600 text-white border-emerald-700';
            icon = '✅';
          } else if (toast.type === 'error') {
            bgClass = 'bg-rose-600 text-white border-rose-700';
            icon = '❌';
          } else if (toast.type === 'warning') {
            bgClass = 'bg-amber-600 text-white border-amber-700';
            icon = '⚠️';
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-lg shadow-lg border text-sm font-medium transition-all duration-300 ease-out animate-in slide-in-from-top-2 ${bgClass}`}
              role="alert"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">{icon}</span>
                <span>{toast.message}</span>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="ml-3 text-white/80 hover:text-white font-bold p-1 rounded transition-colors text-xs"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

