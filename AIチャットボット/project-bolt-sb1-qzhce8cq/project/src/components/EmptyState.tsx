import { MessageCircleQuestion } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Product, ShopStatus } from "@/types";
import { CrowdBadge } from "@/components/CrowdBadge";
import { PicksStrip } from "@/components/PicksStrip";

interface EmptyStateProps {
  onSuggestionClick: (text: string) => void;
  status: ShopStatus | null;
  picks: Product[];
  onReserve: (product: Product | null) => void;
}

export function EmptyState({ onSuggestionClick, status, picks, onReserve }: EmptyStateProps) {
  const { t, dict } = useI18n();

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-10 px-5 py-10">
      <div className="flex flex-col items-center text-center">
        <picture className="block h-20 w-20 overflow-hidden rounded-full shadow-lift ring-4 ring-surface">
          <source srcSet="/images/login-pourover.webp" type="image/webp" />
          <img src="/images/login-pourover.jpg" alt="" width={80} height={80} className="h-full w-full object-cover object-[center_30%]" />
        </picture>
        <p className="eyebrow mt-6">Hidamari Coffee</p>
        <h1 className="mt-2 font-serif text-[28px] font-bold leading-tight tracking-wide text-ink sm:text-[32px]">
          {t("appName")}
          <span className="mt-1 block text-base font-medium text-muted">{t("assistant")}</span>
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">{t("tagline")}</p>
        <div className="mt-4">
          <CrowdBadge status={status} detailed />
        </div>
      </div>

      <PicksStrip picks={picks} onReserve={(p) => onReserve(p)} />

      <section aria-labelledby="faq-title">
        <h2 id="faq-title" className="mb-3 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted">
          <MessageCircleQuestion size={14} aria-hidden="true" />
          {t("suggestionsTitle")}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {dict.suggestions.map((s, i) => (
            <button
              key={s}
              onClick={() => onSuggestionClick(s)}
              className="group flex min-h-[56px] animate-rise cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm text-ink transition hover:border-caramel/50 hover:bg-caramel-soft active:scale-[0.99]"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {s}
              <span className="text-caramel opacity-0 transition group-hover:opacity-100" aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
