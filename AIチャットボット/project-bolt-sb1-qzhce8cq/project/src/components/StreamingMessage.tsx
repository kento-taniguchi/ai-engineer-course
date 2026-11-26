import { Markdown } from "@/components/Markdown";
import { BrandMark } from "@/components/BrandMark";
import { useI18n } from "@/lib/i18n";

/** 回答が届いている途中の表示（まだ何も届いていなければ「淹れています…」） */
export function StreamingMessage({ content }: { content: string }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-3" aria-live="polite" aria-busy="true">
      <BrandMark size={32} steam={!content} />
      <div className="min-w-0 max-w-full flex-1 md:max-w-[85%]">
        <div className="rounded-3xl rounded-tl-md border border-line bg-surface px-5 py-4 text-ink shadow-soft">
          {content ? (
            <>
              <Markdown content={content} />
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-caramel align-middle" />
            </>
          ) : (
            <span className="text-sm text-muted">{t("thinking")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
