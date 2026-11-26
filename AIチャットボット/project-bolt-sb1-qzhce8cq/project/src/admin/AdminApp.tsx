import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Gauge, Loader2, Package, Settings2, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AuthApi } from "@/hooks/useAuth";
import { BrandMark } from "@/components/BrandMark";
import { PreferenceSwitchers } from "@/components/SettingsMenu";
import { Dashboard } from "@/admin/Dashboard";
import { Inventory } from "@/admin/Inventory";
import { Reservations } from "@/admin/Reservations";
import { CrowdPanel } from "@/admin/CrowdPanel";
import { SettingsPanel } from "@/admin/SettingsPanel";

const TABS = [
  { id: "dashboard", label: "ダッシュボード", icon: Gauge },
  { id: "inventory", label: "在庫・おすすめ", icon: Package },
  { id: "reservations", label: "予約", icon: CalendarDays },
  { id: "crowd", label: "混雑状況", icon: Users },
  { id: "settings", label: "設定", icon: Settings2 },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** 店主向けの管理画面（日本語のみ） */
export function AdminApp({ auth, onBack }: { auth: AuthApi; onBack: () => void }) {
  const [tab, setTab] = useState<TabId>("dashboard");
  const [hasOwner, setHasOwner] = useState<boolean | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    supabase.rpc("cafe_has_owner").then(({ data }) => setHasOwner(data === true));
  }, [auth.isStaff]);

  if (!auth.isStaff) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-6">
        <div className="card w-full max-w-md p-8 text-center">
          <ShieldCheck size={36} className="mx-auto text-caramel" aria-hidden="true" />
          <h1 className="mt-4 font-serif text-xl font-bold text-ink">店主メニュー</h1>
          {hasOwner === null ? (
            <Loader2 className="mx-auto mt-6 animate-spin text-muted" />
          ) : hasOwner ? (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              この画面は店主だけが使えます。店主として登録したアカウントでログインし直してください。
            </p>
          ) : auth.isGuest ? (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              まだ店主が登録されていません。ゲストのままでは登録できないので、いったんログアウトして、Googleかメールでログインしてください。
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                まだ店主が登録されていません。今ログインしているアカウント（{auth.user?.email}）を店主として登録しますか？
                <br />
                <span className="text-xs">※ 最初の1人だけが店主になれます。</span>
              </p>
              {claimError && <p className="mt-3 rounded-xl bg-berry/10 px-3 py-2 text-xs text-berry">{claimError}</p>}
              <button
                className="btn-primary mt-6 w-full"
                disabled={claiming}
                onClick={async () => {
                  setClaiming(true);
                  setClaimError(await auth.claimOwner());
                  setClaiming(false);
                }}
              >
                {claiming && <Loader2 size={16} className="animate-spin" />}
                店主として登録する
              </button>
            </>
          )}
          <button onClick={onBack} className="btn-ghost mt-3 w-full">
            <ArrowLeft size={16} />
            チャットに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row">
      {/* 横（スマホでは上）のメニュー */}
      <aside className="flex shrink-0 flex-col border-line bg-sunken md:w-60 md:border-r">
        <div className="flex items-center gap-3 px-5 py-4">
          <BrandMark size={32} />
          <div className="min-w-0 flex-1">
            <p className="font-serif text-sm font-bold text-ink">ひだまり珈琲店</p>
            <p className="text-[11px] text-muted">店主メニュー</p>
          </div>
          <div className="md:hidden">
            <button onClick={onBack} className="icon-btn" aria-label="チャットに戻る">
              <ArrowLeft size={18} />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible" aria-label="店主メニュー">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2.5 rounded-2xl px-3.5 text-sm transition ${
                tab === id ? "bg-surface font-medium text-ink shadow-soft" : "text-muted hover:bg-surface/60 hover:text-ink"
              }`}
            >
              <Icon size={17} className={tab === id ? "text-caramel" : ""} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto hidden space-y-2 border-t border-line p-4 md:block">
          <PreferenceSwitchers />
          <button onClick={onBack} className="btn-ghost w-full">
            <ArrowLeft size={16} />
            チャットに戻る
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-5 py-8 md:px-10">
          {tab === "dashboard" && <Dashboard onJump={setTab} />}
          {tab === "inventory" && <Inventory />}
          {tab === "reservations" && <Reservations />}
          {tab === "crowd" && <CrowdPanel />}
          {tab === "settings" && <SettingsPanel />}
        </div>
      </main>
    </div>
  );
}

/** 各画面の見出し */
export function PageTitle({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <header className="mb-8">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-1 font-serif text-2xl font-bold text-ink">{title}</h1>
      {lead && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{lead}</p>}
    </header>
  );
}
