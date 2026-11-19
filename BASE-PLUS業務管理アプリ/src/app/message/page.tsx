"use client";

// 連絡メッセージ画面（リマインド・お礼・フィードバック送信）

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useApp } from "@/store/AppStore";
import { bookingOf, reportOfBooking, targetHref, targetName, todoTitle } from "@/lib/selectors";
import { reminderDraft, reportText, thanksDraft } from "@/lib/messages";
import { markSent, saveDraft, setTodoStatus } from "@/lib/operations";
import { formatDateTime, formatRange } from "@/lib/time";
import { isOpen, urgencyOf } from "@/lib/todoEngine";
import { ShareBox } from "@/components/ShareBox";
import { Empty, KindBadge, OffBadge, StatusChip, UrgencyBadge } from "@/components/ui";

export default function MessagePage() {
  return (
    <Suspense>
      <MessageInner />
    </Suspense>
  );
}

function MessageInner() {
  const params = useSearchParams();
  const id = params.get("todo") ?? "";
  const { data } = useApp();
  const todo = data.todos.find((t) => t.id === id);
  const booking = todo ? bookingOf(data, todo) : undefined;
  if (!todo || !booking) {
    return (
      <>
        <Link href="/" className="back-link">
          ← 今日の仕事
        </Link>
        <Empty>対象のToDoが見つかりません</Empty>
      </>
    );
  }
  // key を付けて、ToDoが変わったら下書きの入力状態をリセット
  return <MessageEditor key={todo.id} todoId={todo.id} />;
}

function MessageEditor({ todoId }: { todoId: string }) {
  const { data, now, update } = useApp();
  const todo = data.todos.find((t) => t.id === todoId)!;
  const booking = bookingOf(data, todo)!;
  const report = reportOfBooking(data, booking.id);
  const isFeedback = todo.kind === "send_feedback";

  const template = isFeedback
    ? report
      ? reportText(data, report, booking)
      : ""
    : todo.kind === "remind"
      ? reminderDraft(data, booking)
      : thanksDraft(data, booking);
  const [text, setText] = useState(todo.draft ?? template);
  const dirty = text !== (todo.draft ?? template);
  const open = isOpen(todo);

  return (
    <>
      <Link href="/" className="back-link">
        <span aria-hidden="true">←</span> 今日の仕事
      </Link>
      <div className="page-head">
        <div>
          <h1>{todoTitle(data, todo)}</h1>
          <p className="sub">
            {booking.target ? <Link href={targetHref(booking.target)}>{targetName(data, booking.target)}</Link> : "対象者未確定"} ・ 指導{" "}
            {formatRange(booking.start, booking.end)} <KindBadge kind={booking.kind} />
          </p>
        </div>
        <div className="row">
          <StatusChip status={todo.status} />
          <UrgencyBadge info={urgencyOf(todo, data, now)} />
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <OffBadge>LINE・メール等とは未連携（アプリからは自動送信しません）</OffBadge>
      </div>

      {isFeedback && !report ? (
        <div className="notice notice-warn stack" role="status">
          <strong>⚠ この指導のレポートがまだ作成されていません</strong>
          <span>先にフィードバック（レポート）を作成・保存してください。</span>
          <div>
            <Link href={`/report?booking=${booking.id}`} className="btn btn-primary">
              レポートを作成する →
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid-2">
          <section className="stack-2" aria-labelledby="h-draft">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <h2 id="h-draft">{isFeedback ? "送信する文章" : "下書き"}</h2>
              {isFeedback && report && (
                <Link href={`/report?id=${report.id}`} className="btn btn-sm">
                  レポートを編集
                </Link>
              )}
            </div>
            <label className="field">
              <span className="sr-only">文章</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 260 }} />
            </label>
            <div className="row">
              <button className="btn" disabled={!dirty} onClick={() => update((d) => saveDraft(d, todo.id, text), "下書きを保存しました（端末内）")}>
                下書きを保存
              </button>
              <button
                className="btn btn-ghost"
                disabled={text === template}
                onClick={() => {
                  setText(template);
                  update((d) => saveDraft(d, todo.id, template));
                }}
              >
                {isFeedback ? "レポートの内容に戻す" : "テンプレートに戻す"}
              </button>
              {dirty && <span className="xs muted">未保存の変更があります</span>}
            </div>
          </section>

          <section className="stack-2" aria-labelledby="h-share">
            <h2 id="h-share">共有する</h2>
            <ShareBox text={text} subject={isFeedback ? "BASE-PLUS フィードバック" : "BASE-PLUSより"} />
            <div className="card stack">
              <h3>送信の記録</h3>
              {open ? (
                <>
                  <p className="small">LINEやメールで実際に送信したあと、下のボタンを押してください。</p>
                  <div className="row">
                    <button
                      className="btn btn-gold"
                      onClick={() =>
                        update((d, n) => markSent(saveDraft(d, todo.id, text), todo.id, n), "送信済みにしました")
                      }
                    >
                      ✓ 送信済みにする
                    </button>
                    {todo.status !== "doing" && (
                      <button className="btn btn-sm btn-ghost" onClick={() => update((d, n) => setTodoStatus(d, todo.id, "doing", "", n), "作業中にしました")}>
                        作業中にする
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="small">
                    <span className="badge badge-ok">✓ {todo.status === "done" ? "送信済み" : "対象外"}</span>{" "}
                    {todo.statusChangedAt && formatDateTime(todo.statusChangedAt)}
                    {todo.statusReason && `（${todo.statusReason}）`}
                  </p>
                  <div>
                    <button className="btn btn-sm" onClick={() => update((d, n) => setTodoStatus(d, todo.id, "todo", "未送信に戻す", n), "未送信に戻しました")}>
                      未送信に戻す
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
