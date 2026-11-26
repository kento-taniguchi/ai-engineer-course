import { useEffect, useRef, useState } from "react";
import { Check, Globe, LogOut, Monitor, Moon, Store, Sun, UserRound } from "lucide-react";
import { LANGS, useI18n, type Lang } from "@/lib/i18n";
import { useTheme, type ThemeChoice } from "@/lib/theme";

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;
const THEME_ORDER: ThemeChoice[] = ["light", "dark", "system"];

/** 言語の選択とダークモードの切り替え（ログイン画面でも使う） */
export function PreferenceSwitchers() {
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const Icon = THEME_ICON[theme];
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];

  return (
    <div className="flex items-center gap-1">
      <label className="relative inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs text-muted transition hover:bg-sunken hover:text-ink">
        <Globe size={16} aria-hidden="true" />
        <span className="sr-only">{t("language")}</span>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          className="cursor-pointer appearance-none bg-transparent pr-1 text-xs text-ink outline-none"
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={() => setTheme(next)}
        className="icon-btn"
        aria-label={`${t("theme")}: ${t(`theme_${theme}` as "theme_light")} → ${t(`theme_${next}` as "theme_light")}`}
        title={`${t("theme")}: ${t(`theme_${theme}` as "theme_light")}`}
      >
        <Icon size={18} />
      </button>
    </div>
  );
}

interface AccountMenuProps {
  email: string | null;
  isGuest: boolean;
  isStaff: boolean;
  onOpenAdmin: () => void;
  onSignOut: () => void;
}

export function AccountMenu({ email, isGuest, isStaff, onOpenAdmin, onSignOut }: AccountMenuProps) {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="icon-btn"
        aria-label={t("account")}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <UserRound size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-64 animate-rise rounded-2xl border border-line bg-surface p-2 shadow-lift"
        >
          <div className="px-3 py-2">
            <p className="text-[11px] text-muted">{t("account")}</p>
            <p className="truncate text-sm text-ink">{isGuest ? t("guestBadge") : email}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <p className="px-3 pt-2 text-[11px] text-muted">{t("theme")}</p>
          <div className="grid grid-cols-3 gap-1 p-2">
            {THEME_ORDER.map((th) => {
              const Icon = THEME_ICON[th];
              return (
                <button
                  key={th}
                  role="menuitemradio"
                  aria-checked={theme === th}
                  onClick={() => setTheme(th)}
                  className={`flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition ${
                    theme === th ? "bg-caramel-soft text-caramel" : "text-muted hover:bg-sunken"
                  }`}
                >
                  <Icon size={16} />
                  {t(`theme_${th}` as "theme_light")}
                </button>
              );
            })}
          </div>
          <div className="my-1 h-px bg-line" />
          {!isGuest && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenAdmin();
              }}
              className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-sm text-ink hover:bg-sunken"
            >
              <Store size={16} className="text-caramel" />
              {t("admin")}
              {isStaff && <Check size={14} className="ml-auto text-sage" aria-hidden="true" />}
            </button>
          )}
          <button
            role="menuitem"
            onClick={onSignOut}
            className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-sm text-berry hover:bg-berry/10"
          >
            <LogOut size={16} />
            {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
}
