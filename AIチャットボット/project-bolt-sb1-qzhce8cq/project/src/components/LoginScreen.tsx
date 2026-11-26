import { useState, type FormEvent } from "react";
import { Loader2, UserRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { AuthApi } from "@/hooks/useAuth";
import type { ShopStatus } from "@/types";
import { CrowdBadge } from "@/components/CrowdBadge";
import { PreferenceSwitchers } from "@/components/SettingsMenu";

const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
  </svg>
);

/** 背景の写真（ハンドドリップ）。Unsplash の無料で使える写真 */
const PHOTO_CREDIT = {
  name: "Nadia Valko",
  url: "https://unsplash.com/photos/pouring-hot-water-over-coffee-grounds-in-a-pour-over-brewer-F0XGFD9Z1Uk",
};

function BackgroundPhoto({ className = "" }: { className?: string }) {
  return (
    <picture>
      <source srcSet="/images/login-pourover.webp" type="image/webp" />
      <img
        src="/images/login-pourover.jpg"
        alt=""
        width={1400}
        height={2100}
        decoding="async"
        className={`h-full w-full object-cover ${className}`}
      />
    </picture>
  );
}

/** 店名のロゴ（文字だけで上品に） */
function Wordmark({ light = false }: { light?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={light ? "text-[#F6EDE2]" : "text-ink"}>
      <p className={`text-[11px] font-medium uppercase tracking-[0.32em] ${light ? "text-[#E2B884]" : "text-caramel"}`}>
        Hidamari Coffee
      </p>
      <h1 className="mt-3 font-serif text-4xl font-bold tracking-[0.12em] sm:text-5xl">{t("appName")}</h1>
      <div className={`mt-4 h-px w-12 ${light ? "bg-[#E2B884]/70" : "bg-caramel/60"}`} aria-hidden="true" />
      <p className={`mt-4 max-w-xs text-sm leading-relaxed ${light ? "text-[#F6EDE2]/85" : "text-muted"}`}>{t("tagline")}</p>
    </div>
  );
}

export function LoginScreen({ auth, status }: { auth: AuthApi; status: ShopStatus | null }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "google" | "email" | "guest">(null);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const run = async (kind: "google" | "email" | "guest", fn: () => Promise<string | null>) => {
    setBusy(kind);
    setMessage(null);
    const result = await fn();
    if (result === "confirm") setMessage({ tone: "info", text: t("checkEmail") });
    else if (result) setMessage({ tone: "error", text: result });
    setBusy(null);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run("email", () =>
      mode === "signIn" ? auth.signInWithEmail(email, password) : auth.signUpWithEmail(email, password),
    );
  };

  const credit = (
    <a
      href={PHOTO_CREDIT.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[10px] tracking-wide text-[#F6EDE2]/60 transition hover:text-[#F6EDE2]"
    >
      Photo: {PHOTO_CREDIT.name} / Unsplash
    </a>
  );

  return (
    <div className="relative min-h-dvh bg-canvas lg:grid lg:grid-cols-[1.15fr_1fr]">
      {/* 写真：スマホでは画面いっぱいの背景、パソコンでは左半分 */}
      <div className="fixed inset-0 lg:sticky lg:top-0 lg:h-dvh">
        <BackgroundPhoto className="object-[center_30%]" />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/55 to-black/85 lg:bg-gradient-to-t lg:from-black/80 lg:via-black/20 lg:to-black/30"
        />
        <div className="absolute inset-x-0 bottom-0 hidden p-12 lg:block xl:p-16">
          <Wordmark light />
          <div className="mt-6">
            <CrowdBadge status={status} detailed />
          </div>
          <div className="mt-10">{credit}</div>
        </div>
      </div>

      {/* ログイン欄 */}
      <div className="relative z-10 flex min-h-dvh flex-col">
        <header className="flex justify-end p-4">
          <div className="rounded-full bg-surface/85 backdrop-blur lg:bg-transparent lg:backdrop-blur-none">
            <PreferenceSwitchers />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-10">
          {/* スマホでは写真の上に店名 */}
          <div className="mb-8 lg:hidden">
            <Wordmark light />
            <div className="mt-5">
              <CrowdBadge status={status} detailed />
            </div>
          </div>

          <div className="rounded-3xl border border-line/60 bg-surface/95 p-7 shadow-lift backdrop-blur-md lg:border-line lg:bg-surface lg:shadow-soft">
            <p className="eyebrow">Welcome</p>
            <h2 className="mt-1 font-serif text-2xl font-bold text-ink">{t("login_title")}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{t("login_lead")}</p>

            <button
              type="button"
              onClick={() => run("google", auth.signInWithGoogle)}
              disabled={busy !== null}
              className="btn-ghost mt-6 w-full bg-surface"
            >
              {busy === "google" ? <Loader2 size={18} className="animate-spin" /> : <GoogleLogo />}
              {t("login_google")}
            </button>

            <div className="my-5 flex items-center gap-3 text-xs text-muted" aria-hidden="true">
              <span className="h-px flex-1 bg-line" />
              {t("login_or")}
              <span className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={onSubmit} className="space-y-3" noValidate>
              <div>
                <label htmlFor="email" className="label">
                  {t("email")}
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="password" className="label">
                  {t("password")}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  minLength={6}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field"
                />
              </div>

              {message && (
                <p
                  role={message.tone === "error" ? "alert" : "status"}
                  className={`rounded-xl px-3 py-2 text-xs ${
                    message.tone === "error" ? "bg-berry/10 text-berry" : "bg-sage/10 text-sage"
                  }`}
                >
                  {message.text}
                </p>
              )}

              <button
                type="submit"
                disabled={busy !== null || !email || password.length < 6}
                className="btn-primary w-full"
              >
                {busy === "email" && <Loader2 size={16} className="animate-spin" />}
                {mode === "signIn" ? t("signIn") : t("signUp")}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setMode(mode === "signIn" ? "signUp" : "signIn");
                setMessage(null);
              }}
              className="mt-3 w-full cursor-pointer py-2 text-center text-xs text-caramel underline-offset-4 hover:underline"
            >
              {mode === "signIn" ? t("toSignUp") : t("toSignIn")}
            </button>

            <div className="mt-4 border-t border-line pt-4 text-center">
              <button
                type="button"
                onClick={() => run("guest", auth.signInAsGuest)}
                disabled={busy !== null}
                className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full px-4 text-sm text-ink transition hover:bg-sunken"
              >
                {busy === "guest" ? <Loader2 size={16} className="animate-spin" /> : <UserRound size={16} />}
                {t("guest")}
              </button>
              <p className="text-[11px] text-muted">{t("guestNote")}</p>
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-[#F6EDE2]/75 lg:text-muted">{t("privacy")}</p>
          <div className="mt-2 text-center lg:hidden">{credit}</div>
        </main>
      </div>
    </div>
  );
}
