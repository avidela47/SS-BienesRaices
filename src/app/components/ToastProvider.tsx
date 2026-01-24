"use client";
import { createContext, useContext, useState, ReactNode } from "react";

interface ToastContextType {
  show: (msg: string) => void;
}

const ToastContext = createContext<ToastContextType>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);

  function show(msg: string) {
    setMessage(msg);
    setVisible(true);
    setTimeout(() => setVisible(false), 2500);
  }

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {visible && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-neutral-900 text-white px-6 py-3 rounded-xl shadow-lg border border-white/10 z-50 animate-fade-in">
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
