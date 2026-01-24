"use client";
import { createContext, useContext } from "react";

// Dummy Toast context/provider for build, replace with your real implementation
const ToastContext = createContext({ show: () => {} });
export function useToast() {
  return useContext(ToastContext);
}
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return children;
}
