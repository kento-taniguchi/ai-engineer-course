import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageTitle } from "@/admin/AdminApp";
import type { CrowdLevel, Settings, ShopStatus } from "@/types";

const LEVELS: { value: Exclude<CrowdLevel, "closed">; label: string; hint: string; bars: number; tone: string }[] = [
  { value: "empty", label: "空いています", hint: "すぐにご案内できます", bars: 1, tone: "text-sage" },
  { value: "normal", label: "ふつう", hint: "席に余裕があります", bars: 2, tone: "text-sage" },
  { value: "busy", label: "混み合っています", hint: "少しお待ちいただくかも", bars: 3, tone: "text-caramel" },
  { value: "full", label: "満席です", hint: "お待ちいただきます", bars: 4, tone: "text-berry" },
];

export function CrowdPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<ShopStatus | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    const [s, st] = await Promise.all([supabase.from("cafe_settings").select("*").eq("id", 1).single(), supabase.rpc("cafe_status")]);
    if (s.data) {
      setSettings(s.data as Settings);
      setNote((s.data as Settings).crowd_note);
    }
    if (st.data) setStatus(st.data as ShopStatus);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (level: CrowdLevel) => {
    setSaving(level);
    await supabase
      .from("cafe_settings")
      .update({ crowd_level: level, crowd_note: note, crowd_updated_at: new Date().toISOString() })
      .eq("id", 1);
    await load();
    setSaving(null);
  };

  if (!settings) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-muted" />
      </div>
    );
  }

  const updated = settings.crowd_updated_at
    ? new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" }).format(
        new Date(settings.crowd_updated_at),
      )
    : "まだ更新していません";

  return (
    <>
      <PageTitle
        eyebrow="Crowd"
        title="店内の混雑状況"
        lead="ボタンを押すと、お客さんの画面とAIの回答にすぐ反映されます。3時間以上更新がないときは、予約の入り具合から自動で目安を表示します。"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LEVELS.map((l) => {
          const current = settings.crowd_level === l.value;
          return (
            <button
              key={l.value}
              onClick={() => save(l.value)}
              aria-pressed={current}
              className={`card flex min-h-[132px] cursor-pointer flex-col items-start p-5 text-left transition hover:shadow-lift ${
                current ? "ring-2 ring-caramel" : ""
              }`}
            >
              <span className={`flex gap-1 ${l.tone}`} aria-hidden="true">
                {[1, 2, 3, 4].map((i) => (
                  <span key={i} className={`h-5 w-1.5 rounded-full ${i <= l.bars ? "bg-current" : "bg-line"}`} />
                ))}
              </span>
              <span className="mt-4 font-serif text-lg font-bold text-ink">{l.label}</span>
              <span className="text-xs text-muted">{l.hint}</span>
              <span className="mt-auto flex h-5 items-center pt-2 text-xs text-caramel">
                {saving === l.value ? <Loader2 size={14} className="animate-spin" /> : current && <><Check size={14} className="mr-1" />表示中</>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="card mt-6 p-6">
        <label htmlFor="crowd-note" className="label">
          お客さんへのひとこと（任意・AIも参考にします）
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="crowd-note"
            className="field flex-1"
            value={note}
            maxLength={80}
            placeholder="例：テラス席は空いています／14時まで貸切です"
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="btn-primary" onClick={() => save(settings.crowd_level)} disabled={note === settings.crowd_note}>
            ひとことを保存
          </button>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">最後に更新</dt>
            <dd className="text-ink">{updated}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">今の時間帯の予約</dt>
            <dd className="tabular-nums text-ink">
              {status?.reserved_now ?? 0}名 / 全{settings.seats}席
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">営業</dt>
            <dd className="text-ink">{status?.is_open ? "営業中" : "営業時間外（お客さんには「営業時間外」と表示）"}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}
