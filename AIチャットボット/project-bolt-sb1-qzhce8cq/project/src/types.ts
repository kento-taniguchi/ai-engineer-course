export interface Conversation {
  id: string;
  user_id: string;
  dify_conversation_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  dify_message_id?: string | null;
  created_at: string;
}

export interface DifyStreamEvent {
  event: "message" | "message_replace" | "message_end" | "error" | "quota";
  answer?: string;
  conversation_id?: string;
  message_id?: string;
  /** error イベントのときの説明文 */
  message?: string;
  code?: string;
  /** quota イベント：今日の残り回数（店主は null＝無制限） */
  remaining?: number | null;
  limit?: number | null;
}

export type CrowdLevel = "empty" | "normal" | "busy" | "full" | "closed";

export interface ShopStatus {
  is_open: boolean;
  open_time: string;
  close_time: string;
  closed_weekdays: number[];
  seats: number;
  reserved_now: number;
  crowd_level: CrowdLevel;
  crowd_note: string;
  crowd_updated_at: string | null;
  max_party: number;
}

export type ProductCategory = "drink" | "food" | "sweets" | "beans" | "goods";

export interface Product {
  id: string;
  name: string;
  name_en: string;
  category: ProductCategory;
  price: number;
  sale_price: number | null;
  stock: number;
  best_before: string | null;
  push: boolean;
  promo_text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ReservationStatus = "booked" | "visited" | "cancelled" | "no_show";

export interface ReservationItem {
  id: string;
  reservation_id: string;
  product_id: string | null;
  product_name: string;
  qty: number;
  unit_price: number;
}

export interface Reservation {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  party_size: number;
  reserved_at: string;
  note: string;
  status: ReservationStatus;
  created_at: string;
  cafe_reservation_items?: ReservationItem[];
}

export interface Settings {
  id: number;
  daily_user_limit: number;
  daily_total_limit: number;
  seats: number;
  reservable_seats: number;
  max_party: number;
  open_time: string;
  close_time: string;
  last_reservation_time: string;
  stay_minutes: number;
  closed_weekdays: number[];
  crowd_level: CrowdLevel;
  crowd_note: string;
  crowd_updated_at: string | null;
  updated_at: string;
}
