"use client";

import { createContext, useContext, useRef, useState, ReactNode } from "react";

type ToastContextType = {
  show: (msg: string) => void;
};

const ToastContext = createContext<ToastContextType>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  function show(msg: string) {
    setMessage(msg);
    setVisible(true);

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setVisible(false);
      timerRef.current = null;
    }, 2500);
  }

  return (
    <ToastContext.Provider value={{ show }}>
      {children}

      {visible && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-white/10 bg-neutral-900 px-6 py-3 text-white shadow-lg"
          style={{ animation: "fade-in 160ms ease-out" }}
        >
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
