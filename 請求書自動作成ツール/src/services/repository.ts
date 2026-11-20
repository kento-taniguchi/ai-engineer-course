// データの保存先の「窓口」
// 画面はこの Repository だけを使います。保存先（ブラウザ / Googleスプレッドシート）を
// 切り替えるときは、同じ関数を持つ実装を作り、getRepository() で選ぶようにします。
import type { DateKey, DayRecord, Member, MonthKey } from "@/lib/types";
import { localRepository } from "./localRepository";

export interface Repository {
  /** 保存先の名前（画面の表示用） */
  readonly label: string;
  listMembers(): Promise<Member[]>;
  /** 会員を1人分保存（新規・更新どちらも） */
  saveMember(member: Member): Promise<void>;
  getDay(date: DateKey): Promise<DayRecord | null>;
  /** 1日分の出欠を保存（同じ日の記録は置き換え） */
  saveDay(record: DayRecord): Promise<void>;
  listDaysInMonth(ym: MonthKey): Promise<DayRecord[]>;
  /** バックアップ用：全データの書き出し・読み込み */
  exportAll(): Promise<BackupData>;
  importAll(data: BackupData): Promise<void>;
  /** 試作版用：架空データに戻す */
  resetToDemo(): Promise<void>;
}

export type BackupData = {
  app: "attendance-invoice";
  version: 1;
  exportedAt: string;
  members: Member[];
  days: DayRecord[];
};

export function getRepository(): Repository {
  // 将来：process.env.NEXT_PUBLIC_DATA_BACKEND === "sheets" のときに
  // Googleスプレッドシート用の実装（例：sheetsRepository）を返す
  return localRepository;
}
