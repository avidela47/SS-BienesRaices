
"use client";

import Link from "next/link";
import Image from "next/image";

const cards = [
  {
    label: "Personas",
    color: "var(--benetton-green)",
    icon: <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="9" cy="10" r="3"/><circle cx="15" cy="10" r="3"/><path d="M4 19c0-2.5 3-4 8-4s8 1.5 8 4"/></svg>,
    subtitle: "Consultar y administrar personas",
    href: "/people",
    glow: "0 0 32px 8px #00A65155"
  },
  {
    label: "Propiedades",
    color: "var(--benetton-green)",
    icon: <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12l9-7 9 7"/><rect x="6" y="12" width="12" height="8" rx="2"/></svg>,
    subtitle: "Revisar y gestionar propiedades",
    href: "/properties",
    glow: "0 0 32px 8px #00A65155"
  },
  {
    label: "Contratos",
    color: "var(--benetton-green)",
    icon: <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M8 3h8v4"/></svg>,
    subtitle: "Ver y administrar contratos",
    href: "/contracts",
    glow: "0 0 32px 8px #00A65155"
  },
  {
    label: "Cuotas",
    color: "var(--benetton-green)",
    icon: <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="13" rx="2"/><circle cx="16" cy="13" r="2"/></svg>,
    subtitle: "Gestión de cuotas vencimientos",
    href: "/installments",
    glow: "0 0 32px 8px #00A65155"
  },
  {
    label: "Pagos",
    color: "var(--benetton-green)",
    icon: <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><text x="12" y="16" textAnchor="middle" fontSize="16" fill="#ED1C24">€</text></svg>,
    subtitle: "Registrar y controlar pagos",
    href: "/payments",
    glow: "0 0 32px 8px #00A65155"
  },
  {
    label: "Caja",
    color: "var(--benetton-green)",
    icon: (
      <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="3" y="7" width="18" height="10" rx="2"/>
        <rect x="7" y="11" width="10" height="2" rx="1"/>
        <path d="M3 10V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3"/>
      </svg>
    ),
    subtitle: "Registro y control financiero.",
    href: "/cashbox",
    glow: "0 0 32px 8px #00A65155"
  },
];

export default function Home() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at bottom, #14141A 0%, #0B0B0F 100%)",
      color: "var(--foreground)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    }}>
      <div className="pt-0 pb-0 text-center">
        <Image src="/logo.png" alt="Logo" width={180} height={180} className="mx-auto mb-2" />
        <h1 className="text-5xl font-bold mb-2" style={{ color: "var(--foreground)" }}>SOTGIU & SOTERAS</h1>
        <h2 className="text-4xl font-light mb-6" style={{ color: "var(--foreground)" }}>Bienes Raíces</h2>
        <div className="text-xl mb-8" style={{ color: "var(--benetton-muted)" }}>
          Gestión integral de contratos, cuotas, pagos y propiedades.
        </div>
      </div>
      <div
        className="flex flex-wrap justify-center gap-4 mb-6 mt-2"
        style={{ maxWidth: 1440 }}
      >
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            style={{
              background: "var(--benetton-card)",
              border: `2px solid ${card.color}`,
              boxShadow: card.glow,
              minWidth: 150,
              maxWidth: 160,
              flex: "1 1 150px"
            }}
            className="rounded-2xl p-4 flex flex-col items-center text-center"
          >
            <div style={{ color: card.color, marginBottom: 8 }}>{card.icon}</div>
            <div className="text-lg font-bold mb-1" style={{ color: card.color }}>{card.label}</div>
            <div className="text-sm mb-1" style={{ color: "var(--foreground)" }}>{card.subtitle}</div>
          </Link>
        ))}
      </div>
      {/* ...eliminado texto de la paleta Benetton... */}
    </div>
  );
}
