import { useEffect, useState, type FormEvent } from "react";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageTitle } from "@/admin/AdminApp";
import type { Settings } from "@/types";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const hhmm = (t: string) => t.slice(0, 5);

export function SettingsPanel() {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("cafe_settings")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }) => data && setS(data as Settings));
  }, []);

  if (!s) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-muted" />
      </div>
    );
  }

  const num = (key: keyof Settings) => ({
    value: String(s[key] ?? ""),
    inputMode: "numeric" as const,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [key]: Number(e.target.value.replace(/\D/g, "")) || 0 }),
    className: "field tabular-nums",
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    const { error: err } = await supabase
      .from("cafe_settings")
      .update({
        daily_user_limit: s.daily_user_limit,
        daily_total_limit: s.daily_total_limit,
        seats: Math.max(1, s.seats),
        reservable_seats: Math.min(s.reservable_seats, s.seats),
        max_party: Math.max(1, s.max_party),
        open_time: hhmm(s.open_time),
        close_time: hhmm(s.close_time),
        last_reservation_time: hhmm(s.last_reservation_time),
        stay_minutes: Math.min(480, Math.max(15, s.stay_minutes)),
        closed_weekdays: s.closed_weekdays,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setSaving(false);
    if (err) setError(`保存に失敗しました：${err.message}`);
    else setSaved(true);
  };

  return (
    <>
      <PageTitle eyebrow="Settings" title="設定" lead="AIの利用回数の上限、席数、予約の受付時間などを決めます。" />

      <form onSubmit={submit} className="space-y-6">
        <section className="card p-6">
          <h2 className="font-serif text-base font-bold text-ink">AIの利用回数（1日あたり）</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            使いすぎによるDifyの利用料の増加や、いたずらを防ぎます。日本時間の0時にリセットされます。店主のアカウントは回数制限なしです。
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ul">お客さん1人あたり（回）</label>
              <input id="ul" {...num("daily_user_limit")} />
            </div>
            <div>
              <label className="label" htmlFor="tl">お店全体（回）</label>
              <input id="tl" {...num("daily_total_limit")} />
              <p className="mt-1 text-[11px] text-muted">ゲストを作り直して制限をすり抜ける使い方への備えです。</p>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-serif text-base font-bold text-ink">席と予約</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor="seats">店内の席数</label>
              <input id="seats" {...num("seats")} />
            </div>
            <div>
              <label className="label" htmlFor="rs">予約で使える席数</label>
              <input id="rs" {...num("reservable_seats")} />
              <p className="mt-1 text-[11px] text-muted">残りは予約なしのお客さん用</p>
            </div>
            <div>
              <label className="label" htmlFor="mp">1組の最大人数</label>
              <input id="mp" {...num("max_party")} />
            </div>
            <div>
              <label className="label" htmlFor="st">1組の滞在時間（分）</label>
              <input id="st" {...num("stay_minutes")} />
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-serif text-base font-bold text-ink">営業時間と定休日</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="ot">開店</label>
              <input id="ot" type="time" className="field" value={hhmm(s.open_time)} onChange={(e) => setS({ ...s, open_time: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="ct">閉店</label>
              <input id="ct" type="time" className="field" value={hhmm(s.close_time)} onChange={(e) => setS({ ...s, close_time: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="lr">予約の最終受付</label>
              <input id="lr" type="time" className="field" value={hhmm(s.last_reservation_time)} onChange={(e) => setS({ ...s, last_reservation_time: e.target.value })} />
            </div>
          </div>
          <fieldset className="mt-4">
            <legend className="label">定休日</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((w, i) => {
                const on = s.closed_weekdays.includes(i);
                return (
                  <button
                    type="button"
                    key={w}
                    aria-pressed={on}
                    onClick={() =>
                      setS({ ...s, closed_weekdays: on ? s.closed_weekdays.filter((d) => d !== i) : [...s.closed_weekdays, i].sort() })
                    }
                    className={`h-11 w-11 cursor-pointer rounded-full text-sm transition ${on ? "bg-berry text-white dark:text-roast" : "bg-sunken text-ink hover:bg-line"}`}
                  >
                    {w}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              ※ Difyのナレッジ（資料）に書いてある営業時間・定休日とそろえてください。AIは両方を参考にします。
            </p>
          </fieldset>
        </section>

        {error && (
          <p role="alert" className="rounded-xl bg-berry/10 px-4 py-3 text-sm text-berry">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            設定を保存
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-sage" role="status">
              <Check size={16} />
              保存しました
            </span>
          )}
        </div>
      </form>
    </>
  );
}
