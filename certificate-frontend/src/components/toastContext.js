import { createContext, useContext } from "react";

export const ToastContext = createContext(null);

export const toastTypes = new Set(["success", "error", "warning", "info"]);

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
