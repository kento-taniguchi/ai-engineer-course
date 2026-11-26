import { Coffee } from "lucide-react";

/** 湯気の立つコーヒーカップのロゴ */
export function BrandMark({ size = 40, steam = false }: { size?: number; steam?: boolean }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-2xl bg-roast text-on-roast"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {steam && (
        <span className="absolute -top-2 left-1/2 flex -translate-x-1/2 gap-1">
          <span className="h-2.5 w-[2px] animate-steam rounded-full bg-caramel/70" />
          <span className="h-3 w-[2px] animate-steam rounded-full bg-caramel/70 [animation-delay:0.4s]" />
          <span className="h-2.5 w-[2px] animate-steam rounded-full bg-caramel/70 [animation-delay:0.8s]" />
        </span>
      )}
      <Coffee size={Math.round(size * 0.5)} strokeWidth={1.75} />
    </span>
  );
}
