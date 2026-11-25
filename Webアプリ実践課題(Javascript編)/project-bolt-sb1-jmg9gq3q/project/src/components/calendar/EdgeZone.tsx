import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  side: 'left' | 'right';
  label: string;
  onStep: () => void;
}

/**
 * 移動中だけ出る、カレンダーの左右の帯。
 * カーソル（またはドラッグ中のタスク）を少し置くと前・次へ切り替わり、置いたままだと続けて進む。押しても切り替わる。
 */
export function EdgeZone({ side, label, onStep }: Props) {
  const timer = useRef<number | null>(null);
  const stepRef = useRef(onStep);
  useEffect(() => {
    stepRef.current = onStep;
  });

  const stop = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const start = () => {
    if (timer.current !== null) return;
    const repeat = () => {
      stepRef.current();
      timer.current = window.setTimeout(repeat, 900);
    };
    timer.current = window.setTimeout(repeat, 450);
  };
  useEffect(() => stop, []);

  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      onMouseEnter={start}
      onMouseLeave={stop}
      onDragEnter={start}
      onDragOver={(e) => {
        e.preventDefault();
        start();
      }}
      onDragLeave={stop}
      onDrop={(e) => {
        e.preventDefault();
        stop();
      }}
      onClick={() => {
        stop();
        stepRef.current();
      }}
      className={`absolute inset-y-0 z-30 flex w-7 cursor-pointer items-center justify-center bg-accent/15 text-accent-600 transition-colors hover:bg-accent/30 ${
        side === 'left' ? 'left-0 rounded-r-lg' : 'right-0 rounded-l-lg'
      }`}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </div>
  );
}
