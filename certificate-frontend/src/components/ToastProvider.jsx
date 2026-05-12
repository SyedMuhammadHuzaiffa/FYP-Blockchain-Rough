import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ToastContext, toastTypes } from "./toastContext";

function ToastItem({ toast, onClose }) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onClose(toast.id);
    }, toast.duration);

    return () => window.clearTimeout(timeoutId);
  }, [onClose, toast.duration, toast.id]);

  return (
    <div className={`toast toast-${toast.type}`} role="status">
      <div className="toast-content">
        <strong>{toast.title}</strong>
        <span>{toast.message}</span>
      </div>
      <button
        type="button"
        className="toast-close"
        onClick={() => onClose(toast.id)}
        aria-label="Close notification"
      >
        x
      </button>
    </div>
  );
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(({ type = "info", title, message, duration = 4200 }) => {
    const normalizedType = toastTypes.has(type) ? type : "info";
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setToasts((current) => [
      ...current,
      {
        id,
        type: normalizedType,
        title: title || normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1),
        message,
        duration,
      },
    ]);

    return id;
  }, []);

  const value = useMemo(
    () => ({
      show: addToast,
      dismiss: removeToast,
      success: (message, options = {}) =>
        addToast({ ...options, type: "success", message }),
      error: (message, options = {}) =>
        addToast({ ...options, type: "error", message }),
      warning: (message, options = {}) =>
        addToast({ ...options, type: "warning", message }),
      info: (message, options = {}) =>
        addToast({ ...options, type: "info", message }),
    }),
    [addToast, removeToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
