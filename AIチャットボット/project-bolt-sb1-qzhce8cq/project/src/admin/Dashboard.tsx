import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  HelpCircle,
  Loader2,
  MessageSquareText,
  Package,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageTitle } from "@/admin/AdminApp";
import type { Message, Product, Reservation, Settings } from "@/types";

type Jump = (tab: "inventory" | "reservations") => void;

/** AIが答えられなかったとみられる言い回し */
const UNANSWERED = /申し訳|お答えでき|お答えしかね|分かりかね|わかりかね|ご用意がありません|情報がありません|把握しておりません|I'm sorry|I don't have/i;

const todayJst = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

interface Stats {
  usageToday: number;
  settings: Settings | null;
  reservationsToday: Reservation[];
  expiring: Product[];
  lowStock: Product[];
  popular: { text: string; count: number }[];
  unanswered: { question: string; answer: string; at: string }[];
  daily: { day: string; count: number }[];
  conversations7d: number;
}

export function Dashboard({ onJump }: { onJump: Jump }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const today = todayJst();
      const startToday = new Date(`${today}T00:00:00+09:00`);
      const start7 = new Date(startToday.getTime() - 6 * 86400000);
      const tomorrow = new Date(startToday.getTime() + 86400000);

      const [usage, settings, resv, products, msgs, usage7, convs] = await Promise.all([
        supabase.from("cafe_usage").select("id", { count: "exact", head: true }).gte("created_at", startToday.toISOString()),
        supabase.from("cafe_settings").select("*").eq("id", 1).single(),
        supabase
          .from("cafe_reservations")
          .select("*")
          .eq("status", "booked")
          .gte("reserved_at", startToday.toISOString())
          .lt("reserved_at", tomorrow.toISOString())
          .order("reserved_at"),
        supabase.from("cafe_products").select("*").eq("is_active", true),
        supabase
          .from("cafe_messages")
          .select("conversation_id, role, content, created_at")
          .gte("created_at", start7.toISOString())
          .order("created_at")
          .limit(3000),
        supabase.from("cafe_usage").select("created_at").gte("created_at", start7.toISOString()).limit(10000),
        supabase.from("cafe_conversations").select("id", { count: "exact", head: true }).gte("created_at", start7.toISOString()),
      ]);

      const prods = (products.data as Product[]) ?? [];
      const tomorrowStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(tomorrow);
      const messages = (msgs.data as Message[]) ?? [];

      // よくある質問（同じ言い回しをまとめて数える）
      const counter = new Map<string, number>();
      for (const m of messages) {
        if (m.role !== "user") continue;
        const key = m.content.trim().replace(/[？?！!。．\s]+$/u, "").slice(0, 60);
        if (key) counter.set(key, (counter.get(key) ?? 0) + 1);
      }
      const popular = [...counter.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([text, count]) => ({ text, count }));

      // 答えられなかった質問（直前のお客さんの質問と組にする）
      const unanswered: Stats["unanswered"] = [];
      const lastQuestion = new Map<string, string>();
      for (const m of messages) {
        if (m.role === "user") lastQuestion.set(m.conversation_id, m.content);
        else if (UNANSWERED.test(m.content)) {
          unanswered.push({ question: lastQuestion.get(m.conversation_id) ?? "（不明）", answer: m.content, at: m.created_at });
        }
      }

      // 日ごとの利用回数（7日分）
      const daily: Stats["daily"] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start7.getTime() + i * 86400000);
        daily.push({ day: new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" }).format(d), count: 0 });
      }
      for (const u of (usage7.data as { created_at: string }[]) ?? []) {
        const idx = Math.floor((new Date(u.created_at).getTime() - start7.getTime()) / 86400000);
        if (idx >= 0 && idx < 7) daily[idx].count++;
      }

      setStats({
        usageToday: usage.count ?? 0,
        settings: (settings.data as Settings) ?? null,
        reservationsToday: (resv.data as Reservation[]) ?? [],
        expiring: prods
          .filter((p) => p.stock > 0 && p.best_before && p.best_before <= tomorrowStr)
          .sort((a, b) => (a.best_before ?? "").localeCompare(b.best_before ?? "")),
        lowStock: prods.filter((p) => p.stock > 0 && p.stock <= 3 && p.stock < 999),
        popular,
        unanswered: unanswered.reverse().slice(0, 10),
        daily,
        conversations7d: convs.count ?? 0,
      });
    })();
  }, []);

  if (!stats) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-muted" />
      </div>
    );
  }

  const people = stats.reservationsToday.reduce((s, r) => s + r.party_size, 0);
  const max = Math.max(1, ...stats.daily.map((d) => d.count));
  const limit = stats.settings?.daily_total_limit ?? 0;

  return (
    <>
      <PageTitle
        eyebrow="Dashboard"
        title="今日のお店のようす"
        lead="AIへの質問・予約・食品ロスにつながりそうな商品を、ひと目で確認できます。"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={MessageSquareText} label="今日のAI利用" value={`${stats.usageToday}`} unit="回" note={`お店全体の上限 ${limit}回`} />
        <StatCard icon={TrendingUp} label="直近7日の会話" value={`${stats.conversations7d}`} unit="件" />
        <StatCard
          icon={CalendarDays}
          label="今日の予約"
          value={`${stats.reservationsToday.length}`}
          unit="組"
          note={`合計 ${people}名`}
          onClick={() => onJump("reservations")}
        />
        <StatCard
          icon={AlertTriangle}
          label="期限が明日までの商品"
          value={`${stats.expiring.length}`}
          unit="品"
          tone={stats.expiring.length > 0 ? "warn" : undefined}
          onClick={() => onJump("inventory")}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="card p-6 lg:col-span-3">
          <h2 className="font-serif text-base font-bold text-ink">AIの利用回数（直近7日）</h2>
          <ul className="mt-4 space-y-2" aria-label="日ごとの利用回数">
            {stats.daily.map((d) => (
              <li key={d.day} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-3 text-xs">
                <span className="text-muted">{d.day}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                  <span className="block h-full rounded-full bg-caramel" style={{ width: `${(d.count / max) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-ink">{d.count}回</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-6 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-serif text-base font-bold text-ink">
            <Package size={16} className="text-caramel" aria-hidden="true" />
            早めに出したい商品
          </h2>
          {stats.expiring.length === 0 && stats.lowStock.length === 0 ? (
            <p className="mt-4 text-sm text-muted">いまは心配な商品はありません。</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {stats.expiring.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-ink">{p.name}</span>
                  <span className="shrink-0 rounded-full bg-berry/10 px-2 py-0.5 text-[11px] text-berry">
                    {p.best_before === todayJst() ? "本日まで" : "明日まで"}・残り{p.stock}
                  </span>
                </li>
              ))}
              {stats.lowStock
                .filter((p) => !stats.expiring.includes(p))
                .map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-ink">{p.name}</span>
                    <span className="shrink-0 rounded-full bg-caramel-soft px-2 py-0.5 text-[11px] text-caramel">残りわずか・{p.stock}</span>
                  </li>
                ))}
            </ul>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-muted">
            期限が明日までの商品と「早く出したい」に印を付けた商品は、AIとチャット画面の「本日のおすすめ」で自然に紹介されます。
          </p>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="font-serif text-base font-bold text-ink">よく聞かれる質問（直近7日）</h2>
          {stats.popular.length === 0 ? (
            <p className="mt-4 text-sm text-muted">まだ質問がありません。</p>
          ) : (
            <ol className="mt-4 space-y-2.5">
              {stats.popular.map((p, i) => (
                <li key={p.text} className="flex items-start gap-3 text-sm">
                  <span className="w-5 shrink-0 text-right font-serif font-bold tabular-nums text-caramel">{i + 1}</span>
                  <span className="flex-1 text-ink">{p.text}</span>
                  <span className="shrink-0 tabular-nums text-muted">{p.count}回</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card p-6">
          <h2 className="flex items-center gap-2 font-serif text-base font-bold text-ink">
            <HelpCircle size={16} className="text-berry" aria-hidden="true" />
            AIが答えられなかった質問
          </h2>
          <p className="mt-1 text-[11px] text-muted">Difyのナレッジ（資料）に答えを書き足すと、次から答えられるようになります。</p>
          {stats.unanswered.length === 0 ? (
            <p className="mt-4 text-sm text-muted">見つかりませんでした。</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {stats.unanswered.map((u, i) => (
                <li key={i} className="rounded-2xl bg-sunken px-4 py-3">
                  <p className="text-sm text-ink">{u.question}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">→ {u.answer}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  note,
  tone,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  note?: string;
  tone?: "warn";
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`card flex flex-col p-5 text-left ${onClick ? "cursor-pointer transition hover:shadow-lift" : ""}`}
    >
      <span className="flex items-center gap-2 text-xs text-muted">
        <Icon size={15} className={tone === "warn" ? "text-berry" : "text-caramel"} aria-hidden="true" />
        {label}
      </span>
      <span className="mt-3 font-serif text-3xl font-bold tabular-nums text-ink">
        {value}
        <span className="ml-1 text-sm font-medium text-muted">{unit}</span>
      </span>
      {note && <span className="mt-1 text-[11px] text-muted">{note}</span>}
    </Tag>
  );
}
