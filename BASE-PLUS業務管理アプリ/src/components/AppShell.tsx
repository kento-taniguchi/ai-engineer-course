"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { CloudSyncIndicator } from "./CloudSyncIndicator";

const NAV = [
  { href: "/", label: "今日の仕事", icon: "today" as IconName },
  { href: "/players", label: "選手", icon: "player" as IconName },
  { href: "/teams", label: "チーム", icon: "team" as IconName },
  { href: "/calendar", label: "月間予定", icon: "calendar" as IconName },
  { href: "/sales", label: "売上", icon: "sales" as IconName },
  { href: "/sns", label: "発信・SNS", icon: "sns" as IconName },
  { href: "/seminar", label: "プチセミナー", icon: "seminar" as IconName },
  { href: "/slots", label: "予約枠管理", icon: "slots" as IconName },
  { href: "/google", label: "Google連携", icon: "calendar" as IconName },
  { href: "/cloud", label: "クラウド保存", icon: "cloud" as IconName },
  { href: "/settings", label: "設定", icon: "settings" as IconName },
];

const BOTTOM = NAV.slice(0, 4);
const MORE = NAV.slice(4);

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pathname]);
  const moreActive = MORE.some((n) => isActive(pathname, n.href));

  return (
    <div className="shell">
      <nav className="sidenav" aria-label="メインメニュー">
        <Link href="/" className="brand">
          <span className="brand-mark">
            BASE<span>-</span>PLUS
          </span>
          <span className="brand-sub">業務管理</span>
        </Link>
        <ul className="nav-list">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="nav-link" aria-current={isActive(pathname, n.href) ? "page" : undefined}>
                <span className="nav-icon">
                  <Icon name={n.icon} />
                </span>
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="nav-future">
          <strong>今後追加予定</strong>
          <br />
          新規顧客対応（申込フォーム・事前ヒアリングシートの自動送信）
        </div>
      </nav>

      <main className="main" id="main">
        <CloudSyncIndicator />
        {children}
      </main>

      {moreOpen && (
        <div className="more-sheet" role="menu" aria-label="その他のメニュー">
          {MORE.map((n) => (
            <Link key={n.href} href={n.href} role="menuitem" aria-current={isActive(pathname, n.href) ? "page" : undefined}>
              <Icon name={n.icon} />
              {n.label}
            </Link>
          ))}
        </div>
      )}

      <nav className="bottomnav" aria-label="下部メニュー">
        {BOTTOM.map((n) => (
          <Link key={n.href} href={n.href} aria-current={isActive(pathname, n.href) ? "page" : undefined}>
            <span className="bn-icon">
              <Icon name={n.icon} />
            </span>
            {n.label}
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-current={moreActive && !moreOpen ? "page" : undefined}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <span className="bn-icon">
            <Icon name="menu" />
          </span>
          {moreOpen ? "閉じる" : "その他"}
        </button>
      </nav>
    </div>
  );
}
