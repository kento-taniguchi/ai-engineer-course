"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Booking, TargetRef, Todo } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { bucketTodos, STATUS_LABEL } from "@/lib/todoEngine";
import { buildTodayCategories, todoLevel, type TodayCategoryGroup, type TodayGroup } from "@/lib/todayGroups";
import type { TaskCategory } from "@/lib/types";
import { TaskDialog } from "@/components/TaskDialog";
import { ChangeNoticeCard } from "@/components/GoogleParts";
import { dateKey, formatDateLong, formatRange, formatTime, formatDateTime, toISO } from "@/lib/time";
import { setBookingTarget } from "@/lib/operations";
import { TodoCard } from "@/components/TodoCard";
import { PlaceDialog, ScheduleTimeline } from "@/components/Schedule";
import { DemoBar, Empty, KindBadge } from "@/components/ui";
import { todoTitle } from "@/lib/selectors";

export default function TodayPage() {
  const { data, now } = useApp();
  const today = dateKey(now);
  const buckets = useMemo(() => bucketTodos(data, now), [data, now]);
  const cats = useMemo(() => buildTodayCategories(data, now), [data, now]);
  const groups = cats.find((c) => c.key === "people")!.groups;
  const [openKeys, setOpenKeys] = useOpenGroups();
  const [closedCats, setClosedCats] = useOpenGroups("baseplus-today-closed-cats");
  const allOpen = cats.flatMap((c) => c.open);
  const overdueCount = allOpen.filter((t) => todoLevel(t, data, now).label.startsWith("期限超過")).length;
  const todayDueCount = allOpen.filter((t) => todoLevel(t, data, now).label === "今日まで").length;
  const [placing, setPlacing] = useState<Todo | null>(null);
  const [adding, setAdding] = useState<TaskCategory | null>(null);
  const unresolved = data.bookings.filter((b) => b.status === "scheduled" && !b.target && new Date(b.end) > new Date(now.getTime() - 86400000 * 7));
  const notices = data.bookings.filter((b) => b.changeNotice);
  const reviewCount = buckets.needsReview.length + unresolved.length + notices.length;
  const offset = data.settings.clockOffsetMin;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="small muted">今日の仕事</p>
          <h1>{formatDateLong(today)}</h1>
          <p className="sub">
            現在 {formatTime(toISO(now))}（日本時間）
            {offset !== 0 && (
              <span className="badge badge-demo" style={{ marginLeft: 8 }}>
                デモ時刻：{offset > 0 ? "+" : ""}
                {Math.round((offset / 60) * 10) / 10}時間ずらし中
              </span>
            )}
          </p>
        </div>
        <div className="row small">
          <span className="badge badge-danger">‼ 期限超過 {overdueCount}件</span>
          <span className="badge badge-warning">! 今日まで {todayDueCount}件</span>
          <span className="badge badge-info">未完了 {allOpen.length}件</span>
          {reviewCount > 0 && <span className="badge badge-warning">要確認 {reviewCount}</span>}
        </div>
      </div>

      <DemoBar>
        予約・SNS・プチセミナー・登録した仕事からToDoを作っています。外部への送信・登録は行いません。
        <Link href="/settings">設定でデモ時刻を変更</Link>
      </DemoBar>

      <div className="today-grid">
        <div>
          {reviewCount > 0 && (
            <section className="section" aria-labelledby="h-review">
              <div className="section-head">
                <h2 id="h-review">
                  <span aria-hidden="true">?</span> 確認が必要 <span className="count">{reviewCount}</span>
                </h2>
              </div>
              <div className="stack">
                {notices.map((b) => (
                  <ChangeNoticeCard key={`n-${b.id}`} booking={b} />
                ))}
                {unresolved.map((b) => (
                  <UnresolvedBooking key={b.id} booking={b} />
                ))}
                {buckets.needsReview.map((t) => (
                  <TodoCard key={t.id} todo={t} onPlace={setPlacing} draggable />
                ))}
              </div>
            </section>
          )}

          <section className="section" aria-labelledby="h-today">
            <div className="section-head">
              <h2 id="h-today">
                <span aria-hidden="true">●</span> 今日やること <span className="count">{allOpen.length}</span>
              </h2>
              <div className="row">
                <button className="btn btn-sm btn-primary" onClick={() => setAdding("other")}>
                  ＋ 仕事を追加
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setClosedCats(new Set());
                    setOpenKeys(new Set(groups.map((g) => g.key)));
                  }}
                >
                  すべて開く
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setClosedCats(new Set(cats.map((c) => c.key)));
                    setOpenKeys(new Set());
                  }}
                >
                  すべて閉じる
                </button>
              </div>
            </div>
            <p className="xs muted" style={{ marginBottom: 8 }}>
              分類や選手・チーム名を押すと開閉します。<span className="hide-mobile">開いたToDoはドラッグしてスケジュールに配置できます。</span>
              <Link href="/tasks" style={{ marginLeft: 8 }}>
                登録した仕事・繰り返しの一覧
              </Link>
            </p>
            <div className="stack-2">
              {cats.map((c) => (
                <CategorySection
                  key={c.key}
                  cat={c}
                  expanded={!closedCats.has(c.key)}
                  onToggle={() =>
                    setClosedCats((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.key)) next.delete(c.key);
                      else next.add(c.key);
                      return next;
                    })
                  }
                  onAdd={c.key === "people" ? undefined : () => setAdding(c.key as TaskCategory)}
                >
                  {c.key === "people" ? (
                    c.groups.length === 0 ? (
                      <Empty>今日の仕事はありません</Empty>
                    ) : (
                      c.groups.map((g) => (
                        <TodayGroupRow
                          key={g.key}
                          group={g}
                          expanded={openKeys.has(g.key)}
                          onToggle={() =>
                            setOpenKeys((prev) => {
                              const next = new Set(prev);
                              if (next.has(g.key)) next.delete(g.key);
                              else next.add(g.key);
                              return next;
                            })
                          }
                          onPlace={setPlacing}
                        />
                      ))
                    )
                  ) : (
                    <>
                      {c.open.length === 0 && <Empty>今日の仕事はありません</Empty>}
                      {c.open.map((t) => (
                        <TodoCard key={t.id} todo={t} onPlace={setPlacing} draggable level={todoLevel(t, data, now)} />
                      ))}
                      {c.closed.length > 0 && <ClosedList todos={c.closed} />}
                    </>
                  )}
                </CategorySection>
              ))}
            </div>
          </section>

          {buckets.later.length > 0 && (
            <section className="section" aria-labelledby="h-later">
              <div className="section-head">
                <h2 id="h-later" style={{ fontSize: 16 }}>
                  このあと表示される仕事 <span className="count">{buckets.later.length}</span>
                </h2>
              </div>
              <ul className="list small">
                {buckets.later.map(({ todo, from }) => (
                  <li key={todo.id} style={{ padding: "8px 16px" }}>
                    <span className="badge badge-off">{formatTime(from)}〜表示</span> {todoTitle(data, todo)}
                    <span className="muted">
                      {" "}
                      （{data.bookings.find((b) => b.id === todo.bookingId)?.title.replace("【BASE-PLUS】", "") ?? ""}）
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

        </div>

        <aside aria-labelledby="h-schedule">
          <div className="section-head">
            <h2 id="h-schedule">今日のスケジュール</h2>
          </div>
          <ScheduleTimeline day={today} onPlace={setPlacing} />
        </aside>
      </div>

      {placing && <PlaceDialog todo={placing} day={today} onClose={() => setPlacing(null)} />}
      {adding && <TaskDialog defaultCategory={adding} onClose={() => setAdding(null)} />}
    </>
  );
}

function CategorySection({
  cat,
  expanded,
  onToggle,
  onAdd,
  children,
}: {
  cat: TodayCategoryGroup;
  expanded: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  const id = `cat-${cat.key}`;
  return (
    <section className={`cat cat-${cat.level}`} aria-labelledby={`${id}-h`}>
      <div className="cat-head-row">
        <button type="button" className="cat-head" aria-expanded={expanded} aria-controls={id} onClick={onToggle} id={`${id}-h`}>
          <span className="group-chev" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
          <span className="cat-name">{cat.name}</span>
          <span className="group-side">
            {cat.level !== "normal" && (
              <span className={`badge badge-${cat.level}`}>
                <span aria-hidden="true">{cat.level === "danger" ? "‼" : "!"}</span>
                {cat.label}
              </span>
            )}
            <span className={`badge ${cat.openCount ? "badge-off" : "badge-ok"}`}>{cat.openCount ? `未完了 ${cat.openCount}件` : "✓ なし"}</span>
          </span>
        </button>
        {onAdd && (
          <button type="button" className="btn btn-sm btn-ghost cat-add" onClick={onAdd} aria-label={`${cat.name}に仕事を追加`}>
            ＋ 追加
          </button>
        )}
      </div>
      {expanded && (
        <div className="cat-body stack" id={id}>
          {children}
        </div>
      )}
    </section>
  );
}

function ClosedList({ todos }: { todos: Todo[] }) {
  const { data } = useApp();
  return (
    <details className="group-closed">
      <summary className="small">完了・対象外にした業務（{todos.length}件）</summary>
      <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 20 }}>
        {todos.map((t) => (
          <li key={t.id}>
            <span aria-hidden="true">{t.status === "done" ? "✓" : "－"}</span> {todoTitle(data, t)}：{STATUS_LABEL[t.status]}
            <span className="muted">{t.statusChangedAt && `（${formatDateTime(t.statusChangedAt)}${t.statusReason ? `・${t.statusReason}` : ""}）`}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function UnresolvedBooking({ booking }: { booking: Booking }) {
  const { data, update } = useApp();
  const [value, setValue] = useState("");
  return (
    <article className="todo is-review">
      <div className="todo-body">
        <div className="row">
          <span className="status status-todo">
            <span aria-hidden="true">?</span>対象者未確定
          </span>
          <KindBadge kind={booking.kind} />
        </div>
        <div className="todo-title" style={{ marginTop: 4 }}>
          予定「{booking.title}」の対象者を選んでください
        </div>
        <div className="todo-meta">
          {formatRange(booking.start, booking.end)} ・ 予定名から対象者を特定できなかったため、自動では紐づけていません。
        </div>
        <div className="todo-actions">
          <label className="sr-only" htmlFor={`sel-${booking.id}`}>
            対象者
          </label>
          <select id={`sel-${booking.id}`} value={value} onChange={(e) => setValue(e.target.value)} style={{ maxWidth: 280 }}>
            <option value="">選択してください</option>
            <optgroup label="選手">
              {data.players.map((p) => (
                <option key={p.id} value={`player:${p.id}`}>
                  {p.name}（{p.grade}）
                </option>
              ))}
            </optgroup>
            <optgroup label="チーム">
              {data.teams.map((t) => (
                <option key={t.id} value={`team:${t.id}`}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          </select>
          <button
            className="btn btn-sm btn-primary"
            disabled={!value}
            onClick={() => {
              const [type, id] = value.split(":") as [TargetRef["type"], string];
              update((d, n) => setBookingTarget(d, booking.id, { type, id }, n), "対象者を設定し、ToDoを作成しました");
            }}
          >
            この対象者にする
          </button>
        </div>
        <p className="xs muted" style={{ marginTop: 4 }}>
          最終更新 {formatDateTime(booking.history[booking.history.length - 1]?.at ?? booking.start)}
        </p>
      </div>
    </article>
  );
}

/** 開いているグループを、このタブの中で覚えておく（画面を移動して戻っても開いたまま） */
function useOpenGroups(KEY = "baseplus-today-open"): [Set<string>, React.Dispatch<React.SetStateAction<Set<string>>>] {
  const [keys, setKeys] = useState<Set<string>>(() => {
    try {
      const raw = window.sessionStorage.getItem(KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify([...keys]));
    } catch {
      /* 保存できなくても動作には影響しない */
    }
  }, [keys]);
  return [keys, setKeys];
}

const LEVEL_ICON = { danger: "‼", warning: "!", normal: "" } as const;

function TodayGroupRow({
  group,
  expanded,
  onToggle,
  onPlace,
}: {
  group: TodayGroup;
  expanded: boolean;
  onToggle: () => void;
  onPlace: (t: Todo) => void;
}) {
  const { data, now } = useApp();
  const panelId = `group-${group.key.replace(":", "-")}`;
  const nextLesson = group.bookings.find((b) => new Date(b.end) > now) ?? group.bookings[group.bookings.length - 1];
  const done = group.open.length === 0;
  return (
    <div className={`group group-${group.level} ${done ? "is-done" : ""}`}>
      <button type="button" className="group-head" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
        <span className="group-chev" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
        <span className="group-main">
          <span className="group-name">{group.name}</span>
          <span className="group-sub">
            {nextLesson ? `指導 ${formatRange(nextLesson.start, nextLesson.end)}` : group.isOther ? "プチセミナー・対象者のない業務など" : ""}
          </span>
        </span>
        <span className="group-side">
          {group.level !== "normal" && (
            <span className={`badge badge-${group.level}`}>
              <span aria-hidden="true">{LEVEL_ICON[group.level]}</span>
              {group.label}
            </span>
          )}
          <span className={`badge ${done ? "badge-ok" : "badge-off"}`}>{done ? "✓ 完了" : `未完了 ${group.open.length}件`}</span>
        </span>
      </button>
      {expanded && (
        <div className="group-body stack" id={panelId}>
          {group.open.map((t) => (
            <TodoCard key={t.id} todo={t} onPlace={onPlace} draggable hideTarget={!group.isOther} level={todoLevel(t, data, now)} />
          ))}
          {group.closed.length > 0 && (
            <details className="group-closed">
              <summary className="small">完了・対象外にした業務（{group.closed.length}件）</summary>
              <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                {group.closed.map((t) => (
                  <li key={t.id}>
                    <span aria-hidden="true">{t.status === "done" ? "✓" : "－"}</span> {todoTitle(data, t)}：{STATUS_LABEL[t.status]}
                    <span className="muted">
                      {t.statusChangedAt && `（${formatDateTime(t.statusChangedAt)}${t.statusReason ? `・${t.statusReason}` : ""}）`}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
