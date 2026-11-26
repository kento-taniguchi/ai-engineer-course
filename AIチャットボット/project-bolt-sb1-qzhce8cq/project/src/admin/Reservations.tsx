import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Phone, StickyNote } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageTitle } from "@/admin/AdminApp";
import type { Reservation, ReservationStatus } from "@/types";

const STATUS: Record<ReservationStatus, { label: string; tone: string }> = {
  booked: { label: "予約中", tone: "bg-caramel-soft text-caramel" },
  visited: { label: "来店済み", tone: "bg-sage/15 text-sage" },
  no_show: { label: "無断キャンセル", tone: "bg-berry/10 text-berry" },
  cancelled: { label: "取り消し", tone: "bg-sunken text-muted" },
};

const fmtDay = (d: string) =>
  new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" }).format(
    new Date(`${d}T12:00:00+09:00`),
  );
const shiftDay = (d: string, n: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date(new Date(`${d}T12:00:00+09:00`).getTime() + n * 86400000));
const todayJst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());

export function Reservations() {
  const [day, setDay] = useState(todayJst);
  const [list, setList] = useState<Reservation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setList(null);
    const start = new Date(`${day}T00:00:00+09:00`);
    const end = new Date(start.getTime() + 86400000);
    const { data, error: err } = await supabase
      .from("cafe_reservations")
      .select("*, cafe_reservation_items(*)")
      .gte("reserved_at", start.toISOString())
      .lt("reserved_at", end.toISOString())
      .order("reserved_at");
    if (err) setError("予約の読み込みに失敗しました");
    setList((data as Reservation[]) ?? []);
  }, [day]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: ReservationStatus) => {
    const { error: err } = await supabase.rpc("cafe_set_reservation_status", { p_id: id, p_status: status });
    if (err) setError(`変更に失敗しました：${err.message}`);
    load();
  };

  const active = list?.filter((r) => r.status === "booked" || r.status === "visited") ?? [];
  const people = active.reduce((s, r) => s + r.party_size, 0);
  const items = active.flatMap((r) => r.cafe_reservation_items ?? []);

  return (
    <>
      <PageTitle
        eyebrow="Reservations"
        title="予約"
        lead="取り消し・無断キャンセルにすると、取り置きしていた商品は自動で在庫に戻ります。"
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button className="icon-btn ring-1 ring-line" onClick={() => setDay(shiftDay(day, -1))} aria-label="前の日">
          <ChevronLeft size={18} />
        </button>
        <input type="date" className="field w-auto" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="日付" />
        <button className="icon-btn ring-1 ring-line" onClick={() => setDay(shiftDay(day, 1))} aria-label="次の日">
          <ChevronRight size={18} />
        </button>
        {day !== todayJst() && (
          <button className="btn-ghost min-h-[40px]" onClick={() => setDay(todayJst())}>
            今日
          </button>
        )}
        <p className="ml-auto text-sm text-muted">
          <span className="font-serif text-ink">{fmtDay(day)}</span> · {active.length}組・{people}名
          {items.length > 0 && <>・取り置き{items.reduce((s, i) => s + i.qty, 0)}点</>}
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-berry/10 px-4 py-3 text-sm text-berry">
          {error}
        </p>
      )}

      {list === null ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-muted" />
        </div>
      ) : list.length === 0 ? (
        <p className="card px-6 py-12 text-center text-sm text-muted">この日の予約はありません。</p>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => {
            const time = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(r.reserved_at));
            return (
              <li key={r.id} className={`card flex flex-wrap items-start gap-4 p-5 ${r.status === "cancelled" ? "opacity-60" : ""}`}>
                <div className="w-16 shrink-0 font-serif text-2xl font-bold tabular-nums text-ink">{time}</div>
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-medium text-ink">{r.name} 様</p>
                    <span className="text-sm text-muted">{r.party_size}名</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>
                  </div>
                  {r.phone && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <Phone size={12} aria-hidden="true" />
                      <a href={`tel:${r.phone}`} className="hover:text-ink">{r.phone}</a>
                    </p>
                  )}
                  {r.note && (
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-muted">
                      <StickyNote size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {r.note}
                    </p>
                  )}
                  {r.cafe_reservation_items && r.cafe_reservation_items.length > 0 && (
                    <p className="mt-2 inline-block rounded-xl bg-caramel-soft px-3 py-1.5 text-xs text-caramel">
                      取り置き：{r.cafe_reservation_items.map((i) => `${i.product_name}×${i.qty}`).join("、")}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["visited", "no_show", "cancelled", "booked"] as ReservationStatus[])
                    .filter((s) => s !== r.status)
                    .map((s) => (
                      <button key={s} onClick={() => setStatus(r.id, s)} className="btn-ghost min-h-[36px] px-3 text-xs">
                        {s === "booked" ? "予約中に戻す" : STATUS[s].label}
                      </button>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
