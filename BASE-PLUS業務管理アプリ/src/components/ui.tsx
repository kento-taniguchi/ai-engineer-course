"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { BookingKind, TodoStatus } from "@/lib/types";
import { STATUS_ICON, STATUS_LABEL, type UrgencyInfo } from "@/lib/todoEngine";
import { BOOKING_KIND_ICON, BOOKING_KIND_LABEL } from "@/lib/selectors";

export function DemoBadge({ children = "デモ" }: { children?: ReactNode }) {
  return (
    <span className="badge badge-demo">
      <span aria-hidden="true">◇</span>
      {children}
    </span>
  );
}

export function OffBadge({ children }: { children: ReactNode }) {
  return (
    <span className="badge badge-off">
      <span aria-hidden="true">⊘</span>
      {children}
    </span>
  );
}

export function DemoBar({ children }: { children?: ReactNode }) {
  return (
    <div className="demo-bar" role="note">
      <DemoBadge>デモデータ</DemoBadge>
      <span>{children ?? "表示中のデータはすべて架空です。外部サービスには接続していません。"}</span>
    </div>
  );
}

export function StatusChip({ status }: { status: TodoStatus }) {
  return (
    <span className={`status status-${status}`}>
      <span aria-hidden="true">{STATUS_ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function UrgencyBadge({ info }: { info: UrgencyInfo }) {
  if (info.level === "normal" || !info.label) return null;
  return (
    <span className={`badge badge-${info.level}`}>
      <span aria-hidden="true">{info.level === "danger" ? "‼" : "!"}</span>
      {info.label}
    </span>
  );
}

export function KindBadge({ kind }: { kind: BookingKind }) {
  return (
    <span className="badge badge-kind">
      <span aria-hidden="true">{BOOKING_KIND_ICON[kind]}</span>
      {BOOKING_KIND_LABEL[kind]}
    </span>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Modal({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}>
        <h2 id="modal-title">{title}</h2>
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}
