"use client";

// 軽量なSVGグラフ（外部ライブラリなし）

import { startOfDay, formatDate } from "@/lib/time";

export interface Point {
  date: string; // YYYY-MM-DD
  value: number;
}

function niceRange(min: number, max: number): [number, number] {
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.15;
  return [min - pad, max + pad];
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n) < 10 ? 2 : 1);
}

/** 日付に沿った折れ線グラフ（1項目・1単位のみ） */
export function LineChart({ points, unit, label }: { points: Point[]; unit: string; label: string }) {
  const W = 640;
  const H = 260;
  const m = { l: 56, r: 36, t: 36, b: 40 };
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;
  const xs = sorted.map((p) => startOfDay(p.date).getTime());
  const [xmin, xmax] = xs.length > 1 ? [xs[0], xs[xs.length - 1]] : [xs[0] - 86400000 * 15, xs[0] + 86400000 * 15];
  const [ymin, ymax] = niceRange(Math.min(...sorted.map((p) => p.value)), Math.max(...sorted.map((p) => p.value)));
  const x = (t: number) => m.l + ((t - xmin) / (xmax - xmin || 1)) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - ((v - ymin) / (ymax - ymin)) * (H - m.t - m.b);
  const ticks = Array.from({ length: 5 }, (_, i) => ymin + ((ymax - ymin) * i) / 4);
  const path = sorted.map((p, i) => `${i === 0 ? "M" : "L"}${x(xs[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const showEvery = Math.ceil(sorted.length / 6);

  return (
    <figure className="chart" style={{ margin: 0, maxWidth: 760 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}の推移グラフ（単位：${unit}）`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="#e6e9ef" />
            <text x={m.l - 8} y={y(t) + 4} fontSize="12" textAnchor="end" fill="#5b6475">
              {fmt(Math.round(t * 100) / 100)}
            </text>
          </g>
        ))}
        <text x={8} y={16} fontSize="12" fill="#5b6475">
          （{unit}）
        </text>
        <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} stroke="#9aa3b2" />
        <path d={path} fill="none" stroke="#1b2a4a" strokeWidth="2.5" />
        {sorted.map((p, i) => (
          <g key={p.date + i}>
            <circle cx={x(xs[i])} cy={y(p.value)} r="5" fill="#fff" stroke="#b08a35" strokeWidth="2.5" />
            <text x={x(xs[i])} y={y(p.value) - 10} fontSize="12" textAnchor="middle" fill="#1b2a4a" fontWeight="700">
              {fmt(p.value)}
            </text>
            {i % showEvery === 0 || i === sorted.length - 1 ? (
              <text x={x(xs[i])} y={H - m.b + 20} fontSize="11" textAnchor={sorted.length > 1 && i === sorted.length - 1 ? "end" : sorted.length > 1 && i === 0 ? "start" : "middle"} fill="#5b6475">
                {p.date.slice(2, 7).replace("-", "/")}/{p.date.slice(8)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <figcaption className="sr-only">
        {sorted.map((p) => `${formatDate(p.date)} ${fmt(p.value)}${unit}`).join("、")}
      </figcaption>
    </figure>
  );
}

export interface BarDatum {
  label: string;
  values: { key: string; value: number; color: string; pattern?: boolean }[];
}

/** 横棒グラフ（予定額と確認済み金額などを並べて表示） */
export function HBarChart({ data, format }: { data: BarDatum[]; format: (n: number) => string }) {
  const max = Math.max(1, ...data.flatMap((d) => d.values.map((v) => v.value)));
  return (
    <div className="stack-2">
      {data.map((d) => (
        <div key={d.label}>
          <div className="small" style={{ fontWeight: 700, marginBottom: 4 }}>
            {d.label}
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {d.values.map((v) => (
              <div key={v.key} className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <span className="xs muted" style={{ width: 72, flexShrink: 0 }}>
                  {v.key}
                </span>
                <div style={{ flex: 1, background: "#eef0f4", borderRadius: 4, height: 16, minWidth: 0 }}>
                  <div
                    style={{
                      width: `${(v.value / max) * 100}%`,
                      height: "100%",
                      borderRadius: 4,
                      background: v.pattern ? `repeating-linear-gradient(45deg, ${v.color}, ${v.color} 4px, #fff 4px, #fff 7px)` : v.color,
                      border: `1px solid ${v.color}`,
                    }}
                  />
                </div>
                <span className="xs" style={{ width: 88, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {format(v.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 割合の帯グラフ（積み上げ100%） */
export function ShareBar({ parts }: { parts: { label: string; value: number; color: string; icon: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 28, borderRadius: 6, overflow: "hidden", border: "1px solid #d9dee7" }} role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join("、")}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color, color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {p.icon}
            </div>
          ))}
      </div>
      <div className="legend" style={{ marginTop: 8 }}>
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.icon} {p.label} {Math.round((p.value / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}
