"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OFFICE } from "@/config";
import { GoogleGate } from "./GoogleGate";
import { confirmLeave } from "./unsaved";

const NAV = [
  { href: "/", label: "出欠を記録" },
  { href: "/summary", label: "月の集計・請求書" },
  { href: "/members", label: "会員管理" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/summary" && path.startsWith("/invoices")));
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            {OFFICE.name}
            {OFFICE.isDemo && <span className="demo-badge">試作版</span>}
          </span>
          <nav className="nav">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={active(n.href) ? "active" : ""}
                onClick={(e) => {
                  if (!confirmLeave()) e.preventDefault();
                }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="main">
        <GoogleGate>{children}</GoogleGate>
      </main>
    </>
  );
}
