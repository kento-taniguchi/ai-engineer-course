import { Leaf } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { productName, yen } from "@/hooks/useShop";
import type { Product } from "@/types";

interface PicksStripProps {
  picks: Product[];
  onReserve: (product: Product) => void;
  compact?: boolean;
}

/**
 * 本日のおすすめ（早めに出したい商品）。
 * 押し売りにならないよう「今日が食べ頃」「取り置きできます」という伝え方にしている。
 */
export function PicksStrip({ picks, onReserve, compact = false }: PicksStripProps) {
  const { t, lang, locale } = useI18n();
  if (picks.length === 0) return null;

  return (
    <section aria-labelledby="picks-title" className="w-full">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Today&apos;s Picks</p>
          <h2 id="picks-title" className="font-serif text-lg font-bold text-ink">
            {t("todaysPick")}
          </h2>
        </div>
        {!compact && (
          <p className="hidden items-center gap-1 text-xs text-muted sm:flex">
            <Leaf size={13} className="text-sage" aria-hidden="true" />
            {t("pickNote")}
          </p>
        )}
      </div>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {picks.map((p, i) => {
          const onSale = p.sale_price != null && p.sale_price < p.price;
          return (
            <li
              key={p.id}
              className="card flex w-56 shrink-0 snap-start animate-rise flex-col p-4"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-serif text-[15px] font-bold leading-snug text-ink">{productName(p, lang)}</h3>
                <span className="shrink-0 rounded-full bg-caramel-soft px-2 py-0.5 text-[11px] font-medium text-caramel">
                  {t("left", { n: p.stock })}
                </span>
              </div>
              {p.promo_text && lang === "ja" && <p className="mt-1 text-xs text-muted">{p.promo_text}</p>}
              <div className="mt-auto flex items-end justify-between pt-3">
                <p className="tabular-nums">
                  {onSale && <span className="mr-1.5 text-xs text-muted line-through">{yen(p.price, locale)}</span>}
                  <span className={`text-base font-bold ${onSale ? "text-berry" : "text-ink"}`}>
                    {yen(onSale ? p.sale_price! : p.price, locale)}
                  </span>
                </p>
                <button
                  onClick={() => onReserve(p)}
                  className="min-h-[36px] cursor-pointer rounded-full px-3 text-xs font-medium text-caramel ring-1 ring-caramel/40 transition hover:bg-caramel-soft"
                >
                  {t("reserveThis")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
