import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { APP_NAME, OFFICE } from "@/config";

export const metadata: Metadata = {
  title: OFFICE.isDemo ? `${APP_NAME}（試作版）` : APP_NAME,
  description: "通所サービスの出欠記録と月の請求書作成（架空データの試作版）",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f5d62",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
