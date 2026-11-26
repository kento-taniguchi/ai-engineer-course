import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Product, ShopStatus } from "@/types";

/** お店の今の様子（混雑・営業中か）と、本日のおすすめ。1分ごとに更新 */
export function useShop() {
  const [status, setStatus] = useState<ShopStatus | null>(null);
  const [picks, setPicks] = useState<Product[]>([]);

  const refresh = useCallback(async () => {
    const [s, r] = await Promise.all([supabase.rpc("cafe_status"), supabase.rpc("cafe_recommendations")]);
    if (!s.error && s.data) setStatus(s.data as ShopStatus);
    if (!r.error && r.data) setPicks(r.data as Product[]);
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 60_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return { status, picks, refresh };
}

/** 商品名（日本語以外のときは英語名があればそちら） */
export const productName = (p: Pick<Product, "name" | "name_en">, lang: string) =>
  lang !== "ja" && p.name_en ? p.name_en : p.name;

export const yen = (n: number, locale = "ja-JP") =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "JPY" }).format(n);
