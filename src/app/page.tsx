"use client";

import Link from "next/link";
import Image from "next/image";

type HomeCard = {
  label: string;
  color: string;
  icon: React.ReactNode;
  subtitle: string;
  href: string;
  glow: string;
};

const cards: HomeCard[] = [
  {
    label: "Panel de control",
    color: "var(--benetton-turquoise)",
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M4 13h6v7H4v-7z" />
        <path d="M14 4h6v16h-6V4z" />
        <path d="M4 4h6v7H4V4z" />
      </svg>
    ),
    subtitle: "Resumen general",
    href: "/dashboard",
    glow: "0 0 22px 6px #00AEEF3A",
  },
  {
    label: "Personas",
    color: "var(--benetton-green)",
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="9" cy="10" r="3" />
        <circle cx="15" cy="10" r="3" />
        <path d="M4 19c0-2.5 3-4 8-4s8 1.5 8 4" />
      </svg>
    ),
    subtitle: "Administración",
    href: "/people",
    glow: "0 0 22px 6px #00A6513A",
  },
  {
    label: "Garantes",
    color: "var(--benetton-violet)",
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M12 3l8 4v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z" />
        <path d="M9 12l2 2 4-5" />
      </svg>
    ),
    subtitle: "Listado / alta",
    href: "/guarantors",
    glow: "0 0 22px 6px #662D913A",
  },
  {
    label: "Propiedades",
    color: "var(--benetton-blue)",
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M3 12l9-7 9 7" />
        <rect x="6" y="12" width="12" height="8" rx="2" />
      </svg>
    ),
    subtitle: "Gestión",
    href: "/properties",
    glow: "0 0 22px 6px #0054A63A",
  },
  {
    label: "Contratos",
    color: "var(--benetton-fuchsia)",
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M7 3h10v18H7z" />
        <path d="M9 7h6" />
        <path d="M9 11h6" />
        <path d="M9 15h4" />
      </svg>
    ),
    subtitle: "Administración",
    href: "/contracts",
    glow: "0 0 22px 6px #EC008C3A",
  },
  {
    label: "Alquiler mensual",
    color: "var(--benetton-orange)",
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M3 7h18" />
        <path d="M6 3v4" />
        <path d="M18 3v4" />
        <rect x="4" y="7" width="16" height="14" rx="2" />
        <path d="M7 11h4" />
        <path d="M7 15h6" />
      </svg>
    ),
    subtitle: "Vencimientos",
    href: "/installments",
    glow: "0 0 22px 6px #F7941D3A",
  },
  {
    label: "Pagos",
    color: "var(--benetton-yellow)",
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M3 7h18v10H3V7z" />
        <path d="M7 11h4" />
        <path d="M17 13h.01" />
      </svg>
    ),
    subtitle: "Registrar",
    href: "/payments",
    glow: "0 0 22px 6px #FFF2003A",
  },
  {
    label: "Caja",
    color: "var(--benetton-red)",
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M4 7h16v10H4V7z" />
        <path d="M7 7V5h10v2" />
        <path d="M9 12h6" />
      </svg>
    ),
    subtitle: "Resumen",
    href: "/cash",
    glow: "0 0 22px 6px #ED1C243A",
  },
  {
    label: "Documentación",
    color: "var(--benetton-green)",
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M7 3h8l2 2v16H7V3z" />
        <path d="M9 9h6" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    ),
    subtitle: "Escanear / subir",
    href: "/documentation",
    glow: "0 0 22px 6px #00A6513A",
  },
];

export default function HomePage() {
  return (
    <main
      className="h-svh text-white overflow-hidden flex flex-col"
      style={{
        background:
          "radial-gradient(820px 480px at 18% 0%, #00A65114 0%, transparent 55%), radial-gradient(760px 480px at 82% 0%, #00AEEF10 0%, transparent 55%), var(--background)",
        fontFamily: "var(--font-inter), ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
      }}
    >
      {/* Header compacto */}
  <header className="mx-auto w-full max-w-6xl px-5 pt-0 pb-1 flex items-center justify-center flex-none">
        <div className="flex flex-col items-center text-center gap-2 min-w-0">
          <Image src="/logo.png" alt="Logo" width={110} height={110} className="rounded-full" />
          <div className="min-w-0 leading-tight">
            <h1
              className="text-2xl sm:text-3xl font-normal"
              style={{ fontFamily: "'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif" }}
            >
              S&amp;S Sotgiu &amp; Soteras
            </h1>
            <p className="text-sm sm:text-base font-normal mt-1" style={{ color: "var(--benetton-muted)" }}>
              Negocios Inmobiliarios
            </p>
          </div>
        </div>
      </header>

      {/* Grid ocupa el resto del alto, sin generar scroll */}
      <section className="mx-auto w-full max-w-6xl px-5 pb-4 flex-1 flex items-center">
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group rounded-2xl border px-4 py-3 transition-all hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
                borderColor: "var(--benetton-border)",
                boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className="rounded-2xl p-2 border"
                  style={{
                    borderColor: "rgba(255,255,255,0.10)",
                    color: c.color,
                    boxShadow: c.glow,
                  }}
                >
                  {c.icon}
                </div>

                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px]" style={{ color: "var(--benetton-muted)" }}>
                  Entrar →
                </span>
              </div>

              <h2 className="mt-2 text-sm font-semibold">{c.label}</h2>
              <p className="mt-0.5 text-[12px]" style={{ color: "var(--benetton-muted)" }}>
                {c.subtitle}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
