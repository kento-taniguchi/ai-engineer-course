import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, Loader2, Minus, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useI18n, type DictKey } from "@/lib/i18n";
import { productName, yen } from "@/hooks/useShop";
import type { Product, Reservation, ShopStatus } from "@/types";

interface ReservationDialogProps {
  open: boolean;
  onClose: () => void;
  status: ShopStatus | null;
  preselect: Product | null;
  onBooked: () => void;
}

const ERROR_CODES = [
  "full",
  "out_of_stock",
  "closed_day",
  "out_of_hours",
  "out_of_range",
  "party_size",
  "too_many",
  "name_required",
] as const;

/** 日本時間の日付（YYYY-MM-DD） */
const jstDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function ReservationDialog({ open, onClose, status, preselect, onBooked }: ReservationDialogProps) {
  const { t, lang, locale } = useI18n();
  const [tab, setTab] = useState<"new" | "mine">("new");
  const [date, setDate] = useState(() => jstDate(new Date()));
  const [slots, setSlots] = useState<{ slot: string; remaining: number }[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [party, setParty] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [mine, setMine] = useState<Reservation[]>([]);

  const maxParty = status?.max_party ?? 6;

  // 今日から14日分の日付ボタン
  const days = useMemo(() => {
    const list: { value: string; label: string; dow: number }[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getTime() + i * 86400000);
      const value = jstDate(d);
      const dt = new Date(`${value}T12:00:00+09:00`);
      list.push({
        value,
        dow: dt.getUTCDay(),
        label: new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" }).format(dt),
      });
    }
    return list;
  }, [locale]);

  const loadMine = useCallback(async () => {
    const { data } = await supabase
      .from("cafe_reservations")
      .select("*, cafe_reservation_items(*)")
      .eq("status", "booked")
      .gte("reserved_at", new Date(Date.now() - 2 * 3600000).toISOString())
      .order("reserved_at");
    setMine((data as Reservation[]) ?? []);
  }, []);

  // 開いたときに初期化
  useEffect(() => {
    if (!open) return;
    setDone(false);
    setError(null);
    setTab("new");
    setQty(preselect ? { [preselect.id]: 1 } : {});
    supabase
      .from("cafe_products")
      .select("*")
      .eq("is_active", true)
      .gt("stock", 0)
      .in("category", ["food", "sweets", "beans", "goods"])
      .order("push", { ascending: false })
      .order("best_before", { ascending: true, nullsFirst: false })
      .then(({ data }) => setProducts((data as Product[]) ?? []));
    loadMine();
  }, [open, preselect, loadMine]);

  // 開いたとき、空きのあるいちばん近い日を選んでおく（夜に開くと今日はもう受付終了のため）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      for (const d of days) {
        const { data } = await supabase.rpc("cafe_slot_availability", { p_date: d.value });
        if (cancelled) return;
        if ((data as { remaining: number }[] | null)?.some((s) => s.remaining > 0)) {
          setDate(d.value);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, days]);

  // 日付を変えたら空き状況を読み直す
  useEffect(() => {
    if (!open) return;
    setSlots(null);
    setSlot(null);
    supabase.rpc("cafe_slot_availability", { p_date: date }).then(({ data }) => {
      setSlots((data as { slot: string; remaining: number }[]) ?? []);
    });
  }, [open, date, done]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const priceOf = (p: Product) => (p.sale_price != null && p.sale_price < p.price ? p.sale_price : p.price);
  const total = products.reduce((sum, p) => sum + (qty[p.id] ?? 0) * priceOf(p), 0);

  const toMessage = (raw: string) => {
    const code = ERROR_CODES.find((c) => raw.includes(c));
    return code ? t(`err_${code}` as DictKey) : t("err_generic");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!slot) return;
    setBusy(true);
    setError(null);
    const items = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([product_id, q]) => ({ product_id, qty: q }));
    const { error: rpcErr } = await supabase.rpc("cafe_create_reservation", {
      p_name: name,
      p_phone: phone,
      p_party: party,
      p_at: `${date}T${slot}:00+09:00`,
      p_note: note,
      p_items: items,
    });
    setBusy(false);
    if (rpcErr) {
      setError(toMessage(rpcErr.message));
      return;
    }
    setDone(true);
    setQty({});
    loadMine();
    onBooked();
  };

  const cancelReservation = async (id: string) => {
    if (!window.confirm(t("r_cancelConfirm"))) return;
    const { error: rpcErr } = await supabase.rpc("cafe_set_reservation_status", { p_id: id, p_status: "cancelled" });
    if (rpcErr) setError(t("err_generic"));
    loadMine();
    onBooked();
  };

  const fmtDateTime = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tokyo",
    }).format(new Date(iso));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="reserve-title">
      <div className="absolute inset-0 bg-roast/40 backdrop-blur-sm dark:bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg animate-rise flex-col overflow-hidden rounded-t-3xl border border-line bg-canvas shadow-lift sm:rounded-3xl">
        <header className="flex items-start justify-between gap-3 border-b border-line px-6 pb-4 pt-5">
          <div>
            <p className="eyebrow">Reservation</p>
            <h2 id="reserve-title" className="font-serif text-xl font-bold text-ink">
              {t("r_title")}
            </h2>
            <p className="mt-0.5 text-xs text-muted">{t("r_lead")}</p>
          </div>
          <button onClick={onClose} className="icon-btn -mr-2" aria-label={t("close")}>
            <X size={18} />
          </button>
        </header>

        <div className="flex gap-1 px-6 pt-3" role="tablist">
          {(["new", "mine"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`min-h-[40px] cursor-pointer rounded-full px-4 text-sm transition ${
                tab === k ? "bg-roast text-on-roast" : "text-muted hover:bg-sunken"
              }`}
            >
              {k === "new" ? t("reserve") : `${t("r_mine")}${mine.length ? `（${mine.length}）` : ""}`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "mine" ? (
            mine.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">{t("r_none")}</p>
            ) : (
              <ul className="space-y-3">
                {mine.map((r) => (
                  <li key={r.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-serif text-base font-bold text-ink">{fmtDateTime(r.reserved_at)}</p>
                        <p className="text-xs text-muted">
                          {t("r_people", { n: r.party_size })} · {r.name}
                        </p>
                        {r.cafe_reservation_items && r.cafe_reservation_items.length > 0 && (
                          <p className="mt-1 text-xs text-caramel">
                            {r.cafe_reservation_items.map((i) => `${i.product_name}×${i.qty}`).join("、")}
                          </p>
                        )}
                      </div>
                      <button onClick={() => cancelReservation(r.id)} className="btn-ghost min-h-[36px] px-3 text-xs text-berry">
                        {t("r_cancel")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : done ? (
            <div className="flex flex-col items-center py-10 text-center">
              <CheckCircle2 size={44} className="text-sage" aria-hidden="true" />
              <p className="mt-4 font-serif text-lg font-bold text-ink" role="status">
                {t("r_done")}
              </p>
              <div className="mt-6 flex gap-2">
                <button onClick={() => setTab("mine")} className="btn-ghost">
                  {t("r_mine")}
                </button>
                <button onClick={onClose} className="btn-primary">
                  {t("close")}
                </button>
              </div>
            </div>
          ) : (
            <form id="reserve-form" onSubmit={submit} className="space-y-6">
              {/* 日付 */}
              <fieldset className="min-w-0">
                <legend className="label flex items-center gap-1.5">
                  <CalendarDays size={13} aria-hidden="true" />
                  {t("r_date")}
                </legend>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
                  {days.map((d) => {
                    const closed = status?.closed_weekdays?.includes(d.dow);
                    return (
                      <button
                        type="button"
                        key={d.value}
                        disabled={closed}
                        onClick={() => setDate(d.value)}
                        aria-pressed={date === d.value}
                        className={`min-h-[44px] shrink-0 cursor-pointer rounded-xl px-3 text-xs transition disabled:cursor-not-allowed disabled:opacity-35 ${
                          date === d.value ? "bg-roast text-on-roast" : "bg-surface text-ink ring-1 ring-line hover:bg-sunken"
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="date"
                  value={date}
                  min={days[0].value}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="field mt-2 max-w-[200px]"
                  aria-label={t("r_date")}
                />
              </fieldset>

              {/* 時間 */}
              <fieldset className="min-w-0">
                <legend className="label">{t("r_time")}</legend>
                {slots === null ? (
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-[52px] animate-pulse rounded-xl bg-sunken" />
                    ))}
                  </div>
                ) : slots.length === 0 ? (
                  <p className="rounded-xl bg-sunken px-4 py-3 text-xs text-muted">{t("r_noSlots")}</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((s) => {
                      const full = s.remaining < party;
                      return (
                        <button
                          type="button"
                          key={s.slot}
                          disabled={full}
                          onClick={() => setSlot(s.slot)}
                          aria-pressed={slot === s.slot}
                          className={`flex min-h-[52px] cursor-pointer flex-col items-center justify-center rounded-xl text-sm tabular-nums transition disabled:cursor-not-allowed disabled:opacity-35 ${
                            slot === s.slot ? "bg-roast text-on-roast" : "bg-surface text-ink ring-1 ring-line hover:bg-sunken"
                          }`}
                        >
                          {s.slot}
                          <span className={`text-[10px] ${slot === s.slot ? "text-on-roast/80" : "text-muted"}`}>
                            {t("r_seats", { n: s.remaining })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </fieldset>

              {/* 人数 */}
              <div>
                <span className="label" id="party-label">
                  {t("r_party")}
                </span>
                <div className="inline-flex items-center gap-1 rounded-full bg-surface p-1 ring-1 ring-line" aria-labelledby="party-label">
                  <button type="button" className="icon-btn" onClick={() => setParty(Math.max(1, party - 1))} aria-label="-1">
                    <Minus size={16} />
                  </button>
                  <span className="w-14 text-center text-sm font-medium tabular-nums text-ink" aria-live="polite">
                    {t("r_people", { n: party })}
                  </span>
                  <button type="button" className="icon-btn" onClick={() => setParty(Math.min(maxParty, party + 1))} aria-label="+1">
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* お名前など */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="r-name" className="label">
                    {t("r_name")} <span className="text-berry">*</span>
                  </label>
                  <input id="r-name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="field" />
                </div>
                <div>
                  <label htmlFor="r-phone" className="label">
                    {t("r_phone")}
                  </label>
                  <input id="r-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="field" />
                </div>
              </div>
              <div>
                <label htmlFor="r-note" className="label">
                  {t("r_note")}
                </label>
                <textarea id="r-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="field resize-none" />
              </div>

              {/* 取り置き */}
              {products.length > 0 && (
                <fieldset className="min-w-0">
                  <legend className="label">{t("r_items")}</legend>
                  <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                    {products.map((p) => {
                      const q = qty[p.id] ?? 0;
                      const onSale = priceOf(p) < p.price;
                      return (
                        <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-ink">
                              {productName(p, lang)}
                              {p.push && <span className="ml-1.5 rounded-full bg-caramel-soft px-1.5 py-0.5 text-[10px] text-caramel">{t("todaysPick")}</span>}
                            </p>
                            <p className="text-xs tabular-nums text-muted">
                              <span className={onSale ? "font-medium text-berry" : ""}>{yen(priceOf(p), locale)}</span> · {t("left", { n: p.stock })}
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button type="button" className="icon-btn h-9 w-9" disabled={q === 0} onClick={() => setQty({ ...qty, [p.id]: q - 1 })} aria-label={`${productName(p, lang)} -1`}>
                              <Minus size={14} />
                            </button>
                            <span className="w-6 text-center text-sm tabular-nums text-ink">{q}</span>
                            <button type="button" className="icon-btn h-9 w-9" disabled={q >= p.stock} onClick={() => setQty({ ...qty, [p.id]: q + 1 })} aria-label={`${productName(p, lang)} +1`}>
                              <Plus size={14} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {total > 0 && (
                    <p className="mt-2 text-right text-sm text-ink">
                      {t("r_total")}：<span className="font-bold tabular-nums">{yen(total, locale)}</span>
                    </p>
                  )}
                </fieldset>
              )}

              {error && (
                <p role="alert" className="rounded-xl bg-berry/10 px-4 py-3 text-sm text-berry">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>

        {tab === "new" && !done && (
          <footer className="border-t border-line bg-surface/60 px-6 py-4">
            <button type="submit" form="reserve-form" disabled={busy || !slot || !name.trim()} className="btn-primary w-full">
              {busy && <Loader2 size={16} className="animate-spin" />}
              {t("r_submit")}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
