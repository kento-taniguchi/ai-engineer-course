import { useState } from 'react';

export const PANEL_MIN = 260;
export const PANEL_MAX = 720;
export const PANEL_DEFAULT = 380;
const clamp = (w: number) => Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(w)));

interface Props {
  width: number;
  onChange: (w: number) => void;
}

/** 一覧とカレンダーの境目。左右にドラッグすると一覧の幅が変わる。ダブルクリックで元の幅に戻す */
export function PanelDivider({ width, onChange }: Props) {
  const [active, setActive] = useState(false);

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    setActive(true);
    const move = (ev: PointerEvent) => onChange(clamp(startW + ev.clientX - startX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setActive(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="一覧の幅（左右の矢印キーでも変えられます）"
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={start}
      onDoubleClick={() => onChange(PANEL_DEFAULT)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          onChange(clamp(width + (e.key === 'ArrowRight' ? 24 : -24)));
        }
      }}
      title="ドラッグで一覧の幅を変更・ダブルクリックで元に戻す"
      className="group hidden cursor-col-resize touch-none select-none items-center justify-center lg:flex"
    >
      <span className={`h-12 w-1 rounded-full transition-colors ${active ? 'bg-navy' : 'bg-navy-100 group-hover:bg-navy-300'}`} />
    </div>
  );
}
