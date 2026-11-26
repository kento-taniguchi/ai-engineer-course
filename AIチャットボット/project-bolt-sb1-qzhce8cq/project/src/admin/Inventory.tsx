import { useCallback, useEffect, useState } from "react";
import { Loader2, Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageTitle } from "@/admin/AdminApp";
import type { Product, ProductCategory } from "@/types";

const CATEGORIES: { value: ProductCategory; label: string }[] = [
  { value: "drink", label: "ドリンク" },
  { value: "food", label: "フード" },
  { value: "sweets", label: "スイーツ" },
  { value: "beans", label: "コーヒー豆" },
  { value: "goods", label: "雑貨" },
];

const todayJst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
const tomorrowJst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date(Date.now() + 86400000));

/** AIとチャット画面で「本日のおすすめ」として紹介される条件（データベースの関数と同じ） */
const isRecommended = (p: Product) =>
  p.is_active && p.stock > 0 && (p.push || (p.best_before != null && p.best_before <= tomorrowJst()));

export function Inventory() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from("cafe_products").select("*").order("category").order("name");
    if (err) setError("商品の読み込みに失敗しました");
    setProducts((data as Product[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (id: string, patch: Partial<Product>) => {
    setProducts((prev) => prev?.map((p) => (p.id === id ? { ...p, ...patch } : p)) ?? prev);
    const { error: err } = await supabase
      .from("cafe_products")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (err) {
      setError(`保存に失敗しました：${err.message}`);
      load();
    }
  };

  const add = async () => {
    const { data, error: err } = await supabase
      .from("cafe_products")
      .insert({ name: "新しい商品", category: "sweets", price: 400, stock: 0 })
      .select()
      .single();
    if (err) {
      setError(`追加に失敗しました：${err.message}`);
      return;
    }
    setProducts((prev) => [data as Product, ...(prev ?? [])]);
  };

  const remove = async (p: Product) => {
    if (!window.confirm(`「${p.name}」を削除しますか？（予約の取り置き記録の商品名は残ります）`)) return;
    const { error: err } = await supabase.from("cafe_products").delete().eq("id", p.id);
    if (err) {
      setError(`削除に失敗しました：${err.message}`);
      return;
    }
    setProducts((prev) => prev?.filter((x) => x.id !== p.id) ?? prev);
  };

  const recommended = products?.filter(isRecommended) ?? [];

  return (
    <>
      <PageTitle
        eyebrow="Inventory"
        title="在庫・おすすめ"
        lead="「早く出したい」をオンにした商品と、賞味期限が明日までの商品は、AIが会話の中で自然におすすめし、チャット画面の「本日のおすすめ」にも並びます。在庫が0になると自動で外れます。"
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button onClick={add} className="btn-primary">
          <Plus size={16} />
          商品を追加
        </button>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Sparkles size={14} className="text-caramel" aria-hidden="true" />
          いまAIがおすすめ中：
          <span className="text-ink">{recommended.length ? recommended.map((p) => p.name).join("、") : "なし"}</span>
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-berry/10 px-4 py-3 text-sm text-berry">
          {error}
        </p>
      )}

      {products === null ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-muted" />
        </div>
      ) : (
        <ul className="space-y-3">
          {products.map((p) => (
            <ProductRow key={p.id} product={p} onUpdate={(patch) => update(p.id, patch)} onRemove={() => remove(p)} />
          ))}
        </ul>
      )}
    </>
  );
}

function ProductRow({
  product: p,
  onUpdate,
  onRemove,
}: {
  product: Product;
  onUpdate: (patch: Partial<Product>) => void;
  onRemove: () => void;
}) {
  // 文字や数字の欄は、書き終えてから「保存」で確定する
  const [draft, setDraft] = useState({
    name: p.name,
    name_en: p.name_en,
    category: p.category,
    price: String(p.price),
    sale_price: p.sale_price == null ? "" : String(p.sale_price),
    best_before: p.best_before ?? "",
    promo_text: p.promo_text,
  });
  const dirty =
    draft.name !== p.name ||
    draft.name_en !== p.name_en ||
    draft.category !== p.category ||
    draft.price !== String(p.price) ||
    draft.sale_price !== (p.sale_price == null ? "" : String(p.sale_price)) ||
    draft.best_before !== (p.best_before ?? "") ||
    draft.promo_text !== p.promo_text;

  const save = () =>
    onUpdate({
      name: draft.name.trim() || p.name,
      name_en: draft.name_en.trim(),
      category: draft.category,
      price: Math.max(0, Number(draft.price) || 0),
      sale_price: draft.sale_price === "" ? null : Math.max(0, Number(draft.sale_price) || 0),
      best_before: draft.best_before || null,
      promo_text: draft.promo_text,
    });

  const expiresToday = p.best_before != null && p.best_before <= todayJst();
  const expiresTomorrow = !expiresToday && p.best_before != null && p.best_before <= tomorrowJst();
  const rec = isRecommended(p);

  return (
    <li className={`card p-5 ${p.is_active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {rec && (
          <span className="inline-flex items-center gap-1 rounded-full bg-caramel-soft px-2 py-0.5 text-[11px] font-medium text-caramel">
            <Sparkles size={11} aria-hidden="true" />
            AIがおすすめ中
          </span>
        )}
        {expiresToday && <span className="rounded-full bg-berry/10 px-2 py-0.5 text-[11px] text-berry">期限：本日まで</span>}
        {expiresTomorrow && <span className="rounded-full bg-berry/10 px-2 py-0.5 text-[11px] text-berry">期限：明日まで</span>}
        {p.stock === 0 && <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-muted">品切れ</span>}
        {!p.is_active && <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-muted">非表示</span>}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[2fr_1.4fr_1fr_1fr_1fr]">
        <div>
          <label className="label" htmlFor={`n-${p.id}`}>商品名</label>
          <input id={`n-${p.id}`} className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor={`en-${p.id}`}>英語名（任意）</label>
          <input id={`en-${p.id}`} className="field" value={draft.name_en} onChange={(e) => setDraft({ ...draft, name_en: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor={`c-${p.id}`}>分類</label>
          <select
            id={`c-${p.id}`}
            className="field"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value as ProductCategory })}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`p-${p.id}`}>値段（円）</label>
          <input id={`p-${p.id}`} className="field tabular-nums" inputMode="numeric" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/\D/g, "") })} />
        </div>
        <div>
          <label className="label" htmlFor={`s-${p.id}`}>特別価格（任意）</label>
          <input id={`s-${p.id}`} className="field tabular-nums" inputMode="numeric" placeholder="なし" value={draft.sale_price} onChange={(e) => setDraft({ ...draft, sale_price: e.target.value.replace(/\D/g, "") })} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_2fr]">
        <div>
          <label className="label" htmlFor={`b-${p.id}`}>賞味期限（任意）</label>
          <input id={`b-${p.id}`} type="date" className="field" value={draft.best_before} onChange={(e) => setDraft({ ...draft, best_before: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor={`m-${p.id}`}>ひとこと（AIとおすすめ欄で使います）</label>
          <input id={`m-${p.id}`} className="field" placeholder="例：本日焼き上げ・数量限定" value={draft.promo_text} onChange={(e) => setDraft({ ...draft, promo_text: e.target.value })} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-4">
        {/* 在庫はその場で保存 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">在庫</span>
          <div className="inline-flex items-center rounded-full bg-sunken p-1">
            <button className="icon-btn h-9 w-9" disabled={p.stock === 0} onClick={() => onUpdate({ stock: Math.max(0, p.stock - 1) })} aria-label="在庫を1つ減らす">
              <Minus size={15} />
            </button>
            <span className="w-12 text-center text-base font-bold tabular-nums text-ink" aria-live="polite">
              {p.stock}
            </span>
            <button className="icon-btn h-9 w-9" onClick={() => onUpdate({ stock: p.stock + 1 })} aria-label="在庫を1つ増やす">
              <Plus size={15} />
            </button>
          </div>
          <button className="min-h-[36px] cursor-pointer rounded-full px-2.5 text-xs text-muted ring-1 ring-line hover:bg-sunken" onClick={() => onUpdate({ stock: p.stock + 5 })}>
            ＋5
          </button>
        </div>

        <Toggle label="早く出したい（おすすめに出す）" checked={p.push} onChange={(v) => onUpdate({ push: v })} />
        <Toggle label="お客さんに表示" checked={p.is_active} onChange={(v) => onUpdate({ is_active: v })} />

        <div className="ml-auto flex items-center gap-2">
          <button onClick={onRemove} className="icon-btn hover:text-berry" aria-label={`${p.name}を削除`}>
            <Trash2 size={16} />
          </button>
          <button onClick={save} disabled={!dirty} className="btn-primary min-h-[40px]">
            保存
          </button>
        </div>
      </div>
    </li>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 text-xs text-ink">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition ${checked ? "bg-caramel" : "bg-line"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
        />
      </button>
      {label}
    </label>
  );
}
