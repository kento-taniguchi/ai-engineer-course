/* eslint-disable react-refresh/only-export-components */
import { Users } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { CrowdLevel, ShopStatus } from "@/types";

const DOTS: Record<CrowdLevel, number> = { empty: 1, normal: 2, busy: 3, full: 4, closed: 0 };
const TONE: Record<CrowdLevel, string> = {
  empty: "text-sage",
  normal: "text-sage",
  busy: "text-caramel",
  full: "text-berry",
  closed: "text-muted",
};

/** 店主が数時間更新していなければ、予約の入り具合から目安を出す */
export function effectiveCrowd(status: ShopStatus): CrowdLevel {
  if (!status.is_open) return "closed";
  const fresh =
    status.crowd_updated_at && Date.now() - new Date(status.crowd_updated_at).getTime() < 3 * 60 * 60 * 1000;
  if (fresh) return status.crowd_level === "closed" ? "closed" : status.crowd_level;
  const ratio = status.seats > 0 ? status.reserved_now / status.seats : 0;
  if (ratio >= 0.9) return "full";
  if (ratio >= 0.6) return "busy";
  if (ratio >= 0.25) return "normal";
  return "empty";
}

export function CrowdBadge({ status, detailed = false }: { status: ShopStatus | null; detailed?: boolean }) {
  const { t } = useI18n();
  if (!status) return null;
  const level = effectiveCrowd(status);
  const label = t(`crowd_${level}` as "crowd_empty");
  const minutes = status.crowd_updated_at
    ? Math.max(0, Math.round((Date.now() - new Date(status.crowd_updated_at).getTime()) / 60000))
    : null;

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-xs text-ink backdrop-blur"
      role="status"
      aria-live="polite"
      title={status.crowd_note || undefined}
    >
      <Users size={14} className={TONE[level]} aria-hidden="true" />
      <span className="text-muted">{t("crowd")}</span>
      <span className={`font-medium ${TONE[level]}`}>{label}</span>
      {level !== "closed" && (
        <span className="flex gap-0.5" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`h-2.5 w-1 rounded-full ${i <= DOTS[level] ? "bg-current " + TONE[level] : "bg-line"}`}
            />
          ))}
        </span>
      )}
      {detailed && (
        <span className="hidden text-muted sm:inline">
          · {t("hours", { open: status.open_time, close: status.close_time })}
          {minutes !== null && level !== "closed" && (
            <> · {minutes < 3 ? t("updatedJust") : t("updatedAgo", { m: minutes })}</>
          )}
        </span>
      )}
    </div>
  );
}
