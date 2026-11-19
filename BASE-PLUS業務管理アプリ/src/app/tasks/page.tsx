"use client";

// 登録した仕事（臨時・繰り返し）の一覧

import Link from "next/link";
import { useState } from "react";
import type { TaskCategory } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { dateKey, formatDate } from "@/lib/time";
import { TASK_CATEGORY_LABEL, nextOccurrence, repeatLabel } from "@/lib/workTasks";
import { STATUS_LABEL } from "@/lib/todoEngine";
import { TaskDialog } from "@/components/TaskDialog";
import { Empty, PageHead } from "@/components/ui";

export default function TasksPage() {
  const { data, now } = useApp();
  const today = dateKey(now);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; occ: string } | null>(null);
  const tasks = [...(data.tasks ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const active = tasks.filter((t) => t.repeat.type === "none" || !t.until || t.until > today);
  const ended = tasks.filter((t) => !active.includes(t));

  return (
    <>
      <Link href="/" className="back-link">
        <span aria-hidden="true">←</span> 今日の仕事
      </Link>
      <PageHead title="登録した仕事" sub="臨時の仕事・毎週／毎月の繰り返し">
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          ＋ 仕事を追加
        </button>
      </PageHead>

      {active.length === 0 ? (
        <Empty>登録した仕事はありません。「＋ 仕事を追加」から登録できます。</Empty>
      ) : (
        <ul className="list">
          {active.map((t) => {
            const todos = data.todos.filter((x) => x.taskId === t.id);
            const next = nextOccurrence(t, today);
            const latest = [...todos].sort((a, b) => (b.occurrence ?? "").localeCompare(a.occurrence ?? ""))[0];
            const done = todos.filter((x) => x.status === "done").length;
            const editOcc = t.repeat.type === "none" ? t.date : latest?.occurrence ?? next ?? t.date;
            return (
              <li key={t.id} className="row" style={{ padding: "12px 16px", justifyContent: "space-between" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong>{t.title}</strong> <span className="badge badge-kind">{TASK_CATEGORY_LABEL[t.category as TaskCategory]}</span>
                  <div className="small muted">
                    {t.repeat.type === "none" ? `対応日 ${formatDate(t.date)}${t.dueDate ? `・期限 ${formatDate(t.dueDate)}` : ""}` : `${repeatLabel(t.repeat)}（${formatDate(t.date)}から）${next ? `・次回 ${formatDate(next)}` : ""}`}
                    {latest && ` ・ 最新の回：${STATUS_LABEL[latest.status]}`}
                    {t.repeat.type !== "none" && ` ・ 完了 ${done}回`}
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => setEditing({ id: t.id, occ: editOcc })}>
                  編集・削除
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {ended.length > 0 && (
        <details className="record section" style={{ marginTop: 16 }}>
          <summary>
            <strong>終了した繰り返し（{ended.length}件・履歴として保存）</strong>
          </summary>
          <ul className="record-body small">
            {ended.map((t) => (
              <li key={t.id}>
                {t.title}（{repeatLabel(t.repeat)}、{t.until && `${formatDate(t.until)}で終了`}）
              </li>
            ))}
          </ul>
        </details>
      )}

      {adding && <TaskDialog onClose={() => setAdding(false)} />}
      {editing && <TaskDialog taskId={editing.id} occurrence={editing.occ} onClose={() => setEditing(null)} />}
    </>
  );
}
