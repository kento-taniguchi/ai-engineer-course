import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppStoreProvider } from "@/store/AppStore";
import { AppShell } from "@/components/AppShell";
import { GoogleProvider } from "@/store/GoogleStore";
import { CloudSyncProvider } from "@/store/CloudSyncStore";

export const metadata: Metadata = {
  title: "BASE-PLUS 業務管理（試作版）",
  description: "野球指導事業 BASE-PLUS の業務管理アプリ（デモデータ使用の試作版）",
  // 個人用のアプリのため、検索エンジンに載せない
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1b2a4a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AppStoreProvider>
          <GoogleProvider>
            <CloudSyncProvider>
              <AppShell>{children}</AppShell>
            </CloudSyncProvider>
          </GoogleProvider>
        </AppStoreProvider>
      </body>
    </html>
  );
}
