import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ToastProvider } from "@/components/ToastProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "S&S Sotgiu & Soteras Negocios Inmobiliarios",
  description: "Sistema de gestión inmobiliaria: propiedades, contratos, cuotas, pagos y documentación.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} antialiased`}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
